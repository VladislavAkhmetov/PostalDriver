/**
 * 2D portraits on the talk cards (docs/design.md, «Подача»): a passport-size photo pinned to the
 * card's corner. Files go in `src/assets/portraits/` by id (`muha.png`, `kartatay.jpg`…); until one
 * is there, the corner shows a monogram of the speaker's initials. Who is who is found from the
 * speaker's name as the game writes it («Сержант Кузьмин, ГАИ» → kuzmin).
 */
const FILES = import.meta.glob('../assets/portraits/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const WHO: [RegExp, string][] = [
  [/Муха/, 'muha'], [/Картатай|Урал-агай/, 'kartatay'], [/Зинаида/, 'zinaida'], [/Гульнара|^Әсәй/, 'esay'], [/Өләсәй/, 'olesey'],
  [/Кузьмин/, 'kuzmin'], [/Бритый/, 'brityi'], [/Пацан/, 'kid'], [/кожанке/, 'leather'], [/Серый/, 'seryi'],
  [/Нина Петровна/, 'nina'], [/Валентина/, 'valentina'], [/Степанович/, 'stepanych'], [/Галина Ивановна/, 'galina'],
  [/Фёдор/, 'fedor'], [/Рашит/, 'rashit'], [/Фарида/, 'farida'], [/Михалыч/, 'mikhalych'],
  [/Баба Шура/, 'shura'], [/Дед Митяй/, 'mityai'], [/Оля/, 'olya'], [/Петрович/, 'petrovich'], [/Тамара/, 'tamara'], [/Колька/, 'kolka'],
];

/** Speakers that are not a face: the radio, the tools under the seat. */
const FACELESS = /Радио|Под сиденьем|Колесо|Мегафон/;

export interface Face { id: string; url: string | null; initials: string }

/** The portrait for a speaker, or null for voices without a face. */
export function faceFor(speaker: string): Face | null {
  if (FACELESS.test(speaker)) return null;
  const hit = WHO.find(([re]) => re.test(speaker));
  const id = hit ? hit[1] : '';
  let url: string | null = null;
  if (id) for (const ext of ['webp', 'jpg', 'jpeg', 'png']) { url = FILES[`../assets/portraits/${id}.${ext}`] ?? null; if (url) break; }
  const name = speaker.split(',')[0].replace(/^(Сержант|Дед|Баба)\s+/, '');
  const initials = name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return { id, url, initials };
}
