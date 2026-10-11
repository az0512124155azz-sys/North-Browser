'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('north',{
 open:u=>ipcRenderer.invoke('north:open',u),select:id=>ipcRenderer.invoke('north:select',id),close:id=>ipcRenderer.invoke('north:close',id),go:(id,u)=>ipcRenderer.invoke('north:go',id,u),nav:(id,a)=>ipcRenderer.invoke('north:nav',id,a),
 onTabs:f=>ipcRenderer.on('tabs:update',(_e,d)=>f(d)),
 study:{panel:()=>ipcRenderer.invoke('study:panel'),status:()=>ipcRenderer.invoke('study:status'),setToken:t=>ipcRenderer.invoke('study:setToken',t),pair:()=>ipcRenderer.invoke('study:pair'),scan:()=>ipcRenderer.invoke('study:scan'),openBot:()=>ipcRenderer.invoke('study:bot'),onChange:f=>ipcRenderer.on('study:changed',(_e,d)=>f(d))}
});
