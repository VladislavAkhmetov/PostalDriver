import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/game/Career'; export * from './src/game/Profile';
    export * from './src/game/Summer'; export * from './src/game/Fuel';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const p = api.freshProfile();
p.damage = .8; p.wear = {steer:.5, rad:.6, pull:-1}; p.money = 0;
assert.equal(api.repair(p, 'grandpa'), 1);
assert.equal(p.damage, 0); assert.equal(p.wear.rad, 0); assert.equal(p.money, 0);
p.damage = .5; assert.equal(api.repair(p, 'kolka'), 1); assert.equal(p.damage, 0);
const reports = [], views = [];
const pump = new api.FuelStop({view:v=>views.push(v), pump:()=>{}, done:(...args)=>reports.push(args)});
const van = {vx:0,vy:0,fuel:0}; p.talons=0;
for(let i=0;i<30;i++) pump.update(1,van,true,p);
assert.equal(van.fuel,1); assert.equal(p.money,0); assert.equal(reports.length,1);
assert.equal(reports[0][1],0); assert.equal(reports[0][2],'full');
assert(!views.some(v=>v?.note.includes('Денег')));
const rec = api.reckon([], 40000, 0, 0, 20, [['Помог соседу',10000,2],['Встреча на дороге',-30000,0]]);
assert.equal(rec.total,0); assert.equal(rec.lines.length,0);
assert(rec.journal.some(([l])=>l==='Помог соседу'));
assert(!JSON.stringify(rec.journal).includes('доверие +'));
const book=api.newPayBook(); const pay=[];
for(let d=1;d<=18;d++){const r=api.paydays(book,d);assert.equal(r.lines.length,0);pay.push(...r.notes);}
assert(pay.some(([,text])=>text.includes('ведомости')));
assert.equal(api.calendar(19).short,'30·06·98');
function finale(profile){
  const pages=[]; let driving=false, ended=false, next;
  const h={page:(ch,text,opts)=>{pages.push(text);next=opts?.pick;},done:()=>ended=true};
  api.playFinaleEvening(profile,h,()=>driving=true); next(); assert(driving);
  api.playDeparture(profile,h);
  for(let i=0;i<10&&!ended;i++){assert(next);next();}
  assert(ended); assert(profile.seasonFinale); return pages.join('\n');
}
const poor=finale({...api.freshProfile(),money:0,trust:0});
const rich=finale({...api.freshProfile(),money:99999999,trust:100});
assert.equal(poor,rich); assert(!/копил|экзамен|не хватило/i.test(poor));
const helped=finale({...api.freshProfile(), cases:{birth:'done'}, muha:{ending:'quit'}});
const missed=finale({...api.freshProfile(), cases:{birth:'refused'}, muha:{ending:'north'}});
assert(helped.includes('помогает грузить')); assert(missed.includes('Сургут')); assert.notEqual(helped,missed);
assert(!poor.includes('осталось в шкафу'));
const legacy={...api.freshProfile(),day:15,runs:14,money:50000,exams:'next',examYear:1999,cases:{birth:'done'}};
globalThis.localStorage={getItem:()=>JSON.stringify(legacy)};
const loaded=api.loadProfile(); assert.equal(loaded.day,15); assert.equal(loaded.cases.birth,'done');
assert(api.seasonFinaleDue({...loaded,seasonFinale:false},19));
assert(!api.seasonFinaleDue({...loaded,seasonFinale:true},19));
console.log('PASS: repair/fuel without money, journal, salary, calendar, both finale paths, legacy saves.');
