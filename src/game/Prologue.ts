import type { StoryImage } from '../ui/storyArt';

/**
 * The beginning (docs/design.md, «Пролог»): for now one page — September 1997, Timur back from the
 * army, the grandfather due in hospital in Ufa today, the money for the institute. Then the first
 * morning in the yard in Urmanly (FirstMorning.ts): Timur drives the grandfather to Klyuchevsk, to
 * the Ufa bus, and the grandfather shows him the way and the van on it. The bus goes from the post
 * office: there they say goodbye (`farewellPages`), and Zinaida Pavlovna gives Timur the keys and
 * the first route sheet (`keysPage`).
 */
export interface PrologueHooks {
  page(eyebrow: string, text: string, opts?: { title?: string; speaker?: string; options?: string[]; pick?: (i: number) => void; skip?: () => void; image?: StoryImage; step?: [number, number] }): void;
  /** Over: the first morning, at home. */
  finish(): void;
}
type Page = PrologueHooks['page'];

const KARTATAY = 'Картатай';
/** The film camera's date on the prints: the first working morning. */
const FIRST_DAY = '’97 9 17';
/** The pictures (src/assets/story/README.md lists them for whoever draws them). */
const ART: Record<string, StoryImage> = {
  urmanly: { id: 'urmanly', brief: 'Двор в Урманлы солнечным утром: синяя с жёлтым почтовая буханка у ворот, солнце над ельником. Картатай с палкой и авоськой яблок, өләсәй на крыльце в платке, Тимур в армейском бушлате у кабины.', date: FIRST_DAY },
  farewell: { id: 'farewell', brief: 'Крыльцо почты в Ключевске, утро: картатай в кепке и сером пиджаке, палка, авоська с яблоками; рядом буханка, у двери — Зинаида Павловна в синем халате.', date: FIRST_DAY },
  notebook: { id: 'notebook', brief: 'Потёртый блокнот на резинке в загорелой ладони: адреса карандашом, пометки «злая собака», «пенсию — в руки»; рядом очки деда.', date: FIRST_DAY },
  zinaida: { id: 'zinaida', portrait: true, brief: 'Зинаида Павловна, 55 лет: химическая завивка, очки, синий форменный халат; на стойке — связка ключей.', date: FIRST_DAY },
};

/** Pages at the post office door the first morning: the goodbye, then Zinaida's (`keysPage`). */
const DOOR_PAGES = 3;

/**
 * The first morning at the post office: the Ufa bus leaves from here. The grandfather's last word,
 * his notebook of addresses, and he stays on the porch to wait for it; then `done` (the keys).
 */
export function farewellPages(page: Page, done: () => void): void {
  const ch = 'Первое утро · Ключевск, у почты';
  page(ch, 'Ну вот и довёз, улым. Автобус в десять — посижу у Зинаиды, чаю попью. Ты не жди: почта ждать не будет. Машину береги, людей уважай, Кузьмину не суй. Звонить буду сюда, по межгороду.', {
    title: 'Проводы', image: ART.farewell, speaker: KARTATAY, step: [1, DOOR_PAGES],
    options: ['Выздоравливай, картатай. Всё сделаю', 'Обнять деда'],
    pick: (i) => page(ch, `${i === 1
      ? 'Обнялись. От пиджака пахнет папиросами и яблоками от өләсәй. Дед кашлянул в кулак'
      : 'Дед кивнул, помолчал'} и достал из нагрудного кармана потёртый блокнот на резинке: «Тут все мои адреса. Кто где живёт, у кого собака злая, кому пенсию — в руки. Тридцать лет писал. Теперь твой».`, {
      title: 'Блокнот', image: ART.notebook, step: [2, DOOR_PAGES],
      options: ['Взять блокнот'],
      pick: () => done(),
    }),
  });
}

/** Then Zinaida Pavlovna and the keys, and `done` (the route sheet). */
export function keysPage(page: Page, done: () => void): void {
  page('Первое утро · отделение связи', 'Ну, Тимур. Урал-агай за тебя поручился, а я его тридцать лет знаю. Вот ключи от буханки — временно, пока он лечится. Путевой лист на стойке. Опоздаешь — с премии сниму. Побьёшь машину — из своего кармана.', {
    title: 'Ключи', image: ART.zinaida, speaker: 'Зинаида Павловна', step: [DOOR_PAGES, DOOR_PAGES],
    options: ['Спасибо, Зинаида Павловна. Не подведу'],
    pick: () => done(),
  });
}

export class Prologue {
  constructor(private hooks: PrologueHooks) {}

  /** The one page, then the morning. */
  start(): void {
    const h = this.hooks;
    h.page('Сентябрь 1997 · Башкортостан', 'Тимуру двадцать, вчера вернулся из армии. Картатай тридцать лет возит почту по району, а сегодня ложится в больницу в Уфе. Почте нужен водитель, Тимуру — деньги: три миллиона к июлю, на институт. Утром — отвезти деда в Ключевск, к автобусу. Там же и почта.', {
      title: 'Сельская почта', image: ART.urmanly,
      options: ['Утро. Во двор'],
      pick: () => h.finish(),
    });
  }
}
