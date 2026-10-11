'use strict';
const crypto = require('node:crypto');
const FIXED_USERNAME = 'NorthStudyHelperBot';
const WAIT_MS = 2500;
const cut = (s, n = 3500) => String(s || '').slice(0, n);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wantsPDF=text=>/(?:pdf|פי די (?:אף|אפ))/i.test(text)&&!/(?:בלי|ללא|אל תשלח|אל תכין|לא צריך|לא רוצה).{0,40}(?:pdf|פי די)/i.test(text);

function createTelegramBot({readState, writeState, getToken, saveToken, scan, tasks, classes, messages=async()=>[], addTask, workflow, fileStore, captureTask=async()=>[], renderPDF, onStatus = () => {}, transport = fetch}) {
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
        method: 'POST', ...(payload instanceof FormData?{}:{headers: {'content-type':'application/json'}}),
        body: payload instanceof FormData?payload:JSON.stringify(payload), signal:ctrl.signal
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
  function unlink() {state.bot.owner=null;delete state.bot.lastAnswer;persist();return createPairingCode();}
  async function send(chatId, text, keyboard) {
    return api('sendMessage', {chat_id:chatId, text:cut(text,3900), ...(keyboard ? {reply_markup:{inline_keyboard:keyboard}} : {})});
  }
  async function toOwner(text, keyboard) {
    if (!state.bot.owner) return false;
    await send(state.bot.owner,text,keyboard);return true;
  }
  async function sendAnswer(chatId,text){
    for(let i=0;i<text.length;i+=3800)await send(chatId,text.slice(i,i+3800));
    state.bot.lastAnswer=text;persist();
  }
  async function sendPDF(chatId,text){
    if(!text)return send(chatId,'עוד אין תשובה שאפשר להפוך לקובץ. שלח את השאלות או בקש ממני להכין תשובה קודם.');
    if(!renderPDF)return send(chatId,'יצירת PDF אינה זמינה כרגע.');
    const bytes=await renderPDF(text),form=new FormData();form.append('chat_id',String(chatId));form.append('document',new Blob([bytes],{type:'application/pdf'}),'North-answers.pdf');form.append('caption','הנה התשובה כ־PDF. אפשר לכתוב לי מה לשנות ואכין גרסה מעודכנת.');await api('sendDocument',form);
  }
  async function receiveDocument(document){
    if(!fileStore)throw Error('שמירת קבצים אינה זמינה כרגע.');
    if(document.file_size>20*1024*1024)throw Error('הקובץ גדול מדי. אפשר לשלוח עד 20MB.');
    const name=String(document.file_name||'document').slice(0,200);
    const file=await api('getFile',{file_id:document.file_id});
    if(!/^[\w./-]+$/.test(file?.file_path||'')||file.file_path.includes('..'))throw Error('לא הצלחתי לקבל קישור תקין לקובץ.');
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),30000);
    try {
      const response=await transport(`https://api.telegram.org/file/bot${token()}/${file.file_path}`,{signal:ctrl.signal,redirect:'error'});
      if(!response.ok)throw Error('לא הצלחתי להוריד את הקובץ. אפשר לשלוח שוב?');
      const reader=response.body.getReader(),parts=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024)throw Error('הקובץ גדול מדי. אפשר לשלוח עד 20MB.');parts.push(Buffer.from(value));}}finally{await reader.cancel();}
      return fileStore.put(Buffer.concat(parts),name);
    }finally{clearTimeout(timer)}
  }
  async function sendFile(chatId,file){const form=new FormData();form.append('chat_id',String(chatId));form.append('document',new Blob([fileStore.read(file)],{type:file.mime}),file.name);return api('sendDocument',form);}
  async function presentProposal(chatId,result){
    if(result.superseded)return;
    const t=result.thread;
    if(result.question)return send(chatId,`שיחה ${t.id} · ${t.title}\n${result.question}`);
    if(result.delivery){await sendAnswer(chatId,`שיחה ${t.id} · ${t.title}\n${result.delivery.text}`);for(const file of result.delivery.files)await sendFile(chatId,file);return;}
    const p=result.pending;
    const preview=`שיחה ${t.id} · ${t.title}\n\nהפרומפט המוצע ל־GPT:\n${p.prompt}\n\nקבצים לשליחה: ${p.files.map(f=>f.name).join(', ')||'ללא'}\n${p.reason}\n\nלא אשלח ל־GPT לפני האישור שלך.`;
    for(let i=0;i<preview.length;i+=3700)await send(chatId,preview.slice(i,i+3700));
    const message=await send(chatId,'לאשר את הפרומפט והקבצים האלה?',[[{text:'✓ אשר ושלח ל־GPT',callback_data:`approve:${t.id}:${p.nonce}`}],[{text:'ערוך פרומפט',callback_data:`edit:${t.id}`},{text:'בטל',callback_data:`cancel:${t.id}:${p.nonce}`}]]);
    if(t.pending===p){p.telegramMessage=message?.message_id;workflow.changed();}
  }
  async function presentTask(task,passive=false){
    if(!workflow)throw Error('שיחות GPT אינן מוכנות.');
    let files=[],note='';try{files=await captureTask(task);}catch(e){note='\nצילום חומר המקור לא זמין: '+cut(e.message,300);}
    const result=await workflow.prepare((passive?'הגיעה מטלה חדשה. בחר אם להציג את חומר המקור או להציע פרומפט לעזרה שאאשר.':'עזור לי לבצע את המטלה הזאת.')+note,{task,files,activate:!passive});
    if(state.bot.owner)await presentProposal(state.bot.owner,result);return result;
  }
  async function listChats(chatId){
    const all=workflow?.status().threads||[];if(!all.length)return send(chatId,'עדיין אין שיחות. שלח בקשה או קובץ, או כתוב /שיחה חדשה.');
    for(let i=0;i<all.length;i+=10){const rows=all.slice(i,i+10);await send(chatId,rows.map(t=>`${t.id===workflow.status().active?'▶ ':'💬 '}${t.id}. ${t.title}${t.course?' · '+t.course:''}`).join('\n'),rows.map(t=>[{text:`${t.id}. ${cut(t.title,45)}`,callback_data:`chat:${t.id}`}]));}
  }
  async function selectChat(chatId,id){delete state.bot.editThread;persist();const t=workflow.choose(id);try{await workflow.open(id);}catch(e){await send(chatId,cut(e.message,500));}return send(chatId,`שיחה ${t.id} · ${t.title} נבחרה. ההודעה הבאה תמשיך את השיחה הזאת.`,[[{text:'הצג היסטוריה',callback_data:`history:${t.id}`}]]);}
  async function approvePrompt(chatId,id,nonce,replyTo){
    const t=workflow.get(id),p=t.pending;if(!p||p.status!=='approval'||p.nonce!==nonce||(replyTo&&p.telegramMessage&&replyTo!==p.telegramMessage))return send(chatId,'האישור הזה אינו של הפרומפט העדכני. פתח את השיחה ואשר את ההצעה האחרונה.');
    workflow.choose(id);workflow.approve(id,nonce).catch(e=>send(chatId,`שיחה ${id}: ${cut(e.message,800)}`).catch(()=>{}));return send(chatId,`הפרומפט אושר לשיחה ${id}. אפתח את ChatGPT ואעדכן כשהתשובה מוכנה.`);
  }
  async function deliverGptResult({thread,pending}){await sendAnswer(state.bot.owner,`GPT · שיחה ${thread.id} · ${thread.title}\n\n${pending.answer}`);for(const file of pending.filesReceived||[])await sendFile(state.bot.owner,file);if(pending.downloadErrors?.length)await send(state.bot.owner,'התשובה נשמרה, אבל לא הצלחתי לאסוף חלק מהקבצים. אפשר לפתוח אותם בשיחת GPT.');await send(state.bot.owner,'אפשר לכתוב מה לתקן. אציג פרומפט חדש לאישור לפני שאשלח ל־GPT.');}
  function formatted(task, i) {
    const completion = task.state === 'turned_in' ? '✅' : task.state === 'missing' ? '❗' : '◻️';
    return `${completion} ${i+1}. ${cut(task.title,120)}\n${cut(task.course,85)}${task.due ? ` · ${task.due}` : ''}`;
  }
  async function showTasks(chatId) {
    const rows = await tasks();
    state.bot.taskChoices=rows.slice(0,30).map(t=>t.id);persist();
    if (!rows.length) return send(chatId,'עוד אין לי מטלות במאגר. רוצה שאבדוק את Classroom? כתוב לי ״תבדוק מה יש לי לעשות״.');
    for(let i=0;i<Math.min(rows.length,30);i++) {
      const t=rows[i];
      await send(chatId,formatted(t,i)+(t.url ? `\n${t.url}` : ''), [[
        {text:'✍️ תעזור לי עם זה',callback_data:`run:${t.id}`},
        {text:'📋 פרטי מטלה',callback_data:`details:${t.id}`}
      ]]);
    }
    await send(chatId,'אפשר לבחור בכפתור או לכתוב לי, למשל, ״תעשה את 2״.');
    if(rows.length>30) await send(chatId,`מוצגות 30 מתוך ${rows.length} מטלות.`);
  }
  async function handleCommand(chatId,text) {
    const trimmed=String(text||'').trim();
    const [cmd,...args]=trimmed.split(/\s+/);
    switch((cmd||'').split('@')[0].toLowerCase()){
      case '/start':case '/help':return send(chatId,'היי 🙂 כתוב לי רגיל או שלח קובץ. המודל המקומי יסדר פרומפט לאישור שלך; GPT באתר יענה אחרי שתאשר.\n/שיחה — השיחות שלך\n/שיחה 3 — המשך שיחה 3\n/שיחה חדשה — התחל שיחה חדשה\n\nNorth ו־Ollama צריכים לפעול במחשב, וצריך להיות מחובר ל־ChatGPT בתוך North.');
      case '/שיחה':case '/chat':{if(!workflow)return send(chatId,'שיחות GPT אינן מוכנות.');const name=args.join(' ');if(!name)return listChats(chatId);if(args[0]==='חדשה'||args[0]==='new'){delete state.bot.editThread;persist();const t=workflow.create(args.slice(1).join(' ')||'שיחה חדשה');return send(chatId,`פתחתי שיחה ${t.id}. מה תרצה ש־GPT יעשה?`);}const matches=workflow.status().threads.filter(t=>String(t.id)===name||t.title===name);return matches.length===1?selectChat(chatId,matches[0].id):listChats(chatId);}
      case '/scan': {
        await send(chatId,'מתחיל סריקה פנימית של Classroom. אעדכן בסיום.');
        try {const result=await scan();await send(chatId,`סריקה הסתיימה: ${result?.courses||0} כיתות, ${result?.assignments||0} מטלות, ${result?.announcements||0} הודעות. ${result?.authRequired?'נדרשת התחברות ל־Classroom בתוך North.':''}`);if((await tasks()).length)await showTasks(chatId);}catch(e){await send(chatId,'הסריקה נכשלה: '+cut(e.message,600));}
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
      case '/run':return runDraft(chatId,args[0]||state.bot.lastTask,'');
      case '/revise': {
        const [id,...rest]=args;const instruction=rest.join(' ').trim();if(!id||!instruction)return send(chatId,'דוגמה: /revise 12 תסביר יותר בפירוט');
        return runDraft(chatId,id,instruction);
      }
      case '/status':{const all=await tasks();return send(chatId,`North פעיל. נמצאו ${all.length} מטלות במאגר המקומי. הבוט: @${FIXED_USERNAME}.`);}
      case '/gpt':return handleConversation(chatId,args.join(' ')||'המשך את השיחה');
      default:return send(chatId,'לא הבנתי את הפקודה הזאת. אפשר לכתוב לי במילים רגילות מה אתה רוצה לעשות 🙂');
    }
  }
  async function runDraft(chatId,id,revision) {
    if(!id)return showTasks(chatId);
    try{const task=(await tasks()).find(t=>t.id===id);if(!task)throw Error('המטלה לא נמצאה');if(revision){const thread=workflow.status().threads.find(t=>t.taskId===id);if(thread)return presentProposal(chatId,await workflow.prepare(revision,{task,threadId:thread.id}));}await send(chatId,'מכין פרומפט מסודר לאישור שלך…');return await presentTask(task);}
    catch(e){return send(chatId,'לא הצלחתי להכין הצעה: '+cut(e.message,700));}
  }
  async function handleConversation(chatId,text,document,replyTo){
    const normalized=String(text||'').trim().replace(/[!?.,״"׳']/g,'').replace(/\s+/g,' ');
    if(!document){
      if(/^(היי|הי|שלום|אהלן|מה נשמע|בוקר טוב|ערב טוב)$/i.test(normalized))return send(chatId,'היי 🙂 מה בא לך שנעשה היום? אפשר לדבר, לבדוק מטלות או לשלוח לי קובץ.');
      if(/^(תודה|תודה רבה|תודה אחי|סבבה|מעולה)$/i.test(normalized))return send(chatId,'בכיף 🙂 אני כאן אם צריך להמשיך או לשנות משהו.');
      if(/^(שיחה חדשה|תתחיל שיחה חדשה|אפס שיחה)$/.test(normalized))return handleCommand(chatId,'/שיחה חדשה');
      if(/^(מאשר|מאשרת|אשר|כן שלח|שלח לGPT|שלח ל־GPT)$/i.test(normalized)){const t=workflow?.active();return t?.pending?approvePrompt(chatId,t.id,t.pending.nonce,replyTo):send(chatId,'אין כרגע פרומפט שממתין לאישור.');}
      if(/^(?:תסרוק|סרוק|תעשה סריקה|תבדוק|בדוק).*(?:קלסרום|קלאסרום|classroom|מטלות|עבודות|יש לי לעשות)|^(?:סריקה מלאה|תסרוק הכל|תסרוק הכול)$/i.test(normalized))return handleCommand(chatId,'/scan');
      if(/^(?:מה (?:יש לי|אני צריך) לעשות|מה המטלות שלי|מה העבודות שלי|(?:תראה|תציג|שלח)(?: לי)? (?:את )?(?:כל )?(?:המטלות|המשימות|העבודות)(?: שלי)?)$/.test(normalized))return showTasks(chatId);
      if(/^(?:תראה|תציג|שלח)(?: לי)? (?:את )?(?:ההודעות|הכיתות)$/.test(normalized))return handleCommand(chatId,normalized.includes('ההודעות')?'/messages':'/classes');
      if(/^(?:שלח|תשלח|תכין|הכן|אפשר)(?: לי)?(?: את זה| את התשובה)?(?: כ| ב| בקובץ| קובץ)?\s*pdf$/i.test(normalized))return sendPDF(chatId,state.bot.lastAnswer);
      const choice=/^(?:(?:תעשה|תכין|תפתור)(?: לי)?(?: את)?(?: העבודה| המטלה| המשימה)?(?: מספר)?\s*)?(\d{1,2})$/.exec(normalized);
      if(choice){const id=state.bot.taskChoices?.[Number(choice[1])-1];if(id)return runDraft(chatId,id,'');return send(chatId,'המספר הזה לא מופיע ברשימה האחרונה. אציג אותה שוב.').then(()=>showTasks(chatId));}
    }
    const typing=()=>api('sendChatAction',{chat_id:chatId,action:'typing'}).catch(()=>{});await typing();const timer=setInterval(typing,4000);
    try{
      if(!workflow)throw Error('שיחות GPT אינן מוכנות.');
      if(state.bot.editThread){const id=state.bot.editThread;delete state.bot.editThread;persist();await presentProposal(chatId,await workflow.edit(id,text));}
      else await presentProposal(chatId,await workflow.prepare(text,{files:document?[document]:[]}));
    }catch(e){await send(chatId,'לא הצלחתי להשלים את זה כרגע: '+cut(e.message,900));}
    finally{clearInterval(timer)}
  }
  async function processUpdate(update) {
    const message=update.message;const callback=update.callback_query;
    if(callback) {try{await api('answerCallbackQuery',{callback_query_id:callback.id})}catch{}}
    const chat=message?.chat||callback?.message?.chat;
    if(chat?.type!=='private'||!chat.id)return;
    const id=String(chat.id),value=String(message?.text||message?.caption||callback?.data||'').trim();
    if(!state.bot.owner){
      const m=/^\/link\s+(\d{6})$/.exec(value);
      const deep=/^\/start(?:@NorthStudyHelperBot)?\s+link_([a-f0-9]{48})$/i.exec(value);
      const valid=pairingUntil>Date.now()&&((!!m&&!!pairingCode&&crypto.timingSafeEqual(Buffer.from(m[1]),Buffer.from(pairingCode)))||(!!deep&&!!pairingNonce&&crypto.timingSafeEqual(Buffer.from(deep[1]),Buffer.from(pairingNonce))));
      if(!valid)return send(id,'היי 🙂 כדי שאדע שזה אתה, פתח את North במחשב ולחץ ״חבר את הטלגרם שלי״ ואז Start בקישור שנפתח.');
      state.bot.owner=id;pairingCode=null;pairingNonce=null;persist();progress({connected:true});return send(id,'מחוברים 🙂 אפשר פשוט לדבר איתי. נסה ״תבדוק מה יש לי לעשות״ או שלח קובץ עם ההוראות שלך.');
    }
    if(state.bot.owner!==id)return; // Strict owner-only command handling
    if(callback&&value.startsWith('approve:')){const [,thread,nonce]=value.split(':');return approvePrompt(id,thread,nonce);}
    if(callback&&value.startsWith('cancel:')){const [,thread,nonce]=value.split(':');try{workflow.cancel(thread,nonce);return send(id,'בוטל. לא נשלח ל־GPT.');}catch(e){return send(id,e.message);}}
    if(callback&&value.startsWith('edit:')){const thread=Number(value.slice(5));workflow.choose(thread);state.bot.editThread=thread;persist();return send(id,'כתוב את הפרומפט המדויק שתרצה לשלוח. אציג אותו לאישור חדש.');}
    if(callback&&value.startsWith('chat:'))return selectChat(id,value.slice(5));
    if(callback&&value.startsWith('history:')){const t=workflow.get(value.slice(8));const history=t.events.filter(e=>['request','proposal','gpt_response'].includes(e.kind)).map(e=>`${e.kind==='gpt_response'?'GPT':e.kind==='proposal'?'פרומפט':'אתה'}:\n${e.text||e.prompt||''}`).join('\n\n');for(let i=0;i<history.length;i+=3800)await send(id,history.slice(i,i+3800));return;}
    if(callback&&value.startsWith('run:'))return runDraft(id,value.slice(4),'');
    if(callback&&value.startsWith('details:')){const row=(await tasks()).find(t=>t.id===value.slice(8));return send(id,row?`${row.title}\nכיתה: ${row.course||'לא ידוע'}\nסטטוס: ${row.state||'לא ידוע'}\n${cut(row.description,3000)}\n${row.url||''}`:'המטלה לא נמצאה');}
    if(message?.document){
      try{const document=await receiveDocument(message.document);await send(id,'קיבלתי את '+document.name+'. הוא יועבר ל־GPT רק אחרי אישורך.');return handleConversation(id,/^\/(?:new|run)$/.test(value)?'ענה על השאלות בקובץ':value,document);}
      catch(e){return send(id,cut(e.message,900));}
    }
    if(message?.photo){try{const photo=message.photo.at(-1);return handleConversation(id,value,await receiveDocument({...photo,file_name:'Telegram-photo.jpg'}));}catch(e){return send(id,e.message);}}
    if(message?.voice||message?.audio||message?.video)return send(id,'כרגע אפשר להעביר ל־GPT תמונה, PDF או מסמך. הקלטות ווידאו עדיין אינם מחוברים.');
    if(!value)return;
    return value.startsWith('/')?handleCommand(id,value):handleConversation(id,value,null,message?.reply_to_message?.message_id);
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
  return {start,stop,verifyAndSave,createPairingCode,unlink,toOwner,showTasks,handleCommand,presentTask,deliverGptResult,getOwner:()=>state.bot.owner,isConfigured:()=>!!token(),username:FIXED_USERNAME};
}
module.exports={createTelegramBot,FIXED_USERNAME};
