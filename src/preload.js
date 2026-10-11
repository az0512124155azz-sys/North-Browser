'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,listener)=>{const handler=(_event,data)=>listener(data);ipcRenderer.on(channel,handler);return ()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('north',{
 tabs:()=>ipcRenderer.invoke('north:tabs'),newWindow:()=>ipcRenderer.invoke('north:window'),downloads:()=>ipcRenderer.invoke('north:downloads'),showDownload:id=>ipcRenderer.invoke('north:download-show',id),
 open:u=>ipcRenderer.invoke('north:open',u),select:id=>ipcRenderer.invoke('north:select',id),close:id=>ipcRenderer.invoke('north:close',id),go:(id,u)=>ipcRenderer.invoke('north:go',id,u),nav:(id,a)=>ipcRenderer.invoke('north:nav',id,a),overlay:pixels=>ipcRenderer.invoke('north:overlay',pixels),quit:()=>ipcRenderer.invoke('north:quit'),
 onTabs:f=>subscribe('tabs:update',f),
 onDownloads:f=>subscribe('downloads:update',f),
 study:{panel:()=>ipcRenderer.invoke('study:panel'),status:()=>ipcRenderer.invoke('study:status'),setToken:t=>ipcRenderer.invoke('study:setToken',t),pair:()=>ipcRenderer.invoke('study:pair'),scan:()=>ipcRenderer.invoke('study:scan'),openBot:()=>ipcRenderer.invoke('study:bot'),onChange:f=>subscribe('study:changed',f)}
});
