'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,listener)=>{const handler=(_event,data)=>listener(data);ipcRenderer.on(channel,handler);return ()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('north',{
 tabs:()=>ipcRenderer.invoke('north:tabs'),newWindow:()=>ipcRenderer.invoke('north:window'),downloads:()=>ipcRenderer.invoke('north:downloads'),showDownload:id=>ipcRenderer.invoke('north:download-show',id),
 open:u=>ipcRenderer.invoke('north:open',u),select:id=>ipcRenderer.invoke('north:select',id),close:id=>ipcRenderer.invoke('north:close',id),go:(id,u)=>ipcRenderer.invoke('north:go',id,u),nav:(id,a)=>ipcRenderer.invoke('north:nav',id,a),overlay:pixels=>ipcRenderer.invoke('north:overlay',pixels),quit:()=>ipcRenderer.invoke('north:quit'),
 onTabs:f=>subscribe('tabs:update',f),
 onDownloads:f=>subscribe('downloads:update',f),
 passwords:{panel:()=>ipcRenderer.invoke('passwords:panel'),list:()=>ipcRenderer.invoke('passwords:list'),remove:id=>ipcRenderer.invoke('passwords:remove',id),answer:(id,save)=>ipcRenderer.invoke('passwords:answer',id,save),onOffer:f=>subscribe('passwords:offer',f)},
 gpt:{history:()=>ipcRenderer.invoke('gpt:history'),status:()=>ipcRenderer.invoke('gpt:status'),select:id=>ipcRenderer.invoke('gpt:select',id),open:id=>ipcRenderer.invoke('gpt:open',id),create:title=>ipcRenderer.invoke('gpt:new',title),prepare:(id,text)=>ipcRenderer.invoke('gpt:prepare',id,text),edit:(id,prompt)=>ipcRenderer.invoke('gpt:edit',id,prompt),approve:(id,nonce)=>ipcRenderer.invoke('gpt:approve',id,nonce),cancel:(id,nonce)=>ipcRenderer.invoke('gpt:cancel',id,nonce),recover:id=>ipcRenderer.invoke('gpt:recover',id),rename:(id,title)=>ipcRenderer.invoke('gpt:rename',id,title),file:id=>ipcRenderer.invoke('gpt:file',id),onChange:f=>subscribe('gpt:changed',f)},
 study:{panel:()=>ipcRenderer.invoke('study:panel'),status:()=>ipcRenderer.invoke('study:status'),setToken:t=>ipcRenderer.invoke('study:setToken',t),pair:()=>ipcRenderer.invoke('study:pair'),connect:()=>ipcRenderer.invoke('study:connect'),scan:()=>ipcRenderer.invoke('study:scan'),openBot:()=>ipcRenderer.invoke('study:bot'),onChange:f=>subscribe('study:changed',f)}
});
