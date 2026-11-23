import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

process.on('uncaughtException', e => { console.error(e.message); console.error(e.stack?.split('\n').filter(l => !l.includes('data:')).slice(1, 5).join('\n')); process.exit(1); });
const compiled = await build({
  stdin: { contents: `export * from './src/game/Mission'; export * from './src/game/Career';
    export * from './src/game/MorningLines'; export * from './src/game/Cases';
    export * from './src/game/RoadStop'; export * from './src/game/MuhaStory';
    export {folkGate,neighbourMotorcycle,neighbourCot} from './src/world/Urmanly';
    export * as THREE from 'three';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'test-inputs', setup(b) {
    b.onResolve({ filter: /\?(url|raw)$/ }, a => ({ path: a.path, namespace: 'asset' }));
    b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""', loader: 'js' }));
    b.onLoad({ filter: /[\\/]Cases\.ts$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8') + '\nexport { CASES as testCases };', loader: 'ts' }));
  } }],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const { Mission, RoadStop, Cases, MuhaStory, THREE: T } = api;
const order = { id:'9-test', dest:'sosnovka', due:100, title:'Письма', kind:'letters', fragile:false, pay:0 };
const stop = () => ({id:'sosnovka',name:'Сосновка',s:0,pos:{x:0,z:0},person:{wave:0},line:'Почта!',speaker:'Нина'});
const ground = {nearestRoad:()=>null,main:{nearestS:()=>0},marks:{},branchSpurs:[]};
const events = {hint(){},clearHint(){},ritual(){},delivered(){},dialogue(){},finished(){},notice(){}};
const mission = () => new Mission({stops:[stop()]},ground,events,[{...order}]);
const m = mission(); m.grantHeadStart(90); m.grantHeadStart(90);
assert.equal(m.time,0); assert.equal(m.dueLeft,190);
m.addTime(150); assert.equal(m.time,150); assert.equal(m.dueLeft,40);
const checkpoint = JSON.parse(JSON.stringify(m.snapshot()));
const resumed = mission(); resumed.grantHeadStart(90); resumed.restore(checkpoint); resumed.grantHeadStart(90);
assert.equal(resumed.time,150); assert.equal(resumed.dueLeft,40);
for (const time of [-86,60]) {
  const legacy = {...checkpoint,time}; delete legacy.deadlineBonus;
  const r = mission(); r.grantHeadStart(90); r.restore(legacy);
  assert.equal(r.time,time+90); assert.equal(r.dueLeft,100-time);
  const again = mission(); again.grantHeadStart(90); again.restore(r.snapshot());
  assert.equal(again.time,r.time); assert.equal(again.dueLeft,r.dueLeft);
}
const ordinary = mission(); const old = {...ordinary.snapshot(),time:12}; delete old.deadlineBonus;
ordinary.restore(old); assert.equal(ordinary.time,12); assert.equal(ordinary.dueLeft,88);
// Actual hand-over and evening stats must use separate elapsed/schedule clocks.
for (const elapsed of [150,210]) {
  const run = mission(); run.grantHeadStart(90); run.addTime(elapsed);
  const v = {engine:'off',x:0,z:0,speedKmh:0,handbrake:true,damage:0,odometer:20};
  const ctx = {lights:true,wipers:false,rain:0,dark:0};
  run.update(0,v,false,ctx); run.update(0,v,true,ctx); run.update(0,v,false,ctx); run.update(0,v,true,ctx);
  assert.equal(run.delivered,1); assert.equal(run.snapshot().deliveries[0].late,Math.max(0,elapsed-190));
  assert.equal(run.stats(20).time,elapsed);
}
const june = api.boardFor(9,50);
assert.equal(api.calendar(9).short,'04·06·98'); assert(api.morningAway(9,june).includes('Воду'));
assert(api.morningAway(4,{season:'spring',forecast:'Черёмуховые холода'}).includes('Черёмуховые'));
assert(api.morningAway(9,{season:'summer',forecast:'По радио: гроза'}).includes('Дождевик'));
assert(!api.morningAway(9,{season:'summer',forecast:'тихое утро'}).includes('холода'));

function hooks() {
  const h = { lines:[], options:[], pick:null, radio:false, say:(_,s)=>h.lines.push(s), toast:s=>h.lines.push(s),
    choice:(_,s,opts,pick)=>{h.lines.push(s);h.options=opts;h.pick=pick;}, takeRadio:()=>h.radio=true };
  return h;
}
// Call the real roadside dialogue with its real mission bookkeeping, no scene meshes.
const timers = globalThis.setTimeout; globalThis.setTimeout = f => { f(); return 0; };
for (const [fuel,choice,remaining,outcome] of [[.5,0,.5-5/60,'gave'],[.5,1,.5-2/60,'haggled'],[.5,2,.5,'robbed'],[.08,0,.08-2/60,'haggled'],[.02,0,.02,'refused']]) {
  const h=hooks(),run=mission(),r=Object.create(RoadStop.prototype),v={fuel};
  Object.assign(r,{hooks:h,mission:run,kind:'fuel',s:{done:false},men:[],day:9});
  r.talk(v); h.pick(choice);
  assert(Math.abs(v.fuel-remaining)<1e-9); assert.equal(r.saved.outcome,outcome); assert(r.saved.done);
  assert.equal(h.radio,outcome==='robbed'); assert.equal(run.time,['gave','haggled'].includes(outcome)?120:0);
  assert(run.extras.every(([,money])=>money===0));
  if(fuel===.08)assert(!h.options.some(s=>s.includes('5 литров')));
}
for (const choice of [1,2]) {
  const h=hooks(),run=mission(),muha=Object.create(MuhaStory.prototype);
  Object.assign(muha,{hooks:h,mission:run,police:{},s:{step:'ask',day:1,bond:0},day:2});
  muha.ask(); h.pick(choice);
  assert.equal(run.orders.some(o=>o.id==='muha-box'),choice===1);
  assert(!h.lines.join(' ').match(/тысяч|держи сверху|Пятьдесят/));
  if(choice===1){assert.equal(muha.s.step,'after');assert.equal(run.orders.at(-1).pay,0);}
  else assert.equal(muha.s.outcome,'refused');
}
globalThis.setTimeout=timers;
const wedding=api.testCases.find(c=>c.id==='wedding');
for (let choice=0;choice<wedding.options.length;choice++) {
  const h=hooks(),run=mission(),cs=Object.create(Cases.prototype); let removed=false;
  Object.assign(cs,{hooks:h,mission:run,world:{stops:[]},ground,saved:{}});
  const live={c:wedding,state:'wait',crowd:[],ribbon:{removeFromParent:()=>removed=true}};
  cs.ask(live);h.pick(choice);assert(removed);assert.equal(live.state,'done');
  assert.equal(cs.saved.wedding,choice===wedding.decline?'declined':'done');
  assert.equal(run.time,choice===wedding.decline?0:120);
}
assert(!api.weekBefore(12,{wedding:'declined'}).includes('порванную'));
assert(api.weekBefore(12,{wedding:'refused'}).includes('порванную'));
assert(api.morningCase(8).options[1].startsWith('Не повезу'));
for (const id of ['mityai-perfume','mityai-river']) {
  const c=api.testCases.find(c=>c.id===id);assert(c,id);assert(!/по пути|сторону/.test(c.no));
}
// The two open gates must expose the prop from cab height; closed gates must occlude it.
const mats={gate:'flat',base:'#777',trim:'#ddd'};
const bucket = group => ({add:(_,geo,matrix)=>{const mesh=new T.Mesh(geo.clone(),new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.applyMatrix4(matrix);group.add(mesh);}});
for (const makeProp of [api.neighbourMotorcycle,api.neighbourCot]) {
  for (const open of [false,true]) {
    const gate=new T.Group(),prop=new T.Group();
    api.folkGate(bucket(gate),{x:0,y:0,z:0,rot:0},mats,[],open);
    makeProp(bucket(prop),{x:0,y:0,z:-2.8,rot:0},[]);
    gate.updateMatrixWorld(true);prop.updateMatrixWorld(true);
    for(const x of [-1,0,1]) {
      const start=new T.Vector3(x,1.7,8);
      const target=makeProp===api.neighbourCot?new T.Vector3(.11,.96,-2.43):new T.Vector3(.15,.98,-2.8);
      const ray=new T.Raycaster(start,target.sub(start).normalize());
      const g=ray.intersectObject(gate,true)[0],p=ray.intersectObject(prop,true)[0];
      assert(p,`${makeProp.name}: prop silhouette missed at x=${x}`);assert.equal(!g||p.distance<g.distance,open);
    }
  }
}
console.log('PASS: elapsed/deadline clocks, old/new checkpoints, delivery lateness, weather lines, petrol choices, Muha box, wedding refusal, cab-height gate visibility.');
