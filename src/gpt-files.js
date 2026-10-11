'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const types={pdf:'application/pdf',txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',rtf:'application/rtf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
function createGptFiles(root){
 fs.mkdirSync(root,{recursive:true});root=path.resolve(root);
 function location(file){if(!/^[a-f0-9]{32}$/.test(file?.id||''))throw Error('קובץ לא תקין');return path.join(root,file.id,path.basename(file.name));}
 function put(bytes,name){
  bytes=Buffer.from(bytes);if(bytes.length>20*1024*1024)throw Error('אפשר להעביר קבצים עד 20MB דרך North.');
  name=String(name||'document').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(-150);const extension=name.split('.').pop().toLowerCase();
  if(!types[extension])throw Error('שלח PDF, תמונה, מסמך Office או קובץ טקסט. הפורמט הזה אינו נתמך להעברה.');
  const file={id:crypto.randomBytes(16).toString('hex'),name,size:bytes.length,mime:types[extension],sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  fs.mkdirSync(path.dirname(location(file)),{recursive:true});fs.writeFileSync(location(file),bytes,{mode:0o600});return file;
 }
 function read(file){const bytes=fs.readFileSync(location(file));if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('הקובץ השתנה מאז הצגתו. נדרש פרומפט ואישור חדשים.');return bytes;}
 function paths(files){return files.map(file=>{read(file);return location(file);});}
 return {put,read,paths,location};
}
module.exports={createGptFiles};
