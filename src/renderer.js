'use strict';
const $ = s => document.querySelector(s);
const north = window.north;
let active = 0;
let tabs = [];
let menuMode = 'none';
const originalBrowserMenu = $('#browserMenu').innerHTML;
function restoreMenu() { if ($('#browserMenu').dataset.listMode) {$('#browserMenu').innerHTML = originalBrowserMenu;delete $('#browserMenu').dataset.listMode;} }
const siteDomains = new Map([
 ['classroom.google.com','classroom.google.com'],
 ['chatgpt.com','chatgpt.com'],
 ['students.myofek.cet.ac.il','students.myofek.cet.ac.il'],
 ['www.galim.org.il','galim.org.il'],
 ['moodle.org','moodle.org']
]);
const iconHref = id => '#i-' + id;
function icon(id) {
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
 const use = document.createElementNS('http://www.w3.org/2000/svg','use');
 use.setAttribute('href',iconHref(id));
 svg.appendChild(use);
 return svg;
}
function tabFavicon(tab) {
 const img = document.createElement('img');
 img.className = 'tab-favicon';
 if (tab.url === 'north://newtab') return icon('compass');
 try {
  const host = new URL(tab.url).hostname;
  img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(siteDomains.get(host)||host) + '&sz=64';
 } catch { return icon('compass'); }
 img.onerror = () => { img.replaceWith(icon('compass')); };
 return img;
}
function update(data) {
 active = data.active;
 tabs = data.tabs || [];
 const tabbar = $('#tabs');
 tabbar.replaceChildren();
 for (const tab of tabs) {
  const b = document.createElement('div');
  b.tabIndex = 0;
  b.className = 'tab' + (tab.id === active ? ' active' : '');
  b.setAttribute('role','tab');
  b.setAttribute('aria-selected',String(tab.id === active));
  b.title = tab.title || tab.url;
  const img = tabFavicon(tab);
  const title = document.createElement('span');
  title.className = 'tab-label';
  title.textContent = (tab.loading ? '◌ ' : '') + (tab.title || 'New tab');
  const x = document.createElement('button');
  x.className = 'tab-close';
  x.title = 'Close tab';
  x.setAttribute('aria-label','Close ' + (tab.title || 'tab'));
  x.append(icon('close'));
  x.onclick = event => { event.stopPropagation(); closeMenus(); north.close(tab.id); };
  b.append(img,title,x);
  b.onclick = () => { closeMenus(); north.select(tab.id); };
  b.onkeydown = event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();b.click();}};
  tabbar.append(b);
 }
 const selected = tabs.find(t => t.id === active);
 $('#address').value = selected && selected.url !== 'north://newtab' ? selected.url : '';
 $('#homePage').hidden = !selected || selected.url !== 'north://newtab';
}
function setMenus(mode) {
 if (mode !== 'browser') restoreMenu();
 menuMode = mode;
 document.body.classList.toggle('menu-active',mode!=='none');
 $('#browserMenu').hidden = mode === 'none';
 $('#studyMenu').hidden = mode !== 'study';
 $('#menuScrim').hidden = mode === 'none';
 $('#more').setAttribute('aria-expanded', String(mode !== 'none'));
 const available = Math.max(0, window.innerWidth - 520);
 const desired = mode === 'study' ? 650 : mode === 'browser' ? 320 : 0;
 if (north.overlay) north.overlay(Math.min(available, desired)).catch(console.warn);
}
function closeMenus(){ setMenus('none'); }
function newTab(){ closeMenus(); north.open('north://newtab'); }
function navigate(url) {closeMenus(); if (!active) return north.open(url); return north.go(active,url);}
const toast = (message) => {
 const el=$('#notice');
 el.textContent=message;
 el.hidden=false;
 if (toast.timer) clearTimeout(toast.timer);
 toast.timer=setTimeout(()=>{el.hidden=true},3500);
};
function studyPanel() {closeMenus(); north.study.panel().catch(e=>toast(e.message));}
async function runScan() {
 closeMenus();
 toast('Scanning Classroom in North...');
 try {const result=await north.study.scan(); toast('Classroom scan finished. Open Study Assistant to review results.'); return result;}
 catch(e){toast('Classroom scan error: '+e.message);}
}
function showSimpleList(which) {
 closeMenus();
 const data = JSON.parse(localStorage.getItem('north:'+which)||'[]');
 const label = which === 'bookmarks' ? 'Bookmarks' : 'History';
 const popup = $('#browserMenu');
 popup.dataset.listMode='true';
 popup.replaceChildren();
 const head=document.createElement('div');
 head.className='list-header';
 head.textContent=label;
 popup.append(head);
 if(!data.length) {
  const p=document.createElement('p');p.className='list-empty';
  p.textContent=which==='bookmarks'?'No bookmarks yet. Save the current page with Ctrl+D.':'Browse some pages to build your history.';
  popup.append(p);
 }
 for(const entry of data.slice(0,15)) {
  const btn=document.createElement('button');
  btn.className='saved-entry';
  btn.textContent=entry.title||entry.url;
  btn.title=entry.url;
  btn.onclick=()=>{closeMenus();navigate(entry.url);};
  popup.append(btn);
 }
 popup.hidden=false;$('#menuScrim').hidden=false;
 menuMode='browser';$('#more').setAttribute('aria-expanded','true');
 if(north.overlay)north.overlay(Math.min(320,Math.max(0,window.innerWidth-520)));
}
function recordVisit(t) {
 if(!t||t.url==='north://newtab'||t.url===recordVisit.last)return;
 recordVisit.last=t.url;
 const history=JSON.parse(localStorage.getItem('north:history')||'[]');
 history.unshift({url:t.url,title:t.title||t.url,at:Date.now()});
 const seen=new Set();
 localStorage.setItem('north:history',JSON.stringify(history.filter(x=>!seen.has(x.url)&&seen.add(x.url)).slice(0,100)));
}
function toggleBookmark() {
 const t=tabs.find(x=>x.id===active);
 if(!t||t.url==='north://newtab'){showSimpleList('bookmarks');return;}
 const items=JSON.parse(localStorage.getItem('north:bookmarks')||'[]');
 const idx=items.findIndex(x=>x.url===t.url);
 if(idx>=0){items.splice(idx,1);toast('Bookmark removed');}
 else {items.unshift({url:t.url,title:t.title||t.url});toast('Page bookmarked');}
 localStorage.setItem('north:bookmarks',JSON.stringify(items.slice(0,100)));
}
function handleAction(action) {
 switch(action) {
  case 'newtab': newTab(); break;
  case 'newwindow': closeMenus();toast('Opening a separate window is not available in this version.');break;
  case 'study': setMenus('study');break;
  case 'activity':case 'tasks':case 'assistant':case 'settings': studyPanel();break;
  case 'telegram':closeMenus();north.study.openBot().catch(e=>toast(e.message));break;
  case 'scan':runScan();break;
  case 'history':showSimpleList('history');break;
  case 'bookmarks':showSimpleList('bookmarks');break;
  case 'downloads':closeMenus();toast('Downloads are managed by Chromium.');break;
  case 'help':closeMenus();toast('North Browser — Study Assistant and Google Search.');break;
  case 'exit':closeMenus();if(north.quit)north.quit();else toast('Exit using your system tray icon.');break;
 }
}
north.onTabs(data=>{
 update(data);
 recordVisit(tabs.find(t=>t.id===active));
});
$('#add').onclick=newTab;
$('#railNew').onclick=newTab;
$('#addBookmark').onclick=newTab;
$('#home').onclick=()=>navigate('north://newtab');
$('#railLogo').onclick=()=>navigate('north://newtab');
$('#back').onclick=()=>north.nav(active,'back');
$('#forward').onclick=()=>north.nav(active,'forward');
$('#reload').onclick=()=>north.nav(active,'reload');
$('#address-form').onsubmit=e=>{e.preventDefault();navigate($('#address').value);};
$('#search-form').onsubmit=e=>{e.preventDefault();navigate($('#search').value);};
document.querySelectorAll('[data-site]').forEach(b=>{b.onclick=()=>navigate(b.dataset.site);});
$('#bookmarks').onclick=toggleBookmark;
$('#railBookmark').onclick=()=>showSimpleList('bookmarks');
$('#historyTop').onclick=()=>showSimpleList('history');
$('#railHistory').onclick=()=>showSimpleList('history');
$('#downloadsTop').onclick=()=>handleAction('downloads');
$('#railDownloads').onclick=()=>handleAction('downloads');
$('#railSettings').onclick=studyPanel;
$('#profile').onclick=()=>toast('North maintains a separate browser profile on this computer.');
$('#more').onclick=()=>setMenus(menuMode==='none'?'browser':'none');
$('#menuScrim').onclick=closeMenus;
$('#studyClose').onclick=()=>setMenus('browser');
$('#browserMenu').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)handleAction(b.dataset.action);});
$('#studyMenu').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)handleAction(b.dataset.action);});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeMenus();return;}
 if(!(e.ctrlKey||e.metaKey))return;
 if(e.key.toLowerCase()==='t'){e.preventDefault();newTab();}
 if(e.key.toLowerCase()==='l'){e.preventDefault();$('#address').focus();$('#address').select();}
 if(e.key.toLowerCase()==='w'){e.preventDefault();closeMenus();north.close(active);}
 if(e.key.toLowerCase()==='d'){e.preventDefault();toggleBookmark();}
 if(e.key.toLowerCase()==='h'){e.preventDefault();showSimpleList('history');}
});
window.addEventListener('resize',()=>{if(menuMode!=='none')setMenus(menuMode);});
document.querySelectorAll('.site-icon img,.shortcut-tile img').forEach(img=>img.onerror=()=>{img.style.display='none'});
