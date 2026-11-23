import assert from 'node:assert/strict';
import {build} from 'esbuild';
process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(l=>!l.includes('data:')).slice(1,6).join('\n'));process.exit(1);});
const result=await build({stdin:{contents:`export * from './src/game/AliaStory'; export * from './src/game/AliaRide';
  export * from './src/game/Profile'; export * from './src/game/Career'; export * from './src/game/Summer';
  export {Ground} from './src/world/Ground'; export * as THREE from 'three';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'assets',setup(b){
    b.onResolve({filter:/\?(url|raw)$/},a=>({path:a.path,namespace:'asset'}));
    b.onLoad({filter:/.*/,namespace:'asset'},()=>({contents:'export default ""',loader:'js'}));
  }}]});
const a=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const dates=['12·05·98','14·05·98','26·05·98','04·06·98','08·06·98','16·06·98','23·06·98','29·06·98'];
const days=Object.keys(a.ALIA_SHIFTS).map(Number);assert.equal(days.length,8);
assert.deepEqual(days.map(d=>a.calendar(d).short),dates);
for(const d of [1,8,12,19,20,100])assert.equal(a.aliaShift(d),null);
let friendly=a.readAlia(),flirty=a.readAlia();
for(const day of days){
  const shift=a.ALIA_SHIFTS[day];
  const scene=a.aliaScene(friendly,shift);
  friendly=a.completeAlia(friendly,day,shift,scene.answers.length-1);
  flirty=a.completeAlia(flirty,day,shift,0);
  assert.deepEqual(a.completeAlia(flirty,day,shift,0),flirty,'repeat day must not count');
}
assert.equal(friendly.rides,8);assert.equal(friendly.letters,'friendly');assert.equal(friendly.interest,0);
assert.equal(flirty.letters,'personal');assert(flirty.interest>=2);
assert(a.aliaMemory(flirty).includes('Обещала написать Тимуру'));
assert(a.aliaMemory(friendly).includes('подружиться'));assert.equal(a.aliaMemory(),null);
let skipped=a.readAlia();for(const d of days.slice(3))skipped=a.completeAlia(skipped,d,a.ALIA_SHIFTS[d],0);
assert.equal(skipped.rides,5);assert.equal(skipped.letters,'personal','missed early days must not close the story');
assert.deepEqual(a.completeAlia(skipped,19,'morning',0),skipped);
let boundary=a.readAlia();for(const d of days.slice(0,4))boundary=a.completeAlia(boundary,d,a.ALIA_SHIFTS[d],0);
boundary=a.completeAlia(boundary,days[4],a.ALIA_SHIFTS[days[4]],1);
assert.equal(boundary.letters,'friendly');assert(!a.aliaMemory(boundary).includes('Обещала написать Тимуру'));
const invalid=a.readAlia({rides:NaN,interest:Infinity,lastDay:-1,letters:'bad'});assert.deepEqual(invalid,a.readAlia());
const legacy={...a.freshProfile(),day:14,runs:13};
globalThis.localStorage={getItem:()=>JSON.stringify(legacy)};assert.deepEqual(a.loadProfile().alia,a.readAlia());
legacy.alia=flirty;legacy.returnEvening=13;assert.equal(a.loadProfile().returnEvening,13);assert.deepEqual(a.loadProfile().alia,flirty);
legacy.returnEvening=9;assert.equal(a.loadProfile().returnEvening,undefined);

// Drive the actual encounter to/from its actual road points, without GPU or skinned assets.
const ground=new a.Ground(),T=a.THREE;
function setup(day,shift,state) {
  const world={group:new T.Group(),people:[],villageHomes:[{id:'alia',s:ground.homeRoad.length-215,side:1}],postDoor:new T.Vector3(0,0,0)};
  const poses=a.aliaPlaces(world,ground),post=ground.main.frame(15);world.postDoor.set(post.x,ground.height(post.x,post.z),post.z);
  let prompt=null,saved=null,seat=false;
  const h={choice:(who,line,options,pick)=>{prompt={line,options,pick};},closeChoice:()=>prompt=null,choiceOpen:()=>!!prompt,
    say:()=>{},hint:()=>{},clearHint:()=>{},seat:on=>seat=on,complete:s=>saved=s};
  const r=new a.AliaRide(world,ground,day,shift,state,h,()=>({group:new T.Group(),wave:0}));
  const from=shift==='morning'?poses.home:poses.town,to=shift==='morning'?world.postDoor:poses.home;
  const van={x:from.x,z:from.z,speedKmh:0,handbrake:true};
  const pick=i=>{const p=prompt;assert(p,'missing choice');prompt=null;p.pick(i);};
  return {r,world,van,from,to,pick,get prompt(){return prompt;},get saved(){return saved;},get seat(){return seat;}};
}
for(const [day,shift] of [[3,'morning'],[4,'evening']]) {
  const t=setup(day,shift);t.r.update(1,t.van);assert(t.prompt);t.pick(0);assert(t.seat);assert(t.r.riding);
  t.van.x=t.to.x;t.van.z=t.to.z;t.r.update(1,t.van);assert(t.prompt);assert.equal(t.saved,null);
  t.pick(0);assert.equal(t.saved.rides,1);assert.equal(t.saved.lastDay,day);assert(!t.seat);assert(t.r.busy);
  t.r.update(7,t.van);assert(!t.r.busy);assert(!t.r.riding);t.r.dispose();assert.equal(t.world.people.length,0);
  const repeat=setup(day,shift,t.saved);assert(!repeat.r.active);assert.equal(repeat.world.people.length,0);
}
const declined=setup(3,'morning');declined.r.update(1,declined.van);declined.pick(1);assert.equal(declined.saved,null);assert(!declined.r.active);
const expired=setup(4,'evening');expired.van.x+=100;expired.r.update(241,expired.van);assert(!expired.r.active);assert.equal(expired.saved,null);
const cancelled=setup(3,'morning');cancelled.r.update(1,cancelled.van);cancelled.pick(0);cancelled.r.dispose();assert.equal(cancelled.saved,null);assert(!cancelled.seat);
const droveAway=setup(3,'morning');droveAway.r.update(1,droveAway.van);droveAway.van.x+=50;droveAway.r.update(1,droveAway.van);assert(!droveAway.prompt);assert.equal(droveAway.saved,null);
console.log('PASS: eight dated shifts, friendship/flirt/boundary, missed meetings, no farming, legacy/pending saves, pickup/dropoff both directions, refusal/expiry/disposal.');
