import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = 'reports/window-winder';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4317', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--remote-debugging-port=9451',
  `--user-data-dir=${mkdtempSync(tmpdir() + '/window-winder-')}`,
  '--window-size=1400,1000', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserLog = '';
browser.stderr.on('data', data => { browserLog += data; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch('http://127.0.0.1:9451/json')).json(); if (pages.length) break; } catch {}
    await pause(250);
  }
  assert(pages?.length, `Browser starts: ${browserLog}`);
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', e => {
    const message = JSON.parse(e.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise(resolve => {
    const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
    return response.result?.result?.value;
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}.png`, Buffer.from(result.result.data, 'base64'));
  };
  const until = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(250); }
    const samples = await evaluate('window.__windowSamples');
    writeFileSync(`${out}/samples.json`, JSON.stringify(samples, null, 2));
    console.log(JSON.stringify({first:samples?.slice(0,3),last:samples?.slice(-3),max:Math.max(...(samples||[]).map(s=>s.opening)),errors}));
    throw new Error(`Timed out: ${expression}`);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4317/' });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    ready = await evaluate('!!window.__uaz'); if (ready) break; await pause(400);
  }
  assert(ready, 'Game boots');
  console.log('Game ready');
  await evaluate('window.__uaz.ui.onStartSandbox()');
  await until("window.__uaz.vehicle.engine === 'running' && !window.__uaz.cabin.hands.busy('L')");
  await pause(500);
  const soundState = () => evaluate(`(() => {const a=window.__uaz.audio;return {cutoff:a.cabin.frequency.value,level:a.exteriorLevel.gain.value,engine:a.engineGain.gain.value,master:a.master.gain.value,villageFiltered:a.villageAmbience.dest===a.world};})()`);
  const closedSound = await soundState();
  // Sample the actual rendered animation, including its camera and hand contact.
  await evaluate(`(() => {
    const u = window.__uaz;
    u.vehicle.handbrake = true;
    u.atmo.setDayWeather('Ясно');
    u.input.lookYaw = 0; u.input.lookPitch = 0;
    window.__windowSamples = [];
    const update = u.cabin.update.bind(u.cabin);
    u.cabin.update = (...args) => {
      update(...args);
      const w = u.cabin.windowWinder, hands = u.cabin.hands;
      const h = hands.human, palm = h.at('PalmL');
      const wrist = hands.toCabin(palm, palm.clone());
      const target = hands.taskOf('L')?.target();
      const rig = hands.rigL;
      const fingers = new wrist.constructor(0, 1, 0).applyQuaternion(rig.group.quaternion);
      const contact = palm.clone().addScaledVector(fingers, hands.left.extent / hands.scale);
      const contactCabin = hands.toCabin(contact, contact.clone());
      window.__windowSamples.push({ dt: args[0], time: w.time, opening: w.opening,
        angle: w.crank.rotation.x, lean: w.lean, hand: hands.taskOf('L')?.tag,
        target: target?.toArray(), wrist: wrist.toArray(), contact: contactCabin.toArray(),
        eye: u.camera.parent.position.toArray(), pitch: u.camera.parent.rotation.x,
        minY: Math.min(...Array.from(w.glass.geometry.attributes.position.array).filter((_, i) => i % 3 === 1)),
      });
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', key: 'o', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyO', key: 'o', bubbles: true }));
  })()`);
  console.log('Animation started');
  await until('window.__uaz.cabin.windowWinder.opening > .35'); await shot('01-winding-down');
  await until('window.__uaz.cabin.windowOpening === 1 && window.__uaz.cabin.windowLean < .001');
  await shot('02-window-open');
  await pause(700);
  assert(await evaluate("window.__uaz.cabin.windowOpening === 1 && !window.__uaz.cabin.hands.busy('L') && window.__uaz.input.enabled && !window.__uaz.ui.paused"), 'Open window persists; driver is free to continue');
  const openSound = await soundState();
  await evaluate("window.__uaz.input.onAction('window')");
  await until('window.__uaz.cabin.windowOpening < .65'); await shot('03-winding-up');
  await until('window.__uaz.cabin.windowWinder.opening === 0 && window.__uaz.cabin.windowLean < .001'); await shot('04-returned');
  await pause(500);
  const closedAgainSound = await soundState();
  assert(openSound.cutoff > closedSound.cutoff + 3000 && openSound.level > closedSound.level + .15, 'Open window lets exterior sound through');
  assert(closedAgainSound.cutoff < 3300 && closedAgainSound.level < .82, 'Closing restores exterior muffling');
  assert(Math.abs(openSound.engine-closedAgainSound.engine)<.01 && openSound.master===closedAgainSound.master, 'Cabin audio volume stays unchanged');
  assert(openSound.villageFiltered, 'Village sounds use the exterior filter while driving');
  const samples = await evaluate('window.__windowSamples');
  writeFileSync(`${out}/samples.json`, JSON.stringify(samples, null, 2));
  const active = samples.filter(s => s.hand === 'driver-window' && s.time >= 0);
  assert(active.length > 10, 'Hand takes the crank');
  assert(Math.max(...samples.map(s => s.opening)) > .999, 'Window fully lowers');
  assert(samples.at(-1).opening === 0 && samples.at(-1).lean < .001, 'Window closes and driver returns');
  assert(samples.every(s => s.minY >= .5969), 'Glass stays above the door seal');
  const peak = samples.findIndex(s => s.opening === Math.max(...samples.map(s => s.opening)));
  assert(samples.slice(0, peak).every((s, i, a) => !i || s.opening >= a[i - 1].opening), 'Continuous lowering');
  assert(samples.slice(peak).every((s, i, a) => !i || s.opening <= a[i - 1].opening), 'Continuous raising');
  const duration = samples.filter(s => s.lean > .01).reduce((n, s) => n + s.dt, 0);
  assert(duration < 5.5 && duration > 3.8, 'Each independent movement is a little slower');
  const contactError = Math.max(...active.map(s => Math.hypot(...s.target.map((v, i) => v - s.contact[i]))));
  assert(contactError < .035, 'Hand stays on the crank');
  // Repeated key presses must not restart the cycle; ignition may interrupt it.
  const interruptions = await evaluate(`(() => {
    const u = window.__uaz, w = u.cabin.windowWinder, h = u.cabin.hands;
    u.ui.paused = true;
    u.cabin.windWindow();
    for (let i = 0; i < 55; i++) u.cabin.update(1/60, u.vehicle, 0, 0);
    const before = w.time;
    u.cabin.windWindow();
    const repeatIgnored = before === w.time;
    u.cabin.reach('start');
    u.cabin.update(1/60, u.vehicle, 0, 0);
    const stopped = w.time < 0, angle = w.crank.rotation.x;
    for (let i = 0; i < 180; i++) u.cabin.update(1/60, u.vehicle, 0, 0);
    const noGhostRotation = angle === w.crank.rotation.x;
    u.cabin.windWindow();
    for (let i = 0; i < 240; i++) u.cabin.update(1/60, u.vehicle, 0, 0);
    const recovered = w.opening === 1 && !h.busy('L');
    u.cabin.windWindow();
    for (let i = 0; i < 240; i++) u.cabin.update(1/60, u.vehicle, 0, 0);
    return { repeatIgnored, stopped, noGhostRotation, recovered, closesAgain:w.opening===0 };
  })()`);
  assert(Object.values(interruptions).every(Boolean), 'Repeat, interruption and recovery work');
  const smoke = await evaluate(`(() => {
    const u=window.__uaz, c=u.cabin, s=c.smoker;
    c.smoke();
    for(let i=0;i<600&&s.state!=='smoking';i++) c.update(.05,u.vehicle,0,0);
    const lit=s.state==='smoking';
    s.smoke.density=0;
    for(let i=0;i<200;i++)c.update(.05,u.vehicle,0,0);
    const afterTen=s.smoke.density;
    for(let i=0;i<200;i++)c.update(.05,u.vehicle,0,0);
    const afterTwenty=s.smoke.density;
    const hazeVisible=s.smoke.haze.filter(q=>q.s.visible).length;
    window.__smokeInitial=afterTwenty;
    return {lit,afterTen,afterTwenty,hazeVisible,closedDraft:s.smoke.draft.x,windowOpening:s.windowOpening};
  })()`);
  assert(smoke.lit && smoke.afterTwenty > smoke.afterTen && smoke.afterTwenty > .25 && smoke.hazeVisible > 0 && smoke.closedDraft === 0 && smoke.windowOpening===0, 'A real lit cigarette accumulates smoke behind closed glass');
  await shot('05-closed-window-smoke');
  const ventilation = await evaluate(`(() => {
    const u=window.__uaz,c=u.cabin,s=c.smoker,smoke=s.smoke;
    c.windWindow();for(let i=0;i<80;i++)c.update(.05,u.vehicle,0,0);
    for(let i=0;i<200;i++)c.update(.05,u.vehicle,0,0);
    const cleared=smoke.density;
    const atRest=()=>{smoke.density=window.__smokeInitial;smoke.speed=0;for(let i=0;i<60;i++)smoke.update(.05,0);return smoke.density;};
    const stationary=atRest();
    smoke.density=window.__smokeInitial;smoke.speed=60;for(let i=0;i<60;i++)smoke.update(.05,0);
    const moving=smoke.density;
    c.stubOut();for(let i=0;i<200;i++)c.update(.05,u.vehicle,0,0);
    const afterStub=smoke.density;
    return {cleared,stationary,moving,afterStub,state:s.state,openDraft:smoke.draft.x,windowOpening:s.windowOpening};
  })()`);
  assert(ventilation.cleared < smoke.afterTwenty*.25 && ventilation.moving < ventilation.stationary*.25 && ventilation.windowOpening===1 && ventilation.openDraft<0 && ventilation.state==='idle' && ventilation.afterStub<.01, 'Open window clears smoke, faster on the move, and no new smoke accumulates after stubbing');
  await shot('06-open-window-cleared');
  assert.equal(errors.length, 0, 'No browser exceptions');
  const report = { duration, contactError, frames: active.length, maxOpening: Math.max(...samples.map(s => s.opening)), interruptions, closedSound, openSound, closedAgainSound, smoke, ventilation, errors, samples };
  writeFileSync(`${out}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ duration, contactError, frames: active.length, interruptions, closedSound, openSound, closedAgainSound, smoke, ventilation, errors }));
  await Promise.race([send('Browser.close'), pause(1000)]);
} finally { ws?.close(); browser.kill(); server.kill(); }
