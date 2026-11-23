import type { Part } from './types.ts';
import { uid } from './types.ts';

/**
 * Player colors: the IBM Carbon categorical palette (the design system that
 * pairs with IBM Plex). It's built for data with many categories: the order
 * maximizes the difference between neighbors, every color is readable as a
 * bar, dot or tint on white, and it was checked for common color-vision
 * deficiencies. Partwise's own UI colors stay out of this range so a player
 * color is never confused with a status color.
 */
export const PART_COLORS = [
  '#6929c4', // purple 70
  '#1192e8', // cyan 50
  '#005d5d', // teal 70
  '#9f1853', // magenta 70
  '#fa4d56', // red 50
  '#198038', // green 60
  '#002d9c', // blue 80
  '#ee538b', // magenta 50
  '#b28600', // yellow 50
  '#009d9a', // teal 50
  '#8a3800', // orange 70
  '#a56eff', // purple 50
];

const GRAND_STAFF = /\b(piano|pno|harp|celesta|cembalo|harpsichord|keyboard|marimba)\b/i;
const ORGAN = /\borgan\b/i;
// Timpani are written on a 5-line staff, so they aren't treated as percussion lines.
const PERCUSSION = /\b(perc|percussion|drum|drums|snare|cymbals?|triangle|tambourine|woodblock|bass drum|toms?)\b/i;

/** Sensible defaults from an instrument name. */
export function guessPartShape(name: string): Pick<Part, 'staffCount' | 'percussion'> {
  if (ORGAN.test(name)) return { staffCount: 3, percussion: false };
  if (GRAND_STAFF.test(name)) return { staffCount: 2, percussion: false };
  return { staffCount: 1, percussion: PERCUSSION.test(name) };
}

export function makePart(name: string, index: number): Part {
  return { id: uid(), name, color: PART_COLORS[index % PART_COLORS.length], ...guessPartShape(name) };
}

export function partsFromNames(names: string[]): Part[] {
  return names.map((name) => name.trim()).filter(Boolean).map(makePart);
}

/** Common instrument names, for suggestions while typing. */
export const INSTRUMENTS = [
  'Piccolo', 'Flute', 'Flute 1', 'Flute 2', 'Alto Flute', 'Oboe', 'Oboe 1', 'Oboe 2', 'English Horn',
  'Clarinet in B♭', 'Clarinet 1', 'Clarinet 2', 'Clarinet in A', 'E♭ Clarinet', 'Bass Clarinet',
  'Bassoon', 'Bassoon 1', 'Bassoon 2', 'Contrabassoon',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Horn', 'Horn 1', 'Horn 2', 'Horn 3', 'Horn 4', 'Trumpet', 'Trumpet 1', 'Trumpet 2', 'Trumpet 3', 'Cornet',
  'Flugelhorn', 'Trombone', 'Trombone 1', 'Trombone 2', 'Bass Trombone', 'Euphonium', 'Baritone', 'Tuba',
  'Timpani', 'Percussion', 'Snare Drum', 'Bass Drum', 'Cymbals', 'Drum Set', 'Glockenspiel', 'Xylophone',
  'Vibraphone', 'Marimba', 'Chimes',
  'Harp', 'Piano', 'Celesta', 'Harpsichord', 'Organ', 'Guitar', 'Bass Guitar',
  'Soprano', 'Alto', 'Tenor', 'Bass', 'Voice',
  'Violin', 'Violin I', 'Violin II', 'Viola', 'Cello', 'Double Bass', 'Contrabass',
];

export const PRESETS: { name: string; parts: string[] }[] = [
  { name: 'String quartet', parts: ['Violin I', 'Violin II', 'Viola', 'Cello'] },
  { name: 'Piano trio', parts: ['Violin', 'Cello', 'Piano'] },
  { name: 'Choir (SATB) + piano', parts: ['Soprano', 'Alto', 'Tenor', 'Bass', 'Piano'] },
  { name: 'Woodwind quintet', parts: ['Flute', 'Oboe', 'Clarinet', 'Horn', 'Bassoon'] },
  { name: 'Brass quintet', parts: ['Trumpet 1', 'Trumpet 2', 'Horn', 'Trombone', 'Tuba'] },
  {
    name: 'Orchestra',
    parts: ['Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Horn', 'Trumpet', 'Trombone', 'Timpani', 'Violin I', 'Violin II', 'Viola', 'Cello', 'Bass'],
  },
  {
    name: 'Concert band',
    parts: [
      'Flute', 'Oboe', 'Clarinet 1', 'Clarinet 2', 'Bass Clarinet', 'Bassoon', 'Alto Sax', 'Tenor Sax', 'Bari Sax',
      'Trumpet 1', 'Trumpet 2', 'Horn', 'Trombone', 'Euphonium', 'Tuba', 'Percussion',
    ],
  },
];
