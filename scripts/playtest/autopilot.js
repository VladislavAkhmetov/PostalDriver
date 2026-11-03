// Autopilot (docs/playtest.md): plays the real game day by day — the morning, the board with its
// requests, out of town past the GAI post, every scene of the day (Muha, the cases, riders and
// favours on the road, «тормозят на дороге», the sawmill), the deliveries with the stop ritual, the
// evening's journal, the repair — and on to the next morning. It drives by putting the van where it
// must be (on the road by the target, stopped on the handbrake); only the GAI post is driven through
// on the real physics. Answers by policy. Returns what it saw: the days' evenings and story state,
// every question and answer, every line said (window.__uaz.voice.heard), and the problems.
//
//   window.__P = { policy: 'yes' | 'no' | 'mix', days: 10, fresh: true, seed: 7 }
const u = window.__uaz, P = window.__P || {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const press = async (code, ms = 140) => { down(code); await sleep(ms); up(code); };
const log = (...a) => console.log('FLOW', a.join(' '));
let seed = P.seed ?? 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = { days: [], problems: [], choices: [], fades: [], pages: [], lines: 0 };
const problem = (what) => { R.problems.push(`d${u.profile.day}: ${what}`); log('PROBLEM', what); };
// every line said: nothing of the code may show through
const orig = u.ui.onLine;
u.ui.onLine = (who, text, kind) => {
  R.lines++;
  if (/undefined|NaN|\$\{|\{[a-z]+\}|\bnull\b|\[object/.test(text) || /undefined|null/.test(who) || !who) problem(`bad line: ${who}: ${text.slice(0, 120)}`);
  return orig ? orig(who, text, kind) : 0;
};
const vis = (sel) => { const e = document.querySelector(sel); return e && !e.classList.contains('out') ? e : null; };
const txt = (e) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const pick = (n, labels) => {
  // the morning's way to the post: always straight there (the drive itself is the first morning's lesson)
  const fixed = labels.findIndex((t) => /сразу к почте/i.test(t));
  if (fixed >= 0) return fixed;
  if (P.policy === 'no') return n - 1;
  if (P.policy === 'mix') return Math.floor(rnd() * n);
  return 0;
};
/** Answer whatever is on the screen. Returns what it did, or null. */
const service = async () => {
  const bo = vis('.blackout:not(.story)');
  if (bo) {
    const t = txt(bo.querySelector('.bo-card')).slice(0, 160);
    if (R.fades[R.fades.length - 1] !== t) { R.fades.push(t); log('FADE', t.slice(0, 120)); }
    if (bo.querySelector('.bo-skip')) { await sleep(700); await press('Enter'); return 'fade'; }
    await sleep(300);
    return 'fade-wait';
  }
  const ch = vis('.dialogue.choice');
  if (ch) {
    const btns = [...ch.querySelectorAll('.answer')];
    const labels = btns.map((b) => txt(b).replace(/^\d\s*/, ''));
    const who = txt(ch.querySelector('.who')), line = txt(ch.querySelector('p'));
    const i = pick(btns.length, labels);
    R.choices.push(`d${u.profile.day} ${who}: ${line.slice(0, 80)} → ${labels[i]}`);
    log('CHOICE', who, '|', line.slice(0, 90), '→', labels[i]);
    await sleep(250); btns[i]?.click(); await sleep(400);
    return 'choice';
  }
  const st = vis('.blackout.story');
  if (st) {
    const btns = [...st.querySelectorAll('.st-answers button')];
    const title = txt(st.querySelector('.st-title')) || txt(st.querySelector('.st-chapter'));
    R.pages.push(`d${u.profile.day} ${title}: ${txt(st.querySelector('.st-body')).slice(0, 100)}`);
    log('PAGE', title, '|', txt(st.querySelector('.st-body')).slice(0, 90));
    await sleep(500);
    const i = P.policy === 'no' ? btns.length - 1 : P.policy === 'mix' ? Math.floor(rnd() * btns.length) : 0;
    if (btns[i]) btns[i].click(); else await press('Enter');
    await sleep(600);
    return 'page';
  }
  if (u.ui.boardOpen) {
    // the requests: the old letter (first in the list) and one more — or none, as the policy has it
    const reqs = [...document.querySelectorAll('.overlay:not(.out) .end.board button.order')].filter((b) => !b.disabled);
    const take = P.policy === 'no' ? 0 : P.policy === 'mix' ? Math.floor(rnd() * 3) : 2;
    for (const b of reqs.slice(0, take)) { b.click(); await sleep(150); }
    log('BOARD', u.today?.route, '·', u.today?.date, '· requests', reqs.length, 'took', Math.min(take, reqs.length), reqs.slice(0, take).map((b) => txt(b).slice(0, 50)).join(' | '));
    await sleep(400); await press('Enter'); await sleep(1500);
    return 'board';
  }
  const end = document.querySelector('.overlay:not(.out) .end:not(.board)');
  if (end) {
    const btns = [...end.querySelectorAll('button')];
    const fix = btns.find((b) => /гараж/i.test(b.textContent) && !b.disabled);
    if (fix && u.profile.damage > 0.05 && rnd() < 0.7) { fix.click(); await sleep(1200); }
    for (let k = 0; k < 40 && vis('.blackout:not(.story)'); k++) { await service(); await sleep(300); }
    const next = [...end.querySelectorAll('button')].find((b) => /Следующий день/i.test(b.textContent));
    const p = u.profile;
    log('EVENING', txt(end.querySelector('.eyebrow')), '|', txt(end.querySelector('p')).slice(0, 100));
    R.days.push({ day: p.day - 1, evening: txt(end).slice(0, 1200), muha: p.muha, letters: p.letters, cases: p.cases, roadStop: p.roadStop, money: p.money, trust: p.trust, gai: p.gai });
    await sleep(500);
    if (!next) problem('evening without «Следующий день»');
    next?.click(); await sleep(1500);
    return 'evening';
  }
  return null;
};
const v = u.vehicle, g = u.ground;
const dist = (p) => Math.hypot(p.x - v.x, p.z - v.z);
/** The van on the road nearest a point (`back` metres short along it), never more than 16 m off it, stopped on the handbrake. */
const placeAt = async (p, back = 0, exact = false) => {
  let x = p.x, z = p.z, yaw = v.yaw;
  const hit = exact ? null : g.nearestRoad(p.x, p.z, 60);
  if (hit) { const s = hit.sample; x = s.x - s.tx * back; z = s.z - s.tz * back; yaw = Math.atan2(s.tx, s.tz); }
  const off = Math.hypot(x - p.x, z - p.z);
  if (off > 16) { const k = 12 / off; x = p.x + (x - p.x) * k; z = p.z + (z - p.z) * k; }
  v.place(x, z, yaw, g);
  v.handbrake = true;
  if (v.engine !== 'running') { v.engine = 'running'; v.rpm = 900; }
  for (let i = 0; i < 8; i++) { await sleep(150); if (Math.abs(v.speedKmh) < 0.5) break; }
};
/** Wait while something happens, answering the screen. */
const settle = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) { await service(); await sleep(200); } };
const tries = new Map();
const attempt = (key) => { const n = (tries.get(key) ?? 0) + 1; tries.set(key, n); if (n === 6) problem(`stuck on ${key}`); return n <= 6; };

/** Through the GAI post (or the ambush) at 30–38 km/h on the real physics; stop if waved down. */
async function passPost() {
  const main = g.main, sPost = u.police.postS;
  const f0 = main.frame(sPost - 160);
  v.place(f0.x + f0.rx * 1.6, f0.z + f0.rz * 1.6, Math.atan2(f0.tx, f0.tz), g);
  v.handbrake = false;
  if (v.engine !== 'running') { v.engine = 'running'; v.rpm = 900; }
  const t0 = performance.now();
  let stopped = false;
  while (performance.now() - t0 < 90000) {
    const sv = main.nearestS(v.x, v.z);
    const pol = u.police.state;
    if (sv > sPost + 140 && pol !== 'talk' && pol !== 'signal') break;
    const f = main.frame(sv);
    v.yaw = Math.atan2(f.tx, f.tz);
    const lat = (v.x - f.x) * f.rx + (v.z - f.z) * f.rz;
    v.x -= f.rx * (lat - 1.6) * 0.3; v.z -= f.rz * (lat - 1.6) * 0.3;
    if (pol === 'signal' || pol === 'talk') {
      up('KeyW');
      if (!stopped) { log('GAI', pol, u.police.reason ?? ''); stopped = true; }
      if (Math.abs(v.speedKmh) > 1) down('KeyS'); else { up('KeyS'); v.handbrake = true; }
      await service(); await sleep(150);
      continue;
    }
    if (pol === 'chase') problem('GAI chase on the way past the post');
    if (v.handbrake && stopped) v.handbrake = false;
    const kmh = Math.abs(v.speedKmh);
    if (kmh < 30) down('KeyW'); else if (kmh > 38) up('KeyW');
    await service(); await sleep(100);
  }
  up('KeyW'); up('KeyS');
  v.handbrake = true;
  if (stopped) log('GAI done', u.police.state);
}

async function playDay() {
  const day0 = u.profile.day;
  // the evening is often answered inside settle(): the day is over once it has been written down
  const seen = R.days.length;
  log('DAY', day0, u.today?.date);
  tries.clear();
  let posted = false;
  for (let it = 0; it < 900; it++) {
    if (R.days.length > seen) return true;
    const did = await service();
    if (did === 'evening') return true;
    if (did) continue;
    const m = u.mission;
    if (u.morning) {
      // the neighbour's wife to the maternity, then on to the post door
      if (u.birth) { if (attempt('hospital')) { await placeAt(u.world.hospital.pos, 0); await settle(2500); } continue; }
      if (it > 6 && !u.ui.boardOpen) { if (attempt('postdoor')) { await placeAt(u.world.postDoor, 0, true); await settle(2000); } }
      await sleep(300); continue;
    }
    if (!m || !m.stops.length) { await sleep(300); continue; }
    if (v.fuel < 0.3) v.fuel = 0.9;
    const pol = u.police.state;
    if (pol !== 'idle' && pol !== 'cool') { await settle(600); if (attempt('police-' + pol)) continue; }
    const cs = u.cases, enc = u.encounters, st = u.story, rs = u.roadStop;
    // passengers first: where they are going
    const rc = cs?.live.find((l) => l.state === 'riding');
    if (rc) { const to = rc.c.to(cs.ctx()); if (attempt('case-dest-' + rc.c.id)) { await placeAt(to.pos, 0); await settle(2500); } else { problem(`case rider ${rc.c.id} never got out: d=${dist(to.pos).toFixed(1)}`); rc.state = 'done'; } continue; }
    const re = enc?.list.find((e) => e.state === 'riding');
    if (re) { if (attempt('enc-dest')) { await placeAt(re.dest.pos, 0); await settle(2500); } else { problem(`rider ${re.rider.name} never got out at ${re.dest.id}: d=${dist(re.dest.pos).toFixed(1)}`); re.state = 'done'; } continue; }
    if (rs?.state === 'ride' && rs.dest) { if (attempt('kid-dest')) { await placeAt(rs.dest.pos, 0); await settle(2500); } else { problem('the lad never got out'); rs.state = 'parked'; } continue; }
    if (st?.riding) { if (attempt('muha-dest')) { await placeAt(st.riding.pos, 0); await settle(5000); } else { problem(`Muha never got out at ${st.riding.out}: d=${dist(st.riding.pos).toFixed(1)}`); st.riding = null; } continue; }
    // in town: Muha by the shop, or on his bench by the last house (chapter three)
    const muha = u.world.muha;
    if (st && st.pressedToday && !st.pressOut && !st.busy && muha) { if (attempt('muha-pressed')) { await placeAt(muha.group.position, 4); await settle(3000); } continue; }
    if (st && st.due && !st.busy && muha && !u.world.away.has(muha) && st.s.step !== 'pressed') { if (attempt('muha-' + st.s.step)) { await placeAt(muha.group.position, 0); await settle(3500); } continue; }
    // out of town past the GAI post (after the shop, where Muha's box comes aboard)
    if (!posted) { posted = true; await passPost(); continue; }
    if (st && st.sawToday && st.talk < 0 && !st._seen) { if (attempt('sawmill')) { await placeAt(u.world.sawmill.pos, 18); await settle(4500); st._seen = true; } continue; }
    const road = cs?.live.find((l) => l.state === 'wait' && l.person && l.c.kind !== 'favor' && !l.c.from);
    if (road) { if (attempt('case-' + road.c.id)) { await placeAt({ x: road.pos.x - road.side.x * 6, z: road.pos.z - road.side.z * 6 }, 0, true); await settle(2500); } else road.state = 'done'; continue; }
    const e = enc?.list.find((x) => x.state === 'wait' && x.pos && x.kind !== 'flat');
    if (e) { if (attempt('enc-' + e.s)) { await placeAt(e.pos, 0); await settle(2500); } else e.state = 'done'; continue; }
    if (rs && rs.state === 'wait' && rs.model) { if (attempt('roadstop')) { await placeAt(rs.model.group.position, 10); await settle(3000); } else rs.state = 'over'; continue; }
    // the deliveries, with the ritual: stop, handbrake, two honks
    const next = m.stops.find((s) => !s.done);
    if (next) {
      if (!attempt('stop-' + next.id)) { problem(`could not deliver at ${next.id}`); next.done = true; continue; }
      await placeAt(next.pos, 0);
      if (dist(next.pos) > 24) await placeAt(next.pos, 0, true);
      await sleep(500);
      await press('KeyH', 160); await sleep(350); await press('KeyH', 160);
      await settle(1800);
      // a favour of the addressee's once the post is in his hands (the forester, the beekeeper)
      if (next.done && cs?.live.some((l) => l.state === 'wait' && l.c.from === next.id)) {
        // stand at the gate until he asks (game time runs slow on a software renderer)
        for (let k = 0; k < 40 && cs.live.some((l) => l.state === 'wait' && l.c.from === next.id); k++) await settle(500);
        if (cs.live.some((l) => l.state === 'wait' && l.c.from === next.id)) problem(`the addressee's case at ${next.id} never asked`);
      }
      continue;
    }
    // all delivered: the day ends after the mission's nine seconds (cut short here; a rider in the cab still holds it)
    if (m.stops.every((x) => x.done) && !m.hold?.()) m.deliveredT = Math.min(m.deliveredT ?? Infinity, m.time - 9.5);
    await settle(1500);
    if (it % 20 === 0) log('WAIT-END', 'hold', m.hold?.(), 'finished', m.finished, 'time', Math.round(m.time));
  }
  problem('the day did not end');
  return false;
}

if (P.fresh) u.ui.onNewGame(); else u.ui.onStart();
await sleep(1500);
for (let d = 0; d < (P.days ?? 3); d++) if (!(await playDay())) break;
R.heard = [...u.voice.heard.values()];
const p = u.profile;
R.profile = { day: p.day, money: p.money, trust: p.trust, muha: p.muha, letters: p.letters, cases: p.cases, roadStop: p.roadStop, exams: p.exams, gai: p.gai };
return R;
