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
