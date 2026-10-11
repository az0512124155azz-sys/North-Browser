'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTelegramBot}=require('../src/telegram-bot');
test('Telegram deep link is stable until used, private, single-use and owner-scoped',async()=>{
 const store={},queue=[];let scans=0,saves=0;
 const transport=async(url)=>{const method=String(url).split('/').pop();let result=true;if(method==='getMe')result={username:'NorthStudyHelperBot'};if(method==='getWebhookInfo')result={url:''};if(method==='getUpdates'){await new Promise(r=>setTimeout(r,10));result=queue.splice(0);}return {ok:true,json:async()=>({ok:true,result})};};
 const options={readState:()=>store,writeState:()=>{saves++;},getToken:()=> 'test-only',saveToken:()=>{},scan:async()=>{scans++;return {};},tasks:async()=>[],classes:async()=>[],draft:async()=>({}),addTask:async()=>({}),transport};
 const bot=createTelegramBot(options),link=bot.createPairingCode();assert.equal(bot.createPairingCode().url,link.url);
 const payload=new URL(link.url).searchParams.get('start');assert.match(payload,/^link_[a-f0-9]{48}$/);
 queue.push({update_id:1,message:{chat:{id:222,type:'group'},text:'/start '+payload}},{update_id:2,message:{chat:{id:333,type:'private'},text:'/start link_'+'0'.repeat(48)}},{update_id:3,message:{chat:{id:111,type:'private'},text:'/start '+payload}},{update_id:4,message:{chat:{id:222,type:'private'},text:'/start '+payload}},{update_id:5,message:{chat:{id:222,type:'private'},text:'/scan'}},{update_id:6,message:{chat:{id:111,type:'private'},text:'/scan'}});
 await bot.start();await new Promise(r=>setTimeout(r,150));bot.stop();assert.equal(bot.getOwner(),'111');assert.equal(scans,1);assert.ok(saves>0);assert.equal(bot.createPairingCode(),null);
 const restarted=createTelegramBot(options);assert.equal(restarted.getOwner(),'111');assert.equal(restarted.createPairingCode(),null);
});
