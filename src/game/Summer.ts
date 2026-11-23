import { aliaMemory } from './AliaStory';
import type { StoryImage } from '../ui/storyArt';
import { SEASON_DAYS } from './Career';
import type { Profile } from './Profile';

/** A shared drive ends the temporary posting, irrespective of money or district trust. */
export interface SummerHooks {
  page(eyebrow: string, text: string, opts?: { title?: string; speaker?: string; options?: string[]; pick?: (i: number) => void; image?: StoryImage; step?: [number, number] }): void;
  done(): void;
}
export function seasonFinaleDue(p: Profile, day: number): boolean {
  return day > SEASON_DAYS && !p.seasonFinale;
}
/** Grandpa is still beside Timur, but no longer teaches him. */
export const DEPARTURE = {
  send: 'Пирожки на сиденье, Зинаиде передадите. И сами поешьте. Урал, не командуй всю дорогу — он уже сам знает.',
  ask: 'Ну что, улым, свозишь меня на почту? Соскучился. За руль не полезу, не бойся.',
  hint: 'С картатаем до почты · встаньте у дверей и затяните ручник.',
  lines: [
    'Нюра вчера спрашивала, когда ты поедешь. Раньше у меня расписание узнавала. Теперь у тебя своё.',
    'Я у Хадии всё собирался тебе позвонить: там объезд, тут колея… Потом думаю — сам уже видел.',
    'Зинаида звонила. Я спрашиваю: как там внук? А она: у него спроси, он теперь ездит.',
    'Соскучился по этой дороге. В санатории дорожки ровные, а идти по ним некуда.',
    'У почты припаркуйся, где тебе удобно. Я рядом посижу.',
  ],
};
function finish(p: Profile, h: SummerHooks): void {
  const notes = ['За эти недели в дедовом блокноте появились пометки рукой Тимура.'];
  if (p.cases?.['mityai-ram'] === 'done') notes.push('Митяй до сих пор рассказывает, как Чемпион ехал в почтовом вездеходе. С каждым разом баран становится крупнее.');
  else if (p.cases?.['mityai-seedlings'] === 'done') notes.push('Нюра обещала первые помидоры Тимуру: рассаду он довёз, теперь пусть приезжает пробовать.');
  if (p.cases?.birth === 'done') notes.push('У Рината и Зульфии теперь тихо не бывает. На улице Ринат здоровается издалека, обеими руками.');
  else if (p.cases?.birth === 'refused') notes.push('Ринат при встрече здоровается коротко. Ту утреннюю поездку на тракторе он ещё помнит.');
  const neighbour = aliaMemory(p.alia);
  if (neighbour) notes.push(neighbour);
  const muha = p.muha?.ending;
  if (muha === 'quit') notes.push('Муха теперь помогает грузить почту. Первый мешок поднял и сказал: «А они у вас тяжёлые».');
  else if (muha === 'north') notes.push('Муха уехал на вахту в Сургут. Обещал написать — теперь Тимур знает, сколько такое письмо бывает в пути.');
  else if (muha === 'jailed') notes.push('Мухи у магазина больше нет. Дело дошло до суда; дома о нём говорят вполголоса.');
  else if (p.muha) notes.push('Муха всё ещё появляется у магазина. Их разговор ещё не закончен.');
  if (p.letters?.done.includes('galiya')) notes.push('Письмо 1979 года дошло до матери Галии. Однажды вечером картатай сам заговорил о нём.');
  else if (p.letters?.done.length) notes.push('Несколько старых писем наконец нашли своих адресатов. В шкафу ещё остались конверты.');
  h.page('Конец сезона · Июнь 1998', notes.join('\n\n'), {
    title: 'Знакомые адреса', options: ['Дальше'],
    pick: () => h.page('Сельская почта', 'Первый сезон окончен.\n\nСпасибо, что проехали эту дорогу. Можно продолжить службу: знакомые адреса, новые дни и истории, до которых ещё не добрались.', {
      title: 'Дорога домой', options: ['Продолжить службу'],
      pick: () => { p.seasonFinale = true; h.done(); },
    }),
  });
}
export function playFinaleEvening(_p: Profile, h: SummerHooks, drive: () => void): void {
  h.page('Конец июня · Урманлы', 'Картатай сидит на лавке у ворот. Из открытого гаража пахнет маслом, в доме звенит посуда. «Завтра на почту собираешься? Возьми меня с собой. Зинаиду повидаю. А то вернулся — всё до конца месяца отдыхай да отдыхай».', {
    title: 'Вечер у ворот', options: ['Утром поедем, картатай'], pick: drive,
  });
}
export function playDeparture(p: Profile, h: SummerHooks): void {
  h.page('Ключевск · Отделение связи', 'Тимур глушит мотор. Дед тянется к блокноту на панели, листает — между его строчками новые: «объезд после дождя», «калитка сбоку». Закрывает и кладёт обратно. «Пусть пока у тебя лежит».', {
    title: 'Дедов блокнот', options: ['Выйти к почте'],
    pick: () => h.page('Ключевск · Отделение связи', 'Зинаида Павловна выходит на крыльцо: «Урал-агай! Наконец-то. Чайник поставила». Потом поворачивается к Тимуру: «И ты заходи. Нина Петровна тебе пакет оставила». Дед придерживает дверь, пропуская внука вперёд.', {
      title: 'Свои люди', options: ['Зайти вместе'], pick: () => finish(p, h),
    }),
  });
}
