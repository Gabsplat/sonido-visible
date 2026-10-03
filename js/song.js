// «Canción para lápiz»: 26 compases en La menor a 96 BPM, escrita para que cada
// parte dibuje algo distinto. Eventos: [segundo, instrumento, midi, duración (s), intensidad].

const BEAT = 60 / 96;
const at = (bar, beat = 0) => (bar * 4 + beat) * BEAT;

const ROOTS = [33, 29, 36, 31]; // La, Fa, Do, Sol (graves)
const PADS = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];

// Motivos de la melodía: [pulso, midi, pulsos de duración].
const M1 = [[0, 76, 1], [1, 74, 0.5], [1.5, 72, 0.5], [2, 69, 1], [3, 72, 0.5], [3.5, 74, 0.5]];
const M2 = [[0, 76, 0.5], [0.5, 79, 0.5], [1, 76, 1], [2, 74, 1.5], [3.5, 72, 0.5]];
const M3 = [[0, 72, 1], [1, 69, 0.5], [1.5, 67, 0.5], [2, 69, 2]];

export const SECTIONS = [
  [0, 'I. Agua quieta'],
  [3, 'II. Cordillera'],
  [9, 'III. Bandada'],
  [12, 'IV. Tormenta'],
  [18, 'V. Claro'],
  [22, 'VI. Lago'],
];

function build() {
  const ev = [];
  const add = (t, kind, midi, dur, vel = 1) => ev.push([t, kind, midi, dur, vel]);
  const motif = (bar, m, shift = 0, vel = 1) => m.forEach(([b, n, d]) => add(at(bar, b), 'mid', n + shift, d * BEAT * 0.9, vel));
  const pad = (bar, chord, bars = 1, vel = 1) => chord.forEach((n) => add(at(bar), 'pad', n, bars * 4 * BEAT, vel));
  const chirps = (t, base, n, gap = 0.09) => { for (let i = 0; i < n; i++) add(t + i * gap, 'high', base + ((i * 5) % 7), 0); };

  // I. Agua quieta (0–2): un compás de silencio (lago) y un colchón que trae nubes.
  pad(1, PADS[0], 2, 0.7);
  add(at(2, 3), 'mid', 64, BEAT, 0.6);

  // II. Cordillera (3–8): bajo y melodía.
  for (let b = 3; b < 9; b++) {
    const r = ROOTS[(b - 3) % 4];
    add(at(b), 'low', r, BEAT * 1.8);
    add(at(b, 2), 'low', r + (b % 2 ? 12 : 7), BEAT * 1.6);
    motif(b, [M1, M2, M1, M3][(b - 3) % 4]);
  }

  // III. Bandada (9–11): llamados y respuestas de pájaros sobre el colchón.
  for (let b = 9; b < 12; b++) {
    pad(b, PADS[(b - 9) % 4], 1, 0.6);
    chirps(at(b), 93, 3);
    chirps(at(b, 1.5), 88, 2, 0.12);
    chirps(at(b, 2.5), 96, 4, 0.07);
    add(at(b), 'low', ROOTS[(b - 9) % 4], BEAT * 3, 0.7);
  }

  // IV. Tormenta (12–17): lluvia, bajo picado y truenos.
  add(at(12), 'rain', 0, at(6) - BEAT * 0.5, 1);
  for (let b = 12; b < 18; b++) {
    const r = ROOTS[(b - 12) % 4];
    for (let i = 0; i < 8; i++) add(at(b, i / 2), 'low', r + (i === 6 ? 12 : 0), BEAT * 0.38, 0.9);
    if (b % 2 === 1) add(at(b), 'thunder', 0, 0, 1);
    if (b % 2 === 0) motif(b, M3, 0, 0.7);
  }

  // V. Claro (18–21): un pulso de silencio y un acorde fuerte (sol), melodía arriba.
  [33, 45, 57, 60, 64, 69, 72, 76].forEach((n) => add(at(18, 0.25), n < 50 ? 'low' : 'stab', n, BEAT * 2.5, 1));
  for (let b = 18; b < 22; b++) {
    add(at(b, 2), 'low', ROOTS[(b - 18) % 4], BEAT * 1.8, 0.8);
    motif(b, [M2, M1, M2, M3][b - 18], 12, 0.85);
    chirps(at(b, 3.5), 95, 2);
  }

  // VI. Lago (22–25): el colchón se apaga y queda el silencio.
  pad(22, PADS[0], 2, 0.6);
  pad(24, PADS[1], 1, 0.35);
  motif(22, M3, 0, 0.6);
  add(at(24), 'mid', 69, BEAT * 3, 0.4);

  SECTIONS.forEach(([b, name]) => add(at(b), 'section', 0, 0, name));
  return ev.sort((a, b) => a[0] - b[0]);
}

export const SONG = { title: 'Canción para lápiz', dur: at(26), events: build() };

// «Cumbre»: techno melódico original a 124 BPM en Re menor, 56 compases (~108 s).
// Pensada para estrenar la noche, el viento y el drop: corte sin bajo, subida y caída.
const B2 = 60 / 124;
const at2 = (bar, beat = 0) => (bar * 4 + beat) * B2;
const ROOTS2 = [38, 34, 41, 36]; // Re, Si♭, Fa, Do
const CHORDS2 = [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]];
// Frases de la melodía (propias): [pulso, midi, pulsos].
const LA = [[0, 74, 1.5], [1.5, 77, 0.5], [2, 81, 1], [3, 79, 0.5], [3.5, 77, 0.5], [4, 76, 1.5], [5.5, 74, 0.5], [6, 72, 1], [7, 74, 1]];
const LB = [[0, 77, 1], [1, 81, 1], [2, 84, 1.5], [3.5, 81, 0.5], [4, 79, 2], [6, 77, 1], [7, 76, 1]];

export const CUMBRE_SECTIONS = [
  [0, 'I. Amanecer'],
  [8, 'II. Marcha'],
  [24, 'III. Noche'],
  [28, 'IV. Subida'],
  [32, 'V. Cumbre'],
  [48, 'VI. Regreso'],
];

function buildCumbre() {
  const ev = [];
  const add = (t, kind, midi, dur, vel = 1) => ev.push([t, kind, midi, dur, vel]);
  const ci = (b) => (((b % 4) + 4) % 4);
  const arp = (b, vel, oct = 12) => {
    const ch = CHORDS2[ci(b)];
    for (let i = 0; i < 16; i++) add(at2(b, i / 4), 'pluck', ch[[0, 1, 2, 1][i % 4]] + oct + (i >= 8 && i % 4 === 2 ? 12 : 0), B2 * 0.22, vel);
  };
  const kick = (b, vel = 1) => { for (let i = 0; i < 4; i++) add(at2(b, i), 'kick', 0, 0, vel); };
  const bass = (b, vel = 1) => {
    const r = ROOTS2[ci(b)];
    for (let i = 0; i < 4; i++) add(at2(b, i + 0.5), 'low', r + (i === 3 ? 12 : 0), B2 * 0.4, vel);
  };
  const lead = (b, phrase, vel = 1, shift = 0) => phrase.forEach(([p, n, d]) => add(at2(b, p), 'lead', n + shift, d * B2 * 0.95, vel));
  const pad = (b, vel = 1, kind = 'pad') => CHORDS2[ci(b)].forEach((n) => add(at2(b), kind, n, 4 * B2, vel));

  // I. Amanecer (0–7): colchón y arpegio; el bombo entra a la mitad.
  for (let b = 0; b < 8; b++) { pad(b, 0.8); arp(b, 0.35 + b * 0.04); if (b >= 4) kick(b, 0.85); }
  // II. Marcha (8–23): bombo, bajo a contratiempo, arpegio y melodía desde el compás 16.
  for (let b = 8; b < 24; b++) {
    kick(b); bass(b); arp(b, 0.55); pad(b, 0.6);
    if (b >= 16 && b % 2 === 0) lead(b, (b / 2) % 2 ? LB : LA, 0.75);
  }
  // III. Noche (24–27): se va el bajo; colchón y melodía sola.
  for (let b = 24; b < 28; b++) { pad(b, 1); if (b % 2 === 0) lead(b, b === 24 ? LA : LB, 0.7); }
  // IV. Subida (28–31): sin bombo; el ruido sube y el arpegio crece hasta un pulso de silencio.
  add(at2(28), 'riser', 0, at2(4) - B2, 1);
  for (let b = 28; b < 32; b++) {
    pad(b, 0.9);
    arp(b, 0.3 + (b - 28) * 0.12);
  }
  // V. Cumbre (32–47): el drop. Acordes gruesos con bombeo, crash cada 8 compases.
  for (let b = 32; b < 48; b++) {
    kick(b, 1.1); bass(b, 1.05); add(at2(b), 'low', ROOTS2[ci(b)] - 12, B2 * 0.9, 0.9);
    pad(b, 1, 'saw');
    arp(b, 0.5, 24);
    if (b % 2 === 0) lead(b, (b / 2) % 2 ? LB : LA, 1, 12);
    if (b % 8 === 0) add(at2(b), 'crash', 0, 0, 1);
  }
  // VI. Regreso (48–55): se apaga en capas hasta el silencio.
  for (let b = 48; b < 56; b++) {
    if (b < 52) { kick(b, 0.8 - (b - 48) * 0.15); arp(b, 0.4 - (b - 48) * 0.06); }
    if (b < 54) pad(b, 0.7 - (b - 48) * 0.1);
  }
  add(at2(48), 'crash', 0, 0, 0.6);

  CUMBRE_SECTIONS.forEach(([b, name]) => add(at2(b), 'section', 0, 0, name));
  return ev.sort((a, b) => a[0] - b[0]);
}

export const CUMBRE = { title: 'Cumbre', dur: at2(56), events: buildCumbre() };
