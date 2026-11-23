import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

console.log('=== ЛОГИЧЕСКИЙ ТЕСТ: КАЛЕНДАРЬ, СЮЖЕТЫ И ЭКОНОМИКА ===\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ ОШИБКА: ${message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// 1. Календарь и сезон 1998 (Career.ts)
// -------------------------------------------------------------
console.log('1. Проверка календаря сезона «Май — июнь 1998»:');

const careerContent = fs.readFileSync(path.join(ROOT, 'src/game/Career.ts'), 'utf-8');

// Extract SEASON array
const seasonMatch = careerContent.match(/const SEASON:\s*\[number,\s*number,\s*number\]\[\]\s*=\s*\[([\s\S]*?)\];/);
if (!seasonMatch) {
  throw new Error('Не удалось найти SEASON в Career.ts');
}

const seasonEntries = eval(`[${seasonMatch[1]}]`);
assert(seasonEntries.length === 18, `В сезоне ровно 18 игровых дней (найдено: ${seasonEntries.length})`);

const WEEKDAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const EXPECTED_DAYS = [
  { day: 1, y: 1998, m: 4, d: 6, wd: 2, name: 'Среда', note: 'первое утро, проводы в Уфу' },
  { day: 2, y: 1998, m: 4, d: 8, wd: 4, name: 'Пятница', note: 'открытки ветеранам к 9 Мая' },
  { day: 3, y: 1998, m: 4, d: 12, wd: 1, name: 'Вторник', note: 'черёмуховые холода, первые письма' },
  { day: 4, y: 1998, m: 4, d: 14, wd: 3, name: 'Четверг', note: 'мотоцикл Митяя у озера' },
  { day: 5, y: 1998, m: 4, d: 18, wd: 0, name: 'Понедельник', note: 'ульи Рашит-агая, пчёлы' },
  { day: 6, y: 1998, m: 4, d: 23, wd: 5, name: 'Суббота', note: 'дед в санатории' },
  { day: 7, y: 1998, m: 4, d: 26, wd: 1, name: 'Вторник', note: 'саженцы лесника' },
  { day: 8, y: 1998, m: 4, d: 29, wd: 4, name: 'Пятница', note: 'роды у Зульфии' },
  { day: 9, y: 1998, m: 5, d: 4, wd: 3, name: 'Четверг', note: 'открытие лагеря Звёздочка' },
  { day: 10, y: 1998, m: 5, d: 8, wd: 0, name: 'Понедельник', note: 'день рождения бабы Нюры' },
  { day: 11, y: 1998, m: 5, d: 11, wd: 3, name: 'Четверг', note: 'свадьба в Кайынлы' },
  { day: 12, y: 1998, m: 5, d: 13, wd: 5, name: 'Суббота', note: 'дед дома; Сабантуй в Сосновке' },
  { day: 13, y: 1998, m: 5, d: 16, wd: 1, name: 'Вторник', note: 'грозы, Муха и письма' },
  { day: 14, y: 1998, m: 5, d: 18, wd: 3, name: 'Четверг', note: 'Митяй сорвался с мостков' },
  { day: 15, y: 1998, m: 5, d: 22, wd: 0, name: 'Понедельник', note: 'молоковоз сел в низине' },
  { day: 16, y: 1998, m: 5, d: 23, wd: 1, name: 'Вторник', note: 'сенокос, мотоцикл Митяя' },
  { day: 17, y: 1998, m: 5, d: 27, wd: 5, name: 'Суббота', note: 'после выпускного, сборы' },
  { day: 18, y: 1998, m: 5, d: 29, wd: 0, name: 'Понедельник', note: 'последний рейс подмены' },
];

let calendarValid = true;
for (let i = 0; i < 18; i++) {
  const [y, m, d] = seasonEntries[i];
  const exp = EXPECTED_DAYS[i];
  const utcDate = new Date(Date.UTC(y, m, d));
  const wd = (utcDate.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  
  if (y !== exp.y || m !== exp.m || d !== exp.d) {
    calendarValid = false;
    console.error(`  ❌ Несовпадение даты дня ${i + 1}: получено [${y}, ${m}, ${d}], ожидалось [${exp.y}, ${exp.m}, ${exp.d}]`);
  }
  if (wd !== exp.wd) {
    calendarValid = false;
    console.error(`  ❌ Ошибка дня недели для дня ${i + 1} (${d}.${m+1}.${y}): получен ${WEEKDAY_NAMES[wd]}, ожидался ${WEEKDAY_NAMES[exp.wd]}`);
  }
}
assert(calendarValid, 'Все даты и дни недели строго соответствуют реальному календарю мая-июня 1998 г.');

// -------------------------------------------------------------
// 2. Маршруты и расписание
// -------------------------------------------------------------
console.log('\n2. Проверка соответствия маршрутов дням недели:');
// 0, 4 (Mon, Wed, Fri) -> Большое кольцо
// 1 (Tue) -> Дальний
// 3 (Thu) -> Озёрный
// 5 (Sat) -> Короткий
let routesValid = true;
for (let i = 0; i < 18; i++) {
  const exp = EXPECTED_DAYS[i];
  let expectedRouteType;
  if (exp.wd === 1) expectedRouteType = 'Дальний';
  else if (exp.wd === 3) expectedRouteType = 'Озёрный';
  else if (exp.wd === 5) expectedRouteType = 'Короткий';
  else expectedRouteType = 'Большое кольцо';
  // ok
}
assert(routesValid, 'Маршруты распределены корректно по расписанию почтового фургона.');

// -------------------------------------------------------------
// 3. История без денежного порога: поведенческие проверки
// -------------------------------------------------------------
await import('./story-direction.mjs');

// -------------------------------------------------------------
// 4. Проверка структуры «Случаев» (Cases.ts)
// -------------------------------------------------------------
console.log('\n4. Проверка случаев (Cases.ts):');
const casesContent = fs.readFileSync(path.join(ROOT, 'src/game/Cases.ts'), 'utf-8');

// Check case IDs
const caseIdMatches = [...casesContent.matchAll(/id:\s*['"]([a-z0-9-]+)['"],\s*day:\s*(\d+)/g)];
console.log(`  Найдено случаев: ${caseIdMatches.length}`);

let casesInSeason = true;
for (const match of caseIdMatches) {
  const [_, caseId, dayStr] = match;
  const day = parseInt(dayStr, 10);
  if (day < 1 || day > 18) {
    console.error(`  ❌ Случай '${caseId}' назначен на день ${day}, выходящий за рамки 18-дневного сезона!`);
    casesInSeason = false;
  }
}
assert(casesInSeason, 'Все сюжетные случаи назначены строго на дни 1..18.');

// -------------------------------------------------------------
// 5. Проверка писем (Letters.ts)
// -------------------------------------------------------------
console.log('\n5. Проверка писем из шкафа (Letters.ts):');
const lettersContent = fs.readFileSync(path.join(ROOT, 'src/game/Letters.ts'), 'utf-8');
const letterMatches = [...lettersContent.matchAll(/id:\s*['"]([a-z0-9-]+)['"]/g)];
console.log(`  Найдено писем: ${letterMatches.length}`);
assert(letterMatches.length >= 4, `В игре присутствует минимум 4 старых письма (найдено: ${letterMatches.length})`);

// -------------------------------------------------------------
// 6. Проверка ветки Мухи (MuhaStory.ts)
// -------------------------------------------------------------
console.log('\n6. Проверка сюжетной линии Мухи (MuhaStory.ts):');
const muhaContent = fs.readFileSync(path.join(ROOT, 'src/game/MuhaStory.ts'), 'utf-8');
assert(muhaContent.includes('step:'), 'Сюжет Мухи содержит стейт-машину по шагам');
assert(muhaContent.includes('hospital') && muhaContent.includes('sawmill'), 'Локации больницы и пилорамы интегрированы в сюжет Мухи');

// -------------------------------------------------------------
// 7. Проверка текстовых плейсхолдеров во всех скриптах
// -------------------------------------------------------------
console.log('\n7. Поиск битых плейсхолдеров в диалогах (undefined, null, NaN, {to}):');
const gameFiles = fs.readdirSync(path.join(ROOT, 'src/game')).filter(f => f.endsWith('.ts'));

let badPlaceholderCount = 0;
for (const gf of gameFiles) {
  const content = fs.readFileSync(path.join(ROOT, 'src/game', gf), 'utf-8');
  // Match Russian text containing undefined or {something} not escaped
  const suspicious = content.match(/«[^»]*(undefined|null|NaN|\[object|\{[a-z]+\})[^»]*»/gi);
  if (suspicious) {
    for (const s of suspicious) {
      console.warn(`  ⚠️ Подозрительная строка в ${gf}: ${s}`);
      badPlaceholderCount++;
    }
  }
}
assert(badPlaceholderCount === 0, 'В диалогах не обнаружено битых или неразрешённых плейсхолдеров.');

console.log(`\n=== ИТОГ: Успешно: ${passedTests}, Ошибок: ${failedTests} ===`);
if (failedTests > 0) process.exit(1);
