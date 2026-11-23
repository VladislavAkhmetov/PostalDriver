/** Optional acquaintance, May–June 1998. All affection is between the adult neighbours. */
export const ALIA = 'Алия';
export type AliaShift = 'morning' | 'evening';
export interface AliaState {
  rides: number;
  interest: number;
  lastDay: number;
  letters: 'none' | 'friendly' | 'personal';
}
export const ALIA_SHIFTS: Readonly<Record<number, AliaShift>> = {
  3:'morning', 4:'evening', 7:'morning', 9:'evening', 10:'morning', 13:'evening', 16:'morning', 18:'evening',
};
export function readAlia(raw?: Partial<AliaState> | null): AliaState {
  const count = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  return { rides:count(raw?.rides,8), interest:count(raw?.interest,4), lastDay:count(raw?.lastDay,18),
    letters:raw?.letters === 'personal' || raw?.letters === 'friendly' ? raw.letters : 'none' };
}
export function aliaShift(day: number, raw?: AliaState): AliaShift | null {
  return readAlia(raw).lastDay === day ? null : ALIA_SHIFTS[day] ?? null;
}
interface Answer { text: string; reply: string; flirt?: boolean; letters?: AliaState['letters'] }
export interface AliaScene { pickup: string; chatter: string; arrival: string; answers: Answer[] }
export function aliaScene(raw: AliaState, shift: AliaShift): AliaScene {
  const s = readAlia(raw);
  const where = shift === 'morning' ? 'До Ключевска подбросишь? Я в магазине теперь работаю, возле почты.' : 'Домой едешь? Можно с тобой до наших ворот?';
  const pickup = s.rides === 0 ? `Привет, Тимур. Я Алия, мы через несколько домов живём. ${where}` : `${s.rides > 2 ? 'Привет, почта.' : 'Привет, Тимур.'} ${where}`;
  const scenes: Omit<AliaScene, 'pickup'>[] = [
    { chatter:'Ты когда в армию уходил, мне шестнадцать было. Всё «мелкая, отойди». Восемнадцать уже, если что. Можно просто Алия.',
      arrival:'Приехали. Спасибо. Ты меня у ворот сначала не узнал, да?',
      answers:[{text:'Узнал. Просто растерялся немного.',reply:'Ты? Ну надо же. Ладно, в следующий раз буду предупреждать, что это я.',flirt:true},
        {text:'Не сразу, прости. Давно не виделись.',reply:'Два года — не два дня. Я тебя тоже без формы не сразу узнала.'}] },
    { chatter:'Я в прошлом году собиралась в медицинский. Бабушка ногу сломала, мама на сменах — осталась с ней. Пока смогла сама ходить, поступление уже прошло.',
      arrival:'Теперь бабушка по соседям бегает, а я биологию заново учу. В июле поеду в Уфу. В этот раз точно.',
      answers:[{text:'Буду держать за тебя кулаки.',reply:'Спасибо. Только не за рулём, пожалуйста. Мне ещё до июля дожить.'},
        {text:'На кого хочешь учиться?',reply:'На врача. Дальше пока не загадываю. Мне сначала поступить — потом уже всех лечить.'}] },
    { chatter:'Сегодня покупатель спросил, свежие ли у нас батарейки. Я сказала: утреннего надоя. Начальница услышала. Теперь до конца недели молчу.',
      arrival:'В автобусе я обычно читаю. А с тобой почему-то учебник всё в сумке лежит.',
      answers:[{text:'Мне тоже нравится с тобой разговаривать.',reply:'Тогда ладно. Одну главу я тебе так и быть прощу.',flirt:true},
        {text:'Могу помолчать, если надо готовиться.',reply:'Не надо. После смены всё равно буквы слипаются. Расскажи лучше, как день прошёл.'}] },
    { chatter:s.interest > 0 ? 'Я две булочки взяла. Одну тебе. Нет, это не плата за проезд. Просто подумала, что ты опять весь день на чае.' : 'Бабушка спрашивала, кто меня подвозит. Сказала — Урал-агаев внук. Всё, вопрос закрыт. У деда твоего пропуск в каждый двор.',
      arrival:s.interest > 0 ? 'Ты только не привыкай. Булочки у нас не каждый день хорошие.' : 'С тобой удобно ездить. И дорогу знаешь, и про экзамены каждые пять минут не спрашиваешь.',
      answers:[{text:'Кажется, я уже жду наших поездок.',reply:'Я тоже на остановке сначала почтовую машину высматриваю. Всё, теперь ты знаешь.',flirt:true},
        {text:'Хорошо, когда есть с кем поболтать по дороге.',reply:'Это точно. А то всю дорогу только автобусный мотор слушать.'}] },
    { chatter:'Документы собрала. Мама уже сумку достала, хотя до июля ещё время. Бабушка велела написать сразу, как доеду. Даже если я ей до этого позвоню.',
      arrival:s.interest > 0 ? 'Слушай… А тебе из Уфы написать? Или ты после работы на письма уже смотреть не можешь?' : 'Буду в Уфе — напишу бабушке, как устроилась. Ты уж письмо ей не потеряй, почтальон.',
      answers:[{text:'Напиши и мне. Буду ждать.',reply:'Хорошо. Только ты тоже отвечай. А то будет нечестно.',flirt:true,letters:'personal'},
        {text:'Передавай всем привет. Удачи тебе с учёбой!',reply:'Спасибо, сосед. Бабушку иногда спрашивай, как она. А она тебе всё обо мне расскажет.',letters:'friendly'}] },
  ];
  const scene = scenes[s.rides] ?? {chatter:'Бабушка опять передала, чтобы ты деду передал, чтобы он к ней зашёл. Можно было через дорогу крикнуть, но так, видимо, надёжнее.',
    arrival:'Спасибо за дорогу. До встречи, Тимур.',answers:[{text:'До встречи, Алия.',reply:'Не гони на обратном пути.'}]};
  return {pickup,...scene};
}
/** A completed trip is the only write. Replaying a day cannot farm acquaintance. */
export function completeAlia(raw: AliaState | undefined, day: number, shift: AliaShift, answer: number): AliaState {
  const s = readAlia(raw);
  if (aliaShift(day,s) !== shift) return s;
  const a = aliaScene(s,shift).answers[answer];
  if (!a) return s;
  return {...s,rides:Math.min(8,s.rides+1),lastDay:day,interest:Math.min(4,s.interest+(a.flirt?1:0)),letters:a.letters??s.letters};
}
export function aliaMemory(raw?: AliaState): string | null {
  const s = readAlia(raw);
  if (!s.rides) return null;
  if (s.letters === 'personal' && s.interest >= 2)
    return 'Алия собирается в июле поступать в Уфу. Обещала написать Тимуру. Теперь среди почты будет письмо, которого ждёт он сам.';
  if (s.letters === 'personal') return 'Алия собирается поступать в Уфу и обещала написать Тимуру, как пройдут экзамены. Он пожелал ей удачи и обещал ответить.';
  if (s.rides >= 3) return 'Алия собирается поступать в Уфу. За поездками до магазина и обратно они с Тимуром успели подружиться. Она готовится к экзаменам, он продолжает возить почту.';
  return 'Соседка Алия в июле поедет поступать в медицинский. Теперь, встречаясь в деревне, они с Тимуром останавливаются поговорить.';
}
