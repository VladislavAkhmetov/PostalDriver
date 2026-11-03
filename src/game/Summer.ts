import type { StoryImage } from '../ui/storyArt';
import { rub } from './Money';
import { GOAL, SEASON_DAYS } from './Career';
import type { Profile } from './Profile';

/**
 * The summer the service was for (docs/design.md, «Завязка»): in July Timur goes to Ufa for the
 * entrance exams — if the money box holds the three million. Told as the prologue is, on the
 * album's pages. If it doesn't, the grandfather: «на следующий год — поедешь», and the box waits
 * for the next July. Either way the service goes on after (the post needs a driver in summer).
 */
export interface SummerHooks {
  page(eyebrow: string, text: string, opts?: { title?: string; speaker?: string; options?: string[]; pick?: (i: number) => void; image?: StoryImage; step?: [number, number] }): void;
  done(): void;
}

/** Whether this working day (by its date) is the one the summer's pages come before. */
export function summerDue(p: Profile, y: number, m: number): boolean {
  return p.exams !== 'passed' && m >= 6 && m <= 7 && y >= (p.examYear ?? 1998);
}

/** Whether the grand season 1 finale is due (after completing day 29, before day 30). */
export function seasonFinaleDue(p: Profile, day: number): boolean {
  return day >= SEASON_DAYS && !p.seasonFinale;
}

export function playSummer(p: Profile, y: number, h: SummerHooks): void {
  const ch = `Лето ${y}`;
  const date = `’${String(y).slice(2)} 7 1`;
  if (p.money >= GOAL) {
    h.page(ch, 'Июль. Копилка — три миллиона, пересчитанные трижды. Өләсәй сунула пакет с беляшами, әсәй — конверт «на непредвиденное», картатай — ничего, только крепко пожал руку.', {
      title: 'Уфа', step: [1, 3], image: { id: 'ufa-bus', brief: 'Автостанция Ключевска, утро: автобус на Уфу, өләсәй с пакетом беляшей, әсәй машет, картатай с палкой чуть в стороне.', date },
      pick: () => h.page(ch, 'Неделя в общаге. Сочинение, математика, физика. На стенде у деканата — длинный список. Тимур читает его снизу вверх — и находит себя.', {
        title: 'Экзамены', step: [2, 3], image: { id: 'exam', brief: 'Коридор института в Уфе: абитуриенты у стенда со списками, Тимур ведёт пальцем по фамилиям.', date },
        pick: () => h.page(ch, 'Поступил?.. Ну. Я знал. Только почта без тебя до сентября не проживёт — Зинаида уже звонила. Приезжай на лето. А осенью — учиться. Я сказал.', {
          title: 'Звонок домой', step: [3, 3], speaker: 'Картатай', image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай у телефона в отделении связи, трубка в руке, улыбается в усы.', date },
          options: ['Приеду, картатай'],
          pick: () => { p.money -= GOAL; p.exams = 'passed'; p.examYear = y + 1; h.done(); },
        }),
      }),
    });
  } else {
    h.page(ch, `Июль. В копилке — ${rub(p.money)}. До трёх миллионов не хватает ${rub(GOAL - p.money)}: на дорогу, общагу и экзамены не выйдет.`, {
      title: 'Не хватило', step: [1, 2], image: { id: 'piggy', brief: 'Жестяная банка с купюрами на клеёнке, тетрадка с подсчётами «до Уфы».', date },
      pick: () => h.page(ch, 'Ничего, улым. Год — не срок. Я в твои годы тоже не поехал — и ничего, тридцать лет почту носил. Но ты — поедешь. На следующий год поедешь. Я сказал.', {
        title: 'На следующий год', step: [2, 2], speaker: 'Картатай', image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай на лавке у калитки, вечер, палка между колен.', date },
        options: ['На следующий год, картатай'],
        pick: () => { p.exams = 'next'; p.examYear = y + 1; h.done(); },
      }),
    });
  }
}

/**
 * The Grand Finale of Season 1 (after the 29th working day):
 * 1. Evening talk with картатай on the bench in Urmanly.
 * 2. Handing over the Bukhanka keys (to reformed Muha or back to Zinaida).
 * 3. Season 1 summary statistics.
 * 4. End credits and transition to endless summer service.
 */
export function playSeasonFinale(p: Profile, h: SummerHooks): void {
  const ch = 'Финал 1-го сезона · Июль 1998';
  const date = '’98 7 20';

  // 1. Evening with grandfather
  h.page(ch, 'Вечер на Лесной улице в Урманлы. Солнце садится за ельник, окрашивая синий борт буханки в багрянец. Картатай долго молчит на лавке, положив ладони на набалдашник палки.', {
    title: 'Вечер у ворот', step: [1, 4], speaker: 'Картатай',
    image: { id: 'kartatay', portrait: true, brief: 'Урал-картатай на лавке у ворот дома №14, теплый закат, палка между колен, мудрый добрый взгляд.', date },
    options: ['Посидеть рядом', '«Службу закончил, картатай»'],
    pick: () => {
      // 2. Handing over the keys
      const muhaReformed = p.muha?.ending === 'quit';
      const keyLine = muhaReformed
        ? 'У крыльца отделения связи стоит Женька Муха в синем рабочем халате грузчика. Принимает из рук Тимура связку ключей от УАЗа и смущенно крутит брелок с почтовым рожком: «Тимурка... Ты это... учись там в Уфе. За буханку не переживай — я её каждую субботу шприцевать буду. И Кузьмину — ни копейки, как дед велел. Счастливо, брат!»'
        : 'У дверей почты Зинаида Павловна забирает связку ключей: «Спасибо тебе за деда и за нас, Тимур. Сменщика из райцентра пришлют к августу. Ступай, учись, людям помогай. И пиши нам — мы же почта, любое письмо дойдёт!»';

      h.page(ch, keyLine, {
        title: 'Смена', step: [2, 4],
        speaker: muhaReformed ? 'Женька Муха' : 'Зинаида Павловна',
        image: { id: muhaReformed ? 'muha' : 'zinaida', portrait: true, brief: muhaReformed ? 'Муха на крыльце почты с ключами от буханки.' : 'Зинаида Павловна на крыльце с ключами.', date },
        options: ['Обнять на прощание', '«Машину берегите»'],
        pick: () => {
          // 3. Stats summary
          const mityaiWon = p.cases?.['mityai-ram'] === 'done';
          const letterDelivered = p.letters?.done?.includes('galiya');
          const muhaStatus = p.muha?.ending === 'quit' ? 'завязал с бандитами и работает на почте' : p.muha?.ending === 'north' ? 'уехал на вахту в Сургут' : 'попал под суд';
          const statsText = [
            `Отработано смен: 29 рабочих дней (осень, первый снег, зима, распутица, весна, лето).`,
            `В копилке: ${rub(p.money)} (${p.exams === 'passed' ? 'экзамены сданы, поступил в институт!' : 'поступление отложено на год'}).`,
            `Доверие района: ${p.trust} %.`,
            `Дед Митяй: ${mityaiWon ? 'выиграл барана Чемпиона на Сабантуе' : 'рыбачит на Кайынкуле'}.`,
            `Друг Муха: ${muhaStatus}.`,
            `Письмо 1979 года: ${letterDelivered ? 'донесено матери Галии спустя 19 лет' : 'осталось в шкафу'}.`,
            `Пост ГАИ: встреч с Кузьминым — ${p.gai?.met ?? 0}, предупреждений — ${p.gai?.warned ?? 0}.`,
          ].join('\n\n');

          h.page(ch, statsText, {
            title: 'Итоги года (1997–1998)', step: [3, 4],
            image: { id: 'piggy', brief: 'Копилка, путевые листы и старый блокнот деда с пометками за весь прошедший год.', date },
            options: ['Титры'],
            pick: () => {
              // 4. Credits & free play
              h.page(ch, '«Сельская почта» (Uaz-Zarechye)\n\nСоздано с любовью к башкирской деревне, советскому автопрому и эпохе конца 90-х годов.\n\nСпасибо за бережное отношение к людям, письмам и старой доброй «Буханке»!', {
                title: 'Конец первого сезона', step: [4, 4],
                image: { id: 'farewell', brief: 'Утренний пейзаж Ключевского района, уходящая вдаль лента дороги.', date },
                options: ['Продолжить службу (Свободное лето)'],
                pick: () => {
                  p.seasonFinale = true;
                  h.done();
                },
              });
            },
          });
        },
      });
    },
  });
}
