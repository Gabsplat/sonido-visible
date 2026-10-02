// Utilidades: números, ruido determinista y paleta de grafito.

export const INK = {
  g: 'rgb(38,38,44)',
  soft: 'rgb(70,70,74)',
  b: 'rgb(58,112,168)',
  w: 'rgb(204,84,36)',
  paper: 'rgb(243,237,222)',
};

export const LABEL_FONT = '"Noteworthy","Bradley Hand","Segoe Print","Comic Neue","Patrick Hand",cursive';

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (a, n) => ((a % n) + n) % n;

// Hash entero → [0, 1). Sin estado: el mismo x da siempre el mismo valor.
export function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Valor aleatorio fijo para una posición del mundo y un canal k.
export const rnd = (x, k) => hash((Math.floor(x * 8) | 0) + k * 7919);

export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const o = seed * 1013;
  return lerp(hash(i + o), hash(i + 1 + o), u) * 2 - 1;
}

export const fbm = (x, seed = 0) =>
  noise(x, seed) * 0.6 + noise(x * 2.1, seed + 7) * 0.28 + noise(x * 4.3, seed + 13) * 0.12;

// Línea de grafito: trazo principal y una hebra tenue paralela.
export function line(c, x1, y1, x2, y2, w, a, ink = INK.g) {
  c.strokeStyle = ink;
  c.globalAlpha = a;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.globalAlpha = a * 0.35;
  c.lineWidth = w * 0.45;
  c.beginPath();
  c.moveTo(x1 + 0.45, y1 + 0.55);
  c.lineTo(x2 + 0.45, y2 + 0.55);
  c.stroke();
  c.globalAlpha = 1;
}
