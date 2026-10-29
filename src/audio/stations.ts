/**
 * FM stations on the van's radio. Shared by the deck (browser) and the dev
 * server's same-origin relay (vite.config.ts), which streams them as
 * /radio/<id> so the preview's page policy and CORS can't silence them.
 */
export interface Station { id: string; name: string; freq: string; url: string }

export const STATIONS: Station[] = [
  // Russian rock of the 80s–90s first: Кино, ДДТ, Алиса, Наутилус, Чайф, Аквариум
  { id: 'nashe-classic', name: 'Наше Классика · русский рок', freq: '87,5', url: 'https://nashe1.hostingradio.ru/nasheclassic.mp3' },
  { id: 'nashe', name: 'Наше Радио', freq: '101,7', url: 'https://nashe1.hostingradio.ru/nashe-128.mp3' },
  { id: 'sd90', name: 'Супердискотека 90-х', freq: '90,9', url: 'https://radiorecord.hostingradio.ru/sd9096.aacp' },
  { id: 'russian-gold', name: 'Russian Gold', freq: '96,4', url: 'https://radiorecord.hostingradio.ru/russiangold96.aacp' },
  { id: 'gop', name: 'Гоп FM', freq: '88,3', url: 'https://radiorecord.hostingradio.ru/gop96.aacp' },
  { id: 'russian-hits', name: 'Russian Hits', freq: '104,2', url: 'https://radiorecord.hostingradio.ru/russianhits96.aacp' },
];
