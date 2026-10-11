'use strict';
// Private isolated-world bridge; never expose credentials or IPC to page JS.
const {ipcRenderer}=require('electron');
if(process.isMainFrame){
 const passwordField=()=>[...document.querySelectorAll('input[type="password"]')].find(i=>i.autocomplete!=='new-password'&&i.getClientRects().length);
 const usernameField=p=>{const root=p?.form||document;return root.querySelector('input[autocomplete="username"],input[type="email"],input[name="username"],input[name="email"],input[name="identifier"],input[name="login"],input[name="loginfmt"]'+(p?',input[type="text"]':''));};
 function set(input,value){if(!input)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
 const fill=credentials=>{if(!credentials)return;const p=passwordField(),user=usernameField(p);if(user?.value&&user.value!==credentials.username)return;set(user,credentials.username);set(p,credentials.password);};
 ipcRenderer.on('credentials:fill',(_event,data)=>fill(data));
 document.addEventListener('pointerdown',event=>{
  if(!event.isTrusted||!event.target.matches('input'))return;
  const p=passwordField(),u=usernameField(p);if(event.target!==p&&event.target!==u)return;
  ipcRenderer.invoke('credentials:lookup',u?.value||'').then(fill).catch(()=>{});
 },true);
 document.addEventListener('submit',event=>{
  const p=passwordField(),u=usernameField(p);
  if(!p){if(u?.form===event.target&&u.value)ipcRenderer.send('credentials:username',u.value);return;}
  if(p.form!==event.target||!p.value)return;
  ipcRenderer.send('credentials:offer',{username:u?.value||'',password:p.value});
 },true);
}
