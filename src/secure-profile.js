'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function secureAvailable(storage){return storage.isEncryptionAvailable()&&!(process.platform==='linux'&&storage.getSelectedStorageBackend()==='basic_text')}
function encryptedFile(file,storage){
 return {
  read(fallback){if(!fs.existsSync(file))return fallback;if(!secureAvailable(storage))throw Error('Secure storage is unavailable');return JSON.parse(storage.decryptString(fs.readFileSync(file)));},
  write(value){if(!secureAvailable(storage))throw Error('Secure storage is unavailable');const bytes=storage.encryptString(JSON.stringify(value));fs.writeFileSync(file+'.tmp',bytes,{mode:0o600});fs.renameSync(file+'.tmp',file);}
 };
}
function createPasswordVault(dir,storage){
 const file=encryptedFile(path.join(dir,'north-passwords.enc'),storage);
 let entries=file.read([]);
 return {
  available:()=>secureAvailable(storage),
  list:()=>entries.map(({id,origin,username})=>({id,origin,username})),
  get:id=>entries.find(e=>e.id===id),
  forOrigin:(origin,username)=>entries.filter(e=>e.origin===origin&&(!username||e.username===username)).at(-1),
  matches:(origin,username,password)=>entries.some(e=>e.origin===origin&&e.username===username&&e.password===password),
  save(origin,username,password){const old=entries.find(e=>e.origin===origin&&e.username===username);const entry={id:old?.id||crypto.randomUUID(),origin,username,password};const next=entries.filter(e=>e.id!==entry.id).concat(entry);file.write(next);entries=next;return entry.id;},
  remove(id){const next=entries.filter(e=>e.id!==id);file.write(next);entries=next;}
 };
}
function createSessionKeeper(dir,storage,session){
 const file=encryptedFile(path.join(dir,'north-session-cookies.enc'),storage);
 let timer,restoring=false,pending=Promise.resolve();
 function save(){clearTimeout(timer);pending=pending.catch(()=>{}).then(async()=>{if(secureAvailable(storage))file.write(await session.cookies.get({session:true}));await session.cookies.flushStore();});return pending;}
 const onChange=()=>{if(!restoring){clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>console.warn('Session save:',e.message)),750);}};
 return {
  async start(){
   restoring=true;
   try {
    const rows=file.read([]);
    for(const c of rows){
     const host=c.domain.replace(/^\./,'');
     const details={url:(c.secure?'https://':'http://')+host+(c.path||'/'),name:c.name,value:c.value,path:c.path||'/',secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite};
     if(!c.hostOnly)details.domain=c.domain;
     await session.cookies.set(details).catch(()=>{});
    }
   }finally{restoring=false;session.cookies.on('changed',onChange);}
  },
  save,
  stop(){clearTimeout(timer);session.cookies.removeListener('changed',onChange);}
 };
}
function credentialOrigin(raw){try{const u=new URL(raw);if(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))return u.origin;}catch{}return null;}
module.exports={createPasswordVault,createSessionKeeper,credentialOrigin};
