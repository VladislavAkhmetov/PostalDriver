import type { Stop } from '../world/World';
import { destName, type Order } from './Career';
import type { Mission } from './Mission';

/**
 * Old letters (docs/design.md, «Старые письма»): in the post office's cupboard a bundle of letters
 * «до востребования» from 1990–91 that nobody ever came for. Now and then one goes out with the
 * morning's requests: to the old address first, where a neighbour remembers where the addressee went,
 * and on from there until it finds them. Each is a small story of the district; the last one, with
 * no stamp and the address in the grandfather's own hand, is his («Тайна картатая»).
 * Kept in the profile, moved on only at the evening's reckoning like everything else.
 */
export interface LettersState {
  done: string[];
  /** The letter on its way and how far it has got. */
  cur?: { id: string; step: number };
  /** The working day from which the next letter may go out. */
  next: number;
}

interface Step { dest: string; line: string; speaker?: string }
interface Letter {
  id: string;
  /** On the board: what it looks like and who it is for. */
  title: string; note: string;
  /** The first working day it can be found, and how many must have been delivered before it. */
  from: number; needs?: number;
  /** Where it goes in turn; the last is the addressee. */
  steps: Step[];
  /** The line in the evening's journal. */
  journal: string;
  trust: number;
  /** The grandfather's own: the evening after, his story. */
  grandpa?: boolean;
}

const LETTERS: Letter[] = [
  {
    id: 'rashit', from: 3, title: '«Хабибуллину Р., до востребования»', trust: 3,
    note: 'Конверт с голубем, Казань, 1991. Кто такой Хабибуллин — на почте не помнят. Обратный адрес размыт.',
    steps: [
      { dest: 'sosnovka', line: 'Хабибуллин? Рашит, что ли? Так он тогда у нас в Сосновке жил, у вдовы Хабировой угол снимал. Теперь пасеку держит, у реки. Отвези ему, сынок.' },
      { dest: 'apiary', line: 'Из Казани?.. Почерк… Это Наиля. Мы в шестьдесят восьмом… Ай, улым. Двадцать с лишним лет не писала — и вот написала, а я не получил. Иди, иди. Дай одному посидеть.' },
    ],
    journal: 'Письмо 1991 года нашло Рашит-агая',
  },
  {
    id: 'fedor', from: 5, title: '«Лесникову Ф. И., до востребования»', trust: 3,
    note: 'Женский почерк, штемпель Магнитогорска, 1990. На обороте — «Вернись».',
    steps: [
      { dest: 'khutor', line: 'Федька Лесников? Так это ж наш лесник, Фёдор! Бирюком живёт в лесничестве. Свези ему. Только он письмам не обрадуется — он ничему не радуется.' },
      { dest: 'forestry', line: '«Вернись, Федя. Т.» …Семь лет ждал. А оно в шкафу лежало. Ладно. Спасибо, почтальон. Чаю не предлагаю — не до чаю мне сейчас.' },
    ],
    journal: 'Письмо 1990 года нашло лесника Фёдора',
  },
  {
    id: 'sabira', from: 7, title: '«Галиевой Сабире, до востребования»', trust: 3,
    note: 'Казань, 1991, мужской почерк по-татарски и по-русски. Адресата в Ключевске не нашли.',
    steps: [
      { dest: 'kainly', line: 'Сабира-апа… Нет её, улым, третий год как. А дочь её, Гульшат, в Заречье замужем — у сельпо через дом живёт. Вези туда, Валентина покажет.' },
      { dest: 'zarechye', line: 'Галиевой? Гульшатке, соседке моей? Сейчас крикну… Гульшат! Тебе — от дяди из Казани, с девяносто первого! Ой, ревёт. Иди, милок, я сама с ней.' },
    ],
    journal: 'Письмо 1991 года нашло Гульшат в Заречье',
  },
  {
    id: 'vozhatyi', from: 8, title: '«Вожатому Володе, п/л «Звёздочка»»', trust: 2,
    note: 'Детский почерк, на конверте нарисована звезда. Лето 1990-го. Лагерь закрыт с девяносто второго.',
    steps: [
      { dest: 'camp', line: 'Вожатому Володе?.. Так Володя — это я. Владимир Михайлович. «Спасибо за лето, вы самый лучший вожатый. Лена Р., третий отряд». …Читай дальше сам, у меня глаза что-то.' },
    ],
    journal: 'Письмо 1990 года нашло вожатого «Звёздочки»',
  },
  {
    id: 'galiya', from: 14, needs: 3, grandpa: true, title: 'Письмо без марки и штемпеля, 1979', trust: 5,
    note: 'В самом углу шкафа, завёрнуто в «Знамя труда». Адрес выведен рукой картатая: «Заречье, Ахметовой Г. Х.».',
    steps: [
      { dest: 'zarechye', line: 'Ахметова Гайша? Бабушка Гайша, с края, у старой мельницы жила. Прошлой зимой к дочке в Кайынлы переехала — к Фариде, в медпункт. Только письмо-то… это ж рука Урал-агая?' },
      { dest: 'kainly', line: 'Ахметовой?.. Мама! Әни, тебе письмо. Из семьдесят девятого… От Галии?! …Она плачет и смеётся, улым. Она знала. Она всегда говорила: Галия жива.' },
    ],
    journal: 'Письмо 1979 года, которое картатай так и не отнёс',
  },
  {
    id: 'geolog', from: 19, title: '«Ивановой Г., до востребования»', trust: 3,
    note: 'Воркута, 1989. Адрес карандашом: «Колхозная ферма, зоотехнику». Сургучная печать экспедиции.',
    steps: [
      { dest: 'kolkhoz', line: 'Мне?.. От брата, с Воркуты?! Девять лет ни слуху ни духу... Живой! Пишет, на железной дороге осел. Господи, Тимур, спасибо тебе. Картатай бы гордился тобой.' },
    ],
    journal: 'Письмо 1989 года из Воркуты нашло Галину Ивановну на ферме',
  },
  {
    id: 'newyear89', from: 22, title: 'Новогодняя открытка 1989 года', trust: 3,
    note: 'Открытка с Дедом Морозом и тройкой лошадей. Адрес: «Хутор Берёзки, Степанычу». Подпись: «От бригады мелиораторов».',
    steps: [
      { dest: 'khutor', line: 'Гляди-ка... Открытка с восемьдесят девятого! От ребят с канала... «С Новым годом, Степаныч, пусть твой трактор не чихает». Эх, время было. Спасибо, почта, порадовал старика.' },
    ],
    journal: 'Новогодняя открытка 1989 года нашла Степаныча на хуторе',
  },
];

/** The grandfather, the evening the last letter went home. */
export const GRANDPA_LETTER = 'Вечер. Картатай долго молчит на лавке у ворот, палка между колен. «В семьдесят девятом Галия Ахметова уехала с русским парнем на Север. Отец бы её проклял. Она отдала мне письмо: передай маме, Урал-агай, когда отец остынет. А он не остыл — через год умер. А я… не донёс. Боялся, что поздно. Восемнадцать лет поздно, улым. Спасибо, что донёс за меня».';

const fresh = (): LettersState => ({ done: [], next: 3 });
const orderId = (id: string, step: number) => `letter-${id}-${step}`;

/** The letter whose turn it is today (taken or not — it waits in the cupboard till it is). */
function current(s: LettersState, day: number): { letter: Letter; step: number } | null {
  if (s.cur) {
    const letter = LETTERS.find((l) => l.id === s.cur!.id);
    return letter ? { letter, step: s.cur.step } : null;
  }
  if (day < s.next) return null;
  const letter = LETTERS.find((l) => !s.done.includes(l.id) && day >= l.from && s.done.length >= (l.needs ?? 0));
  return letter ? { letter, step: 0 } : null;
}

/** For the morning's board: the letter as a request (no pay — for thanks), and the postmistress's word the first time. */
export function letterForBoard(saved: LettersState | undefined, day: number): { order: Order; note: string | null } | null {
  const s = saved ?? fresh();
  const c = current(s, day);
  if (!c) return null;
  const { letter, step } = c;
  const where = step > 0 ? ` Теперь — ${destName(letter.steps[step].dest).toLowerCase()}.` : '';
  const order: Order = { id: orderId(letter.id, step), dest: letter.steps[step].dest, kind: 'letters', title: 'Письмо из шкафа', note: `${letter.title}. ${letter.note}${where}`, pay: 0, fragile: false, due: null, from: 'Шкаф «до востребования»', letter: true };
  const note = !s.done.length && !s.cur
    ? 'Зинаида Павловна: «Тимур, разбери шкаф — там письма „до востребования“ с девяностого года. Никто так и не пришёл. Может, кого найдёшь».'
    : letter.grandpa && step === 0 ? 'В углу шкафа нашлось ещё одно письмо — без марки, и почерк на конверте знакомый.' : null;
  return { order, note };
}

export interface LettersHooks { say(speaker: string, line: string): void; toast(text: string): void }

export class Letters {
  private s: LettersState;
  /** The grandfather's own letter went home today: his story tonight. */
  grandpaTonight = false;

  constructor(private mission: Mission, private hooks: LettersHooks, private day: number, saved?: LettersState) {
    this.s = saved ? { done: [...saved.done], cur: saved.cur ? { ...saved.cur } : undefined, next: saved.next } : fresh();
  }

  get saved(): LettersState { return { done: [...this.s.done], cur: this.s.cur ? { ...this.s.cur } : undefined, next: this.s.next }; }

  /** An addressee has had today's mail: if the letter was among it, it moves on or is home. */
  delivered(stop: Stop): void {
    const c = current(this.s, this.day);
    if (!c || !this.mission.handedOver(orderId(c.letter.id, c.step))) return;
    const { letter, step } = c;
    if (letter.steps[step].dest !== stop.id) return;
    const st = letter.steps[step];
    setTimeout(() => this.hooks.say(st.speaker ?? stop.speaker, st.line), 3800);
    if (step < letter.steps.length - 1) {
      this.s.cur = { id: letter.id, step: step + 1 };
      const next = destName(letter.steps[step + 1].dest);
      this.mission.extra(`Письмо из шкафа · след ведёт: ${next.toLowerCase()}`, 0, 0);
      setTimeout(() => this.hooks.toast(`Письмо ищет адресата дальше · ${next}`), 9000);
    } else {
      this.s.done.push(letter.id);
      this.s.cur = undefined;
      this.s.next = this.day + 2;
      this.mission.extra(letter.journal, 0, letter.trust);
      if (letter.grandpa) this.grandpaTonight = true;
    }
  }
}
