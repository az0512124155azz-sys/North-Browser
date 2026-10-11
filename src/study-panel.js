'use strict';
(() => {
const north=window.north;
const $=s=>document.querySelector(s);let data={};
function update(d){data=d;
 $('#botName').textContent=d.bot||'@NorthStudyHelperBot';
 $('#connection').textContent=d.configured?(d.owner?'✓ הטלגרם שלך מחובר':'מוכן לחיבור לטלגרם'):'נדרשת הפעלה חד־פעמית של הבוט';
 $('#connection').className=d.owner?'success':'';
 $('#tokenZone').hidden=d.configured;
 $('#connectTelegram').disabled=!d.configured;
 $('#connectTelegram').textContent=d.owner?'פתח את הטלגרם שלי':'חבר את הטלגרם שלי';
 $('#telegramHint').textContent=d.owner?'החיבור נשמר. אפשר לקבל עדכונים ולשלוח משימות דרך הבוט.':'לחץ על חיבור, ואז על Start בטלגרם. אין צורך להקליד קוד.';
 $('#manualPair').hidden=!!d.owner;
 $('#openBot').hidden=!!d.owner;
 const s=d.scanner||{};$('#scanState').textContent=s.busy?'סורק כעת':s.lastError?'שגיאה':'ממתין';
 const stats=s.stats||{};$('#scanInfo').textContent=`כיתות: ${stats.courses||0} | מטלות: ${stats.assignments||0} | הודעות: ${stats.announcements||0} | דפים: ${stats.pages||0}`+(s.lastRun?`\nסריקה אחרונה: ${new Date(s.lastRun).toLocaleString('he-IL')}`:'');
 $('#scanError').textContent=s.lastError||d.botStatus?.lastError||'';
 const cl=$('#classes');cl.replaceChildren();for(const c of d.classes||[]){const p=document.createElement('p');p.textContent=`📚 ${c.name} — ✅ ${c.complete} הוגשו · ${c.pending} חסרות · ${c.unknown} לא ידוע`;cl.append(p)}
 const tasks=$('#tasks');tasks.replaceChildren();for(const t of (d.tasks||[]).slice(0,70)){const p=document.createElement('div');p.className='task';const title=document.createElement('div');title.textContent=(t.state==='turned_in'?'✅ ':t.state==='missing'?'❗ ':'◻️ ')+t.title;const meta=document.createElement('span');meta.textContent=(t.course||'כיתה לא ידועה')+' · '+t.id;p.append(title,meta);tasks.append(p)}
}
async function refresh(){try{update(await north.study.status())}catch(e){$('#log').textContent=e.message}}
$('#refresh').onclick=refresh;
$('#openGptHistory').onclick=()=>north.gpt.history().catch(e=>{$('#log').textContent=e.message});
async function connectTelegram(){try{await north.study.connect();$('#log').textContent=data.owner?'הבוט נפתח.':'הבוט נפתח בטלגרם. לחץ על Start כדי להשלים את החיבור.';}catch(e){$('#log').textContent=e.message;}}
$('#connectTelegram').onclick=connectTelegram;
$('#saveToken').onclick=async()=>{const t=$('#token').value.trim();if(!t){$('#log').textContent='הדבק את מפתח הבוט כדי להמשיך.';return;}const button=$('#saveToken');button.disabled=true;$('#log').textContent='בודק ושומר…';try{await north.study.setToken(t);$('#token').value='';await refresh();await connectTelegram();}catch(e){$('#log').textContent='החיבור לא הצליח: '+e.message;}finally{button.disabled=false;}};
$('#openBot').onclick=()=>north.study.openBot().catch(e=>{$('#log').textContent=e.message});
$('#pair').onclick=async()=>{try{const x=await north.study.pair();$('#pairCode').textContent=x?x.code:'כבר קיים צ׳אט משויך';}catch(e){$('#log').textContent=e.message}};
$('#scanNow').onclick=async()=>{$('#log').textContent='סורק…';try{const r=await north.study.scan();$('#log').textContent='סריקה הסתיימה: '+JSON.stringify(r);refresh()}catch(e){$('#log').textContent='שגיאה: '+e.message}};
north.study.onChange(update);refresh();
})();
