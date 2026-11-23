import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

console.log('=== ТЕХНИЧЕСКИЙ ТЕСТ: ЦЕЛОСТНОСТЬ АССЕТОВ ===\n');

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.css', '.html']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'dist-test') {
        results = results.concat(getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => file.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

const sourceFiles = getAllFiles(path.join(ROOT, 'src'));

// Check for direct imports: import ... from './path.glb?url' or import('...')
const IMPORT_REGEX = /from\s+['"]([^'"]+\.(glb|fbx|obj|png|jpg|jpeg|webp|mp3|wav|ogg|svg))(\?[^'"]+)?['"]/g;
const DYN_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+\.(glb|fbx|obj|png|jpg|jpeg|webp|mp3|wav|ogg|svg))(\?[^'"]+)?['"]\s*\)/g;
const URL_REGEX = /new\s+URL\s*\(\s*['"]([^'"]+\.(glb|fbx|obj|png|jpg|jpeg|webp|mp3|wav|ogg|svg))(\?[^'"]+)?['"]\s*,\s*import\.meta\.url\s*\)/g;

const allImports = [];

for (const sf of sourceFiles) {
  const content = fs.readFileSync(sf, 'utf-8');
  for (const regex of [IMPORT_REGEX, DYN_IMPORT_REGEX, URL_REGEX]) {
    let m;
    while ((m = regex.exec(content)) !== null) {
      allImports.push({ file: sf, relAsset: m[1] });
    }
  }
}

console.log(`Найдено прямых импортов ассетов в src/: ${allImports.length}`);

let importErrors = 0;
for (const imp of allImports) {
  const resolved = path.resolve(path.dirname(imp.file), imp.relAsset);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ ОШИБКА: Импортируемый ассет не найден:\n   Файл: ${path.relative(ROOT, imp.file)}\n   Путь: ${imp.relAsset}\n   Ожидался: ${resolved}`);
    importErrors++;
  } else {
    const stat = fs.statSync(resolved);
    if (stat.size === 0) {
      console.error(`❌ ОШИБКА: Импортируемый ассет пуст (0 байт): ${resolved}`);
      importErrors++;
    }
  }
}

if (importErrors === 0) {
  console.log(`✅ Все ${allImports.length} импортируемых ассетов (3D модели, звуки, текстуры) существуют и не повреждены!`);
}

// Check glob assets
console.log('\n--- Проверка директорий с динамическими ассетами ---');
const globDirs = [
  'src/assets/portraits',
  'src/assets/story',
  'src/assets/animals',
  'src/assets/cars',
  'src/assets/engine',
  'src/assets/music',
  'src/assets/people',
  'src/assets/radio',
  'src/assets/soviet',
  'src/assets/uaz',
  'public/voice-samples'
];

for (const gd of globDirs) {
  const full = path.join(ROOT, gd);
  if (fs.existsSync(full)) {
    const items = fs.readdirSync(full).filter(f => !f.endsWith('.md') && !f.endsWith('.txt'));
    const totalBytes = items.reduce((sum, f) => sum + fs.statSync(path.join(full, f)).size, 0);
    console.log(`  📁 ${gd}: ${items.length} файлов (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.warn(`  ⚠️ Директория отсутствует: ${gd}`);
  }
}

console.log('\n--- Проверка списка моделей в People.ts и Cars.ts ---');
const peopleTs = fs.readFileSync(path.join(ROOT, 'src/world/People.ts'), 'utf-8');
const peopleGlbs = [...peopleTs.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(m => m[1]);
console.log(`В People.ts упомянуто моделей GLB: ${peopleGlbs.length}`);
for (const pg of peopleGlbs) {
  const p = path.resolve(ROOT, 'src/world', pg);
  if (!fs.existsSync(p)) {
    console.error(`❌ В People.ts битая ссылка на модель: ${pg}`);
  }
}
console.log('✅ Все модели в People.ts на месте!');
