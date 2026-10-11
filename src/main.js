'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,shell,session,safeStorage,Tray,Menu}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const {createTelegramBot}=require('./telegram-bot');
const {createClassroomScanner}=require('./classroom-scanner');
const {createStudyAgent}=require('./study-agent');
const {renderAnswerPDF}=require('./study-documents');
const {createGptFiles}=require('./gpt-files');
const {createGptWorkflow}=require('./gpt-workflow');
const {createChatGPTWeb}=require('./gpt-web');
const {createPasswordVault,createSessionKeeper,credentialOrigin}=require('./secure-profile');
const crypto=require('node:crypto');
const PARTITION='persist:north-main';
let win,panel,tray,scanner,bot,study,quitting=false,scanTimer=null;
let vault,sessionKeeper,passwordWindow,shutdownReady=false;
let gptFiles,gptWorkflow,gptWeb,gptHistoryWindow;
const gptTabs=new Map();
const passwordOffers=new Map();
const usernameHints=new Map();
const browsers=new Map();
const downloads=new Map();let downloadSeq=0;
const state={};let storeFile='';let botStatus={};
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
function persist(){if(!storeFile)return;try{const tmp=storeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,storeFile)}catch(e){console.error('Cannot save North study state:',e.message)}}
function loadState(){storeFile=path.join(app.getPath('userData'),'north-study-state.json');try{Object.assign(state,JSON.parse(fs.readFileSync(storeFile,'utf8')))}catch{}}
function getToken(){if(process.env.NORTH_TELEGRAM_BOT_TOKEN)return process.env.NORTH_TELEGRAM_BOT_TOKEN;try{return state.telegramCipher&&safeStorage.isEncryptionAvailable()?safeStorage.decryptString(Buffer.from(state.telegramCipher,'base64')):''}catch{return ''}}
function saveToken(text){if(!safeStorage.isEncryptionAvailable())throw Error('Secure token storage is unavailable. On Linux set NORTH_TELEGRAM_BOT_TOKEN securely instead.');state.telegramCipher=safeStorage.encryptString(text).toString('base64');persist()}
function pushStudy(){const d=studyStatus();for(const w of [panel,gptHistoryWindow,...[...browsers.values()].map(b=>b.win)])if(w&&!w.isDestroyed()){w.webContents.send('study:changed',d);if(w===gptHistoryWindow)w.webContents.send('gpt:changed',gptWorkflow?.status()||{threads:[]});}}
function studyStatus(){return {bot:'@NorthStudyHelperBot',configured:!!getToken(),owner:bot?.getOwner()||null,botStatus,scanner:scanner?.status()||{},tasks:scanner?.tasks()?.slice(0,200)||[],classes:scanner?.classes()||[],messages:scanner?.notices()?.slice(0,40)||[],localDrafts:Object.keys(state.drafts||{}).length,gpt:gptWeb?.status()||{},gptChats:gptWorkflow?.status().threads.length||0};}
function normalize(input){input=String(input||'').trim();if(!input||input==='north://newtab')return 'north://newtab';if(/^https?:\/\//i.test(input))return input;if(/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(input))return 'https://'+input;return 'https://www.google.com/search?q='+encodeURIComponent(input)}
function tabState(b){return {active:b.active,tabs:[...b.tabs.values()].map(t=>({id:t.id,title:t.title,url:t.url,loading:t.loading,error:t.error||''}))}}
function emitTabs(b){if(!b.win.isDestroyed())b.win.webContents.send('tabs:update',tabState(b))}
function downloadState(){return [...downloads.values()].map(({id,name,url,state})=>({id,name,url,state}))}
function emitDownloads(){for(const b of browsers.values())if(!b.win.isDestroyed())b.win.webContents.send('downloads:update',downloadState())}
function resizeViews(b){if(b.win.isDestroyed())return;const bounds=b.win.getContentBounds();const x=68,y=141;const fullWidth=Math.max(150,bounds.width-x);const width=Math.max(260,fullWidth-Math.min(b.overlaySpace,Math.max(0,fullWidth-260)));for(const t of b.tabs.values())if(t.view)t.view.setBounds({x,y,width,height:Math.max(150,bounds.height-y)})}
function select(b,id){if(!b.tabs.has(id))return;const old=b.tabs.get(b.active);if(old?.view)b.win.contentView.removeChildView(old.view);b.active=id;const t=b.tabs.get(id);if(t.view){b.win.contentView.addChildView(t.view);resizeViews(b)}emitTabs(b)}
function destroyView(b,t){if(!t.view)return;if(t.id===b.active)b.win.contentView.removeChildView(t.view);t.view.webContents.close();t.view=null}
function navigateTab(b,t,raw){
 const url=normalize(raw);t.url=url;t.title=url==='north://newtab'?'New tab':url;t.error='';
 if(url==='north://newtab'){destroyView(b,t);t.loading=false;emitTabs(b);return t.id}
 if(!t.view){
  const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'credentials-preload.js'),partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false}});t.view=view;
  view.webContents.setWindowOpenHandler(({url:u})=>{if(/^https?:\/\//i.test(u))add(b,u);return{action:'deny'}});
  const viewId=view.webContents.id;view.webContents.once('destroyed',()=>usernameHints.delete(viewId));
  const navigated=(_e,u)=>{t.url=u;t.title=view.webContents.getTitle()||u;emitTabs(b)};
  view.webContents.on('did-navigate',navigated);view.webContents.on('did-navigate-in-page',navigated);
  view.webContents.on('page-title-updated',(_e,title)=>{t.title=title;emitTabs(b)});
  view.webContents.on('did-start-loading',()=>{t.loading=true;t.error='';emitTabs(b)});
  view.webContents.on('did-stop-loading',()=>{t.loading=false;emitTabs(b)});
  view.webContents.on('did-fail-load',(_e,code,message,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){t.error=message;console.warn('Navigation failed:',message);emitTabs(b)}});
  view.webContents.on('will-navigate',(event,u)=>{if(!/^https?:\/\//i.test(u))event.preventDefault()});
  if(t.id===b.active){b.win.contentView.addChildView(view);resizeViews(b)}
 }
 t.loading=true;emitTabs(b);
 t.view.webContents.loadURL(url).catch(e=>{if(e.code!=='ERR_ABORTED')console.warn('Navigation:',e.message)});
 return t.id;
}
function add(b,raw='north://newtab'){const id=++b.seq,t={id,url:'north://newtab',title:'New tab',loading:false,view:null};b.tabs.set(id,t);select(b,id);navigateTab(b,t,raw);return id}
function close(b,id){const t=b.tabs.get(id);if(!t)return;destroyView(b,t);b.tabs.delete(id);if(id===b.active){b.active=0;b.tabs.size?select(b,[...b.tabs.keys()].at(-1)):add(b)}emitTabs(b)}
function browserFrom(event){const b=browsers.get(event.sender.id);if(!b||event.senderFrame!==event.sender.mainFrame)throw Error('Invalid browser IPC sender');return b}
function credentialSender(event){
 if(event.sender.isDestroyed()||!event.senderFrame||event.senderFrame!==event.sender.mainFrame)return null;
 const origin=credentialOrigin(event.senderFrame.url);if(!origin||origin!==credentialOrigin(event.sender.getURL()))return null;
 for(const b of browsers.values()){const t=b.tabs.get(b.active);if(t?.view?.webContents===event.sender)return {b,t,origin};}return null;
}
function passwordPanel(){if(passwordWindow&&!passwordWindow.isDestroyed()){passwordWindow.focus();return;}passwordWindow=new BrowserWindow({parent:win,width:580,height:640,backgroundColor:'#1a2420',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});passwordWindow.loadFile(path.join(__dirname,'passwords.html'));}
function passwordPanelSender(e){if(e.sender!==passwordWindow?.webContents||e.senderFrame!==e.sender.mainFrame)throw Error('Invalid password manager sender');}
function createBrowser(){
 const w=new BrowserWindow({width:1370,height:880,minWidth:850,minHeight:540,backgroundColor:'#1c2923',title:'North Browser',titleBarStyle:process.platform==='win32'?'hidden':(process.platform==='darwin'?'hiddenInset':'default'),...(process.platform==='win32'?{titleBarOverlay:{color:'#17231e',symbolColor:'#e9efea',height:48}}:{}),icon:path.join(__dirname,'north-icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const contentsId=w.webContents.id;
 const b={win:w,tabs:new Map(),active:0,seq:0,overlaySpace:0};browsers.set(contentsId,b);
 w.setMenuBarVisibility(false);w.on('resize',()=>resizeViews(b));
 w.on('close',event=>{if(w===win&&!quitting&&tray){event.preventDefault();w.hide()}});
 w.on('closed',()=>{for(const t of b.tabs.values())if(t.view&&!t.view.webContents.isDestroyed())t.view.webContents.close();browsers.delete(contentsId)});
 w.webContents.on('preload-error',(_e,_file,error)=>console.error('North preload failed:',error.message));
 w.webContents.on('console-message',event=>{if(event.level==='error')console.error('North renderer:',event.message)});
 w.webContents.once('did-finish-load',()=>add(b));
 w.loadFile(path.join(__dirname,'index.html'));return w;
}
function panelWindow(){if(panel&&!panel.isDestroyed()){panel.focus();return}panel=new BrowserWindow({parent:win,width:600,height:760,minWidth:420,minHeight:480,backgroundColor:'#1a2420',title:'North Study Assistant',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});panel.loadFile(path.join(__dirname,'study-panel.html'));panel.webContents.on('did-finish-load',pushStudy)}
function createTray(){try{tray=new Tray(path.join(__dirname,'north-icon.png'));tray.setToolTip('North Browser - study scanner');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open North',click:()=>{win.show();win.focus()}},{label:'Study Assistant',click:()=>{win.show();panelWindow()}},{type:'separator'},{label:'Exit North',click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',()=>{win.show();win.focus()})}catch(e){console.warn('Tray not available:',e.message)}}
async function scanNow(){const result=await scanner.scan();pushStudy();return result}
function gptSender(e){if(e.senderFrame!==e.sender.mainFrame||![panel?.webContents,gptHistoryWindow?.webContents,...[...browsers.values()].map(b=>b.win.webContents)].includes(e.sender))throw Error('Invalid GPT workspace sender');}
function gptHistory(){if(gptHistoryWindow&&!gptHistoryWindow.isDestroyed()){gptHistoryWindow.show();gptHistoryWindow.focus();return;}gptHistoryWindow=new BrowserWindow({width:1080,height:800,minWidth:750,minHeight:550,title:'North — שיחות GPT',backgroundColor:'#192620',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});gptHistoryWindow.loadFile(path.join(__dirname,'gpt-history.html'));}
async function getGptTab(thread,url){
 let entry=gptTabs.get(thread.id);
 if(!entry||entry.b.win.isDestroyed()||!entry.t.view||entry.t.view.webContents.isDestroyed()){
  if(!win||win.isDestroyed())win=createBrowser();const b=browsers.get(win.webContents.id),id=add(b,url);entry={b,t:b.tabs.get(id)};gptTabs.set(thread.id,entry);
 }else if(entry.t.view.webContents.getURL()!==url&&!entry.t.view.webContents.isLoading())navigateTab(entry.b,entry.t,url);
 select(entry.b,entry.t.id);entry.b.win.show();entry.b.win.focus();return entry.t.view.webContents;
}
async function captureGptDownload(wc,trigger){
 const dir=path.join(app.getPath('userData'),'north-gpt-downloads');fs.mkdirSync(dir,{recursive:true});
 return new Promise((resolve,reject)=>{
  let item=null,file='',settled=false;const ses=wc.session;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);ses.removeListener('will-download',listener);if(error&&item)item.cancel();if(file&&fs.existsSync(file))fs.unlinkSync(file);error?reject(error):resolve(value);};
  const listener=(_e,incoming,sender)=>{if(sender!==wc)return;item=incoming;ses.removeListener('will-download',listener);file=path.join(dir,crypto.randomBytes(12).toString('hex')+'-'+path.basename(item.getFilename()).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(-100));item.setSavePath(file);if(item.getTotalBytes()>20*1024*1024){finish(Error('קובץ GPT גדול מ־20MB. פתח אותו בשיחה.'));return;}item.on('updated',()=>{if(item.getReceivedBytes()>20*1024*1024)finish(Error('קובץ GPT גדול מדי.'));});item.once('done',(_event,status)=>{if(settled)return;if(status!=='completed'){finish(Error('הורדת קובץ GPT לא הסתיימה.'));return;}try{finish(null,gptFiles.put(fs.readFileSync(file),item.getFilename()));}catch(e){finish(e);}});};
  const timer=setTimeout(()=>finish(Error('לא התקבל קובץ מהקישור של GPT. אפשר לפתוח אותו באתר.')),30000);ses.on('will-download',listener);Promise.resolve().then(trigger).catch(finish);
 });
}
async function captureTask(task){
 if(!/^https:\/\/classroom\.google\.com\//.test(task.url||''))return [];
 const w=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{await w.loadURL(task.url);await new Promise(r=>setTimeout(r,800));const login=await w.webContents.executeJavaScript('location.hostname!=="classroom.google.com"||!!document.querySelector("input[type=password]")');if(login)throw Error('נדרשת התחברות ל־Classroom.');return[gptFiles.put((await w.webContents.capturePage()).toPNG(),'Classroom-task.png')];}finally{w.destroy();}
}
async function initializeStudy(){loadState();scanner=createClassroomScanner({BrowserWindow,partition:PARTITION,store:state,save:persist,onStatus:()=>pushStudy(),
 onNewTasks:async tasks=>{for(const t of tasks.slice(0,10)){try{if(bot.getOwner())await bot.presentTask(t,true);}catch(e){await bot.toOwner(`מטלה חדשה: ${t.title}\n${t.url}\nלא הצלחתי להכין הצעה: ${e.message}`).catch(()=>{});console.warn('Telegram tasks:',e.message)}}},
 onNewAnnouncements:async messages=>{for(const m of messages.slice(0,12)){try{await bot.toOwner(`📢 הודעה חדשה ב-Classroom\nכיתה: ${m.course}\n${String(m.text).slice(0,3100)}`)}catch(e){console.warn('Telegram notices:',e.message)}}}});
 study=createStudyAgent({store:state,save:persist,items:()=>scanner.tasks()});
 gptFiles=createGptFiles(path.join(app.getPath('userData'),'north-gpt-files'));
 gptWeb=createChatGPTWeb({getTab:getGptTab,fileStore:gptFiles,captureDownload:captureGptDownload,onChange:pushStudy});
 gptWorkflow=createGptWorkflow({store:state,save:persist,plan:study.plan,web:gptWeb,onChange:pushStudy,deliveryOwner:()=>bot?.getOwner()||null,onResult:result=>result.pending.deliveryOwner&&String(result.pending.deliveryOwner)===String(bot.getOwner())?bot.deliverGptResult(result):Promise.resolve()});
 bot=createTelegramBot({readState:()=>state,writeState:persist,getToken,saveToken,scan:scanNow,tasks:()=>study.all(),classes:()=>scanner.classes(),messages:()=>scanner.notices(),addTask:study.addTask,workflow:gptWorkflow,fileStore:gptFiles,captureTask,renderPDF:text=>renderAnswerPDF(BrowserWindow,text),onStatus:s=>{botStatus=s;pushStudy()}});
 await bot.start();
 setTimeout(()=>scanNow().catch(e=>{console.warn('Initial classroom scan:',e.message);pushStudy()}),12000).unref?.();
 scanTimer=setInterval(()=>scanNow().catch(e=>console.warn('Periodic classroom scan:',e.message)),5*60*1000);
 }
app.whenReady().then(async()=>{
 if(!primaryInstance)return;
 try{vault=createPasswordVault(app.getPath('userData'),safeStorage);}catch(e){console.warn('Password storage:',e.message);}
 sessionKeeper=createSessionKeeper(app.getPath('userData'),safeStorage,session.fromPartition(PARTITION));
 await sessionKeeper.start().catch(e=>console.warn('Session restore:',e.message));
 session.fromPartition(PARTITION).on('will-download',(_e,item)=>{
  const id=++downloadSeq,entry={id,name:item.getFilename(),url:item.getURL(),state:'progressing',path:''};downloads.set(id,entry);emitDownloads();
  item.on('updated',(_event,state)=>{entry.state=state;emitDownloads()});
  item.once('done',(_event,state)=>{entry.state=state;entry.path=item.getSavePath();emitDownloads()});
 });
 ipcMain.handle('north:tabs',e=>tabState(browserFrom(e)));
 ipcMain.handle('passwords:panel',e=>{browserFrom(e);passwordPanel();});
 ipcMain.handle('passwords:list',e=>{passwordPanelSender(e);return vault?.list()||[];});
 ipcMain.handle('passwords:remove',(e,id)=>{passwordPanelSender(e);vault?.remove(id);});
 const hintedUsername=e=>{const hint=usernameHints.get(e.sender.id);return hint&&hint.origin===credentialOrigin(e.senderFrame.url)&&hint.expires>Date.now()?hint.username:'';};
 ipcMain.on('credentials:username',(e,username)=>{const sender=credentialSender(e);if(sender&&typeof username==='string'&&username.length>0&&username.length<=1000)usernameHints.set(e.sender.id,{origin:sender.origin,username,expires:Date.now()+600000});});
 ipcMain.handle('credentials:lookup',(e,username)=>{const sender=credentialSender(e);if(!sender||!vault)return null;const entry=vault.forOrigin(sender.origin,typeof username==='string'&&username?username:hintedUsername(e));return entry?{username:entry.username,password:entry.password}:null;});
 ipcMain.on('credentials:offer',(e,data)=>{
  const sender=credentialSender(e);
  if(!sender||!vault?.available()||typeof data?.username!=='string'||typeof data.password!=='string'||!data.password||data.username.length>1000||data.password.length>4000)return;
  data={username:data.username||hintedUsername(e),password:data.password};if(!data.username)return;
  if(vault.matches(sender.origin,data.username,data.password))return;
  const id=crypto.randomUUID();passwordOffers.set(id,{b:sender.b,origin:sender.origin,username:data.username,password:data.password});
  setTimeout(()=>passwordOffers.delete(id),120000).unref();
  sender.b.win.webContents.send('passwords:offer',{id,origin:sender.origin,username:data.username});
 });
 ipcMain.handle('passwords:answer',(e,id,save)=>{const b=browserFrom(e),offer=passwordOffers.get(id);if(!offer||offer.b!==b)throw Error('This password offer expired');passwordOffers.delete(id);if(save)vault.save(offer.origin,offer.username,offer.password);return true;});
 ipcMain.handle('north:window',e=>{browserFrom(e);createBrowser();return true});
 ipcMain.handle('north:open',(e,u)=>add(browserFrom(e),u));ipcMain.handle('north:select',(e,id)=>select(browserFrom(e),id));ipcMain.handle('north:close',(e,id)=>close(browserFrom(e),id));
 ipcMain.handle('north:go',(e,id,u)=>{const b=browserFrom(e),t=b.tabs.get(id);if(t)return navigateTab(b,t,u)});
 ipcMain.handle('north:nav',(e,id,action)=>{const wc=browserFrom(e).tabs.get(id)?.view?.webContents;if(!wc)return;if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();if(action==='reload')wc.reload()});
 ipcMain.handle('north:downloads',e=>{browserFrom(e);return downloadState()});
 ipcMain.handle('north:download-show',(e,id)=>{browserFrom(e);const d=downloads.get(id);if(d?.state==='completed'&&d.path)shell.showItemInFolder(d.path)});
 ipcMain.handle('north:external',(_e,url)=>{if(/^https:\/\//.test(url))return shell.openExternal(url)});
 ipcMain.handle('north:overlay',(e,pixels)=>{const b=browserFrom(e);b.overlaySpace=Math.max(0,Math.min(700,Number(pixels)||0));resizeViews(b);return true});
 ipcMain.handle('north:quit',()=>{quitting=true;app.quit()});
 ipcMain.handle('study:panel',panelWindow);
 ipcMain.handle('study:status',()=>studyStatus());
 ipcMain.handle('study:setToken',async(_e,value)=>{if(!bot)throw Error('Bot is not ready');return bot.verifyAndSave(String(value||''))});
 ipcMain.handle('study:pair',()=>{if(!bot)throw Error('Bot is not ready');return bot.createPairingCode()});
 ipcMain.handle('study:scan',()=>scanNow());
 ipcMain.handle('gpt:history',e=>{gptSender(e);gptHistory();});
 ipcMain.handle('gpt:status',e=>{gptSender(e);return gptWorkflow?.status()||{threads:[]};});
 ipcMain.handle('gpt:select',(e,id)=>{gptSender(e);gptWorkflow.choose(id);});
 ipcMain.handle('gpt:open',(e,id)=>{gptSender(e);return gptWorkflow.open(id).then(()=>true);});
 ipcMain.handle('gpt:new',(e,title)=>{gptSender(e);return gptWorkflow.create(title).id;});
 ipcMain.handle('gpt:prepare',(e,id,text)=>{gptSender(e);return gptWorkflow.prepare(text,{threadId:id});});
 ipcMain.handle('gpt:edit',(e,id,prompt)=>{gptSender(e);return gptWorkflow.edit(id,prompt);});
 ipcMain.handle('gpt:approve',(e,id,nonce)=>{gptSender(e);return gptWorkflow.approve(id,nonce).then(()=>true);});
 ipcMain.handle('gpt:cancel',(e,id,nonce)=>{gptSender(e);gptWorkflow.cancel(id,nonce);});
 ipcMain.handle('gpt:recover',(e,id)=>{gptSender(e);return gptWorkflow.recover(id).then(()=>true);});
 ipcMain.handle('gpt:rename',(e,id,title)=>{gptSender(e);gptWorkflow.rename(id,title);});
 ipcMain.handle('gpt:file',(e,id)=>{gptSender(e);const file=gptWorkflow.status().threads.flatMap(t=>t.files).find(f=>f.id===id);if(!file)throw Error('הקובץ לא נמצא');gptFiles.read(file);return shell.openPath(gptFiles.location(file));});
 ipcMain.handle('study:bot',()=>shell.openExternal('https://t.me/NorthStudyHelperBot'));
 ipcMain.handle('study:connect',async()=>{if(!bot?.isConfigured())throw Error('יש להגדיר את מפתח הבוט פעם אחת לפני החיבור.');const pair=bot.createPairingCode();await shell.openExternal(pair?.url||'https://t.me/NorthStudyHelperBot');return pair;});
 win=createBrowser();createTray();
 await initializeStudy();
 if(process.platform==='win32'&&app.isPackaged)app.setLoginItemSettings({openAtLogin:true,openAsHidden:true,args:['--background']});
 if(process.argv.includes('--background'))win.hide();
});
app.on('before-quit',event=>{quitting=true;if(!primaryInstance||shutdownReady)return;event.preventDefault();if(scanTimer)clearInterval(scanTimer);bot?.stop();gptWeb?.stop();scanner?.destroy();persist();passwordOffers.clear();Promise.resolve(sessionKeeper?.save()).catch(e=>console.warn('Session save:',e.message)).finally(()=>{sessionKeeper?.stop();shutdownReady=true;app.quit();});});
app.on('window-all-closed',()=>{if(!tray&&process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(win&&!win.isDestroyed())win.show()});
