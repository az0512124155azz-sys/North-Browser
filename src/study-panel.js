'use strict';
const $=s=>document.querySelector(s);let data={};
function update(d){data=d;
 $('#botName').textContent=d.bot||'@NorthStudyHelperBot';
 $('#connection').textContent=d.configured?(d.owner?'✅ מחובר לצ׳אט פרטי':'הבוט מוגדר, נדרש צימוד'):'נדרש Token חדש';
 $('#connection').className=d.owner?'success':'';
 $('#tokenZone').style.display=d.configured?'none':'block';
 const s=d.scanner||{};$('#scanState').textContent=s.busy?'סורק כעת':s.lastError?'שגיאה':'ממתין';
 const stats=s.stats||{};$('#scanInfo').textContent=`כיתות: ${stats.courses||0} | מטלות: ${stats.assignments||0} | הודעות: ${stats.announcements||0} | דפים: ${stats.pages||0}`+(s.lastRun?`\nסריקה אחרונה: ${new Date(s.lastRun).toLocaleString('he-IL')}`:'');
 $('#scanError').textContent=s.lastError||d.botStatus?.lastError||'';
 const cl=$('#classes');cl.replaceChildren();for(const c of d.classes||[]){const p=document.createElement('p');p.textContent=`📚 ${c.name} — ✅ ${c.complete} הוגשו · ${c.pending} חסרות · ${c.unknown} לא ידוע`;cl.append(p)}
 const tasks=$('#tasks');tasks.replaceChildren();for(const t of (d.tasks||[]).slice(0,70)){const p=document.createElement('div');p.className='task';const title=document.createElement('div');title.textContent=(t.state==='turned_in'?'✅ ':t.state==='missing'?'❗ ':'◻️ ')+t.title;const meta=document.createElement('span');meta.textContent=(t.course||'כיתה לא ידועה')+' · '+t.id;p.append(title,meta);tasks.append(p)}
}
async function refresh(){try{update(await north.study.status())}catch(e){$('#log').textContent=e.message}}
$('#refresh').onclick=refresh;
$('#saveToken').onclick=async()=>{const t=$('#token').value.trim();if(!t)return;$('#log').textContent='מאמת את זהות הבוט…';try{await north.study.setToken(t);$('#token').value='';$('#log').textContent='הבוט אומת ונשמר בהצפנה';refresh()}catch(e){$('#log').textContent='חיבור נכשל: '+e.message}};
$('#openBot').onclick=()=>north.study.openBot();
$('#pair').onclick=async()=>{try{const x=await north.study.pair();$('#pairCode').textContent=x?x.code:'כבר קיים צ׳אט משויך';}catch(e){$('#log').textContent=e.message}};
$('#scanNow').onclick=async()=>{$('#log').textContent='סורק…';try{const r=await north.study.scan();$('#log').textContent='סריקה הסתיימה: '+JSON.stringify(r);refresh()}catch(e){$('#log').textContent='שגיאה: '+e.message}};
north.study.onChange(update);refresh();
