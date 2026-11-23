import type { SceneBeat } from './StoryScene';

/** All camera positions are in room space, east of the Zinaida–visitors dialogue axis.
 * Hard cuts change size; only the master has a very small push. No drifting across furniture. */
export const HIRING_SHOTS = {
  master: { title: 'Трое у стола', eye: [1.65, 1.63, -2.12], target: [-1.47, 1.1, .35], fov: 49 },
  pair: { title: 'Тимур и картатай', eye: [-.12, 1.42, 1.55], target: [-1.51, 1.2, -.47], fov: 49 },
  zinaida: { title: 'Зинаида — средний', eye: [-.08, 1.49, -.73], target: [-1.45, 1.16, 1.3], fov: 39 },
  timur: { title: 'Ответ Тимура', eye: [-.15, 1.58, 1.34], target: [-1.05, 1.5, -.4], fov: 35 },
  grandpa: { title: 'Реакция деда', eye: [-.2, 1.25, .72], target: [-2.02, 1.06, -.55], fov: 36 },
  paper: { title: 'Подпись и путевой лист', eye: [-.38, 1.55, .62], target: [-1.4, .81, .26], fov: 34 },
} as const;
export type HiringShot = keyof typeof HIRING_SHOTS;

/** Draft staging dialogue. The player signs once; only the final beat starts the first route.
 * Grandpa sits beside Timur throughout, and waits for the bus after the scene. */
export const HIRING_BEATS: Record<string, SceneBeat> = {
  establish: { shot: 'master', pose: 'settle', seconds: 2.8, next: 'introduce' },
  introduce: { shot: 'pair', speaker: 'Картатай',
    line: 'Вот, Зинаида Павловна, смену привёз. Сам доехал. Дорогу показал ему.', next: 'welcome' },
  welcome: { shot: 'zinaida', speaker: 'Зинаида Павловна',
    line: 'Ну, Тимур. Урал-агай за тебя поручился, а я его тридцать лет знаю. Подменить его больше некому. Возьмём тебя пока водителем. Зарплата небольшая, по ведомости. Бензин и ремонт — через почту.', next: 'reply' },
  reply: { shot: 'timur', speaker: 'Тимур', line: 'Спасибо, Зинаида Павловна. Не подведу.', next: 'look' },
  look: { shot: 'grandpa', pose: 'proud', seconds: 2.2, next: 'rules' },
  rules: { shot: 'zinaida', speaker: 'Зинаида Павловна',
    line: 'Утром — за путевым листом, вечером — ко мне с отчётом. Если задержишься, позвони из сельсовета. Почту без присмотра не оставляй.', next: 'offer' },
  offer: { shot: 'master', pose: 'offer', speaker: 'Зинаида Павловна',
    line: 'Заявление твоё у меня. Вот здесь распишись. И первый путевой лист — держи.',
    choices: [{ text: 'Расписаться и взять путевой лист', next: 'sign' }] },
  sign: { shot: 'paper', pose: 'sign', seconds: 4.5, next: 'take' },
  take: { shot: 'master', pose: 'take', seconds: 2.6, next: 'notebook' },
  notebook: { shot: 'pair', pose: 'notebook', speaker: 'Картатай',
    line: 'И блокнот мой возьми. Тут адреса, где собака злая, кому пенсию — в руки. Тридцать лет писал. Теперь твой.', next: 'thanks' },
  thanks: { shot: 'timur', pose: 'holding', speaker: 'Тимур', line: 'Разберусь, картатай. Ты отдыхай.', next: 'farewell' },
  farewell: { shot: 'pair', pose: 'holding', speaker: 'Картатай',
    line: 'Автобус в десять. Я пока у Зинаиды чаю попью. Ты не жди — почта ждать не будет. Машину береги, людей уважай.', next: 'send' },
  send: { shot: 'zinaida', pose: 'holding', speaker: 'Зинаида Павловна',
    line: 'Мешки за той дверью. Сверишь по листу — и с Богом.', next: 'end' },
  end: { shot: 'master', pose: 'holding', seconds: 2.5 },
};
