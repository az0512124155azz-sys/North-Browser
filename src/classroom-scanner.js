'use strict';
const crypto=require('node:crypto');
const ORIGIN='https://classroom.google.com';
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,15);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeClassroomUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='classroom.google.com'}catch{return false}};
const toState=raw=>{const text=String(raw||'').toLowerCase();if(/חסר|לא הוגש|missing|not turned in/.test(text))return 'missing';if(/הוגש|השלמת|turned in|submitted/.test(text))return 'turned_in';return 'unknown'};
const LIST_CODE=String.raw`(()=>{
 const anchors=[...document.querySelectorAll('a[href]')].slice(0,700);
 const courses=[];const tasks=[];
 for(const a of anchors){let p;try{p=new URL(a.href)}catch{continue}if(p.hostname!=='classroom.google.com')continue;
  const text=(a.innerText||a.getAttribute('aria-label')||a.textContent||'').trim().slice(0,220);
  const courseMatch=p.pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]{2,})(?:\/|$)/);
  if(courseMatch&&!/\/a\//.test(p.pathname)&&text&&text.length>1)courses.push({id:courseMatch[1],name:text,url:p.origin+'/c/'+courseMatch[1]});
  const taskMatch=p.pathname.match(/\/c\/([A-Za-z0-9_-]+)\/a\/([A-Za-z0-9_-]+)/);
  if(taskMatch&&text){const context=a.closest('article,[role="listitem"],li,[data-assignment-id]')||a.parentElement;
   const cardText=(context?.innerText||text).slice(0,5000);tasks.push({id:taskMatch[2],courseId:taskMatch[1],title:text,url:p.origin+'/c/'+taskMatch[1]+'/a/'+taskMatch[2]+'/details',description:cardText,stateText:cardText});}
 }
 const loginRequired=!location.hostname.endsWith('classroom.google.com')||!!document.querySelector('form[action*="ServiceLogin"]');
 return {loginRequired,url:location.href,courses:courses.slice(0,160),tasks:tasks.slice(0,250)};
})()`;
const STREAM_CODE=String.raw`(()=>{
 const selectors='[data-stream-item-id],[data-announcement-id],article,[role="article"]';
 return [...document.querySelectorAll(selectors)].slice(0,70).map(n=>({id:n.getAttribute('data-stream-item-id')||n.getAttribute('data-announcement-id')||'',text:(n.innerText||'').trim().slice(0,5000)})).filter(x=>x.text.length>15).slice(0,30)
})()`;
const DETAIL_CODE=String.raw`(()=>{
 const root=document.querySelector('main,[role="main"]')||document.body;
 const attachments=[...root.querySelectorAll('a[href]')].filter(a=>{try{const u=new URL(a.href);return u.protocol==='https:'&&(u.hostname.endsWith('google.com')||u.hostname.endsWith('googleapis.com'))}catch{return false}}).slice(0,15).map(a=>({name:(a.innerText||'קובץ').trim().slice(0,150),url:a.href}));
 return {text:(root.innerText||'').trim().slice(0,12000),attachments};
})()`;
function createClassroomScanner({BrowserWindow,partition,store,save,onStatus=()=>{},onNewTasks=()=>{},onNewAnnouncements=()=>{}}){
 let hidden=null,busy=false,at=0,lastError='',nextRun=0,stats={courses:0,assignments:0,announcements:0,pages:0};
 store.classroom=store.classroom||{tasks:[],notices:[],scanned:false};
 const db=store.classroom;
 const status=()=>({busy,lastRun:at,nextRun,lastError,stats,hasScan:db.scanned,assignments:db.tasks.length,notices:db.notices.length});
 const publish=(message)=>onStatus({...status(),message});
 function web(){if(hidden&&!hidden.isDestroyed())return hidden.webContents;hidden=new BrowserWindow({show:false,skipTaskbar:true,width:1250,height:950,webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});hidden.webContents.setWindowOpenHandler(()=>({action:'deny'}));return hidden.webContents;}
 async function load(url){if(!safeClassroomUrl(url))throw Error('Invalid Classroom URL');const wc=web();let timer;
  try{await Promise.race([wc.loadURL(url),new Promise((_,reject)=>{timer=setTimeout(()=>{wc.stop();reject(Error('Classroom timed out'));},27000)})]);await pause(1250);return wc;}
  finally{clearTimeout(timer)}
 }
 async function visit(url,script){const wc=await load(url);if(!wc.getURL().startsWith(ORIGIN))return {loginRequired:true};return wc.executeJavaScript(script,true);}
 function uniqueTasks(rows){const map=new Map();for(const t of rows){if(!t.url||!safeClassroomUrl(t.url)||!t.id||!t.title)continue;const key=t.courseId+'/'+t.id;const current=map.get(key);if(!current||(t.description||'').length>(current.description||'').length)map.set(key,t)}return [...map.values()];}
 async function scan(){if(busy)return {...status(),alreadyRunning:true};busy=true;lastError='';const start=Date.now();let visited=0;let added=[],newNotices=[];publish('מתחיל סריקה פנימית');
  try{
   const home=await visit(ORIGIN+'/u/0/h',LIST_CODE);visited++;
   if(home.loginRequired)throw Error('נדרשת התחברות ל־Google Classroom בתוך North');
   const todo=await visit(ORIGIN+'/u/0/a/not-turned-in/all',LIST_CODE);visited++;
   if(todo.loginRequired)throw Error('נדרשת התחברות ל־Google Classroom');
   const courseMap=new Map();for(const c of [...home.courses,...(todo.courses||[])])if(c.id&&c.name&&!courseMap.has(c.id))courseMap.set(c.id,c);
   // Collect course links both from course cards and known tasks; never leave Classroom.
   for(const t of [...home.tasks,...todo.tasks])if(t.courseId&&!courseMap.has(t.courseId))courseMap.set(t.courseId,{id:t.courseId,name:'כיתה '+t.courseId,url:ORIGIN+'/c/'+t.courseId});
   const all=[...home.tasks,...todo.tasks];const streams=[];let idx=0;
   for(const c of [...courseMap.values()].slice(0,35)){
    idx++;publish(`כיתה ${idx}/${Math.min(35,courseMap.size)}: ${c.name}`);
    try{const page=await visit(ORIGIN+'/c/'+c.id+'/a',LIST_CODE);visited++;for(const t of page.tasks||[])all.push({...t,course:c.name});}catch(e){publish('קריאת עבודות הכיתה נכשלה: '+c.name);}
    try{const notices=await visit(ORIGIN+'/c/'+c.id,STREAM_CODE);visited++;for(const n of Array.isArray(notices)?notices:[])streams.push({id:n.id||hash(c.id+':'+n.text),courseId:c.id,course:c.name,text:n.text});}catch{}
   }
   const merged=uniqueTasks(all);const previous=new Map(db.tasks.map(t=>[t.courseId+'/'+(t.assignmentId||t.id),t]));const first=!db.scanned;
   for(const row of merged){const key=row.courseId+'/'+row.id;const old=previous.get(key);const task={...old,...row,id:old?.id||hash(key),assignmentId:row.id,course:row.course||old?.course||courseMap.get(row.courseId)?.name||row.courseId,
    state:toState(row.stateText)==='unknown'?(old?.state||'unknown'):toState(row.stateText),updatedAt:Date.now()};
    if(!old)added.push(task);previous.set(key,task);
   }
   // Read details only for newly discovered tasks, to avoid expensive full-page crawling.
   for(const task of added.slice(0,16)){
    try{publish('קורא פרטים: '+task.title);const detail=await visit(task.url,DETAIL_CODE);visited++;
     if(detail&&!detail.loginRequired){if(detail.text?.length>task.description.length)task.description=detail.text;task.attachments=detail.attachments||[];}
    }catch{}
   }
   db.tasks=[...previous.values()].slice(-600);
   const knownNotices=new Set(db.notices.map(n=>n.courseId+':'+n.id));
   for(const n of streams){const key=n.courseId+':'+n.id;if(knownNotices.has(key))continue;knownNotices.add(key);newNotices.push({...n,time:Date.now()});}
   db.notices=[...db.notices,...newNotices].slice(-400);db.scanned=true;save();
   at=Date.now();stats={courses:courseMap.size,assignments:db.tasks.length,announcements:db.notices.length,pages:visited};publish(`הסריקה הסתיימה: ${added.length} מטלות חדשות, ${newNotices.length} הודעות חדשות`);
   // On initial scan, avoid flooding Telegram with historic announcements.
   if(!first){if(added.length)await onNewTasks(added);if(newNotices.length)await onNewAnnouncements(newNotices.slice(-12));}
   return {...stats,authRequired:false,newAssignments:added.length,newNotices:newNotices.length,seconds:Math.round((Date.now()-start)/1000)};
  }catch(e){lastError=String(e.message);publish('שגיאת סריקה: '+lastError);throw e}
  finally{busy=false;nextRun=Date.now()+5*60*1000;publish('ממתין לסריקה הבאה')}
 }
 function tasks(){return db.tasks.slice().sort((a,b)=>(a.state==='turned_in')-(b.state==='turned_in'))}
 function notices(){return db.notices.slice().reverse()}
 function classes(){const by=new Map();for(const t of db.tasks){const name=t.course||'לא ידוע';if(!by.has(name))by.set(name,{name,complete:0,pending:0,unknown:0});const x=by.get(name);if(t.state==='turned_in')x.complete++;else if(t.state==='missing')x.pending++;else x.unknown++;}return [...by.values()].sort((a,b)=>a.name.localeCompare(b.name));}
 function destroy(){if(hidden&&!hidden.isDestroyed())hidden.destroy();hidden=null;}
 return {scan,tasks,notices,classes,status,destroy,save};
}
module.exports={createClassroomScanner,toState,safeClassroomUrl};
