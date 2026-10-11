'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createTelegramBot}=require('../src/telegram-bot');
const {toState,safeClassroomUrl}=require('../src/classroom-scanner');
const {createStudyAgent}=require('../src/study-agent');
function mock(){const state={};let saved='';const outbound=[];const transport=async(url,options={})=>{
 const m=String(url).split('/').at(-1);const body=JSON.parse(options.body||'{}');if(m==='getMe')return {ok:true,json:async()=>({ok:true,result:{username:'OtherBot'}})};
 if(m==='getWebhookInfo')return {ok:true,json:async()=>({ok:true,result:{url:''}})};
 if(m==='sendMessage'){outbound.push(body);return{ok:true,json:async()=>({ok:true,result:{message_id:1}})}};
 if(m==='getUpdates')return{ok:true,json:async()=>({ok:true,result:[]})};
 return{ok:true,json:async()=>({ok:true,result:true})};
 };const bot=createTelegramBot({readState:()=>state,writeState:()=>{},getToken:()=>saved,saveToken:t=>saved=t,scan:async()=>({courses:2,assignments:1,announcements:0}),tasks:async()=>[{id:'aa',title:'Math',course:'9A',state:'missing',url:'https://classroom.google.com/c/a/a/a'}],classes:async()=>[],draft:async()=>({id:'aa',title:'Math',text:'solution'}),addTask:async()=>({id:'abc',title:'new'}),transport});return{bot,outbound,state};}
test('bot name immutable',()=>{const m=mock();assert.equal(m.bot.username,'NorthStudyHelperBot')});
test('Classroom URLs limited',()=>{assert.equal(safeClassroomUrl('https://classroom.google.com/c/1'),true);assert.equal(safeClassroomUrl('https://example.com'),false)});
test('submitted status does not mark not-submitted completed',()=>{assert.equal(toState('לא הוגש'),'missing');assert.equal(toState('Turned in'),'turned_in')});
test('bot rejects wrong bot token',async()=>{const m=mock();await assert.rejects(m.bot.verifyAndSave('123456:aaaaaaaaaaaaaaaaaaaaaaaaa'),/does not belong/)});
test('bot will not send without configured token',async()=>{const m=mock();await assert.rejects(m.bot.handleCommand('111','/tasks'),/token is not configured/)});
test('Qwen revision passes prior draft to model',async()=>{const state={};const bodies=[];const agent=createStudyAgent({store:state,save:()=>{},items:()=>[{id:'t',title:'Math',description:'2+2'}],transport:async(u,o)=>{if(u.endsWith('/tags'))return{ok:true,json:async()=>({models:[{name:'qwen2.5'}]})};bodies.push(JSON.parse(o.body));return{ok:true,json:async()=>({message:{content:bodies.length===1?'four':'4'}})}}});await agent.draft('t');await agent.draft('t','correct answer');assert.equal(state.drafts.t,'4');assert.equal(bodies[1].messages[1].content.includes('four'),true)});
