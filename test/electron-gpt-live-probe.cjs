'use strict';
// Read-only probe. Never sends a prompt, uploads files or bypasses sign-in.
const {_electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const out=path.resolve('test-results/electron/live-gpt');fs.mkdirSync(out,{recursive:true});
(async()=>{let app;const result={submitted:false,uploaded:false};try{
 app=await _electron.launch({args:[path.join(__dirname,'electron-bootstrap.cjs')],env:{...process.env,NORTH_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'north-live-gpt-')),NORTH_TEST_GPT:'',NORTH_TEST_TELEGRAM:'',NORTH_TELEGRAM_BOT_TOKEN:''}});
 const page=await app.firstWindow();await page.waitForSelector('.tab');
 const id=await page.evaluate(()=>window.north.gpt.create('Read-only website probe'));
 try{await page.evaluate(id=>window.north.gpt.open(id),id);result.ready=true;}catch(e){result.ready=false;result.readinessError=e.message;}
 result.website=await app.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://chatgpt.com/'));if(!wc)return null;const {inspectPage}=require('./src/gpt-web');return{title:wc.getTitle(),...await wc.executeJavaScript('('+inspectPage.toString()+')()')};});
 await page.screenshot({path:path.join(out,'website.png')});
}catch(e){result.error=e.message;process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(app)await app.close();}})();
