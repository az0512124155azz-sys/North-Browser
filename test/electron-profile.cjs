'use strict';
const {_electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'north-profile-test-'));
const out=path.resolve('test-results/electron/profile');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],limitations:['Password tests use a local login form, not actual Google/ChatGPT credentials.','Telegram API responses and external launch are simulated; DPAPI storage, IPC, UI and restarts are real.']};
let electron,page,proc,runtime='';
const COOKIE='north-profile-session-test',PASSWORD='north-profile-password-test',TOKEN='100000:test_token_test_token_test_token';
let receivedCookie='';
const server=http.createServer((req,res)=>{
 receivedCookie=req.headers.cookie||'';
 res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'");
 if(req.url==='/step1'){res.end('<title>Username step</title><form method="post" action="/step2"><input type="email" name="identifier" autocomplete="username"><button>Next</button></form>');return;}
 if(req.url==='/step2'){req.resume();res.end('<title>Password step</title><form method="post" action="/logged"><input type="password" autocomplete="current-password" name="password"><button>Sign in</button></form>');return;}
 if(req.url==='/logged'){req.resume();res.setHeader('Set-Cookie','north_auth='+COOKIE+'; HttpOnly; SameSite=Lax; Path=/');res.end('<title>Signed in</title><h1>Signed in</h1>');return;}
 if(req.url==='/logout'){res.setHeader('Set-Cookie','north_auth=; Max-Age=0; HttpOnly; Path=/');res.end('<title>Signed out</title>');return;}
 res.end('<title>Test login</title><form action="/logged" method="post"><input name="username" autocomplete="username"><input name="password" type="password" autocomplete="current-password"><button>Sign in</button></form>');
});
const wait=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+label);};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
async function launch(){electron=await _electron.launch({args:[path.join(__dirname,'electron-bootstrap.cjs')],env:{...process.env,NORTH_TEST_PROFILE:profile,NORTH_TEST_TELEGRAM:'1',NORTH_TELEGRAM_BOT_TOKEN:''}});proc=electron.process();for(const stream of [proc.stdout,proc.stderr])stream.on('data',b=>runtime+=b.toString());page=await electron.firstWindow();electron.context().on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));await page.waitForSelector('.tab');}
async function quit(){await page.evaluate(()=>window.north.quit());await wait(()=>Promise.resolve(proc.exitCode!==null),'quit');}
async function go(url){await page.locator('#address').fill(url);await page.locator('#address-form button').click();await wait(()=>Promise.resolve(electron.context().pages().some(p=>p.url()===url)),url);return electron.context().pages().find(p=>p.url()===url);}
async function panel(){await page.locator('#railSettings').click();let p;await wait(()=>{p=electron.windows().find(p=>p.url().endsWith('/study-panel.html'));return Promise.resolve(!!p);},'study panel');return p;}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 await launch();
 await check('Real login submit asks before saving a password',async()=>{
  const login=await go(origin+'/login');await login.locator('[name=username]').fill('student@example.test');await login.locator('[name=password]').fill(PASSWORD);await login.locator('button').click();
  await page.locator('[data-password-save=true]').waitFor();assert.ok(!fs.existsSync(path.join(profile,'north-passwords.enc')));
  await page.screenshot({path:path.join(out,'password-save.png')});await page.locator('[data-password-save=true]').click();await wait(()=>Promise.resolve(fs.existsSync(path.join(profile,'north-passwords.enc'))),'saved vault');
  assert.ok(!fs.readFileSync(path.join(profile,'north-passwords.enc')).includes(Buffer.from(PASSWORD)));
 });
 await quit();await launch();
 await check('Session-only HttpOnly login cookie survives full app restart',async()=>{await go(origin+'/login');assert.ok(receivedCookie.includes(COOKIE));assert.ok(!fs.readFileSync(path.join(profile,'north-session-cookies.enc')).includes(Buffer.from(COOKIE)));});
 await check('Saved password fills after a user click and survives restart',async()=>{
  const login=electron.context().pages().find(p=>p.url()===origin+'/login');await login.locator('[name=username]').click();await wait(()=>login.locator('[name=password]').inputValue().then(v=>v===PASSWORD),'password fill');assert.equal(await login.locator('[name=username]').inputValue(),'student@example.test');assert.equal(login.url(),origin+'/login');assert.equal(await login.evaluate(()=>typeof window.north),'undefined');
 });
 await check('Passwords are scoped to exact origin and removable',async()=>{
  const other='http://localhost:'+server.address().port+'/login';const login=await go(other);await login.locator('[name=username]').click();assert.equal(await login.locator('[name=password]').inputValue(),'');
  await page.locator('#profile').click();let manager;await wait(()=>{manager=electron.windows().find(p=>p.url().endsWith('/passwords.html'));return Promise.resolve(!!manager);},'manager');await manager.locator('.task button').click();await wait(()=>manager.locator('.task').count().then(n=>n===0),'removed password');await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/passwords.html')).close());
 });
 await check('Two-step username/password login saves and fills across pages',async()=>{
  const login=await go(origin+'/step1');await login.locator('input').fill('second@example.test');await login.locator('button').click();await login.waitForURL(origin+'/step2');await login.locator('input').fill(PASSWORD+'-second');await login.locator('button').click();await page.locator('[data-password-save=true]').click();
  const again=await go(origin+'/step1');await again.locator('input').click();await wait(()=>again.locator('input').inputValue().then(v=>v==='second@example.test'),'username step fill');await again.locator('button').click();await again.waitForURL(origin+'/step2');await again.locator('input').click();await wait(()=>again.locator('input').inputValue().then(v=>v===PASSWORD+'-second'),'password step fill');
 });
 await check('Telegram setup opens a single-use deep link without typing a code',async()=>{
  const p=await panel();await p.locator('#token').fill(TOKEN);await p.locator('#saveToken').click();await wait(()=>electron.evaluate(()=>global.__northTestExternal.some(u=>u.includes('?start=link_'))),'deep link');
  const link=(await electron.evaluate(()=>global.__northTestExternal)).find(u=>u.includes('?start=link_'));const payload=new URL(link).searchParams.get('start');assert.match(payload,/^link_[a-f0-9]{48}$/);
  await electron.evaluate((_e,text)=>global.__northTestTelegramQueue.push({update_id:1,message:{chat:{id:111,type:'private'},text:'/start '+text}}),payload);
  await wait(()=>p.locator('#connection').innerText().then(t=>t.includes('מחובר')),'paired');assert.equal(await p.locator('#tokenZone').isVisible(),false);assert.equal(await p.locator('#manualPair').isVisible(),false);assert.equal(await p.locator('#openBot').isVisible(),false);
  assert.ok(!fs.readFileSync(path.join(profile,'north-study-state.json'),'utf8').includes(TOKEN));await p.screenshot({path:path.join(out,'telegram-connected.png')});
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/study-panel.html')).close());
 });
 await go(origin+'/logout');await quit();await launch();
 await check('Telegram token and pairing persist; logout is respected after restart',async()=>{
  const p=await panel();const status=await p.evaluate(()=>window.north.study.status());assert.equal(status.configured,true);assert.equal(status.owner,'111');await p.locator('#connectTelegram').click();await wait(()=>electron.evaluate(()=>global.__northTestExternal.includes('https://t.me/NorthStudyHelperBot')),'connected bot opens');
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/study-panel.html')).close());await go(origin+'/login');assert.ok(!receivedCookie.includes(COOKIE));
 });
 assert.deepEqual(report.errors,[]);await quit();report.result='passed';
})().catch(async e=>{report.result='failed';report.failure=e.stack;console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(electron&&proc?.exitCode===null)await electron.close().catch(()=>{});server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'runtime.log'),runtime);});
