'use strict';
const crypto=require('node:crypto');
const safeChatURL=value=>{try{const u=new URL(value);return u.origin==='https://chatgpt.com'&&/^\/c\/[a-zA-Z0-9-]+\/?$/.test(u.pathname)?u.href:'';}catch{return '';}};
function createGptWorkflow({store,save,plan,web,onChange=()=>{},onResult=async()=>{},deliveryOwner=()=>null}){
 const db=store.gptWorkspace=store.gptWorkspace||{nextId:1,active:null,threads:[]};
 if(!db.legacyImported){
  const old=Array.isArray(store.bot?.conversation)?store.bot.conversation:[];
  const drafts=Object.entries(store.drafts||{});
  if(old.length||drafts.length||store.bot?.document){
   const at=Date.now(),events=old.map(m=>({id:crypto.randomUUID(),at,kind:'legacy',role:m.role,text:String(m.content||'')}));
   for(const [id,text] of drafts)events.push({id:crypto.randomUUID(),at,kind:'legacy',text:'Local draft '+id+'\n'+String(text)});
   if(store.bot?.document)events.push({id:crypto.randomUUID(),at,kind:'legacy',text:store.bot.document.name+'\n'+store.bot.document.text});
   db.threads.push({id:db.nextId++,title:'ארכיון Qwen מהגרסה הקודמת',titleLocked:true,createdAt:at,updatedAt:at,gptURL:'',events,files:[],remoteTranscript:[],pending:null});
  }
  db.legacyImported=true;save();
 }
 for(const t of db.threads)if(['sending','waiting'].includes(t.pending?.status)){t.pending.status='uncertain';t.pending.error='North נסגר בזמן השליחה. יש לבדוק את השיחה לפני שליחה נוספת.';}
 const changed=()=>{save();onChange();};
 const get=id=>{const t=db.threads.find(t=>t.id===Number(id));if(!t)throw Error('השיחה לא נמצאה');return t;};
 const event=(t,kind,data)=>t.events.push({id:crypto.randomUUID(),at:Date.now(),kind,...data});
 const snapshot=()=>JSON.parse(JSON.stringify({active:db.active,threads:db.threads}));
 function create(title='שיחה חדשה',task){const t={id:db.nextId++,title:String(title).slice(0,150),titleLocked:title!=='שיחה חדשה',taskId:task?.id||null,course:task?.course||'',createdAt:Date.now(),updatedAt:Date.now(),gptURL:'',events:[],files:[],remoteTranscript:[],pending:null};db.threads.push(t);db.active=t.id;changed();return t;}
 function active(){return db.active?get(db.active):null;}
 function choose(id){const t=get(id);db.active=t.id;changed();return t;}
 async function open(id){const t=choose(id);await web.open(t);return t;}
 async function prepare(text,{files=[],task,threadId,manualPrompt,activate=true}={}){
  text=String(text||'').trim();if(text.length>12000)throw Error('הבקשה ארוכה מדי. אפשר לפצל אותה?');
  const previousActive=db.active;let t=threadId?get(threadId):task?db.threads.find(t=>t.taskId===task.id):active();
  if(!t){t=create(task?.title||text.slice(0,70)||files[0]?.name||'שיחה חדשה',task);t.titleLocked=false;}
  if(['sending','waiting','uncertain'].includes(t.pending?.status))throw Error('יש שליחה שעדיין לא הסתיימה בשיחה הזאת. בדוק את GPT או פתח שיחה חדשה.');
  db.active=activate?t.id:previousActive;for(const file of files)if(!t.files.some(f=>f.id===file.id))t.files.push(file);
  const request={text,task:task||null,files:files.map(f=>({...f}))};event(t,'request',request);
  const pending={nonce:crypto.randomBytes(12).toString('hex'),status:'preparing',request,prompt:'',files:[],reason:'',createdAt:Date.now()};t.pending=pending;t.updatedAt=Date.now();changed();
  try{
   const result=manualPrompt?{decision:'gpt',title:t.title,prompt:manualPrompt,reason:'פרומפט שנערך ידנית',fileIds:t.files.map(f=>f.id)}:await plan({request,thread:{title:t.title,course:t.course,gptURL:t.gptURL,history:t.events.slice(-16),files:t.files}});
   if(t.pending!==pending)return {superseded:true};
   if(result.decision==='clarify'){pending.status='clarify';pending.question=String(result.question||'מה תרצה ש־GPT יעשה עם החומר?').slice(0,700);event(t,'clarification',{text:pending.question});changed();return {thread:t,question:pending.question};}
   if(result.decision==='deliver'){pending.status='delivered';event(t,'source_delivery',{text:text||task?.description||task?.title||'',files});changed();return {thread:t,delivery:{text:text||task?.description||task?.title||'חומר המקור',files}};}
   if(result.decision!=='gpt'||typeof result.prompt!=='string'||!result.prompt.trim()||result.prompt.length>18000)throw Error('המודל המקומי לא יצר פרומפט תקין. אפשר לנסות שוב או לערוך פרומפט ידנית.');
   const ids=result.fileIds===undefined?t.files.map(f=>f.id):result.fileIds;
   if(!Array.isArray(ids)||ids.some(id=>!t.files.some(f=>f.id===id)))throw Error('המודל המקומי בחר קובץ שאינו קיים.');
   const selected=new Set([...ids,...files.map(f=>f.id)]);pending.files=t.files.filter(f=>selected.has(f.id)).map(f=>({...f}));if(pending.files.length>10)throw Error('אפשר לצרף עד 10 קבצים לשליחה אחת ב־North.');
   pending.prompt=result.prompt.trim();pending.reason=String(result.reason||'').slice(0,1000);pending.status='approval';
   if(!t.gptURL&&!t.titleLocked&&result.title)t.title=String(result.title).slice(0,150);
   event(t,'proposal',{nonce:pending.nonce,prompt:pending.prompt,reason:pending.reason,files:pending.files});changed();return {thread:t,pending};
  }catch(e){if(t.pending===pending){pending.status='error';pending.error=e.message;event(t,'error',{text:e.message});changed();}throw e;}
 }
 function validate(id,nonce){const t=get(id),p=t.pending;if(!p||p.status!=='approval'||p.nonce!==nonce)throw Error('האישור הזה כבר לא תקף. אשר את הפרומפט העדכני בשיחה.');return {t,p};}
 function cancel(id,nonce){const {t,p}=validate(id,nonce);p.status='canceled';event(t,'canceled',{nonce});changed();}
 function edit(id,prompt){const t=get(id);return prepare(t.pending?.request?.text||'עדכון הפרומפט',{threadId:t.id,manualPrompt:String(prompt).trim()});}
 function complete(t,p,result){
  if(typeof result.text!=='string'||!result.text.trim())throw Error('GPT לא החזיר תשובה שניתן לקרוא.');
  t.gptURL=result.url||t.gptURL;t.remoteTranscript=result.transcript||t.remoteTranscript;
  p.status='complete';p.answer=result.text;p.filesReceived=result.files||[];p.downloadErrors=result.downloadErrors||[];for(const file of p.filesReceived)if(!t.files.some(f=>f.id===file.id))t.files.push(file);p.completedAt=Date.now();event(t,'gpt_response',{text:result.text,url:t.gptURL,files:result.files||[],downloadErrors:p.downloadErrors});t.updatedAt=Date.now();changed();
 }
 async function approve(id,nonce){
  const {t,p}=validate(id,nonce);p.deliveryOwner=deliveryOwner();p.status='sending';event(t,'approved',{nonce,prompt:p.prompt,files:p.files});changed();
  try{
   const result=await web.send({thread:t,prompt:p.prompt,files:p.files,onSubmitted:data=>{p.status='waiting';Object.assign(p,{submission:data});if(data.url)t.gptURL=data.url;event(t,'submitted',data);changed();}});
   complete(t,p,result);
  }catch(e){p.status=e.submitted||p.submission?'uncertain':'error';p.error=e.message;event(t,'error',{text:e.message,uncertain:p.status==='uncertain'});changed();throw e;}
  try{await onResult({thread:t,pending:p});}catch(e){p.deliveryError=e.message;changed();}return t;
 }
 async function recover(id){const t=get(id),p=t.pending;if(!p?.submission||!['waiting','uncertain'].includes(p.status))throw Error('אין תשובה ממתינה שאפשר לאסוף.');const result=await web.collect({thread:t,baseline:p.submission});complete(t,p,result);try{await onResult({thread:t,pending:p});}catch(e){p.deliveryError=e.message;changed();}return t;}
 function rename(id,title){const t=get(id);title=String(title).trim();if(!title||title.length>150)throw Error('בחר כותרת עד 150 תווים');t.title=title;t.titleLocked=true;changed();}
 function status(){return snapshot();}
 return {prepare,approve,cancel,edit,open,recover,rename,create,active,choose,get,status,changed};
}
module.exports={createGptWorkflow,safeChatURL};
