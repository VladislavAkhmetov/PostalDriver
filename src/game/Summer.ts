import type { StoryImage } from '../ui/storyArt';
import { rub } from './Money';
import { GOAL, SEASON_DAYS } from './Career';
import type { Profile } from './Profile';

/**
 * The end of the first season (docs/season-1998.md): the evening after the last run, 29 June 1998,
 * told on the album's pages. If the money box holds what the trip needs — the bus to Ufa, the month
 * of entrance exams, a room and food for the first months — Timur leaves on the Wednesday bus, passes,
 * and rings home; if it doesn't, the grandfather: «на следующий год — поедешь», and the box waits for
 * next July (`playSummer`). Either way the service goes on after (the post needs a driver till September).
 */
export interface SummerHooks {
  page(eyebrow: string, text: string, opts?: { title?: string; speaker?: string; options?: string[]; pick?: (i: number) => void; image?: StoryImage; step?: [number, number] }): void;
  done(): void;
}

/** «Не хватило» in an earlier year: the July working day the exams come round again (before its board). */
export function summerDue(p: Profile, y: number, m: number): boolean {
  return p.exams === 'next' && m >= 6 && m <= 7 && y >= (p.examYear ?? 1999);
}

/** The season's end is due: the morning after the last played day's evening. */
export function seasonFinaleDue(p: Profile, day: number): boolean {
  return day > SEASON_DAYS && !p.seasonFinale;
}

/** A later July, when the box was short the first time: go now, or wait another year. */
export function playSummer(p: Profile, y: number, h: SummerHooks): void {
  const ch = `Лето ${y}`;
  const date = `’${String(y).slice(2)} 7 1`;
  if (p.money >= GOAL) {
    h.page(ch, `Июль. В копилке — ${rub(p.money)}, пересчитанные трижды. Өләсәй сунула пакет с беляшами, әсәй — конверт «на непредвиденное», картатай — ничего, только крепко пожал руку.`, {
      title: 'Уфа', step: [1, 2], image: { id: 'ufa-bus', brief: 'Автостанция Ключевска, утро: автобус на Уфу, өләсәй с пакетом беляшей, әсәй машет, картатай с палкой чуть в стороне.', date },
      pick: () => h.page(ch, 'Поступил?.. Ну. Я знал. Деньги на комнату — не трать на ерунду. А пока приезжай: почта без тебя до сентября не проживёт. Я сказал.', {
        title: 'Звонок домой', step: [2, 2], speaker: 'Картатай', image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай у телефона в отделении связи, трубка в руке, улыбается в усы.', date },
        options: ['Приеду, картатай'],
        pick: () => { p.money -= GOAL; p.exams = 'passed'; p.examYear = y + 1; h.done(); },
      }),
    });
  } else {
    h.page(ch, `Июль. В копилке — ${rub(p.money)}. До ${rub(GOAL)} опять не хватает ${rub(GOAL - p.money)}. Картатай молча кладёт на клеёнку свою пенсию: «Возьми». Не взял.`, {
      title: 'Ещё год', step: [1, 1], speaker: 'Картатай', image: { id: 'piggy', brief: 'Жестяная банка с купюрами на клеёнке, тетрадка с подсчётами «до Уфы».', date },
      options: ['На следующий год — точно'],
      pick: () => { p.examYear = y + 1; h.done(); },
    });
  }
}

/** The season's end has Timur leave for Ufa (the box holds what the trip needs): the last drive with the grandfather. */
export const finaleGoes = (p: Profile): boolean => p.money >= GOAL;

/**
 * The last morning, the mirror of the first (docs/season-1998.md): Timur drives the van into
 * Klyuchevsk one last time, to the Ufa bus at the post office, and now the grandfather rides beside
 * him to see him off. Өләсәй's word in the yard, his question, and what he says on the way.
 */
export const DEPARTURE = {
  send: 'Беляши в пакете, деньги — в мешочке, на резинке, под рубашку. Как доедешь — позвони. С почты, Зинаида пустит.',
  ask: 'Ну что, студент. Последний раз за руль — довезёшь деда до автобуса? Только теперь автобус твой, а я — пассажир.',
  hint: 'Последний рейс: до почты в Ключевске — автобус на Уфу идёт от неё. Встань у дверей и затяни ручник.',
  lines: [
    'Ну вот. В мае я тебя учил, где тут передний мост. А теперь ты меня везёшь — и не трясёшь. Выучился.',
    'Нина Петровна вчера пирожков передала. Говорит — студенту. Я одну съел. Для проверки — как Митяй.',
    'В Уфе не робей. Город большой, а люди те же: кто-то письма ждёт, кто-то пенсию. Ты их теперь всех знаешь.',
    'Кузьмину у поста посигналь. Он тебя за всё лето ни разу всерьёз не прижал — значит, ты в меня.',
    'Деньги — у өләсәй в мешочке, на резинке. Не в чемодан. Чемодан — для беляшей.',
    'Тридцать лет я этой дорогой ездил. А ты за два месяца её всю узнал. Не гони, улым. Последний раз — не гони.',
  ],
};

/** The season's figures, then the credits, then `done`. */
function finish(p: Profile, h: SummerHooks, ch: string, date: string, step: number, n: number): void {
  const mityaiWon = p.cases?.['mityai-ram'] === 'done';
  const letterDelivered = p.letters?.done?.includes('galiya');
  const muhaStatus = p.muha?.ending === 'quit' ? 'завязал с Лысым и грузит почту' : p.muha?.ending === 'north' ? 'уехал на вахту в Сургут' : p.muha?.ending === 'jailed' ? 'попал под суд' : 'всё так же у магазина';
  const text = [
    `Отработано: ${SEASON_DAYS} рабочих дней за май и июнь — дожди, грозы, черёмуховые холода и первая жара.`,
    `Копилка: ${rub(p.money)} — ${p.exams === 'passed' ? 'поступил в институт, на комнату в Уфе отложено' : 'поступление отложено на год'}.`,
    `Доверие района: ${p.trust} %.`,
    `Дед Митяй: ${mityaiWon ? 'выиграл барана Чемпиона на Сабантуе' : 'рыбачит на Кайынкуле'}.`,
    `Друг Муха: ${muhaStatus}.`,
    `Письмо 1979 года: ${letterDelivered ? 'донесено матери Галии спустя девятнадцать лет' : 'осталось в шкафу'}.`,
    `Пост ГАИ: встреч с Кузьминым — ${p.gai?.met ?? 0}, предупреждений — ${p.gai?.warned ?? 0}.`,
  ].join('\n\n');
  h.page(ch, text, {
    title: 'Итоги сезона', step: [step, n],
    image: { id: 'piggy', brief: 'Копилка, стопка путевых листов за май и июнь и дедов блокнот с пометками.', date },
    options: ['Титры'],
    pick: () => h.page(ch, '«Сельская почта»\n\nСоздано с любовью к башкирской деревне, старой доброй буханке и концу девяностых.\n\nСпасибо за бережное отношение к людям, письмам и машине. Зима — в следующем сезоне.', {
      title: 'Конец первого сезона', step: [n, n],
      image: { id: 'farewell', brief: 'Июньское утро над Ключевским районом, мокрая после грозы лента дороги уходит вдаль.', date },
      options: ['Продолжить службу'],
      pick: () => { p.seasonFinale = true; h.done(); },
    }),
  });
}

const CH = 'Конец сезона · Июнь 1998';

/**
 * The evening after the last run, on the bench at the gate. With the box full, `drive` (the last
 * morning: the grandfather in the passenger seat, the van to the bus, `playDeparture` at the door);
 * short of it — «не хватило», the grandfather's «на следующий год», the figures, the credits.
 */
export function playFinaleEvening(p: Profile, h: SummerHooks, drive: () => void): void {
  const date = '’98 6 29';
  const go = finaleGoes(p);
  h.page(CH, 'Вечер после последнего рейса. Солнце садится за ельник, синий борт буханки во дворе — в багрянец. Картатай долго молчит на лавке у ворот, положив ладони на набалдашник палки.', {
    title: 'Вечер у ворот', step: go ? undefined : [1, 5], speaker: 'Картатай',
    image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай на лавке у ворот дома №14 в Урманлы, тёплый июньский закат, палка между колен.', date },
    options: go ? ['«Завтра довезу тебя до почты, картатай. Последний раз»'] : ['Посидеть рядом'],
    pick: () => {
      if (go) { drive(); return; }
      h.page(CH, `В копилке — ${rub(p.money)}. До полутора миллионов не хватает ${rub(GOAL - p.money)}: на дорогу, экзамены и комнату в Уфе не выйдет.`, {
        title: 'Не хватило', step: [2, 5], image: { id: 'piggy', brief: 'Жестяная банка с купюрами на клеёнке, тетрадка с подсчётами «до Уфы».', date },
        pick: () => h.page(CH, 'Ничего, улым. Год — не срок. Я в твои годы тоже не поехал — и ничего, тридцать лет почту носил. Но ты — поедешь. На следующий год поедешь. Я сказал.', {
          title: 'На следующий год', step: [3, 5], speaker: 'Картатай', image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай на лавке у калитки, вечер, палка между колен.', date },
          options: ['На следующий год, картатай'],
          pick: () => { p.exams = 'next'; p.examYear = 1999; finish(p, h, CH, date, 4, 5); },
        }),
      });
    },
  });
}

/**
 * At the post office door after the last drive: the keys go back to the grandfather (where they
 * came from in May), the Ufa bus, the exams, the call home; the figures and the credits.
 */
export function playDeparture(p: Profile, h: SummerHooks): void {
  const date = '’98 7 1';
  const n = 6;
  h.page(CH, 'Тимур глушит мотор и минуту сидит молча, руки на руле. Потом снимает с замка связку ключей — с почтовым рожком на брелоке, той самой, что дала Зинаида Павловна в мае, — и кладёт деду в ладонь. «Держи, картатай. Возвращаю». Дед сжимает кулак: «Принимаю. Временно — до сентября. Потом опять твои. Я сказал».', {
    title: 'Ключи', step: [1, n], speaker: 'Картатай',
    image: { id: 'keys', brief: 'Кабина буханки у почты в Ключевске: загорелая молодая рука кладёт связку ключей с почтовым рожком в морщинистую ладонь деда; за лобовым стеклом — крыльцо почты.', date },
    options: ['Отдать ключи'],
    pick: () => h.page(CH, 'Автобус на Уфу подходит к почте в десять — как тогда, в мае, только теперь уезжает внук. Зинаида Павловна выходит на крыльцо с конвертом «на дорогу». Картатай стоит у буханки, ключи в кулаке, и машет палкой, пока автобус не скроется за поворотом.', {
      title: 'Отъезд', step: [2, n],
      image: { id: 'ufa-bus', brief: 'Почта в Ключевске, июльское утро после дождя: автобус на Уфу у крыльца, Зинаида Павловна с конвертом, картатай с палкой и ключами у синей с жёлтым буханки.', date },
      options: ['В автобус'],
      pick: () => h.page(CH, 'Июль. Общежитие, койка у окна, сосед из Стерлитамака. Сочинение, математика, физика. На стенде у деканата — длинный список. Тимур читает его снизу вверх — и находит себя.', {
        title: 'Экзамены', step: [3, n], image: { id: 'exam', brief: 'Коридор института в Уфе: абитуриенты у стенда со списками, Тимур ведёт пальцем по фамилиям.', date: '’98 7 24' },
        pick: () => h.page(CH, 'Поступил?.. Ну. Я знал. Деньги на комнату — не трать на ерунду. А пока приезжай: ключи у меня, а возить почту мне врачи не велят. До сентября — твоя буханка. Я сказал.', {
          title: 'Звонок домой', step: [4, n], speaker: 'Картатай', image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай у телефона в отделении связи, ключи от буханки на стойке рядом, улыбается в усы.', date: '’98 7 24' },
          options: ['Приеду, картатай'],
          pick: () => { p.money -= GOAL; p.exams = 'passed'; p.examYear = 1999; finish(p, h, CH, date, 5, n); },
        }),
      }),
    }),
  });
}
