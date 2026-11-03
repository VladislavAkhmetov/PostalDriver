// The actors' script for the voices (docs/voice/README.md): every line said in the game, with the id
// its recording must be named by (src/assets/voice/<id>.mp3), who says it, and where it is in the code.
//
//   node scripts/voice-script.mjs        → docs/voice/script.csv, docs/voice/by-speaker.md
//
// Lines are found in the sources with the TypeScript parser: the second argument of say / dialogue /
// choice / page / storyPage / blackout calls, the dialogue fields of the story tables (ask, thanks,
// chatter…), the named lists (the morning words, the radio's notices) and [speaker, line] pairs.
// Lines with a variable part (a place, an amount) are templates: the game says them in several
// forms, each its own recording; docs/voice/heard.json (what a playthrough heard, from
// `__uaz.voice.heard` in the dev build) adds those forms when it is there.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = new URL('..', import.meta.url).pathname;

// ---- the same normalisation and id as src/audio/Voice.ts
const voiceText = (t) => t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^«(.*)»$/, '$1').trim();
function voiceId(text) {
  const s = voiceText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'v' + h.toString(36).padStart(7, '0');
}

const NARRATOR = 'Рассказчик';
const PLAYER = 'Тимур (ответ игрока)';
const RADIO = 'Радио «Заречье», ведущая';
/** Named lists of lines and who says them. */
const LISTS = {
  MORNING: 'Өләсәй', ZINAIDA: 'Зинаида Павловна', GRANDPA: 'Картатай', GRANDPA_PHONE: 'Картатай (по межгороду)',
  NOTICES: RADIO, WINTER_NOTICES: RADIO, SPRING_NOTICES: RADIO, GREETINGS: RADIO, DATED: RADIO,
  GRANDPA_LETTER: 'Картатай', W: NARRATOR, NOTES: 'Записка Мухи под дворником (читается)', AFTER3: 'Слух о Мухе (читается)',
  TALK: 'Картатай', SPEEDING: 'Картатай', RIDE: 'Женька Муха',
  BRIBE_OK: 'Сержант Кузьмин, ГАИ', CALLS: 'Сержант Кузьмин, ГАИ (мегафон)', CALLS_DIRT: 'Сержант Кузьмин, ГАИ (мегафон)', FAULTS: 'Сержант Кузьмин, ГАИ',
  ABOUT: 'door', REMEMBER: 'door',
};
/** Dialogue fields of the story tables. */
const SAID = new Set(['ask', 'refused', 'thanks', 'accepted', 'through', 'line', 'hurry', 'chatter', 'bump', 'answers', 'arrive', 'skipLine']);
const NARRATED = new Set(['tow', 'text']);
const ANSWERS = new Set(['yes', 'no', 'options']);
/** Tables that are read, not said (the notes under the wiper): their keys are steps, not dialogue fields. */
const UNSAID = new Set(['NOTES', 'AFTER3']);

const files = [
  ...['src/game', 'src/world', 'src/vehicle'].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`)),
  'src/main.ts',
];
const cyr = (s) => /[А-Яа-яЁё]/.test(s) && s.replace(/[^А-Яа-яЁёӘәҮүӨөҢңҺһҠҡҒғҘҙ]/g, '').length >= 3;

/** Stop ids → who speaks at that door (from World.ts), for the addressees' tables. */
const doors = new Map([['sosnovka', 'Нина Петровна'], ['zarechye', 'Валентина, сельпо'], ['khutor', 'Василий Степанович'], ['kolkhoz', 'Галина Ивановна'],
  ['forestry', 'Фёдор, лесник'], ['apiary', 'Рашит-агай'], ['kainly', 'Фарида-апа'], ['camp', 'Михалыч, сторож лагеря']]);
/** Who speaks a file's lines when nothing else says (the first morning is the grandfather's lesson). */
const FILE_SPEAKER = { 'src/game/FirstMorning.ts': 'Картатай' };
/** Speaker constants imported from elsewhere, and the dynamic ones. */
const KNOWN = { KARTATAY: 'Картатай', 'e.rider.name': 'попутчик (по месту)', 'l.c.who': 'герой случая (по месту)' };

/**
 * The places the road's people ask for (Encounters.ts): {to} — «до Сосновки», {into} — «в Сосновку», {who} —
 * who is at that door. A rider goes to a village (or only home: `home`), a favour to any addressee but `not`.
 */
const DESTS = [...readFileSync(join(ROOT, 'src/game/Career.ts'), 'utf8').matchAll(/id: '(\w+)', gen: '([^']+)', acc: '([^']+)', name: '[^']+', who: '([^']+)'/g)].map((m) => ({ id: m[1], gen: m[2], acc: m[3], who: m[4].split(',')[0] }));
const VILLAGES = ['sosnovka', 'zarechye', 'kainly'];
function places(text, obj) {
  if (!/\{(to|into|who)\}/.test(text)) return [text];
  const str = (k) => { const p = obj && ts.isObjectLiteralExpression(obj) && obj.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText() === k); return p ? p.initializer : null; };
  const home = str('home'), not = str('not');
  const no = not && ts.isArrayLiteralExpression(not) ? not.elements.filter(ts.isStringLiteralLike).map((x) => x.text) : [];
  const ids = text.includes('{to}') ? (home && ts.isStringLiteralLike(home) ? [home.text] : VILLAGES) : DESTS.map((d) => d.id).filter((id) => !no.includes(id));
  return ids.map((id) => DESTS.find((d) => d.id === id)).filter(Boolean).map((d) => text.replace('{to}', d.gen).replace('{into}', d.acc).replace('{who}', d.who));
}

const lines = new Map();
function add(speaker, text, kind, file, node, sf, template = false) {
  if (!text || !cyr(text)) return;
  const t = voiceText(text);
  const id = template ? '' : voiceId(t);
  const key = template ? `tpl:${t}` : id;
  const where = `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
  const had = lines.get(key);
  if (had) { had.n++; if (had.speaker.startsWith('?') && !speaker.startsWith('?')) had.speaker = speaker; return; }
  lines.set(key, { id, speaker, kind, text: t, where, template, n: 1 });
}

// World.ts first: who stands at which door
const order = [...files].sort((a, b) => (b.endsWith('World.ts') ? 1 : 0) - (a.endsWith('World.ts') ? 1 : 0));
for (const file of order) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const consts = new Map();
  const pre = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isStringLiteralLike(n.initializer)) consts.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, pre);
  };
  pre(sf);
  /** An expression's text variants: [{ text, template }]. */
  const resolve = (e) => {
    if (!e) return [];
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return resolve(e.expression);
    if (ts.isStringLiteralLike(e)) return [{ text: e.text, template: false }];
    if (ts.isIdentifier(e) && consts.has(e.text)) return [{ text: consts.get(e.text), template: false }];
    if (ts.isTemplateExpression(e)) {
      // every form the code can give: a span that is a choice of fixed strings (`${done ? 'A' : 'B'}`)
      // multiplies out; anything else (a sum, a name at run time) stays «{…}»
      let acc = [{ text: e.head.text, template: false }];
      for (const sp of e.templateSpans) {
        const vs = resolve(sp.expression).filter((v) => !v.template);
        const opts = vs.length && vs.length <= 6 ? vs : [{ text: '{…}', template: true }];
        acc = acc.flatMap((a) => opts.map((o) => ({ text: a.text + o.text + sp.literal.text, template: a.template || o.template })));
      }
      if (acc.length <= 24) return acc;
      let t = e.head.text;
      for (const sp of e.templateSpans) t += '{…}' + sp.literal.text;
      return [{ text: t, template: true }];
    }
    if (ts.isConditionalExpression(e)) return [...resolve(e.whenTrue), ...resolve(e.whenFalse)];
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = resolve(e.left), b = resolve(e.right);
      if (!a.length || !b.length) return [];
      return a.flatMap((x) => b.map((y) => ({ text: x.text + y.text, template: x.template || y.template })));
    }
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return [...resolve(e.left), ...resolve(e.right)];
    if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap(resolve);
    return [];
  };
  const name = (e) => resolve(e)[0]?.text ?? (e ? KNOWN[e.getText(sf)] ?? FILE_SPEAKER[file] ?? `? ${e.getText(sf).slice(0, 40)}` : '?');
  const keyOf = (p) => (p.name && (p.name.text ?? p.name.getText(sf)));
  const propOf = (obj, key) => obj.properties.find((p) => ts.isPropertyAssignment(p) && keyOf(p) === key);
  /** Who speaks in an object literal: its who / speaker / name, or the nearest enclosing one's; or the door it is for. */
  const speakerOf = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isObjectLiteralExpression(p)) {
        for (const k of ['who', 'speaker', 'name']) { const pr = propOf(p, k); if (pr) return name(pr.initializer); }
        const d = propOf(p, 'dest');
        if (d && ts.isStringLiteralLike(d.initializer) && doors.has(d.initializer.text)) return doors.get(d.initializer.text);
      }
      if (ts.isPropertyAssignment(p) && doors.has(keyOf(p))) return doors.get(keyOf(p));
    }
    return FILE_SPEAKER[file] ?? '? (по контексту)';
  };
  const listOf = (n) => {
    for (let p = n; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && LISTS[p.name.text]) return LISTS[p.name.text];
    return null;
  };
  const inUnsaid = (n) => { for (let p = n; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && UNSAID.has(p.name.text)) return true; return false; };
  const visit = (n) => {
    // the doors: World's mk(id, name, …, speaker, line, cargo) and stop objects { id, speaker, line }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'mk' && n.arguments.length >= 10) {
      const id = resolve(n.arguments[0])[0]?.text, who = name(n.arguments[8]);
      if (id) doors.set(id, who);
      for (const v of resolve(n.arguments[9])) add(who, v.text, 'door', file, n, sf, v.template);
    }
    if (ts.isObjectLiteralExpression(n)) {
      const id = propOf(n, 'id'), sp = propOf(n, 'speaker');
      if (id && sp && ts.isStringLiteralLike(id.initializer)) doors.set(id.initializer.text, name(sp.initializer));
    }
    if (ts.isCallExpression(n)) {
      const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '';
      const a = n.arguments;
      if ((callee === 'say' || callee === 'dialogue') && a.length >= 2) for (const v of resolve(a[1])) add(name(a[0]), v.text, 'say', file, n, sf, v.template);
      if (callee === 'choice' && a.length >= 3) {
        for (const v of resolve(a[1])) add(name(a[0]), v.text, 'ask', file, n, sf, v.template);
        for (const v of resolve(a[2])) add(PLAYER, v.text, 'answer', file, n, sf, v.template);
      }
      if ((callee === 'page' || callee === 'storyPage') && a.length >= 2) {
        const opts = a[2] && ts.isObjectLiteralExpression(a[2]) ? a[2] : null;
        const sp = opts && propOf(opts, 'speaker');
        for (const v of resolve(a[1])) add(sp ? name(sp.initializer) : NARRATOR, v.text, 'page', file, n, sf, v.template);
        const op = opts && propOf(opts, 'options');
        if (op) for (const v of resolve(op.initializer)) add(PLAYER, v.text, 'answer', file, n, sf, v.template);
      }
      if (callee === 'blackout' && a.length >= 2) for (const v of resolve(a[1])) add(NARRATOR, v.text, 'fade', file, n, sf, v.template);
    }
    if (ts.isPropertyAssignment(n) && !inUnsaid(n)) {
      const k = keyOf(n);
      if (SAID.has(k)) {
        const vs = resolve(n.initializer);
        if (k === 'arrive' && vs.length === 2) add(vs[0].text, vs[1].text, 'say', file, n, sf, vs[1].template);
        // the morning ride to the maternity: the jolts and the hurry are Zulfiya's
        else if ((k === 'bump' || k === 'hurry') && file.endsWith('Cases.ts') && n.parent?.parent && ts.isPropertyAssignment(n.parent.parent) && keyOf(n.parent.parent) === 'ride') for (const v of vs) add('Зульфия', v.text, 'say', file, n, sf, v.template);
        else for (const v of vs) for (const t of places(v.text, n.parent)) add(speakerOf(n), t, 'say', file, n, sf, v.template);
      } else if (NARRATED.has(k)) for (const v of resolve(n.initializer)) add(NARRATOR, v.text, 'fade', file, n, sf, v.template);
      else if (ANSWERS.has(k)) for (const v of resolve(n.initializer)) add(PLAYER, v.text, 'answer', file, n, sf, v.template);
      // weekBefore's record of the weeks between (W = { 2: '…', 6: `…` })
      else if (ts.isNumericLiteral(n.name) && listOf(n) === NARRATOR) for (const v of resolve(n.initializer)) add(NARRATOR, v.text, 'fade', file, n, sf, v.template);
    }
    if (ts.isArrayLiteralExpression(n)) {
      const el = n.elements;
      const s = (x) => x && ts.isStringLiteralLike(x);
      const list = listOf(n);
      const who = (x) => /^[А-ЯЁӘӨҮ][^.!?…]{0,38}$/.test(x.text);
      if (list === 'door') { for (const x of el) if (s(x)) add(speakerOf(x), x.text, 'door', file, x, sf); }
      else if (list === 'Сержант Кузьмин, ГАИ' && s(el[0]) && el.length === 3) add(list, el[0].text, 'say', file, n, sf);
      // [speaker, line] — or [speaker, line, when] (the morning's words that fit the day)
      else if (!file.endsWith('Career.ts') && (el.length === 2 || (el.length === 3 && !s(el[2]))) && s(el[0]) && s(el[1]) && who(el[0]) && cyr(el[1].text) && el[1].text.length > 20 && list !== RADIO) add(el[0].text, el[1].text, 'say', file, n, sf);
      else if (list === RADIO && el.length === 4 && s(el[3])) add(list, el[3].text, 'radio', file, n, sf);
      else if (list && !el.some((x) => ts.isArrayLiteralExpression(x))) for (const x of el) if (s(x) && x.text.length > 12) add(list, x.text, list === RADIO ? 'radio' : 'say', file, x, sf);
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && LISTS[n.name.text] && n.initializer && ts.isStringLiteralLike(n.initializer)) add(LISTS[n.name.text], n.initializer.text, 'say', file, n, sf);
    // the addressees' words in Stories.ts (returned by storyFor and common())
    if (file.endsWith('Stories.ts') && ts.isReturnStatement(n) && n.expression) {
      const pos = n.getStart(sf), zar = src.indexOf('// Zarechye'), sos = src.indexOf("if (id === 'sosnovka') {"), story = src.indexOf('export function storyFor');
      const who = pos > zar ? 'Валентина, сельпо' : pos > sos ? 'Нина Петровна' : pos < story ? 'любой адресат' : 'адресат (по месту)';
      for (const v of resolve(n.expression)) add(who, v.text, 'door', file, n, sf, v.template);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// what a playthrough heard: the templates' real forms
const heardPath = join(ROOT, 'docs/voice/heard.json');
if (existsSync(heardPath)) {
  for (const h of JSON.parse(readFileSync(heardPath, 'utf8'))) {
    if (!lines.has(h.id) && cyr(h.text)) lines.set(h.id, { id: h.id, speaker: h.speaker, kind: h.kind === 'radio' ? 'radio' : 'heard', text: voiceText(h.text), where: '(услышано в прохождении)', template: false, n: 1 });
  }
}

const recDir = join(ROOT, 'src/assets/voice');
const rec = new Set(existsSync(recDir) ? readdirSync(recDir).filter((f) => /\.(mp3|ogg|wav)$/.test(f)).map((f) => f.replace(/\.\w+$/, '')) : []);
// the synthesised drafts (scripts/voice-draft.py) are recordings too, until an actor's take replaces them
const draftPath = join(ROOT, 'docs/voice/drafts.json');
const drafts = new Set(existsSync(draftPath) ? Object.keys(JSON.parse(readFileSync(draftPath, 'utf8'))) : []);
const mark = (id) => (!id || !rec.has(id) ? '' : drafts.has(id) ? 'черновик' : 'да');
const real = (l) => mark(l.id) === 'да', draft = (l) => mark(l.id) === 'черновик';
const all = [...lines.values()].sort((a, b) => a.speaker.localeCompare(b.speaker, 'ru') || a.where.localeCompare(b.where, 'en', { numeric: true }));
// one character, one voice: the roles as the portraits know them (src/ui/portraits.ts), whatever the label
const WHO = [...readFileSync(join(ROOT, 'src/ui/portraits.ts'), 'utf8').matchAll(/\[\/(.+?)\/, '(\w+)'\]/g)].map((m) => [new RegExp(m[1]), m[2]]);
const role = (who) => (WHO.find(([re]) => re.test(who))?.[1]) ?? who;
for (const l of all) l.role = role(l.speaker);
mkdirSync(join(ROOT, 'docs/voice'), { recursive: true });
const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
const KIND = { say: 'реплика', ask: 'вопрос', answer: 'ответ игрока', page: 'страница', fade: 'затемнение', radio: 'радио', door: 'у адресата', heard: 'услышано' };
writeFileSync(join(ROOT, 'docs/voice/script.csv'), '\ufeff' + ['id;роль;подпись;где звучит;текст;в коде;записано', ...all.map((l) => [l.id || '(шаблон)', l.role, l.speaker, KIND[l.kind] ?? l.kind, l.text, l.where, mark(l.id)].map(q).join(';'))].join('\n') + '\n');

const by = new Map();
for (const l of all) { if (!by.has(l.role)) by.set(l.role, []); by.get(l.role).push(l); }
let md = `# Сценарий озвучки — по ролям\n\nСобрано \`node scripts/voice-script.mjs\` из исходников (не править руками). Строк: ${all.length}, из них шаблонов: ${all.filter((l) => l.template).length}. Записано: ${all.filter(real).length}, черновиков синтеза: ${all.filter(draft).length}.\nИмя файла — id строки: \`src/assets/voice/<id>.mp3\`. Шаблоны («{…}» — подставляется место, сумма, имя) пишутся по каждому варианту отдельно: варианты собирает прохождение в \`docs/voice/heard.json\`.\n\n`;
for (const [who, ls] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const labels = [...new Set(ls.map((l) => l.speaker))];
  md += `## ${labels[0] === who ? who : `${labels[0]} · \`${who}\``} — ${ls.length}\n\n${labels.length > 1 || labels[0] !== who ? `Подписи в игре: ${labels.join(' · ')}\n\n` : ''}| id | где | текст |\n|---|---|---|\n`;
  for (const l of ls) md += `| ${l.id || '—'} | ${KIND[l.kind] ?? l.kind} | ${l.text.replace(/\|/g, '\\|')} |\n`;
  md += '\n';
}
writeFileSync(join(ROOT, 'docs/voice/by-speaker.md'), md);
const unknown = all.filter((l) => l.speaker.startsWith('?'));
console.log(`lines: ${all.length}, templates: ${all.filter((l) => l.template).length}, speakers: ${by.size}, unknown speaker: ${unknown.length}, recorded: ${all.filter(real).length}, drafts: ${all.filter(draft).length}`);
if (process.argv.includes('--unknown')) for (const l of unknown) console.log(l.where, l.speaker, '|', l.text.slice(0, 80));
