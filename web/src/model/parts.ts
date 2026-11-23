import type { Part } from './types.ts';
import { uid } from './types.ts';

/** Distinct, readable on white paper, and distinguishable from each other. */
export const PART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2',
  '#c026d3', '#65a30d', '#b45309', '#4f46e5', '#e11d48', '#0d9488',
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
