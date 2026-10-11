'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,shell,session,safeStorage,Tray,Menu}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const {createTelegramBot}=require('./telegram-bot');
const {createClassroomScanner}=require('./classroom-scanner');
const {createStudyAgent}=require('./study-agent');
const PARTITION='persist:north-main';
let win,panel,tray,scanner,bot,study,active=0,seq=0,quitting=false,scanTimer=null,overlaySpace=0;
const tabs=new Map();
const state={};let storeFile='';let botStatus={};
function persist(){if(!storeFile)return;try{const tmp=storeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,storeFile)}catch(e){console.error('Cannot save North study state:',e.message)}}
function loadState(){storeFile=path.join(app.getPath('userData'),'north-study-state.json');try{Object.assign(state,JSON.parse(fs.readFileSync(storeFile,'utf8')))}catch{}}
function getToken(){if(process.env.NORTH_TELEGRAM_BOT_TOKEN)return process.env.NORTH_TELEGRAM_BOT_TOKEN;try{return state.telegramCipher&&safeStorage.isEncryptionAvailable()?safeStorage.decryptString(Buffer.from(state.telegramCipher,'base64')):''}catch{return ''}}
function saveToken(text){if(!safeStorage.isEncryptionAvailable())throw Error('Secure token storage is unavailable. On Linux set NORTH_TELEGRAM_BOT_TOKEN securely instead.');state.telegramCipher=safeStorage.encryptString(text).toString('base64');persist()}
function pushStudy(){const d=studyStatus();for(const w of [panel,win])if(w&&!w.isDestroyed())w.webContents.send('study:changed',d)}
function studyStatus(){return {bot:'@NorthStudyHelperBot',configured:!!getToken(),owner:bot?.getOwner()||null,botStatus,scanner:scanner?.status()||{},tasks:scanner?.tasks()?.slice(0,200)||[],classes:scanner?.classes()||[],messages:scanner?.notices()?.slice(0,40)||[],localDrafts:Object.keys(state.drafts||{}).length};}
function normalize(input){input=String(input||'').trim();if(!input||input==='north://newtab')return 'north://newtab';if(/^https?:\/\//i.test(input))return input;if(/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(input))return 'https://'+input;return 'https://www.google.com/search?q='+encodeURIComponent(input)}
function emitTabs(){if(!win||win.isDestroyed())return;win.webContents.send('tabs:update',{active,tabs:[...tabs.values()].map(t=>({id:t.id,title:t.title,url:t.url,loading:t.loading}))})}
function resizeViews(){if(!win)return;const b=win.getContentBounds();const x=68,y=141;const fullWidth=Math.max(150,b.width-x);const width=Math.max(260,fullWidth-Math.min(overlaySpace,Math.max(0,fullWidth-260)));for(const t of tabs.values())if(t.view)t.view.setBounds({x,y,width,height:Math.max(150,b.height-y)})}
function select(id){if(!win||!tabs.has(id))return;const old=tabs.get(active);if(old?.view)win.contentView.removeChildView(old.view);active=id;const t=tabs.get(id);if(t.view){win.contentView.addChildView(t.view);resizeViews()}emitTabs()}
function add(raw='north://newtab'){const url=normalize(raw),id=++seq,t={id,url,title:url==='north://newtab'?'New tab':url,loading:false,view:null};tabs.set(id,t);
 if(url!=='north://newtab'){
  const view=new WebContentsView({webPreferences:{partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false}});t.view=view;
  view.webContents.setWindowOpenHandler(({url:u})=>{if(/^https?:\/\//i.test(u))add(u);return{action:'deny'}});
  view.webContents.on('did-navigate',(_e,u)=>{t.url=u;t.title=view.webContents.getTitle()||u;emitTabs()});
  view.webContents.on('page-title-updated',(_e,title)=>{t.title=title;emitTabs()});
  view.webContents.on('did-start-loading',()=>{t.loading=true;emitTabs()});view.webContents.on('did-stop-loading',()=>{t.loading=false;emitTabs()});
  view.webContents.on('will-navigate',(event,u)=>{if(!/^https?:\/\//i.test(u))event.preventDefault()});
  view.webContents.loadURL(url).catch(e=>console.warn('Navigation:',e.message));
 }select(id);return id;
}
function close(id){const t=tabs.get(id);if(!t)return;if(t.view){win.contentView.removeChildView(t.view);t.view.webContents.close()}tabs.delete(id);if(id===active){active=0;tabs.size?select([...tabs.keys()].at(-1)):add()}emitTabs()}
function panelWindow(){if(panel&&!panel.isDestroyed()){panel.focus();return}panel=new BrowserWindow({parent:win,width:600,height:760,minWidth:420,minHeight:480,backgroundColor:'#1a2420',title:'North Study Assistant',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});panel.loadFile(path.join(__dirname,'study-panel.html'));panel.webContents.on('did-finish-load',pushStudy)}
function createTray(){try{tray=new Tray(path.join(__dirname,'north-icon.png'));tray.setToolTip('North Browser - study scanner');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open North',click:()=>{win.show();win.focus()}},{label:'Study Assistant',click:()=>{win.show();panelWindow()}},{type:'separator'},{label:'Exit North',click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',()=>{win.show();win.focus()})}catch(e){console.warn('Tray not available:',e.message)}}
async function scanNow(){const result=await scanner.scan();pushStudy();return result}
async function initializeStudy(){loadState();scanner=createClassroomScanner({BrowserWindow,partition:PARTITION,store:state,save:persist,onStatus:()=>pushStudy(),
 onNewTasks:async tasks=>{for(const t of tasks.slice(0,10)){try{await bot.toOwner(`📚 מטלה חדשה ב-Classroom\n${t.title}\nכיתה: ${t.course}\n${t.url}`)}catch(e){console.warn('Telegram tasks:',e.message)}}},
 onNewAnnouncements:async messages=>{for(const m of messages.slice(0,12)){try{await bot.toOwner(`📢 הודעה חדשה ב-Classroom\nכיתה: ${m.course}\n${String(m.text).slice(0,3100)}`)}catch(e){console.warn('Telegram notices:',e.message)}}}});
 study=createStudyAgent({store:state,save:persist,items:()=>scanner.tasks()});
 bot=createTelegramBot({readState:()=>state,writeState:persist,getToken,saveToken,scan:scanNow,tasks:()=>study.all(),classes:()=>scanner.classes(),messages:()=>scanner.notices(),draft:study.draft,addTask:study.addTask,onStatus:s=>{botStatus=s;pushStudy()}});
 await bot.start();
 setTimeout(()=>scanNow().catch(e=>{console.warn('Initial classroom scan:',e.message);pushStudy()}),12000).unref?.();
 scanTimer=setInterval(()=>scanNow().catch(e=>console.warn('Periodic classroom scan:',e.message)),5*60*1000);
 }
app.whenReady().then(async()=>{
 session.fromPartition(PARTITION);
 win=new BrowserWindow({width:1370,height:880,minWidth:850,minHeight:540,backgroundColor:'#1c2923',title:'North Browser',titleBarStyle:process.platform==='win32'?'hidden':(process.platform==='darwin'?'hiddenInset':'default'),...(process.platform==='win32'?{titleBarOverlay:{color:'#17231e',symbolColor:'#e9efea',height:48}}:{}),icon:path.join(__dirname,'north-icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenuBarVisibility(false);win.loadFile(path.join(__dirname,'index.html'));win.on('resize',resizeViews);win.on('close',event=>{if(!quitting&&tray){event.preventDefault();win.hide()}});
 win.webContents.once('did-finish-load',()=>add());createTray();
 ipcMain.handle('north:open',(_e,u)=>add(u));ipcMain.handle('north:select',(_e,id)=>select(id));ipcMain.handle('north:close',(_e,id)=>close(id));
 ipcMain.handle('north:go',(_e,id,u)=>{const t=tabs.get(id);if(!t)return;u=normalize(u);if(u==='north://newtab'){close(id);return add()}if(!t.view){const newid=add(u);close(id);return newid}t.view.webContents.loadURL(u).catch(()=>{});return id});
 ipcMain.handle('north:nav',(_e,id,action)=>{const wc=tabs.get(id)?.view?.webContents;if(!wc)return;if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();if(action==='reload')wc.reload()});
 ipcMain.handle('north:external',(_e,url)=>{if(/^https:\/\//.test(url))return shell.openExternal(url)});
 ipcMain.handle('north:overlay',(_e,pixels)=>{overlaySpace=Math.max(0,Math.min(700,Number(pixels)||0));resizeViews();return true});
 ipcMain.handle('north:quit',()=>{quitting=true;app.quit()});
 ipcMain.handle('study:panel',panelWindow);
 ipcMain.handle('study:status',()=>studyStatus());
 ipcMain.handle('study:setToken',async(_e,value)=>{if(!bot)throw Error('Bot is not ready');return bot.verifyAndSave(String(value||''))});
 ipcMain.handle('study:pair',()=>{if(!bot)throw Error('Bot is not ready');return bot.createPairingCode()});
 ipcMain.handle('study:scan',()=>scanNow());
 ipcMain.handle('study:bot',()=>shell.openExternal('https://t.me/NorthStudyHelperBot'));
 await initializeStudy();
 if(process.platform==='win32'&&app.isPackaged)app.setLoginItemSettings({openAtLogin:true,openAsHidden:true,args:['--background']});
 if(process.argv.includes('--background'))win.hide();
});
app.on('before-quit',()=>{quitting=true;if(scanTimer)clearInterval(scanTimer);bot?.stop();scanner?.destroy();persist()});
app.on('window-all-closed',()=>{if(!tray&&process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(win&&!win.isDestroyed())win.show()});
