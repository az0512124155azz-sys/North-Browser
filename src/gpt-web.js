'use strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// These operations interact with the website DOM. No private ChatGPT API,
// session token export, challenge bypass or OpenAI API key is used.
function inspectPage(){
 const visible=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const composer=[...document.querySelectorAll('#prompt-textarea,textarea[data-testid="prompt-textarea"]')].find(visible);
 const send=[...document.querySelectorAll('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="שלח הודעה"],button[aria-label="שליחת הודעה"]')].find(visible);
 const busy=!![...document.querySelectorAll('button[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="עצור יצירה"],[data-is-streaming="true"]')].find(visible);
 const nodes=[...document.querySelectorAll('[data-message-author-role]')];
 const transcript=nodes.map(e=>({role:e.getAttribute('data-message-author-role'),text:(e.querySelector('.markdown')||e).innerText,id:e.getAttribute('data-message-id')||''})).filter(m=>['user','assistant'].includes(m.role));
 const assistants=nodes.filter(e=>e.getAttribute('data-message-author-role')==='assistant'),last=assistants.at(-1);
 const root=composer?.closest('form')||composer?.parentElement?.parentElement;
 const attach=[...document.querySelectorAll('button[data-testid="composer-plus-btn"],button[aria-label*="Attach"],button[aria-label*="צרף"]')].find(visible);
 const error=[...document.querySelectorAll('[role="alert"]')].map(e=>e.innerText).filter(Boolean).join('\n');
 const challenge=/just a moment|verify you are human|checking your browser/i.test(document.title+' '+document.body.innerText.slice(0,400));
 const login=!![...document.querySelectorAll('[data-testid="login-button"],a[href*="/auth/login"]')].find(visible);
 const links=last?[...last.querySelectorAll('a')].filter(a=>a.hasAttribute('download')||/\.(pdf|docx|xlsx|csv|txt|png)(?:[?#]|$)/i.test(a.textContent+' '+a.getAttribute('href'))).map(a=>({href:a.href,label:a.innerText})):[];
 return {composer:!!composer,value:composer?(composer.value??composer.innerText):'',send:!!send,canSend:!!send&&!send.disabled,busy,login,challenge,error,url:location.href,userCount:transcript.filter(m=>m.role==='user').length,assistantCount:assistants.length,text:last?(last.querySelector('.markdown')||last).innerText:'',transcript,links,attachments:root?.innerText||'',uploading:!!root?.querySelector('[role="progressbar"],[data-testid="upload-progress"]'),fileInput:!!document.querySelector('input[type="file"]'),attach:attach?{x:attach.getBoundingClientRect().x+attach.offsetWidth/2,y:attach.getBoundingClientRect().y+attach.offsetHeight/2}:null,sendPoint:send?{x:send.getBoundingClientRect().x+send.offsetWidth/2,y:send.getBoundingClientRect().y+send.offsetHeight/2}:null};
}
function fillComposer(text){
 const el=document.querySelector('#prompt-textarea,textarea[data-testid="prompt-textarea"]');if(!el)throw Error('Composer missing');
 el.focus();if(el.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
 else{document.execCommand('selectAll',false);document.execCommand('insertText',false,text);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
}
function clickUploadMenu(){const e=[...document.querySelectorAll('[role="menuitem"],button')].find(e=>/upload from computer|upload files|add photos.*files|העלה.*קבצ|העלאת.*קבצ|הוספת.*קבצ/i.test(e.textContent)&&e.getBoundingClientRect().width>0);if(e)e.click();return !!e;}
function createChatGPTWeb({getTab,fileStore,captureDownload,baseURL='https://chatgpt.com/',readyTimeout=30000,responseTimeout=600000,onChange=()=>{}}){
 const origin=new URL(baseURL).origin;let busy=false,stopped=false;
 const chatURL=url=>{try{const u=new URL(url);return u.origin===origin&&/^\/c\/[a-zA-Z0-9-]+\/?$/.test(u.pathname)?u.href:'';}catch{return '';}};
 function trusted(wc){if(stopped||wc.isDestroyed())throw Error('הטאב של GPT נסגר.');const u=new URL(wc.getURL());if(u.origin!==origin||!/^\/(?:c\/[a-zA-Z0-9-]+\/?)?$/.test(u.pathname))throw Error('פתח את ChatGPT והתחבר לחשבון בתוך North.');}
 async function exec(wc,fn,...args){trusted(wc);return wc.executeJavaScript('('+fn.toString()+')('+args.map(v=>JSON.stringify(v)).join(',')+')',true);}
 async function state(wc){return exec(wc,inspectPage);}
 function click(wc,point){trusted(wc);wc.sendInputEvent({type:'mouseMove',...point});wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});}
 async function ready(wc){
  const start=Date.now();while(Date.now()-start<readyTimeout){
   if(wc.isDestroyed())throw Error('הטאב של GPT נסגר.');if(!wc.getURL()||wc.isLoading()){await delay(250);continue;}
   const s=await state(wc);if(s.challenge)throw Error('ChatGPT מציג בדיקת דפדפן. פתח את הטאב והשלם אותה ידנית; לא נשלח דבר.');if(s.login)throw Error('צריך להתחבר ל־ChatGPT בתוך North לפני השליחה.');if(s.composer)return s;await delay(300);
  }throw Error('לא נמצא שדה ההודעה של ChatGPT. פתח את האתר; ייתכן שנדרשת התחברות או שהממשק השתנה.');
 }
 async function open(thread){const wc=await getTab(thread,thread.gptURL||baseURL);await ready(wc);return wc;}
 async function upload(wc,files){
  if(!files.length)return;const paths=fileStore.paths(files);let s=await state(wc);
  if(!s.fileInput&&s.attach){click(wc,s.attach);await delay(250);await exec(wc,clickUploadMenu);await delay(250);}
  await exec(wc,function(){const input=document.querySelector('input[type="file"]');if(input)input.value='';});
  trusted(wc);if(wc.debugger.isAttached())throw Error('סגור את כלי המפתחים בטאב GPT לפני צירוף קבצים.');
  wc.debugger.attach('1.3');
  try{const doc=await wc.debugger.sendCommand('DOM.getDocument');const query=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type="file"]'});if(!query.nodeId)throw Error('לא נמצא צירוף קבצים בממשק ChatGPT. אפשר לפתוח את הטאב ולבדוק את החשבון.');await wc.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:query.nodeId,files:paths});}
  finally{if(!wc.isDestroyed()&&wc.debugger.isAttached())wc.debugger.detach();}
  const start=Date.now();while(Date.now()-start<120000){
   s=await state(wc);if(s.error)throw Error('ChatGPT לא אישר את הקבצים: '+s.error.slice(0,400));
   if(files.every(f=>s.attachments.includes(f.name))&&!s.uploading){await delay(500);return;}
   await delay(400);
  }throw Error('צירוף הקבצים לא הושלם. לא נלחץ שלח. בדוק את מכסת הקבצים ואת הטאב.');
 }
 async function collect({thread,baseline,wc,onSubmitted=()=>{}}){
  wc=wc||await open(thread);let expected=chatURL(thread.gptURL)||chatURL(baseline.url),last='',stable=0,start=Date.now();
  while(Date.now()-start<responseTimeout){
   const s=await state(wc),url=chatURL(s.url);
   if(expected&&url!==expected)throw Object.assign(Error('הטאב עבר לשיחה אחרת. לא נאספה תשובה מהשיחה האחרת.'),{submitted:true});
   if(url&&!expected){expected=url;onSubmitted({...baseline,url});}
   if(s.error&&!s.busy)throw Object.assign(Error('ChatGPT: '+s.error.slice(0,600)),{submitted:true});
   if(s.userCount>baseline.userCount&&s.assistantCount>baseline.assistantCount&&s.text.trim()&&!s.busy){
    if(s.text===last){if(!stable)stable=Date.now();if(Date.now()-stable>2200){if(!url)throw Object.assign(Error('לא נוצר קישור קבוע לשיחה. בדוק שהחשבון מחובר.'),{submitted:true});const files=[],downloadErrors=[];for(const link of s.links.slice(0,5)){if(!captureDownload)break;try{const u=new URL(link.href);if(u.origin!==origin&&u.protocol!=='sandbox:')continue;const file=await captureDownload(wc,()=>exec(wc,function(href){const last=[...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1);const a=[...last.querySelectorAll('a')].find(a=>a.href===href);if(!a)throw Error('קישור הקובץ נעלם');a.click();},link.href));files.push(file);}catch(e){downloadErrors.push(e.message);}}return {text:s.text,url,transcript:s.transcript,files,downloadErrors};}}
    else{last=s.text;stable=0;}
   }else stable=0;
   await delay(350);
  }throw Object.assign(Error('GPT עדיין לא סיים או לא ניתן לקרוא את התשובה. פתח את השיחה ואסוף את התשובה; לא תישלח בקשה נוספת אוטומטית.'),{submitted:true});
 }
 async function send({thread,prompt,files,onSubmitted}){
  if(busy)throw Error('יש שליחה אחרת ל־GPT שמתבצעת כרגע. המתן לסיומה.');busy=true;let submitted=false;
  try{
   const wc=await open(thread),before=await state(wc);
   if(thread.gptURL&&chatURL(before.url)!==chatURL(thread.gptURL))throw Error('הטאב אינו בשיחה שנבחרה. פתח את השיחה מחדש.');
   if(before.busy)throw Error('GPT כבר כותב תשובה בטאב הזה. המתן לסיום.');if(before.value.trim())throw Error('יש טיוטה בשדה של GPT. שלח או נקה אותה ידנית לפני ניסיון נוסף.');
   fileStore.paths(files);await upload(wc,files);await exec(wc,fillComposer,prompt);
   let s;const start=Date.now();do{s=await state(wc);if(s.canSend)break;await delay(300);}while(Date.now()-start<15000);
   if(!s.canSend||s.value.replace(/\r/g,'').trim()!==prompt.replace(/\r/g,'').trim())throw Error('הפרומפט לא הוזן בשלמותו או שליחה אינה זמינה. לא נלחץ שלח.');
   const baseline={userCount:before.userCount,assistantCount:before.assistantCount,url:chatURL(s.url),at:Date.now()};
   onSubmitted(baseline);submitted=true;click(wc,s.sendPoint);onChange();return await collect({thread,baseline,wc,onSubmitted});
  }catch(e){if(submitted)e.submitted=true;throw e;}finally{busy=false;onChange();}
 }
 return {open,send,collect,stop:()=>{stopped=true;},status:()=>({busy,provider:'chatgpt-web'})};
}
module.exports={createChatGPTWeb,inspectPage};
