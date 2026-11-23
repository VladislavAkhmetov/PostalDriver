// Isolated browser verification of the standalone cabin-part preview.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const out = 'reports/cabin-game';
mkdirSync(out,{recursive:true});
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-port=9437',`--user-data-dir=${mkdtempSync(tmpdir()+'/speedometer-')}`,
  '--window-size=1400,1100','--hide-scrollbars','about:blank'
],{stdio:'ignore',windowsHide:true});
const pause = ms => new Promise(r=>setTimeout(r,ms));
let ws; const pending = new Map(); let id=0; const errors=[];
try {
  let pages;
  for(let i=0;i<60;i++){try{pages=await(await fetch('http://127.0.0.1:9437/json')).json();if(pages.length)break;}catch{} await pause(250);}
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);} if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result?.result?.value;
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4317/speedometer-preview.html'});
  let status='';
  for(let i=0;i<100;i++){status=await evaluate("document.querySelector('#status')?.textContent");if(status?.includes('треугольников'))break;await pause(200);}
  if(!status?.includes('треугольников'))throw new Error('Model failed to load: '+status);
  await pause(500);
  let shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/threejs-preview.png',Buffer.from(shot.result.data,'base64'));
  const values=[]; const poses=[];
  for(const speed of [0,60,120]){
    await evaluate(`(()=>{const s=document.querySelector('#speed');s.value=${speed};s.dispatchEvent(new Event('input'));document.querySelector('#front').click();})()`);
    await pause(900); values.push(await evaluate("document.querySelector('#value').value"));
    poses.push(await evaluate("JSON.parse(document.querySelector('#status').dataset.metrics)"));
    shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+`/threejs-${speed}.png`,Buffer.from(shot.result.data,'base64'));
  }
  await evaluate("document.querySelector('#retro').click();document.querySelector('#sweep').click()");
  await pause(1500);
  const sweep=await evaluate("({value:document.querySelector('#value').value,active:document.querySelector('#sweep').getAttribute('aria-pressed'),retro:document.querySelector('#retro').getAttribute('aria-pressed')})");
  await evaluate("document.querySelector('#sweep').click();document.querySelector('#distance').click()");
  await pause(500);
  shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/game-distance.png',Buffer.from(shot.result.data,'base64'));
  await evaluate("document.querySelector('#cinematic').click()");
  let cinematic;
  for(let i=0;i<100;i++){cinematic=await evaluate("JSON.parse(document.querySelector('#status').dataset.metrics||'{}')");if(cinematic.variant==='cinematic')break;await pause(100);}
  shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/cinematic-distance.png',Buffer.from(shot.result.data,'base64'));
  await evaluate("document.querySelector('#game').click()"); await pause(300);
  const restored=await evaluate("JSON.parse(document.querySelector('#status').dataset.metrics)");
  const report={status,values,poses,sweep,cinematic,restored,errors};writeFileSync(out+'/browser-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(errors.length||values.join()!=='0 км/ч,60 км/ч,120 км/ч'||sweep.active!=='true'||sweep.value==='120 км/ч'||poses.some((p,i)=>p.triangles!==279||p.calls!==2||Math.abs(p.needleAngle-(135-270*[0,60,120][i]/120)*Math.PI/180)>.03)||cinematic.triangles!==3864||restored.variant!=='game'||restored.calls!==2)process.exitCode=1;
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();}
