'use strict';
// This entry point is used only by the real Electron UI suite. Never reuse the
// developer's signed-in profile, bot credentials, tray settings or saved files.
const {app,shell}=require('electron');
if(process.env.NORTH_TEST_GPT==='1'){
 const module=require('../src/gpt-web'),original=module.createChatGPTWeb;
 module.createChatGPTWeb=options=>original({...options,baseURL:process.env.NORTH_TEST_GPT_URL,readyTimeout:10000,responseTimeout:20000});
 global.__northTestDocuments=require('../src/study-documents');global.__northTestFiles={};
}
if(process.env.NORTH_TEST_CONVERSATION==='1')global.__northTestDocuments=require('../src/study-documents');
app.setPath('userData',process.env.NORTH_TEST_PROFILE);
const external=[];
shell.openExternal=async url=>{external.push(url);};
global.__northTestExternal=external;
const folders=[];
shell.showItemInFolder=file=>folders.push(file);
global.__northTestFolders=folders;
if(process.env.NORTH_TEST_TELEGRAM==='1'){
 global.__northTestTelegramQueue=[];
 global.__northTestBotSent=[];global.__northTestModelRequests=[];
 const originalFetch=global.fetch;
 global.fetch=async(url,options)=>{
  if(process.env.NORTH_TEST_CONVERSATION==='1'){
   if(String(url).startsWith('http://127.0.0.1:11434/api/')){
    if(String(url).endsWith('/tags'))return {ok:true,json:async()=>({models:[{name:'qwen2.5:7b'}]})};
    const body=JSON.parse(options.body);global.__northTestModelRequests.push(body);
    return {ok:true,json:async()=>({message:{role:'assistant',content:global.__northTestModelRequests.length===1?'الإجابة الأولى: أربعة.\nالإجابة الثانية: شكرًا.\nזו טיוטת תשובות לפי הקובץ ששלחת.':'הנה הסבר מפורט יותר לתשובה הקודמת: 2 + 2 = 4.'}})};
   }
   if(String(url).startsWith('https://api.telegram.org/file/bot'))return new Response(global.__northTestPDF,{status:200});
  }
  if(process.env.NORTH_TEST_GPT==='1'){
   if(String(url).startsWith('http://127.0.0.1:11434/api/')){
    if(String(url).endsWith('/tags'))return{ok:true,json:async()=>({models:[{name:'qwen2.5-coder:7b'}]})};
    const body=JSON.parse(options.body),context=JSON.parse(body.messages.at(-1).content);global.__northTestModelRequests.push(body);
    const result={decision:context.request.text?'gpt':'clarify',title:context.request.task?.title||'שיחת לימודים',reason:'המודל המקומי מכין פרומפט בלבד',prompt:'GPT-PROMPT: '+context.request.text,question:'מה תרצה ש־GPT יעשה?',fileIds:context.thread.files.filter(f=>!f.name.startsWith('answer')).map(f=>f.id)};
    return{ok:true,json:async()=>({message:{content:JSON.stringify(result)}})};
   }
   if(String(url).startsWith('https://api.telegram.org/file/bot'))return new Response(global.__northTestFiles[String(url).split('/').pop()]||global.__northTestPDF,{status:200});
  }
  if(!String(url).startsWith('https://api.telegram.org/bot'))return originalFetch(url,options);
  const method=String(url).split('/').pop();let result=true;
  if(method==='getMe')result={username:'NorthStudyHelperBot'};
  if(method==='getWebhookInfo')result={url:''};
  if(method==='getUpdates'){await new Promise(r=>setTimeout(r,100));result=global.__northTestTelegramQueue.splice(0);}
  if(method==='getFile')result={file_path:process.env.NORTH_TEST_GPT==='1'?'documents/'+JSON.parse(options.body).file_id+'.dat':'documents/test.pdf'};
  if(method==='sendMessage')global.__northTestBotSent.push({method,...JSON.parse(options.body)});
  if(method==='sendDocument')global.__northTestBotSent.push({method,chat_id:options.body.get('chat_id'),document:Buffer.from(await options.body.get('document').arrayBuffer()).toString('base64')});
  return {ok:true,json:async()=>({ok:true,result})};
 };
}
app.on('web-contents-created',(_e,wc)=>{
 wc.on('console-message',event=>console.log(JSON.stringify({type:'console',id:wc.id,level:event.level,message:event.message,url:event.sourceId})));
 wc.on('preload-error',(_event,file,error)=>console.log(JSON.stringify({type:'preload-error',file,message:error.message})));
 wc.on('did-fail-load',(_event,code,message,url,isMainFrame)=>console.log(JSON.stringify({type:'navigation-error',code,message,url,isMainFrame})));
 wc.on('did-navigate',(_event,url)=>console.log(JSON.stringify({type:'navigation',id:wc.id,url})));
});
require('../src/main');
