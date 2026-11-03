import type { StoryImage } from '../ui/storyArt';
import { rub } from './Money';
import { GOAL } from './Career';
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
