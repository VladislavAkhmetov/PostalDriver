import './ui.css';
import type { Ground } from '../world/Ground';
import type { Stop } from '../world/World';
import type { Input, Action } from '../core/Input';
import type { RitualStep, RunStats } from '../game/Mission';

const ICON = {
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  weather: '<svg viewBox="0 0 24 24"><path d="M7 17h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3 1.7A3.2 3.2 0 0 0 7 17z"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  rotate: '<svg viewBox="0 0 48 48"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M22 37h4"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17.2v.1"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>',
};

/** Dashboard tell-tales for the control column, drawn in the same stroke style. */
const CTL_ICON: Record<string, string> = {
  engine: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2.5"/></svg>',
  fourWD: '<svg viewBox="0 0 24 24"><rect x="3" y="3.5" width="4" height="6" rx="1"/><rect x="17" y="3.5" width="4" height="6" rx="1"/><rect x="3" y="14.5" width="4" height="6" rx="1"/><rect x="17" y="14.5" width="4" height="6" rx="1"/><path d="M7 6.5h10M7 17.5h10M12 6.5v11"/></svg>',
  low: '<svg viewBox="0 0 24 24"><path d="M2.5 19.5l6-9 4 5 3-3.5 6 7.5z"/><path d="M15.5 4v5h3"/></svg>',
  handbrake: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M10.3 15V9h2.3a1.8 1.8 0 0 1 0 3.6h-2.3"/><path d="M4.5 7.5a9 9 0 0 0 0 9M19.5 7.5a9 9 0 0 1 0 9"/></svg>',
  lights: '<svg viewBox="0 0 24 24"><path d="M11 6C7.5 6 5 8.7 5 12s2.5 6 6 6c1.4 0 2-1.5 2-6s-.6-6-2-6z"/><path d="M16 8h5M16 12h5M16 16h5"/></svg>',
  wipers: '<svg viewBox="0 0 24 24"><path d="M3 18a9 9 0 0 1 18 0"/><path d="M12 18l-5.5-7.5"/><circle cx="12" cy="18" r="1"/></svg>',
  tape: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M6 9l11-5"/><circle cx="15.5" cy="14.5" r="2.5"/><path d="M6.5 13h4M6.5 16h4"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 6l8 6-8 6z"/><path d="M13 6l6 6-6 6"/></svg>',
  horn: '<svg viewBox="0 0 24 24"><path d="M3 10v4h3l7 4V6L6 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
};

export type Quality = 'low' | 'mid' | 'high';
export interface Settings { quality: Quality; look: number; tilt: boolean }
const SETTINGS_KEY = 'uaz17.settings';

const TOUCH_HELP: [string, string][] = [
  ['левая половина', 'руль — потяни влево / вправо'], ['Газ · Тормоз', 'чем выше нажал, тем сильнее; тормоз на месте — задний ход'],
  ['верх экрана', 'осмотреться; коснись прибора, чтобы нажать'], ['Ручник · Ключ · Сигнал', 'всегда под рукой'],
  ['•••', 'мост, понижайка, фары, дворники, карта, радио'], ['наклон', 'руль наклоном телефона — включи в паузе'],
];

export interface RouteState {
  next: string | null; dist: number; progress: number;
  stops: { at: number; done: boolean }[];
  kmh: number; limit: number | null; alert: string | null;
  /** Seconds until the Zarechye shop shuts for lunch (negative: late), null once delivered. */
  left: number | null;
  /** Parcels' condition, %. */
  cargo: number;
}

/** Keyboard reference, grouped the way the keys sit around WASD. */
const KEY_GROUPS: [string, [string, string][]][] = [
  ['Езда', [['W · ↑', 'газ'], ['S · ↓', 'тормоз; стоя на месте — задний ход'], ['A D · ← →', 'руль'], ['Пробел', 'ручник'], ['H', 'клаксон (держать)']]],
  ['Мотор и коробка', [['Enter', 'зажигание'], ['G', 'коробка: автомат / ручная'], ['Q · E', 'передача ниже / выше (в ручном режиме)']]],
  ['Бездорожье — раздатка', [['Z', 'передний мост 4×4'], ['X', 'понижающая передача']]],
  ['Кабина', [['F', 'фары'], ['R', 'дворники'], ['C · N', 'радио: вкл. / следующая станция'], ['V', 'оглянуться назад (держать)'], ['мышь', 'осмотреться; клик — по приборам']]],
  ['Игра', [['M · Tab', 'путевой лист и карта'], ['K', 'погода'], ['U', 'звук'], ['Backspace', 'вытащить машину на дорогу'], ['Esc', 'пауза'], ['F1', 'эта памятка']]],
];
/** The few keys the title card shows. */
const KEYS_SHORT: [string, string][] = [
  ['W A S D', 'езда'], ['Пробел', 'ручник'], ['H', 'клаксон'], ['Q · E', 'передачи'], ['Z · X', 'мост · понижайка'], ['F · R', 'фары · дворники'], ['F1', 'все клавиши'],
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Best run so far (mark, then time), kept in the browser. */
const BEST_KEY = 'uaz-zarechye-best';
interface Best { grade: number; time: number }
function loadBest(): Best | null {
  try { const b = JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null'); return b && typeof b.grade === 'number' ? b : null; } catch { return null; }
}
function saveBest(b: Best): void { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* private mode */ } }
function bestNote(): string {
  const b = loadBest();
  return b ? ` · лучший рейс: «${b.grade}», ${Math.floor(b.time / 60)}:${String(Math.floor(b.time % 60)).padStart(2, '0')}` : '';
}

/** One line for the end card: what the GAI made of the run. */
function policeLine(st: RunStats): string {
  const p = st.police;
  const parts: string[] = [];
  if (p.arrests) parts.push(p.arrests > 1 ? `задержан ${p.arrests} раза` : 'задержан');
  if (p.escapes) parts.push(p.escapes > 1 ? `ушёл от погони ${p.escapes} раза` : 'ушёл от погони');
  if (p.fines) parts.push(`штрафы ${p.fines} ₽`);
  else if (p.warnings) parts.push('отделался предупреждением');
  if (!parts.length) return p.checks ? 'документы в порядке' : 'не останавливали';
  return parts.join(' · ');
}

export interface ChipState { gear: string; auto: boolean; fourWD: boolean; low: boolean; handbrake: boolean; lights: boolean; wipers: boolean; engine: string; tape: string | null }

export class UI {
  readonly root = el('div', 'ui');
  private titleEl!: HTMLElement;
  private hud = el('div', 'hud hidden');
  private chips: Record<string, HTMLElement> = {};
  private hintEl = el('div', 'hint paper out');
  private hintText = el('span');
  private hintKeys = el('span', 'keys');
  private ritualEl = el('div', 'ritual paper out');
  private dialogueEl = el('div', 'dialogue paper out');
  private toastEl = el('div', 'toast out');
  private tipEl = el('div', 'tip');
  private weatherTag = el('div', 'weather-tag');
  private mapEl = el('div', 'overlay out');
  private mapCanvas = el('canvas');
  private pauseEl = el('div', 'overlay out');
  private endEl = el('div', 'overlay out');
  private touchEl = el('div', 'touch');
  private muteBtn!: HTMLButtonElement;
  private typing: { full: string; i: number; t: number } | null = null;
  private dlgTyping: { full: string; i: number; t: number; p: HTMLElement } | null = null;
  private hintHide = 0;
  private dlgHide = 0;
  private toastHide = 0;
  private hintId = '';
  mapOpen = false;
  paused = false;
  onStart?: () => void;
  onRestart?: () => void;
  onAction?: (a: Action) => void;
  onFiles?: (files: FileList) => void;
  onType?: () => void;
  private mapBase: HTMLCanvasElement | null = null;
  private mapXf = { minX: 0, minZ: 0, k: 1, w: 640, h: 400 };
  private touchBtns: Record<string, HTMLButtonElement> = {};
  private speedEl = el('div', 'speedo');
  private routeEl = el('div', 'route-strip');
  private helpEl = el('div', 'overlay out');
  private blackEl = el('div', 'blackout out');
  private wheelEl: HTMLElement | null = null;
  private drawer: HTMLElement | null = null;
  helpOpen = false;
  settings: Settings = { quality: 'mid', look: 1, tilt: false };
  onSettings?: (s: Settings, changed: keyof Settings | null) => void;

  constructor(private input: Input) {
    document.getElementById('app')!.appendChild(this.root);
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')); } catch { /* defaults */ }
    this.buildTitle();
    this.buildHud();
    this.buildOverlays();
    this.buildTouch();
    const rot = el('div', 'rotate', `<div>${ICON.rotate}<p>Поверните телефон горизонтально —<br>в кабине так удобнее.</p></div>`);
    this.root.appendChild(rot);
  }

  // ------------------------------------------------------------- title
  private buildTitle(): void {
    // a film opening over the route: letterbox, grain, a VHS on-screen display,
    // the title in the lower left and the waybill pinned on the right
    const t = el('div', 'title');
    t.innerHTML = `
      <div class="tt-fade"></div>
      <div class="tt-grain"></div>
      <div class="tt-bar top">
        <span class="osd"><i class="rec">▶</i> ВОСПР.</span>
        <span class="osd">СТОРОНА А · 17·09·97 · <b data-clock>05:42:00</b></span>
      </div>
      <div class="tt-caption" data-caption></div>
      <section class="tt-main">
        <span class="eyebrow">Почта России · Маршрут № 17</span>
        <h1>Рейс в&nbsp;Заречье</h1>
        <p class="lede">Сентябрь девяносто седьмого. Туман над Серебрянкой, УАЗ-«буханка», две доставки и&nbsp;двенадцать минут до&nbsp;обеда в&nbsp;сельпо.</p>
        <div class="title-actions">
          <button type="button" class="btn-primary" data-start>Завести <span class="kbd">Enter</span></button>
          <button type="button" class="btn-ghost" data-waybill>Путевой лист</button>
        </div>
        <span class="note">Звук включится по нажатию · рейс минут на десять${bestNote()}</span>
      </section>
      <aside class="waybill paper" data-sheet aria-label="Путевой лист">
        <div class="waybill-head"><span class="eyebrow">Путевой лист</span><span class="form">Ф. 16-а</span></div>
        <dl class="fields">
          <dt>Машина</dt><dd>УАЗ-3741 · М 417 ВН 62</dd>
          <dt>Маршрут</dt><dd>Ключевск → Сосновка → Заречье, 4,4 км</dd>
          <dt>Груз</dt><dd>пенсия, газеты, посылки — <b>стекло, не трясти</b></dd>
          <dt>Срок</dt><dd>сельпо закрывается на обед через 12 мин</dd>
          <dt>Вручение</dt><dd>стоп · ручник · два гудка</dd>
        </dl>
        <span class="stamp">Отправлено<small>17·09·97</small></span>
      </aside>
      <div class="tt-bar bottom"><div class="legend" data-legend></div></div>`;
    const legend = t.querySelector('[data-legend]')!;
    for (const [k, v] of KEYS_SHORT) legend.appendChild(el('span', '', `<span class="kbd">${k}</span>${v}`));
    const startBtn = t.querySelector<HTMLButtonElement>('[data-start]')!;
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.onStart?.();
    });
    const sheet = t.querySelector('[data-sheet]')!;
    t.querySelector<HTMLButtonElement>('[data-waybill]')!.addEventListener('click', (e) => { sheet.classList.toggle('open'); (e.currentTarget as HTMLElement).blur(); });
    // the deck's clock runs on from 05:42
    const clock = t.querySelector('[data-clock]')!;
    const t0 = performance.now();
    const tick = () => {
      if (this.titleEl.classList.contains('out')) return;
      const sec = 5 * 3600 + 42 * 60 + Math.floor((performance.now() - t0) / 1000);
      clock.textContent = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
      setTimeout(tick, 250);
    };
    this.titleEl = t;
    tick();
    this.root.appendChild(t);
  }

  /** The title sequence's dip to black between shots, and the place caption. */
  setTitleFade(fade: number, caption = ''): void {
    const f = this.titleEl.querySelector('.tt-fade') as HTMLElement;
    f.style.opacity = fade.toFixed(3);
    const c = this.titleEl.querySelector('[data-caption]') as HTMLElement;
    if (c.textContent !== caption) c.textContent = caption;
    c.style.opacity = (1 - Math.min(1, fade * 2.5)).toFixed(3);
  }

  hideTitle(): void {
    this.titleEl.classList.add('out');
    this.hud.classList.remove('hidden');
  }
  showTitle(): void { this.titleEl.classList.remove('out'); this.hud.classList.add('hidden'); }

  // ------------------------------------------------------------- HUD
  private buildHud(): void {
    // speed, then a column of labelled controls: icon, name, current state and its key;
    // each row is also a button
    const dash = el('div', 'dash');
    this.speedEl.innerHTML = '<b>0</b><span>км/ч</span><i class="limit" hidden>60</i>';
    const panel = el('div', 'panel');
    panel.setAttribute('aria-label', 'Органы управления');
    const mk = (id: string, name: string, a: Action, key: string, icon: string) => {
      const c = el('button', 'ctl', `<span class="ctl-ico">${icon}</span><span class="ctl-txt"><span class="ctl-name">${name}</span><span class="ctl-state"></span></span><span class="ctl-key"><span class="kbd">${key}</span></span>`);
      c.title = `${name} — ${key}`;
      c.addEventListener('click', (e) => { e.stopPropagation(); this.onAction?.(a); c.blur(); });
      panel.appendChild(c);
      this.chips[id] = c;
    };
    mk('engine', 'Двигатель', 'start', 'Enter', CTL_ICON.engine);
    mk('gear', 'Коробка', 'gearMode', 'G', '<b class="gear-n">1</b>');
    mk('fourWD', 'Передний мост', '4wd', 'Z', CTL_ICON.fourWD);
    mk('low', 'Понижающая', 'low', 'X', CTL_ICON.low);
    mk('handbrake', 'Ручник', 'handbrake', 'Пробел', CTL_ICON.handbrake);
    mk('lights', 'Фары', 'lights', 'F', CTL_ICON.lights);
    mk('wipers', 'Дворники', 'wipers', 'R', CTL_ICON.wipers);
    // the horn is held, like the key
    const horn = el('button', 'ctl', `<span class="ctl-ico">${CTL_ICON.horn}</span><span class="ctl-txt"><span class="ctl-name">Гудок</span><span class="ctl-state">держать</span></span><span class="ctl-key"><span class="kbd">H</span></span>`);
    horn.title = 'Гудок — H (держать)';
    const hornUp = () => { this.input.setTouchHorn(false); horn.classList.remove('on'); };
    horn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.input.setTouchHorn(true); horn.classList.add('on'); });
    horn.addEventListener('pointerup', hornUp);
    horn.addEventListener('pointerleave', hornUp);
    horn.addEventListener('pointercancel', hornUp);
    horn.addEventListener('click', (e) => { e.stopPropagation(); horn.blur(); });
    panel.appendChild(horn);
    mk('tape', 'Радио', 'tape', 'C', CTL_ICON.tape);
    mk('tapeNext', 'Станция', 'tapeNext', 'N', CTL_ICON.next);
    mk('map', 'Путевой лист', 'map', 'M', CTL_ICON.map);
    const keysLink = el('button', 'panel-help', '<span class="kbd">F1</span> все клавиши');
    keysLink.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHelp(true); keysLink.blur(); });
    panel.appendChild(keysLink);
    dash.append(this.speedEl, panel);
    this.hud.appendChild(dash);

    // route strip: next stop, distance and progress along the waybill
    this.routeEl.innerHTML = '<div class="rs-top"><span class="rs-next"></span><span class="rs-dist"></span></div><div class="rs-bar"><i class="rs-fill"></i><i class="rs-car"></i></div><div class="rs-meta"><span class="rs-clock"></span><span class="rs-cargo"></span></div><div class="rs-alert" hidden></div>';
    this.routeEl.addEventListener('click', (e) => { e.stopPropagation(); this.onAction?.('map'); });
    this.routeEl.title = 'Путевой лист (M)';
    this.hud.appendChild(this.routeEl);

    const tools = el('div', 'tools');
    const tool = (a: Action, label: string, icon: string) => {
      const b = el('button', 'tool', icon);
      b.setAttribute('aria-label', label);
      b.title = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onAction?.(a); b.blur(); });
      tools.appendChild(b);
      return b;
    };
    tool('map', 'Путевой лист (M)', ICON.map);
    tool('weather', 'Погода (K)', ICON.weather);
    this.muteBtn = tool('mute', 'Звук (U)', ICON.sound);
    tool('help', 'Управление (F1)', ICON.help);
    if (document.fullscreenEnabled) {
      const fs = el('button', 'tool', ICON.full);
      fs.title = 'Во весь экран'; fs.setAttribute('aria-label', fs.title);
      fs.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullscreen(); fs.blur(); });
      tools.appendChild(fs);
    }
    tool('pause', 'Пауза (Esc)', ICON.pause);
    this.hud.appendChild(tools);
    this.hud.appendChild(this.weatherTag);

    this.hintEl.append(this.hintKeys, this.hintText);
    this.hud.append(this.hintEl, this.ritualEl, this.dialogueEl, this.toastEl);
    this.tipEl.hidden = true;
    this.root.append(this.hud, this.tipEl);
  }

  setChips(s: ChipState): void {
    const c = this.chips;
    const row = (id: string, state: string, cls: 'on' | 'alert' | 'ok' | '' = '') => {
      const r = c[id];
      r.querySelector('.ctl-state')!.textContent = state;
      r.classList.toggle('on', cls === 'on');
      r.classList.toggle('alert', cls === 'alert');
      r.classList.toggle('ok', cls === 'ok');
    };
    const running = s.engine === 'running';
    row('engine', running ? 'работает' : s.engine === 'off' ? 'заглушён' : 'заводится…', running ? 'ok' : s.engine === 'off' ? 'alert' : '');
    c.engine.hidden = running;
    c.gear.querySelector('.gear-n')!.textContent = s.gear;
    row('gear', s.auto ? 'автомат' : 'ручная · Q / E');
    c.gear.querySelector('.ctl-key .kbd')!.textContent = 'G';
    c.gear.classList.toggle('dim', !running);
    row('fourWD', s.fourWD ? 'включён · 4×4' : 'выключен', s.fourWD ? 'on' : '');
    row('low', s.low ? 'включена' : 'выключена', s.low ? 'on' : '');
    row('handbrake', s.handbrake ? 'затянут' : 'отпущен', s.handbrake ? 'alert' : '');
    row('lights', s.lights ? 'включены' : 'выключены', s.lights ? 'on' : '');
    row('wipers', s.wipers ? 'работают' : 'выключены', s.wipers ? 'on' : '');
    row('tape', s.tape ? s.tape.replace(/^▶\s*/, '') : 'выключено', s.tape ? 'on' : '');
    row('tapeNext', s.tape ? 'следующая' : 'включить и листать');
    row('map', 'карта и маршрут');
    for (const [k, b] of Object.entries(this.touchBtns)) {
      if (k === 'more' || k === 'map' || k === 'horn') continue;
      const on = k === '4wd' ? s.fourWD : k === 'low' ? s.low : k === 'handbrake' ? s.handbrake : k === 'lights' ? s.lights : k === 'wipers' ? s.wipers : false;
      b.classList.toggle('on', on);
      if (k === 'gear') b.textContent = s.engine === 'running' ? `${s.auto ? 'А' : 'Р'}·${s.gear}` : 'Ключ';
      if (k === 'tape') b.classList.toggle('on', !!s.tape);
    }
  }

  private routeTicks = 0;
  setRoute(r: RouteState): void {
    const bar = this.routeEl.querySelector('.rs-bar')!;
    if (this.routeTicks !== r.stops.length) {
      bar.querySelectorAll('.rs-stop').forEach((n) => n.remove());
      for (const st of r.stops) { const i = el('i', 'rs-stop'); i.style.left = `${st.at * 100}%`; bar.appendChild(i); }
      this.routeTicks = r.stops.length;
    }
    bar.querySelectorAll<HTMLElement>('.rs-stop').forEach((n, i) => n.classList.toggle('done', r.stops[i]?.done));
    const pct = `${clamp01(r.progress) * 100}%`;
    (bar.querySelector('.rs-fill') as HTMLElement).style.width = pct;
    (bar.querySelector('.rs-car') as HTMLElement).style.left = pct;
    this.routeEl.querySelector('.rs-next')!.textContent = r.next ? `До: ${r.next}` : 'Обратно не нужно — рейс выполнен';
    const d = Math.max(0, r.dist);
    this.routeEl.querySelector('.rs-dist')!.textContent = r.next ? (d < 1000 ? `${Math.round(d / 10) * 10} м` : `${(d / 1000).toFixed(1).replace('.', ',')} км`) : '';
    // the schedule and the parcels: the two things the run is judged on
    const clock = this.routeEl.querySelector('.rs-clock') as HTMLElement;
    if (r.left === null) { clock.textContent = 'Посылки сданы'; clock.className = 'rs-clock'; }
    else {
      const a = Math.abs(Math.round(r.left)), mm = Math.floor(a / 60), ss = String(a % 60).padStart(2, '0');
      clock.textContent = r.left >= 0 ? `До обеда в сельпо ${mm}:${ss}` : `Опоздание ${mm}:${ss}`;
      clock.className = `rs-clock${r.left < 0 ? ' bad' : r.left < 120 ? ' warn' : ''}`;
    }
    const cargo = this.routeEl.querySelector('.rs-cargo') as HTMLElement;
    cargo.textContent = `Посылки ${Math.round(r.cargo)} %`;
    cargo.className = `rs-cargo${r.cargo < 55 ? ' bad' : r.cargo < 80 ? ' warn' : ''}`;
    const al = this.routeEl.querySelector('.rs-alert') as HTMLElement;
    al.hidden = !r.alert;
    if (r.alert) al.textContent = r.alert;
    const k = Math.round(Math.abs(r.kmh));
    this.speedEl.querySelector('b')!.textContent = String(k);
    const lim = this.speedEl.querySelector('.limit') as HTMLElement;
    lim.hidden = r.limit === null;
    this.speedEl.classList.toggle('over', r.limit !== null && k > r.limit + 5);
  }

  setWeather(name: string): void { this.weatherTag.textContent = name; }
  setMuted(m: boolean): void { this.muteBtn.innerHTML = m ? ICON.mute : ICON.sound; this.muteBtn.setAttribute('aria-pressed', String(m)); }

  hint(id: string, text: string, keys?: string): void {
    this.hintId = id;
    this.hintKeys.textContent = keys ?? '';
    this.hintKeys.hidden = !keys;
    this.typing = { full: text, i: 0, t: 0 };
    this.hintText.innerHTML = '<span class="caret"></span>';
    this.hintEl.classList.remove('out');
    this.hintHide = 7 + text.length * 0.03;
  }
  clearHint(id?: string): void { if (!id || id === this.hintId) this.hintHide = Math.min(this.hintHide, 0.01); }

  ritual(stop: Stop | null, step: RitualStep, honks: number): void {
    if (!stop || step === 'done' || step === 'near') { this.ritualEl.classList.add('out'); return; }
    const order: RitualStep[] = ['stop', 'handbrake', 'horn'];
    const cur = order.indexOf(step);
    const li = (i: number, text: string, extra = '') => `<li class="${i < cur ? 'ok' : i === cur ? 'now' : ''}">${text}${extra}</li>`;
    this.ritualEl.innerHTML = `<span class="eyebrow">Вручение · ${stop.cargo}</span><h3>${stop.name}</h3><ul>
      ${li(0, 'Остановиться')}${li(1, 'Затянуть ручник', '<span class="kbd push">␣</span>')}
      ${li(2, 'Посигналить дважды', `<span class="dots">${'●'.repeat(honks)}${'○'.repeat(Math.max(0, 2 - honks))}</span>`)}</ul>`;
    this.ritualEl.classList.remove('out');
  }

  dialogue(speaker: string, line: string, stamp: string | null = 'Вручено'): void {
    const tone = stamp === 'Штраф' ? ' fine' : stamp === 'Предупреждение' || stamp === 'Проверено' ? ' warn' : '';
    this.dialogueEl.innerHTML = `${stamp ? `<span class="stamp thump${tone}">${stamp}</span>` : ''}<span class="who">${speaker}</span><p></p>`;
    this.dlgTyping = { full: `«${line}»`, i: 0, t: 0, p: this.dialogueEl.querySelector('p')! };
    this.dialogueEl.classList.remove('out');
    this.dlgHide = 6 + line.length * 0.045;
  }

  toast(text: string, seconds = 1.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('out');
    this.toastHide = seconds;
  }

  tip(text: string | null, x = 0, y = 0): void {
    this.tipEl.hidden = !text;
    if (text) { this.tipEl.textContent = text; this.tipEl.style.left = `${x}px`; this.tipEl.style.top = `${y}px`; }
  }

  update(dt: number): void {
    if (this.typing) {
      const ty = this.typing;
      ty.t += dt;
      const n = Math.min(ty.full.length, Math.floor(ty.t * 46));
      if (n !== ty.i) { if (ty.full[n - 1] !== ' ') this.onType?.(); ty.i = n; this.hintText.innerHTML = `${ty.full.slice(0, n)}<span class="caret"></span>`; }
      if (n >= ty.full.length) this.typing = null;
    }
    if (this.dlgTyping) {
      const ty = this.dlgTyping;
      ty.t += dt;
      const n = Math.min(ty.full.length, Math.floor(ty.t * 38));
      if (n !== ty.i) { ty.i = n; ty.p.textContent = ty.full.slice(0, n); }
      if (n >= ty.full.length) this.dlgTyping = null;
    }
    if (this.hintHide > 0 && (this.hintHide -= dt) <= 0) this.hintEl.classList.add('out');
    if (this.dlgHide > 0 && (this.dlgHide -= dt) <= 0) this.dialogueEl.classList.add('out');
    if (this.toastHide > 0 && (this.toastHide -= dt) <= 0) this.toastEl.classList.add('out');
    // the on-screen wheel follows tilt steering too
    if (this.wheelEl && this.input.tilt) this.wheelEl.style.transform = `rotate(${this.input.steer * 120}deg)`;
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  }

  toggleHelp(open = !this.helpOpen): void {
    this.helpOpen = open;
    this.helpEl.classList.toggle('out', !open);
  }

  private saveSettings(changed: keyof Settings | null): void {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    this.onSettings?.(this.settings, changed);
  }

  // ------------------------------------------------------------- overlays
  private buildOverlays(): void {
    const sheet = el('div', 'map-sheet paper');
    sheet.innerHTML = `<header><div><span class="eyebrow">Путевой лист · схема маршрута</span><h2>Ключевск — Заречье</h2></div><span class="kbd">M</span></header>`;
    this.mapCanvas.width = 640; this.mapCanvas.height = 400;
    sheet.appendChild(this.mapCanvas);
    sheet.appendChild(el('div', 'foot', '<span>— асфальт &nbsp; ┅ грунт &nbsp; ≈ р. Серебрянка</span><span data-progress></span>'));
    this.mapEl.appendChild(sheet);
    this.mapEl.addEventListener('click', () => this.onAction?.('map'));

    const menu = el('div', 'menu paper');
    menu.innerHTML = '<span class="eyebrow">Остановка</span><h2>Пауза</h2>';
    const btn = (label: string, fn: () => void) => { const b = el('button', 'btn-line', label); b.addEventListener('click', fn); menu.appendChild(b); return b; };
    btn('Продолжить рейс', () => this.onAction?.('pause'));
    btn('Вытащить на дорогу', () => { this.onAction?.('reset'); this.onAction?.('pause'); });
    btn('Начать рейс заново', () => this.onRestart?.());
    btn('Вставить свою кассету…', () => {
      const pick = document.createElement('input');
      pick.type = 'file';
      pick.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac,.opus';
      pick.multiple = true;
      pick.addEventListener('change', () => {
        if (pick.files?.length) this.onFiles?.(pick.files);
      });
      pick.click();
    });
    btn('Управление', () => this.toggleHelp(true));
    btn('Диспетчерская (статистика)', () => window.open('/stats.html', '_blank'));

    // settings
    const set = el('div', 'settings');
    set.innerHTML = '<span class="eyebrow">Настройки</span>';
    const row = (label: string) => { const r = el('div', 'set-row', `<span>${label}</span>`); set.appendChild(r); return r; };
    const q = row('Графика');
    const seg = el('div', 'seg');
    const qBtns: HTMLButtonElement[] = [];
    for (const [id, label] of [['low', 'Быстро'], ['mid', 'Баланс'], ['high', 'Чётко']] as [Quality, string][]) {
      const b = el('button', '', label);
      b.setAttribute('aria-pressed', String(this.settings.quality === id));
      b.addEventListener('click', () => { this.settings.quality = id; qBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); this.saveSettings('quality'); });
      qBtns.push(b); seg.appendChild(b);
    }
    q.appendChild(seg);
    const lk = row('Обзор');
    const range = el('input') as HTMLInputElement;
    range.type = 'range'; range.min = '0.4'; range.max = '2'; range.step = '0.1'; range.value = String(this.settings.look);
    range.setAttribute('aria-label', 'Чувствительность обзора');
    range.addEventListener('input', () => { this.settings.look = Number(range.value); this.saveSettings('look'); });
    lk.appendChild(range);
    const tl = row('Руль наклоном');
    const tiltBtn = el('button', 'switch');
    tiltBtn.setAttribute('aria-pressed', String(this.settings.tilt));
    tiltBtn.setAttribute('aria-label', 'Руль наклоном телефона');
    tiltBtn.addEventListener('click', () => { this.settings.tilt = !this.settings.tilt; tiltBtn.setAttribute('aria-pressed', String(this.settings.tilt)); this.saveSettings('tilt'); });
    tl.appendChild(tiltBtn);
    tl.classList.add('touch-only');
    this.tiltSwitch = tiltBtn;
    menu.appendChild(set);
    this.pauseEl.appendChild(menu);

    const help = el('div', 'help-sheet paper');
    help.innerHTML = '<header><div><span class="eyebrow">Памятка водителю</span><h2>Управление</h2></div><span class="kbd">F1</span></header>';
    const cols = el('div', 'help-cols');
    const col = (title: string, rows: [string, string][], kbd: boolean) => {
      const c = el('section', '', `<h3>${title}</h3>`);
      const l = el('div', 'keys-list');
      for (const [k, v] of rows) l.append(el('span', kbd ? 'kbd' : 'tag', k), el('span', '', v));
      c.appendChild(l);
      cols.appendChild(c);
    };
    {
      const c = el('section', 'help-keys', '<h3>Клавиатура и мышь</h3>');
      for (const [title, rows] of KEY_GROUPS) {
        c.appendChild(el('h4', '', title));
        const l = el('div', 'keys-list');
        for (const [k, v] of rows) l.append(el('span', 'kbd', k), el('span', '', v));
        c.appendChild(l);
      }
      cols.appendChild(c);
    }
    col('Сенсорный экран', TOUCH_HELP, false);
    help.appendChild(cols);
    help.appendChild(el('p', 'help-note', 'ГАИ на выезде из Ключевска: знак «60», радар. Махнул жезлом — остановись, иначе погоня до развилки.'));
    const close = el('button', 'btn-primary', 'Понятно');
    close.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHelp(false); });
    help.appendChild(close);
    this.helpEl.appendChild(help);
    this.helpEl.addEventListener('click', (e) => { if (e.target === this.helpEl) this.toggleHelp(false); });

    this.root.append(this.mapEl, this.pauseEl, this.endEl, this.helpEl);
  }

  private tiltSwitch: HTMLButtonElement | null = null;
  /** Tilt could not be enabled (no sensor or permission denied): flip the switch back. */
  tiltFailed(): void {
    this.settings.tilt = false;
    this.tiltSwitch?.setAttribute('aria-pressed', 'false');
    this.saveSettings(null);
    this.toast('Датчик наклона недоступен', 2.4);
  }

  setPaused(p: boolean): void { this.paused = p; this.pauseEl.classList.toggle('out', !p); }

  /** Pre-renders the static part of the paper map. */
  buildMap(ground: Ground, stops: Stop[]): void {
    const W = 640, H = 400, pad = 36;
    const pts = ground.main.samples;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    // map is drawn with north (−Z) to the right so the long route fits landscape
    const k = Math.min((W - pad * 2) / (maxZ - minZ), (H - pad * 2) / (maxX - minX));
    this.mapXf = { minX, minZ, k, w: W, h: H };
    const P = (x: number, z: number): [number, number] => [W - pad - (z - minZ) * k, H / 2 + (x - (minX + maxX) / 2) * k];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(29,78,166,0.10)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y < H; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    // forest hatch
    const m = ground.marks;
    g.strokeStyle = 'rgba(47,107,58,0.35)';
    for (const p of pts) if (p.s > m.forest && p.s < m.mud && Math.floor(p.s / 2) % 9 === 0) {
      const [x, y] = P(p.x, p.z);
      for (const o of [-22, -14, 14, 22]) { g.beginPath(); g.arc(x, y + o, 3, 0, Math.PI * 2); g.stroke(); }
    }
    // river
    g.strokeStyle = '#5d7fb8'; g.lineWidth = 3;
    g.beginPath();
    ground.riverPts.forEach((r, i) => { const [x, y] = P(r.x, r.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // road by surface
    const style = (s: number) => {
      const z = ground.main.zoneAt(s).surface;
      return z === 'asphalt' ? { c: '#2a2620', w: 3, d: [] as number[] } : z === 'wood' ? { c: '#7a4a22', w: 4, d: [] } : z === 'mud' ? { c: '#6a4a2a', w: 2.5, d: [2, 3] } : { c: '#2a2620', w: 2, d: [6, 4] };
    };
    for (let i = 1; i < pts.length; i++) {
      const st = style(pts[i].s);
      g.strokeStyle = st.c; g.lineWidth = st.w; g.setLineDash(st.d);
      const [x0, y0] = P(pts[i - 1].x, pts[i - 1].z), [x1, y1] = P(pts[i].x, pts[i].z);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(42,38,32,0.5)'; g.lineWidth = 2;
    g.beginPath();
    ground.stub.samples.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // labels
    g.font = '600 15px "PT Sans Narrow", sans-serif';
    g.fillStyle = '#2a2620';
    const label = (s: number, text: string, dy: number) => {
      const f = ground.main.frame(s);
      const [x, y] = P(f.x, f.z);
      g.textAlign = 'center';
      g.fillText(text, x, y + dy);
    };
    label(40, 'Ключевск', -16);
    label(m.junction, 'развилка', 22);
    label(m.bridge, 'мост', -14);
    g.font = 'italic 13px "PT Serif", serif'; g.fillStyle = '#3d5f98';
    const r0 = ground.riverPts[Math.floor(ground.riverPts.length * 0.2)];
    if (r0) { const [x, y] = P(r0.x, r0.z); g.fillText('р. Серебрянка', x, y - 8); }
    this.mapBase = c;
    this.drawStops = (gg) => {
      gg.font = '700 16px "PT Sans Narrow", sans-serif';
      for (const s of stops) {
        const [x, y] = P(s.pos.x, s.pos.z);
        gg.fillStyle = s.done ? '#8e2a4e' : '#1d4ea6';
        gg.beginPath(); gg.arc(x, y, 6, 0, Math.PI * 2); gg.fill();
        gg.textAlign = 'center';
        gg.fillText(s.name, x, y - 13);
        if (s.done) {
          gg.strokeStyle = '#8e2a4e'; gg.lineWidth = 2.5;
          const w = gg.measureText(s.name).width / 2 + 4;
          gg.beginPath(); gg.moveTo(x - w, y - 12); gg.lineTo(x + w, y - 22); gg.stroke();
        }
      }
    };
    this.P = P;
  }
  private drawStops: ((g: CanvasRenderingContext2D) => void) | null = null;
  private P: ((x: number, z: number) => [number, number]) | null = null;

  setMap(open: boolean, car?: { x: number; z: number; yaw: number }, progress?: string): void {
    this.mapOpen = open;
    this.mapEl.classList.toggle('out', !open);
    if (!open || !this.mapBase || !this.P) return;
    const g = this.mapCanvas.getContext('2d')!;
    g.drawImage(this.mapBase, 0, 0);
    this.drawStops?.(g);
    if (car) {
      const [x, y] = this.P(car.x, car.z);
      g.save();
      g.translate(x, y);
      // forward is −Z (map right); yaw rotates forward towards +X (map down)
      g.rotate(-car.yaw);
      g.fillStyle = '#8e2a4e';
      g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, 6); g.lineTo(-3, 0); g.lineTo(-6, -6); g.closePath(); g.fill();
      g.restore();
    }
    const p = this.mapEl.querySelector('[data-progress]');
    if (p && progress) p.textContent = progress;
  }

  showEnd(st: RunStats): void {
    const mm = Math.floor(st.time / 60), ss = Math.floor(st.time % 60).toString().padStart(2, '0');
    const best = loadBest();
    const record = !best || st.grade > best.grade || (st.grade === best.grade && st.time < best.time);
    if (record) saveBest({ grade: st.grade, time: st.time });
    const words: Record<number, [string, string]> = {
      5: ['Отлично', '«Вовремя и всё целое. Пятёрка, премию выпишу.»'],
      4: ['Хорошо', '«Нормально съездил, но есть к чему придраться. Четвёрка.»'],
      3: ['Удовл.', '«Тройка. Опять жалобы писать будут.»'],
      2: ['Неуд.', '«Двойка. Объяснительную — мне на стол.»'],
    };
    const [word, boss] = words[st.grade];
    this.endEl.innerHTML = '';
    const card = el('div', 'end paper');
    card.innerHTML = `<span class="eyebrow">Почта России · Маршрут № 17</span><h2>Рейс завершён</h2>
      <span class="stamp thump grade g${st.grade}">${st.grade}<small>${word}</small></span>
      <p>Начальник отделения: ${boss}${st.remarks.length ? `<br><span class="remarks">Замечания: ${st.remarks.join(', ')}.</span>` : ''}</p>
      <dl class="fields"><dt>Доставлено</dt><dd>${st.delivered} из ${st.total}</dd>
      <dt>В пути</dt><dd>${mm} мин ${ss} с ${st.late > 0 ? `· опоздание ${Math.ceil(st.late / 60)} мин` : '· в графике'}</dd>
      <dt>Посылки</dt><dd>${Math.round(st.cargo)} % целы</dd>
      <dt>Пробег</dt><dd>${(st.distance / 1000).toFixed(2).replace('.', ',')} км · ухабов ${st.bumps}</dd>
      <dt>Буксовал</dt><dd>${st.stuck ? `${st.stuck} раз` : 'ни разу'}</dd>
      <dt>ГАИ</dt><dd>${policeLine(st)}</dd>
      <dt>Лучший</dt><dd>${record ? 'новый рекорд!' : `${best!.grade} · ${Math.floor(best!.time / 60)} мин ${String(Math.floor(best!.time % 60)).padStart(2, '0')} с`}</dd></dl>`;
    const actions = el('div', 'title-actions');
    const again = el('button', 'btn-primary', 'Ещё рейс');
    again.addEventListener('click', () => this.onRestart?.());
    actions.appendChild(again);
    card.appendChild(actions);
    this.endEl.appendChild(card);
    this.endEl.classList.remove('out');
  }
  hideEnd(): void { this.endEl.classList.add('out'); }

  /** Fade to black over a short card (time passing off-screen); `mid` runs once the screen is dark. */
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void): void {
    const b = this.blackEl;
    if (!b.isConnected) this.root.appendChild(b);
    b.innerHTML = `<div class="bo-card"><span class="eyebrow">${title}</span><p>${text}</p><span class="stamp thump fine">Протокол</span></div>`;
    b.classList.remove('out');
    setTimeout(mid, 1300);
    setTimeout(() => { b.classList.add('out'); done(); }, 1300 + seconds * 1000);
  }

  // ------------------------------------------------------------- touch
  private buildTouch(): void {
    const t = this.touchEl;
    const look = el('div', 't-look');
    const steer = el('div', 't-steer');
    const wheel = el('div', 'wheel');
    steer.appendChild(wheel);
    this.wheelEl = wheel;
    const pedals = el('div', 't-pedals');
    const brake = el('button', 'pedal', 'Тормоз');
    const gas = el('button', 'pedal gas', 'Газ');
    brake.setAttribute('aria-label', 'Тормоз / задний ход');
    pedals.append(brake, gas);
    // primary controls stay under the thumb; the rest live in a drawer
    const btns = el('div', 't-buttons');
    const drawer = el('div', 't-drawer');
    this.drawer = drawer;
    const tb = (id: string, label: string, a?: Action, parent: HTMLElement = btns) => {
      const b = el('button', 't-btn', label);
      if (a) b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onAction?.(a); b.classList.add('down'); });
      b.addEventListener('pointerup', () => b.classList.remove('down'));
      b.addEventListener('pointercancel', () => b.classList.remove('down'));
      parent.appendChild(b);
      this.touchBtns[id] = b;
      return b;
    };
    tb('handbrake', 'Ручник', 'handbrake');
    tb('gear', 'Ключ', 'gearMode');
    const more = tb('more', ICON.more);
    more.classList.add('more');
    more.setAttribute('aria-label', 'Ещё органы управления');
    more.addEventListener('pointerdown', (e) => { e.preventDefault(); drawer.classList.toggle('open'); more.classList.toggle('on', drawer.classList.contains('open')); });
    tb('4wd', 'Мост 4×4', '4wd', drawer);
    tb('low', 'Понижайка', 'low', drawer);
    tb('lights', 'Фары', 'lights', drawer);
    tb('wipers', 'Дворники', 'wipers', drawer);
    tb('map', 'Карта', 'map', drawer);
    tb('tape', 'Кассета', 'tape', drawer);
    btns.appendChild(drawer);
    const horn = tb('horn', 'Сигнал');
    horn.classList.add('horn');
    horn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.setTouchHorn(true); horn.classList.add('down'); });
    const hornUp = () => { this.input.setTouchHorn(false); horn.classList.remove('down'); };
    horn.addEventListener('pointerup', hornUp);
    horn.addEventListener('pointercancel', hornUp);
    horn.addEventListener('pointerleave', hornUp);
    t.append(look, steer, pedals, btns);
    this.root.appendChild(t);

    // steering: horizontal drag relative to touch-down point
    let sid = -1, sx = 0;
    steer.addEventListener('pointerdown', (e) => {
      sid = e.pointerId; sx = e.clientX;
      steer.setPointerCapture(e.pointerId);
      this.input.setTouchSteer(0);
    });
    steer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const v = Math.max(-1, Math.min(1, (e.clientX - sx) / (window.innerWidth * 0.14)));
      this.input.setTouchSteer(v);
      wheel.style.transform = `rotate(${v * 120}deg)`;
    });
    const steerEnd = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = -1; this.input.setTouchSteer(null); wheel.style.transform = ''; };
    steer.addEventListener('pointerup', steerEnd);
    steer.addEventListener('pointercancel', steerEnd);

    // pedals: analog by vertical press position
    const pedal = (b: HTMLElement, which: 'gas' | 'brake') => {
      const set = (e: PointerEvent) => {
        const r = b.getBoundingClientRect();
        this.input.setTouchPedal(which, Math.max(0.35, Math.min(1, 1.15 - (e.clientY - r.top) / r.height * 0.8)));
      };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down'); set(e); });
      b.addEventListener('pointermove', (e) => { if (b.hasPointerCapture(e.pointerId)) set(e); });
      const up = () => { this.input.setTouchPedal(which, 0); b.classList.remove('down'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    };
    pedal(gas, 'gas');
    pedal(brake, 'brake');

    // look zone: drag to look, tap to use cabin hotspots
    let lid = -1, lx = 0, ly = 0, moved = 0;
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; moved = 0; look.setPointerCapture(e.pointerId); this.input.touchLooking = true; });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      lx = e.clientX; ly = e.clientY;
      this.input.look(dx, dy, 0.0065);
    });
    const lookEnd = (e: PointerEvent) => {
      if (e.pointerId !== lid) return;
      lid = -1; this.input.touchLooking = false;
      if (moved < 8) this.input.onClick?.(e.clientX, e.clientY);
    };
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);
  }

  /** Shows touch controls once a touch is seen (and hides them on keyboard use). */
  setTouchMode(on: boolean): void {
    this.touchEl.classList.toggle('on', on);
    this.root.classList.toggle('touch-mode', on);
  }
}
