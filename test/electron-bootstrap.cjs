'use strict';
// This entry point is used only by the real Electron UI suite. Never reuse the
// developer's signed-in profile, bot credentials, tray settings or saved files.
const {app,shell}=require('electron');
app.setPath('userData',process.env.NORTH_TEST_PROFILE);
const external=[];
shell.openExternal=async url=>{external.push(url);};
global.__northTestExternal=external;
const folders=[];
shell.showItemInFolder=file=>folders.push(file);
global.__northTestFolders=folders;
app.on('web-contents-created',(_e,wc)=>{
 wc.on('console-message',event=>console.log(JSON.stringify({type:'console',id:wc.id,level:event.level,message:event.message,url:event.sourceId})));
 wc.on('preload-error',(_event,file,error)=>console.log(JSON.stringify({type:'preload-error',file,message:error.message})));
 wc.on('did-fail-load',(_event,code,message,url,isMainFrame)=>console.log(JSON.stringify({type:'navigation-error',code,message,url,isMainFrame})));
 wc.on('did-navigate',(_event,url)=>console.log(JSON.stringify({type:'navigation',id:wc.id,url})));
});
require('../src/main');
