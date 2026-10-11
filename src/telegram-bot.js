'use strict';
const crypto = require('node:crypto');
const FIXED_USERNAME = 'NorthStudyHelperBot';
const WAIT_MS = 2500;
const cut = (s, n = 3500) => String(s || '').slice(0, n);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createTelegramBot({readState, writeState, getToken, saveToken, scan, tasks, classes, messages=async()=>[], draft, addTask, onStatus = () => {}, transport = fetch}) {
  let running = false, generation = 0, pairingCode = null, pairingNonce = null, pairingUntil = 0;
  const state = readState();
  state.bot = state.bot || {owner: null, offset: 0};
  const persist = () => writeState(state);
  const progress = status => onStatus({bot: `@${FIXED_USERNAME}`, ownerLinked: !!state.bot.owner, running, ...status});
  const token = () => getToken();
  async function api(method, payload = {}, maxTime = 40000) {
    const key = token();
    if (!key) throw Error('Bot token is not configured');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), maxTime);
    try {
      const response = await transport(`https://api.telegram.org/bot${key}/${method}`, {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify(payload), signal:ctrl.signal
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw Error(`Telegram ${method}: ${data.description || response.status}`);
      return data.result;
    } finally { clearTimeout(timer); }
  }
  async function verifyAndSave(candidate) {
    const original = token();
    // Verification is performed using a supplied token WITHOUT persisting an unverified credential.
    if (!/^\d{5,}:[a-zA-Z0-9_-]{20,}$/.test(String(candidate || ''))) throw Error('Invalid Telegram token format');
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const response = await transport(`https://api.telegram.org/bot${candidate}/getMe`, {signal:ctrl.signal});
      const info = await response.json();
      if (!response.ok || !info.ok || info.result?.username?.toLowerCase() !== FIXED_USERNAME.toLowerCase()) {
        throw Error('Token does not belong to @' + FIXED_USERNAME);
      }
      saveToken(candidate);
      progress({connected:true});
      if (!running) start();
      return {username:FIXED_USERNAME};
    } finally {clearTimeout(timer);void original;}
  }
  function createPairingCode() {
    if (state.bot.owner) return null;
    if(!pairingCode||pairingUntil<=Date.now()){
      pairingCode = String(crypto.randomInt(100000,1000000));
      pairingNonce = crypto.randomBytes(24).toString('hex');
      pairingUntil = Date.now() + 10*60*1000;
    }
    return {code:pairingCode, expiresAt:pairingUntil, username:FIXED_USERNAME,url:`https://t.me/${FIXED_USERNAME}?start=link_${pairingNonce}`};
  }
  function unlink() {state.bot.owner=null;persist();return createPairingCode();}
  async function send(chatId, text, keyboard) {
    return api('sendMessage', {chat_id:chatId, text:cut(text,3900), ...(keyboard ? {reply_markup:{inline_keyboard:keyboard}} : {})});
  }
  async function toOwner(text, keyboard) {
    if (!state.bot.owner) return false;
    await send(state.bot.owner,text,keyboard);return true;
  }
  function formatted(task, i) {
    const completion = task.state === 'turned_in' ? '✅' : task.state === 'missing' ? '❗' : '◻️';
    return `${completion} ${i+1}. ${cut(task.title,120)}\n${cut(task.course,85)}${task.due ? ` · ${task.due}` : ''}`;
  }
  async function showTasks(chatId) {
    const rows = await tasks();
    if (!rows.length) return send(chatId,'לא נמצאו מטלות מסונכרנות. שלח /scan לבדיקת Classroom.');
    for(let i=0;i<Math.min(rows.length,30);i++) {
      const t=rows[i];
      await send(chatId,formatted(t,i)+(t.url ? `\n${t.url}` : ''), [[
        {text:'✍️ הכן טיוטה עם Qwen',callback_data:`run:${t.id}`},
        {text:'📋 פרטי מטלה',callback_data:`details:${t.id}`}
      ]]);
    }
    if(rows.length>30) await send(chatId,`מוצגות 30 מתוך ${rows.length} מטלות.`);
  }
  async function handleCommand(chatId,text) {
    const trimmed=String(text||'').trim();
    const [cmd,...args]=trimmed.split(/\s+/);
    switch((cmd||'').split('@')[0].toLowerCase()){
      case '/start':case '/help':return send(chatId,'North Study Helper\n/scan — סריקה מלאה\n/tasks — כל המטלות שנמצאו\n/classes — סטטוס לפי כיתה\n/messages — הודעות Classroom\n/new טקסט — משימה חדשה\n/run מזהה — טיוטה דרך Qwen\n/revise מזהה הוראות — תיקון טיוטה\n/status — מצב הסריקה\n\nב־North ניתן לראות את קוד הצימוד הראשוני. ChatGPT רגיל והגשה אוטומטית עדיין אינם מחוברים.');
      case '/scan': {
        await send(chatId,'מתחיל סריקה פנימית של Classroom. אעדכן בסיום.');
        try {const result=await scan();await send(chatId,`סריקה הסתיימה: ${result?.courses||0} כיתות, ${result?.assignments||0} מטלות, ${result?.announcements||0} הודעות. ${result?.authRequired?'נדרשת התחברות ל־Classroom בתוך North.':''}`);await showTasks(chatId);}catch(e){await send(chatId,'הסריקה נכשלה: '+cut(e.message,600));}
        return;
      }
      case '/tasks':return showTasks(chatId);
      case '/messages':{const rows=(await messages()).slice(0,12);if(!rows.length)return send(chatId,'לא נמצאו הודעות שנאספו מ-Classroom. שלח /scan.');for(const n of rows)await send(chatId,`📢 ${n.course}\n${cut(n.text,3200)}`);return;}
      case '/classes': {
        const list=await classes();
        return send(chatId,list.length?list.map(c=>`📚 ${c.name}: ${c.complete} הושלמו, ${c.pending} ממתינות, ${c.unknown||0} לא ידוע`).join('\n').slice(0,3900):'עדיין לא זוהו כיתות. שלח /scan.');
      }
      case '/new': {
        const description=args.join(' ').trim();if(!description)return send(chatId,'דוגמה: /new תכין לי סיכום על מלחמת העולם הראשונה');
        const item=await addTask(description);await send(chatId,`המשימה נשמרה: ${item.title}\nמזהה: ${item.id}`);return runDraft(chatId,item.id,'');
      }
      case '/run':return runDraft(chatId,args[0],'');
      case '/revise': {
        const [id,...rest]=args;const instruction=rest.join(' ').trim();if(!id||!instruction)return send(chatId,'דוגמה: /revise 12 תסביר יותר בפירוט');
        return runDraft(chatId,id,instruction);
      }
      case '/status':{const all=await tasks();return send(chatId,`North פעיל. נמצאו ${all.length} מטלות במאגר המקומי. הבוט: @${FIXED_USERNAME}.`);}
      case '/gpt':return send(chatId,'שליחה אוטומטית ל־ChatGPT באתר עדיין אינה זמינה בגרסת GitHub. ניתן להכין טיוטה מקומית עם Qwen באמצעות /run.');
      default:return send(chatId,'פקודה לא מזוהה. שלח /help.');
    }
  }
  async function runDraft(chatId,id,revision) {
    if(!id)return send(chatId,'חסר מזהה מטלה. שלח /tasks לבחירה.');
    await send(chatId,revision?'מכין גרסה מתוקנת…':'מכין טיוטה בעזרת Qwen 2.5 המקומי…');
    try {const result=await draft(id,revision);await send(chatId,`📝 ${result.title}\n\n${cut(result.text,3450)}\n\nלתיקון: /revise ${result.id} [הוראות]`);}
    catch(e){await send(chatId,'הכנת הטיוטה נכשלה: '+cut(e.message,650));}
  }
  async function processUpdate(update) {
    const message=update.message;const callback=update.callback_query;
    if(callback) {try{await api('answerCallbackQuery',{callback_query_id:callback.id})}catch{}}
    const chat=message?.chat||callback?.message?.chat;
    if(chat?.type!=='private'||!chat.id)return;
    const id=String(chat.id),value=String(message?.text||callback?.data||'').trim();
    if(!state.bot.owner){
      const m=/^\/link\s+(\d{6})$/.exec(value);
      const deep=/^\/start(?:@NorthStudyHelperBot)?\s+link_([a-f0-9]{48})$/i.exec(value);
      const valid=pairingUntil>Date.now()&&((!!m&&!!pairingCode&&crypto.timingSafeEqual(Buffer.from(m[1]),Buffer.from(pairingCode)))||(!!deep&&!!pairingNonce&&crypto.timingSafeEqual(Buffer.from(deep[1]),Buffer.from(pairingNonce))));
      if(!valid)return send(id,'יש לבצע צימוד מתוך North. הזן /link ואחריו קוד הצימוד המוצג באפליקציה.');
      state.bot.owner=id;pairingCode=null;pairingNonce=null;persist();progress({connected:true});return send(id,'✅ North מחובר. אפשר לשלוח /scan לסריקה או /tasks להצגת המשימות.');
    }
    if(state.bot.owner!==id)return; // Strict owner-only command handling
    if(value.startsWith('run:'))return runDraft(id,value.slice(4),'');
    if(value.startsWith('details:')){const row=(await tasks()).find(t=>t.id===value.slice(8));return send(id,row?`${row.title}\nכיתה: ${row.course||'לא ידוע'}\nסטטוס: ${row.state||'לא ידוע'}\n${cut(row.description,3000)}\n${row.url||''}`:'המטלה לא נמצאה');}
    return handleCommand(id,value);
  }
  async function loop(id) {
    let failures=0;
    while(running&&id===generation){
      try {
        const items=await api('getUpdates',{offset:state.bot.offset||0,timeout:20,limit:40,allowed_updates:['message','callback_query']},30000);
        failures=0;progress({connected:true});
        if(!items?.length) await sleep(350);
        for(const update of items||[]){
          state.bot.offset=Math.max(state.bot.offset||0,Number(update.update_id)+1);persist();
          try{await processUpdate(update);}catch(e){progress({lastError:cut(e.message,160)});}
        }
      }catch(e){failures++;progress({connected:false,lastError:cut(e.message,160)});await sleep(Math.min(30000,WAIT_MS*Math.max(1,failures)));}
    }
  }
  async function start() {
    if(running||!token())return;
    running=true;const id=++generation;
    try {const user=await api('getMe');if(user.username?.toLowerCase()!==FIXED_USERNAME.toLowerCase())throw Error('Configured token belongs to another bot');
      const webhook=await api('getWebhookInfo');if(webhook?.url) throw Error('Webhook already registered; getUpdates cannot operate while webhook is active');
      progress({connected:true});loop(id).catch(e=>progress({connected:false,lastError:cut(e.message,160)}));
    }catch(e){running=false;progress({connected:false,lastError:cut(e.message,200)});}
  }
  function stop(){running=false;generation++;progress({connected:false})}
  return {start,stop,verifyAndSave,createPairingCode,unlink,toOwner,showTasks,handleCommand,getOwner:()=>state.bot.owner,isConfigured:()=>!!token(),username:FIXED_USERNAME};
}
module.exports={createTelegramBot,FIXED_USERNAME};
