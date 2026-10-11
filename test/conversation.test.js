'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStudyConversation}=require('../src/study-conversation');
const {createStudyAgent}=require('../src/study-agent');
const {createTelegramBot}=require('../src/telegram-bot');
const {readDocument,answerHTML}=require('../src/study-documents');
test('Conversation retains context across reconstruction and explicit reset clears attachment',async()=>{
 const store={},bodies=[];let saves=0;const options={store,save:()=>saves++,model:async msgs=>{bodies.push(structuredClone(msgs));return{content:'שלום אבישי'};},actions:{}};
 await createStudyConversation(options).reply('קוראים לי אבישי',{name:'test.txt',text:'question'});
 const restarted=createStudyConversation(options);await restarted.reply('איך קוראים לי?');assert.ok(bodies[1].some(m=>m.content==='קוראים לי אבישי'));assert.ok(bodies[1].some(m=>m.content.includes('question')));assert.equal(saves,2);restarted.reset();assert.equal(store.bot.conversation,undefined);assert.equal(store.bot.document,undefined);
});
test('Tool calls use actual actions and reject unknown tools and missing task IDs',async()=>{
 const store={};let calls=0,scans=0,drafts=0;
 const c=createStudyConversation({store,save:()=>{},actions:{scan:async()=>{scans++;return{assignments:2};},tasks:async()=>[{id:'a'}],draft:async()=>drafts++},model:async msgs=>{
  if(!calls++)return{tool_calls:[{function:{name:'scan_classroom',arguments:{}}},{function:{name:'draft_task',arguments:{id:'missing'}}},{function:{name:'execute_shell',arguments:{command:'bad'}}}]};
  assert.ok(msgs.some(m=>m.role==='tool'&&m.content.includes('assignments')));assert.equal(msgs.filter(m=>m.role==='tool'&&m.content.includes('error')).length,2);return{content:'נמצאו שתי מטלות'};
 }});assert.equal(await c.reply('תבדוק מה חדש'),'נמצאו שתי מטלות');assert.equal(scans,1);assert.equal(drafts,0);
});
test('Model failure preserves completed history and missing local model is explained',async()=>{
 const store={bot:{conversation:[{role:'assistant',content:'previous'}]}};
 const c=createStudyConversation({store,save:()=>{},actions:{},model:async()=>{throw Error('offline')}});await assert.rejects(c.reply('next'),/offline/);assert.equal(store.bot.conversation.length,1);
 const a=createStudyAgent({store:{},save:()=>{},items:()=>[],transport:async()=>{throw new TypeError('fetch failed')}});await assert.rejects(a.converse([],[]),/Ollama/);
});
test('Uses existing Qwen variant and prefers general model to coder model',async()=>{
 const selected=[];const a=createStudyAgent({store:{},save:()=>{},items:()=>[],transport:async(url,o)=>url.endsWith('/tags')?{ok:true,json:async()=>({models:[{name:'qwen2.5-coder:7b'},{name:'qwen2.5:7b'}]})}:{ok:true,json:async()=>{selected.push(JSON.parse(o.body).model);return{message:{content:'ok'}};}}});await a.converse([],[]);assert.deepEqual(selected,['qwen2.5:7b']);
});
test('Document input rejects oversized/unsupported files and output escapes HTML',async()=>{
 await assert.rejects(readDocument(Buffer.alloc(20*1024*1024+1),'x.pdf'),/20MB/);await assert.rejects(readDocument(Buffer.from('invalid'),'x.pdf'),/PDF/);assert.equal((await readDocument(Buffer.from('Question 2+2'),'x.txt')).text,'Question 2+2');assert.ok(answerHTML('<script>bad</script>').includes('&lt;script&gt;'));assert.ok(!answerHTML('<script>bad</script>').includes('<script>'));
});
test('Owner-only natural requests select numbered tasks, revise without ID and do not truncate answers',async()=>{
 const store={bot:{owner:'1',offset:0}},queue=[],out=[],revisions=[];let scanCount=0,models=0;
 const transport=async(url,o)=>{const method=url.split('/').pop();let result=true;const body=o?.body instanceof FormData?{}:JSON.parse(o?.body||'{}');if(method==='getMe')result={username:'NorthStudyHelperBot'};if(method==='getWebhookInfo')result={url:''};if(method==='getUpdates'){await new Promise(r=>setTimeout(r,5));result=queue.splice(0);}if(method==='sendMessage')out.push(body.text);return{ok:true,json:async()=>({ok:true,result})};};
 const bot=createTelegramBot({readState:()=>store,writeState:()=>{},getToken:()=> 'fake',saveToken:()=>{},transport,scan:async()=>{scanCount++;return{};},tasks:async()=>[{id:'task-a',title:'Arabic'}],classes:async()=>[],draft:async(id,instruction)=>{revisions.push([id,instruction]);return{id,title:'Arabic',text:'x'.repeat(8000)};},converse:async()=>{models++;return{content:'friendly'};}});
 let n=0;for(const [id,text] of [[2,'תבדוק את הקלסרום'],[1,'היי'],[1,'מה יש לי לעשות?'],[1,'תעשה את 1'],[1,'תתקן את הסעיף השני'],[1,'תבדוק את הקלסרום']])queue.push({update_id:++n,message:{chat:{id,type:'private'},text}});
 await bot.start();try{for(let i=0;i<100&&!out.some(s=>s.startsWith('סריקה הסתיימה'));i++)await new Promise(r=>setTimeout(r,10));assert.equal(scanCount,1);assert.deepEqual(revisions,[['task-a',''],['task-a','תתקן את הסעיף השני']]);assert.equal(models,0);assert.ok(out.filter(s=>/^x+$/.test(s)).join('').length>8000);assert.ok(!out.some(s=>s.includes('פקודה לא מזוהה')));}finally{bot.stop();}
});
