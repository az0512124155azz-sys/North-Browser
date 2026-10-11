'use strict';
const {_electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'north-conversation-')),out=path.resolve('test-results/electron/conversation');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(profile,'north-study-state.json'),JSON.stringify({bot:{owner:'111',offset:0}}));
const report={checks:[],errors:[],limitations:['Telegram transport and model responses are simulated; Electron, PDF parsing, PDF export, IPC and stored conversation are real.','Live local Qwen was tested separately, not in CI.']};
let app,page,log='';
const wait=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+label);};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
(async()=>{
 app=await _electron.launch({args:[path.join(__dirname,'electron-bootstrap.cjs')],env:{...process.env,NORTH_TEST_PROFILE:profile,NORTH_TEST_TELEGRAM:'1',NORTH_TEST_CONVERSATION:'1',NORTH_TELEGRAM_BOT_TOKEN:'100000:test_token_test_token_test_token'}});
 const proc=app.process();for(const s of [proc.stdout,proc.stderr])s.on('data',b=>log+=b.toString());page=await app.firstWindow();await page.waitForSelector('.tab');
 await check('Real Electron creates and reads an Arabic/Hebrew PDF attachment',async()=>{
  const text=await app.evaluate(async({BrowserWindow})=>{
   const docs=global.__northTestDocuments;
   global.__northTestPDF=await docs.renderAnswerPDF(BrowserWindow,'שאלות לתרגול: כמה הם 2 + 2?\nالسؤال الثاني: اكتب كلمة شكرًا.');
   return (await docs.readDocument(global.__northTestPDF,'questions.pdf')).text;
  });console.log('PDF extracted:',JSON.stringify(text));assert.match(text,/2\s*\+\s*2/);assert.ok(text.includes('السؤال'));
 });
 await check('PDF caption is handled as a natural request and the complete answer is returned as PDF',async()=>{
  await app.evaluate(()=>global.__northTestTelegramQueue.push({update_id:1,message:{chat:{id:111,type:'private'},caption:'תענה על השאלות בערבית ותשלח לי PDF מסודר',document:{file_id:'fixture',file_name:'questions.pdf',file_size:global.__northTestPDF.length}}}));
  await wait(()=>app.evaluate(()=>global.__northTestBotSent.some(s=>s.method==='sendDocument')),'PDF reply');
  const result=await app.evaluate(async()=>{
   const request=global.__northTestModelRequests[0],file=global.__northTestBotSent.find(s=>s.method==='sendDocument');
   const docs=global.__northTestDocuments;
   return {caption:request.messages.at(-1).content,attachment:request.messages.some(m=>m.content.includes('السؤال')),text:(await docs.readDocument(Buffer.from(file.document,'base64'),'answer.pdf')).text,base64:file.document};
  });assert.ok(result.caption.includes('בערבית'));assert.equal(result.attachment,true);assert.ok(result.text.includes('أربعة'));fs.writeFileSync(path.join(out,'answers.pdf'),Buffer.from(result.base64,'base64'));
 });
 await check('Follow-up has previous answer and attachment without IDs or commands',async()=>{
  await app.evaluate(()=>global.__northTestTelegramQueue.push({update_id:2,message:{chat:{id:111,type:'private'},text:'תפרט יותר בבקשה'}}));
  await wait(()=>app.evaluate(()=>global.__northTestModelRequests.length===2),'follow-up');
  await wait(()=>app.evaluate(()=>global.__northTestBotSent.some(s=>s.text?.includes('הנה הסבר מפורט'))),'follow-up answer');
  const history=await app.evaluate(()=>global.__northTestModelRequests[1].messages);assert.ok(history.some(m=>m.role==='assistant'&&m.content.includes('أربعة')));assert.ok(history.some(m=>m.content.includes('questions.pdf')));
 });
 await check('Arabic PDF answer preview renders with actual Chromium',async()=>{
  const promise=app.waitForEvent('window');await app.evaluate(async({BrowserWindow})=>{const docs=global.__northTestDocuments;global.__northPreview=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await global.__northPreview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(docs.answerHTML('الإجابة الأولى: أربعة.\nالإجابة الثانية: شكرًا.\nזו טיוטת תשובות לפי הקובץ ששלחת.')));});
  const preview=await promise;await preview.waitForSelector('article');await preview.screenshot({path:path.join(out,'answer-preview.png')});assert.equal(await preview.locator('html').getAttribute('dir'),'rtl');await app.evaluate(()=>global.__northPreview.destroy());
 });
 await check('Unknown owner cannot send an attachment and chat can be cleared naturally',async()=>{
  await app.evaluate(()=>global.__northTestTelegramQueue.push({update_id:3,message:{chat:{id:222,type:'private'},document:{file_id:'bad',file_name:'questions.pdf'}}},{update_id:4,message:{chat:{id:111,type:'private'},text:'תמחק את השיחה'}}));
  await wait(()=>app.evaluate(()=>global.__northTestBotSent.some(s=>s.text?.includes('מתחילים מחדש'))),'reset');const data=JSON.parse(fs.readFileSync(path.join(profile,'north-study-state.json'),'utf8'));assert.equal(data.bot.document,undefined);assert.equal(data.bot.conversation,undefined);assert.equal(await app.evaluate(()=>global.__northTestModelRequests.length),2);
 });
 await page.evaluate(()=>window.north.quit());await app.close();report.result='passed';
})().catch(e=>{report.errors.push(e.stack);report.result='failed';console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close().catch(()=>{});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'runtime.log'),log);});
