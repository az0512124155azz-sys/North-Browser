'use strict';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function textFromItems(items){
 const lines=[];let line=[];
 function flush(){
  if(!line.length)return;
  const ordered=line.filter(i=>i.str).map(i=>({...i,str:i.str.normalize('NFKC')}));
  const joined=ordered.map(i=>i.str).join('');
  const rtl=(joined.match(/[\u0590-\u05ff\u0600-\u06ff]/g)||[]).length>(joined.match(/[a-zA-Z]/g)||[]).length;
  if(!rtl){lines.push(joined);line=[];return;}
  ordered.sort((a,b)=>a.transform[4]-b.transform[4]);
  // PDFs may store shaped Arabic as one glyph per item, in visual order.
  // Attach combining marks to their base glyph before reversing RTL chunks.
  for(const item of [...ordered])if(/^\p{M}+$/u.test(item.str)){
   const bases=ordered.filter(i=>i!==item&&!/^\s*$|^\p{M}+$/u.test(i.str));
   bases.sort((a,b)=>Math.abs(a.transform[4]+a.width/2-item.transform[4])-Math.abs(b.transform[4]+b.width/2-item.transform[4]));
   if(bases[0]){bases[0].str+=item.str;item.str='';}
  }
  const tokens=[];let latin='';const endLatin=()=>{if(latin){const m=/^(\s*)(.*?)(\s*)$/s.exec(latin);if(m[1])tokens.push(m[1]);if(m[2])tokens.push(m[2]);if(m[3])tokens.push(m[3]);latin='';}};
  for(const item of ordered){if(!item.str)continue;if(item.dir==='rtl'){endLatin();tokens.push(item.str);}else latin+=item.str;}
  endLatin();lines.push(tokens.reverse().join(''));line=[];
 }
 for(const item of items){if(typeof item.str!=='string')continue;line.push(item);if(item.hasEOL)flush();}flush();return lines.join('\n');
}
async function readDocument(bytes,name) {
 if(bytes.length>20*1024*1024)throw Error('הקובץ גדול מדי. אפשר לשלוח PDF או טקסט עד 20MB.');
 if(/\.txt$/i.test(name))return {name,text:Buffer.from(bytes).toString('utf8').slice(0,45000)};
 if(!/\.pdf$/i.test(name)||Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw Error('כרגע אני יכול לקרוא PDF עם טקסט או קובץ TXT. אפשר לשלוח באחד הפורמטים האלה?');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});
 let pdf;
 try {
  pdf=await loading.promise;
  if(pdf.numPages>40)throw Error('יש בקובץ יותר מ־40 עמודים. אפשר לשלוח את העמודים של המשימה בלבד?');
  let text='';
  for(let n=1;n<=pdf.numPages;n++) {
   const page=await pdf.getPage(n),content=await page.getTextContent();
   text+='\nעמוד '+n+'\n'+textFromItems(content.items);page.cleanup();
   if(text.length>45000)throw Error('הטקסט בקובץ ארוך מדי. אפשר לפצל אותו כדי שלא אפספס שאלות?');
  }
  if(text.replace(/עמוד\s+\d+/g,'').trim().length<20)throw Error('ה־PDF נראה סרוק ואין בו טקסט שאפשר לקרוא. אין לי עדיין OCR; אפשר לשלוח גרסה עם טקסט או להעתיק לכאן את השאלות?');
  return {name,text};
 }finally{await loading.destroy();}
}
function answerHTML(text) {
 return '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>@page{margin:20mm}body{font-family:Arial,sans-serif;font-size:13pt;line-height:1.7;color:#17231e}h1{font-size:20pt}article{white-space:pre-wrap;overflow-wrap:anywhere;unicode-bidi:plaintext}</style><h1>North — תשובות וטיוטה</h1><article>'+escapeHTML(text)+'</article></html>';
}
async function renderAnswerPDF(BrowserWindow,text) {
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(answerHTML(text)));return await window.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});}
 finally{window.destroy();}
}
module.exports={readDocument,renderAnswerPDF,answerHTML,textFromItems};
