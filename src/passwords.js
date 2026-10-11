'use strict';
(()=>{
 const api=window.north.passwords;
 async function refresh(){try{
  const rows=await api.list(),container=document.querySelector('#entries');container.replaceChildren();
  if(!rows.length)document.querySelector('#message').textContent='עדיין אין סיסמאות שמורות.';else document.querySelector('#message').textContent='';
  for(const row of rows){const item=document.createElement('div');item.className='task';const label=document.createElement('p');label.textContent=new URL(row.origin).host+' — '+row.username;const button=document.createElement('button');button.textContent='מחק';button.onclick=async()=>{try{await api.remove(row.id);await refresh();}catch(e){document.querySelector('#message').textContent=e.message;}};item.append(label,button);container.append(item);}
 }catch(e){document.querySelector('#message').textContent=e.message;}}
 refresh();
})();
