'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');

test('North has the original browser chrome sections',()=>{
 const html=src('index.html');
 for(const id of ['brand','tabs','address-form','rail','bookmarkbar','homePage','shortcuts','browserMenu','studyMenu','menuScrim']){
  assert.match(html,new RegExp('id="'+id+'"'),id+' missing');
 }
 assert.match(html,/#i-compass/);
 assert.match(html,/Study Assistant/);
 assert.match(html,/classroom\.google\.com/);
 assert.match(html,/chatgpt\.com/);
 assert.match(html,/students\.myofek\.cet\.ac\.il/);
});
test('Google is search engine and North is the home page',()=>{
 const main=src('main.js');
 assert.match(main,/north:\/\/newtab/);
 assert.match(main,/www\.google\.com\/search\?q=/);
 assert.match(main,/persist:north-main/);
});
test('Electron views respect the left sidebar and bookmark bar',()=>{
 const main=src('main.js');
 assert.match(main,/const x=68,y=141/);
 assert.match(main,/north:overlay/);
 assert.match(main,/resizeViews\(\)/);
});
test('Browser menu can open Study Assistant and restores menu content',()=>{
 const renderer=src('renderer.js');
 assert.match(renderer,/originalBrowserMenu/);
 assert.match(renderer,/function restoreMenu/);
 assert.match(renderer,/function studyPanel/);
 assert.match(renderer,/window\.addEventListener\('resize'/);
});
test('The exposed bot token is not embedded in the project',()=>{
 const srcs=['main.js','preload.js','renderer.js','index.html','study-panel.html','telegram-bot.js'].map(src).join('\n');
 assert.doesNotMatch(srcs,/8846650038:/);
 assert.match(src('main.js'),/persist:north-main/);
});
