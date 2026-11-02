import dni from '../assets/radio/dni-skvoz-dozhd.mp3?url';
import kraya from '../assets/radio/dalnie-kraya.mp3?url';
import smysl from '../assets/radio/gde-smysl.mp3?url';
import yamgyr from '../assets/radio/kozge-yamgyr.mp3?url';
import firstSheet from '../assets/radio/pervyi-chistyi-list.mp3?url';

/**
 * The dial of the van's radio, GTA-style: channels, each a continuous broadcast. Tuning away and
 * back finds the programme where it has got to, not where you left it. For now there is one
 * station on the dial; the static channels are kept below, off the dial, for the stations to come.
 */
export interface Track { title: string; url: string; seconds: number }
export interface Channel {
  id: string;
  freq: string;
  name: string;
  /** Looped programme; an empty list is dead air. */
  tracks: Track[];
  /** What the empty channels sound like. */
  noise: 'hiss' | 'whistle' | 'buzz';
}

/**
 * Songs the station puts on for a moment of the story, outside its programme (Tape.cue): «Первый
 * чистый лист» as the first route begins, the grandfather left on the post office porch.
 */
export const FIRST_SHEET: Track = { title: 'Первый чистый лист', url: firstSheet, seconds: 146.68 };

/** Off the dial until they have something on them. */
export const DEAD_CHANNELS: Channel[] = [
  { id: 'dead-1', freq: '94,3', name: 'Помехи', tracks: [], noise: 'whistle' },
  { id: 'dead-2', freq: '88,6', name: 'Помехи', tracks: [], noise: 'buzz' },
];

export const CHANNELS: Channel[] = [
  {
    id: 'zarechye', freq: '101,7', name: 'Радио «Заречье»', noise: 'hiss',
    tracks: [
      { title: 'Дни сквозь дождь', url: dni, seconds: 232.83 },
      { title: 'Где смысл?', url: smysl, seconds: 114.84 },
      { title: 'Дальние края', url: kraya, seconds: 154.83 },
      { title: 'Көҙгө ямғыр', url: yamgyr, seconds: 179.95 },
    ],
  },
];
