'use strict';
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const out=path.resolve(process.env.NORTH_TEST_OUTPUT||'test-results/electron');
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'north-ui-'));
const report={platform:process.platform,checks:[],navigation:[],errors:[],remoteErrors:[],limitations:['Fresh profile: Google/ChatGPT login and private Classroom content are not tested.','Telegram external launch and file-manager reveal are captured by the test harness; no real bot token or message is used.']};
let runtime='';
let electron,page,processHandle;
const fixture=http.createServer((req,res)=>{
 if(req.url==='/failure'){res.destroy();return;}
 if(req.url==='/download'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="north-ui-test.txt"'});res.end('North download test');return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(`<title>North fixture ${req.url}</title><h1>${req.url}</h1><a href="/download">Download</a>`);
});
async function waitFor(fn,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
async function state(){return page.evaluate(()=>window.north.tabs());}
async function selected(){const s=await state();return s.tabs.find(t=>t.id===s.active);}
async function click(selector){await page.locator(selector).click();}
async function otherPage(suffix){let found;await waitFor(()=>{found=electron.windows().find(p=>p!==page&&p.url().endsWith(suffix));return Promise.resolve(!!found);},suffix);return found;}
async function menu(action){await click('#more');await click('#browserMenu [data-action="'+action+'"]');}
async function home(){await click('#home');await waitFor(async()=>!(await page.locator('#homePage').getAttribute('hidden')),'home');}
async function go(url){await page.locator('#address').fill(url);await click('#address-form button');await waitFor(async()=>(await selected()).url===url,'navigate '+url);}
async function views(){return electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/index.html')).flatMap(w=>w.contentView.children.map(v=>({url:v.webContents.getURL(),bounds:v.getBounds(),loading:v.webContents.isLoading(),title:v.webContents.getTitle()}))));}
(async()=>{
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+fixture.address().port;
 electron=await _electron.launch({args:[path.join(__dirname,'electron-bootstrap.cjs')],env:{...process.env,NORTH_TELEGRAM_BOT_TOKEN:'',NORTH_TEST_PROFILE:profile},timeout:30000});
 processHandle=electron.process();
 for(const stream of [processHandle.stdout,processHandle.stderr])stream.on('data',b=>{runtime+=b.toString();});
 page=await electron.firstWindow();
 const monitor=p=>p.on('pageerror',e=>{if(/^file:.*\/(index|study-panel|passwords)\.html$/.test(p.url()))report.errors.push(e.message);else report.remoteErrors.push({url:p.url(),message:e.message});});
 monitor(page);electron.on('window',monitor);
 await check('Preload bridge, renderer startup and initial tab',async()=>{
  await waitFor(async()=>(await page.locator('.tab').count())===1,'initial tab');
  assert.equal(await page.evaluate(()=>typeof window.north.open),'function');
  assert.equal(await page.evaluate(()=>typeof document.querySelector('#add').onclick),'function');
 });
 await check('All 10 local quick-access icons decode without CSP errors',async()=>{
  assert.equal(await page.locator('#bookmarkbar img,#shortcuts img').count(),10);
  await waitFor(()=>page.evaluate(()=>[...document.querySelectorAll('#bookmarkbar img,#shortcuts img')].every(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith('file:'))),'local icons');
  await page.screenshot({path:path.join(out,'home.png')});
 });
 for(const selector of ['#add','#railNew','#addBookmark'])await check('Click '+selector+' creates a tab',async()=>{const n=(await state()).tabs.length;await click(selector);await waitFor(async()=>(await state()).tabs.length===n+1,selector);});
 await check('Select tab and close inactive/active tabs, including the final tab',async()=>{
  await page.locator('.tab').first().click();await waitFor(async()=>(await state()).active===1,'select first');
  await page.locator('.tab-close').last().click();assert.equal((await state()).tabs.length,3);
  while((await state()).tabs.length>1){await page.locator('.tab-close').first().click();await page.waitForTimeout(100);}
  await page.locator('.tab-close').click();await waitFor(async()=>(await state()).tabs.length===1,'replacement final tab');
 });
 await check('Home search submit navigates to Google',async()=>{await page.locator('#search').fill('North browser test');await click('#search-form button');await waitFor(async()=>(await selected()).url.startsWith('https://www.google.com/search?q='),'Google search');await home();});
 await check('Address submit, back, forward and reload on real embedded view',async()=>{
  await go(origin+'/one');await waitFor(async()=>(await views()).some(v=>v.title==='North fixture /one'),'fixture one');
  await go(origin+'/two');await waitFor(async()=>(await views()).some(v=>v.title==='North fixture /two'),'fixture two');
  await click('#back');await waitFor(async()=>(await selected()).url===origin+'/one','back');
  await click('#forward');await waitFor(async()=>(await selected()).url===origin+'/two','forward');
  await click('#reload');await waitFor(async()=>(await views()).some(v=>v.title==='North fixture /two'&&!v.loading),'reload');
 });
 await check('Bookmark save, bookmark list and saved-page navigation',async()=>{
  await click('#bookmarks');await waitFor(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('north:bookmarks')||'[]').length===1),'bookmark');
  await click('#railBookmark');assert.match(await page.locator('#browserMenu').innerText(),/North fixture/);await click('.saved-entry');
 });
 for(const selector of ['#historyTop','#railHistory'])await check('History list '+selector,async()=>{await click(selector);assert.match(await page.locator('#browserMenu').innerText(),/History/);await page.keyboard.press('Escape');});
 await check('Menus recover after history/bookmark lists',async()=>{await menu('study');assert.equal(await page.locator('#studyMenu').isVisible(),true);await click('#studyClose');assert.equal(await page.locator('#studyMenu').isVisible(),false);await page.keyboard.press('Escape');});
 await check('Browser menu is clickable above WebContentsView',async()=>{
  const before=(await views())[0].bounds.width;await menu('study');await waitFor(async()=>(await views())[0].bounds.width<before,'overlay reservation');
  await page.screenshot({path:path.join(out,'study-menu-over-page.png')});await page.keyboard.press('Escape');await waitFor(async()=>(await views())[0].bounds.width===before,'overlay restore');
 });
 await check('Download native view event and both download buttons',async()=>{
  await electron.evaluate(({BrowserWindow},file)=>{
   const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'));
   w.contentView.children[0].webContents.session.once('will-download',(_e,item)=>item.setSavePath(file));
  },path.join(out,'north-ui-test.txt'));
  await go(origin+'/download');await waitFor(()=>fs.existsSync(path.join(out,'north-ui-test.txt')),'download');
  for(const selector of ['#downloadsTop','#railDownloads']){await click(selector);await waitFor(()=>page.locator('#browserMenu').innerText().then(t=>t.includes('completed')),'downloads list');await click('#browserMenu .saved-entry');await page.keyboard.press('Escape');}
  assert.equal((await electron.evaluate(()=>global.__northTestFolders)).length,2);
 });
 await check('Home navigation keeps one tab and rail logo returns home',async()=>{
  const n=(await state()).tabs.length,id=(await state()).active;await home();assert.equal((await state()).tabs.length,n);assert.equal((await state()).active,id);
  await go(origin+'/one');await click('#railLogo');await waitFor(async()=>(await selected()).url==='north://newtab','rail home');assert.equal((await state()).tabs.length,n);
 });
 await check('Failed navigation reports an error and the UI recovers',async()=>{await go(origin+'/failure');await waitFor(async()=>!!(await selected()).error,'navigation error');assert.match(await page.locator('#notice').innerText(),/Could not load/);await go(origin+'/one');await waitFor(async()=>(await views())[0].title==='North fixture /one','recover from failed navigation');});
 for(const area of ['#bookmarkbar','#shortcuts'])for(const site of ['classroom.google.com','chatgpt.com','students.myofek.cet.ac.il','www.galim.org.il','moodle.org'])await check('Click '+area+' '+site+' opens embedded navigation',async()=>{
  await home();await click(area+' [data-site="https://'+site+'/"]');
  await waitFor(async()=>(await selected()).url.startsWith('https://'+site+'/'),'requested '+site);
  // Record the actual remote result, including redirects/login/interstitials.
  await waitFor(async()=>{const v=(await views())[0];return v&&v.url&&(!v.loading||(await selected()).error);},'remote result '+site,45000).catch(e=>report.limitations.push(e.message));
  const result=(await views())[0];report.navigation.push({area,site,...result,error:(await selected()).error});console.log('REMOTE',JSON.stringify(result));
 });
 await home();
 await check('Profile button opens password manager',async()=>{await click('#profile');const manager=await otherPage('/passwords.html');await manager.waitForSelector('#message');assert.match(await manager.locator('#message').innerText(),/סיסמאות/);await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/passwords.html')).close());});
 for(const action of ['newtab','history','bookmarks','downloads','help'])await check('Browser menu action '+action,async()=>{await menu(action);if(['history','bookmarks','downloads'].includes(action))await page.keyboard.press('Escape');});
 await check('New window has independent tabs and closes cleanly',async()=>{
  const count=(await state()).tabs.length;await menu('newwindow');
  const other=await otherPage('/index.html');await other.waitForSelector('.tab');await other.locator('#add').click();await waitFor(()=>other.locator('.tab').count().then(n=>n===2),'second window tab');assert.equal((await state()).tabs.length,count);
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/index.html')).sort((a,b)=>b.id-a.id)[0];w.close();});
 });
 for(const action of ['activity','tasks','assistant'])await check('Study Assistant action '+action+' opens working panel',async()=>{
  await menu('study');await click('#studyMenu [data-action="'+action+'"]');
  const panel=await otherPage('/study-panel.html');await panel.waitForSelector('#refresh');await panel.locator('#refresh').click();await waitFor(()=>panel.locator('#scanInfo').innerText().then(t=>t.includes('0')),'panel refresh');
  await panel.locator('#manualPair summary').click();await panel.locator('#pair').click();await waitFor(()=>panel.locator('#pairCode').innerText().then(Boolean),'pair code');
  await panel.locator('#token').fill('invalid-test-value');await panel.locator('#saveToken').click();await waitFor(()=>panel.locator('#log').innerText().then(t=>t.includes('Invalid Telegram token format')),'invalid token feedback');await panel.locator('#openBot').click();
  if(action==='activity'){
   await panel.locator('#scanNow').click();await waitFor(()=>panel.locator('#scanError').innerText().then(Boolean),'unauthenticated scan status',45000);await panel.screenshot({path:path.join(out,'study-panel.png')});
  }
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/study-panel.html'));w.close();});
 });
 await check('Rail settings and browser settings open the panel',async()=>{for(const kind of ['rail','menu']){if(kind==='rail')await click('#railSettings');else await menu('settings');await otherPage('/study-panel.html');await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/study-panel.html')).close());}});
 await check('Telegram menu opens the connection panel',async()=>{await menu('study');await click('#studyMenu [data-action="telegram"]');await otherPage('/study-panel.html');await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/study-panel.html')).close());assert.ok((await electron.evaluate(()=>global.__northTestExternal)).every(u=>u==='https://t.me/NorthStudyHelperBot'));});
 await check('Study scan menu reaches scanner and reports status',async()=>{await menu('study');await click('#studyMenu [data-action="scan"]');await waitFor(()=>page.locator('#notice').innerText().then(t=>/Scanning|scan/.test(t)),'scan feedback');});
 await check('Renderer reload hydrates existing tab state',async()=>{const before=await state();await page.reload();await waitFor(async()=>(await page.locator('.tab').count())===before.tabs.length,'reload tabs');assert.equal((await state()).active,before.active);});
 await check('Keyboard Ctrl+T, Ctrl+W, Ctrl+L and Escape',async()=>{const n=(await state()).tabs.length;await page.keyboard.press('Control+t');await waitFor(async()=>(await state()).tabs.length===n+1,'Ctrl+T');await page.keyboard.press('Control+w');await waitFor(async()=>(await state()).tabs.length===n,'Ctrl+W');await page.keyboard.press('Control+l');assert.equal(await page.locator('#address').evaluate(e=>e===document.activeElement),true);await click('#more');await page.keyboard.press('Escape');assert.equal(await page.locator('#browserMenu').isVisible(),false);});
 assert.deepEqual(report.errors,[],'Renderer/panel runtime errors');
 for(const line of runtime.split(/\r?\n/)){let event;try{event=JSON.parse(line);}catch{continue;}if(event.type==='preload-error'||(event.type==='console'&&event.level==='error'&&/^file:/.test(event.url||'')))report.errors.push(event.message);}
 assert.deepEqual(report.errors,[],'Preload or local CSP/console errors');
 await check('Exit menu quits Electron',async()=>{await menu('exit');await waitFor(()=>Promise.resolve(processHandle.exitCode!==null),'exit');});
 report.result='passed';
})().catch(async e=>{report.result='failed';report.failure=e.stack;console.error(e);if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.log('FAILURE STATE',await page.evaluate(async()=>({menu:document.querySelector('#browserMenu').innerText,downloads:await window.north.downloads()})).catch(()=>{}));}process.exitCode=1;}).finally(async()=>{
 if(electron&&processHandle?.exitCode===null)await electron.close().catch(()=>{});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(out,'runtime.log'),runtime);
 fixture.close();console.log('REPORT',path.join(out,'report.json'));
});
