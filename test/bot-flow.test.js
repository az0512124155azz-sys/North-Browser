'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTelegramBot}=require('../src/telegram-bot');
const TOKEN='100000:test_token_test_token_test_token'; // fake test-only credential
test('pairing requires a code and only authorized private chat executes scans',async()=>{
 const store={};let scanCount=0;const messages=[];const queue=[];
 const transport=async(url,opts={})=>{
  const command=String(url).split('/').pop();
  const data=opts.body?JSON.parse(opts.body):{};
  if(command==='getMe')return{ok:true,json:async()=>({ok:true,result:{username:'NorthStudyHelperBot'}})};
  if(command==='getWebhookInfo')return{ok:true,json:async()=>({ok:true,result:{url:''}})};
  if(command==='getUpdates'){const result=queue.splice(0);return{ok:true,json:async()=>({ok:true,result})}};
  if(command==='sendMessage'){messages.push(data);return{ok:true,json:async()=>({ok:true,result:{message_id:messages.length}})}};
  return{ok:true,json:async()=>({ok:true,result:true})};
 };
 const bot=createTelegramBot({readState:()=>store,writeState:()=>{},getToken:()=>TOKEN,saveToken:()=>{},
  scan:async()=>{scanCount++;return{courses:2,assignments:3,announcements:1}},
  tasks:async()=>[],classes:async()=>[],draft:async()=>({}),addTask:async()=>({}),transport});
 const pair=bot.createPairingCode();assert.match(pair.code,/^\d{6}$/);
 queue.push(
  {update_id:1,message:{chat:{id:222,type:'private'},text:'/scan'}},
  {update_id:2,message:{chat:{id:111,type:'private'},text:'/link '+pair.code}},
  {update_id:3,message:{chat:{id:222,type:'private'},text:'/scan'}},
  {update_id:4,message:{chat:{id:111,type:'private'},text:'/scan'}}
 );
 await bot.start();await new Promise(r=>setTimeout(r,280));bot.stop();
 assert.equal(bot.getOwner(),'111');
 assert.equal(scanCount,1);
 assert.ok(messages.some(m=>String(m.text).includes('3 מטלות')));
 assert.ok(!messages.some(m=>String(m.chat_id)==='222'&&String(m.text).includes('מטלה חדשה')));
});
