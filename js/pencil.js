// Lápiz pre-dibujado una vez: punta en (0, centro), cuerpo hacia +x.
import { INK } from './core.js';

export function makePencil(d) {
  const len = 150, h = 15;
  const cv = document.createElement('canvas');
  cv.width = Math.round(len * d);
  cv.height = Math.round(h * d);
  const c = cv.getContext('2d');
  c.scale(d, d);
  c.lineJoin = 'round';
  const m = h / 2, r = h / 2 - 1.5;

  const shape = (pts, fill) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    // Contorno doble, apenas corrido, como un trazo repasado.
    for (const [o, a] of [[0, 0.85], [0.6, 0.3]]) {
      c.globalAlpha = a;
      c.strokeStyle = INK.g;
      c.lineWidth = 1.1 - o;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x + o, y + o) : c.moveTo(x + o, y + o)));
      c.closePath();
      c.stroke();
    }
    c.globalAlpha = 1;
  };

  shape([[26, m - r], [len - 26, m - r], [len - 26, m + r], [26, m + r]], 'rgb(234,192,78)');
  c.globalAlpha = 0.35;
  c.strokeStyle = 'rgb(150,110,30)';
  c.lineWidth = 0.8;
  for (const y of [m - r / 3, m + r / 3]) { c.beginPath(); c.moveTo(27, y); c.lineTo(len - 27, y); c.stroke(); }
  c.globalAlpha = 1;
  shape([[1, m], [26, m - r], [26, m + r]], 'rgb(228,200,156)');
  shape([[1, m], [9, m - r * 0.32], [9, m + r * 0.32]], INK.g);
  shape([[len - 26, m - r], [len - 13, m - r], [len - 13, m + r], [len - 26, m + r]], 'rgb(176,176,172)');
  for (const x of [len - 22, len - 17]) { c.globalAlpha = 0.5; c.beginPath(); c.moveTo(x, m - r); c.lineTo(x, m + r); c.stroke(); }
  c.globalAlpha = 1;
  shape([[len - 13, m - r], [len - 3, m - r + 1], [len - 1, m], [len - 3, m + r - 1], [len - 13, m + r]], 'rgb(226,146,140)');

  // Sombra difusa del mismo largo.
  const shadow = document.createElement('canvas');
  shadow.width = Math.round((len + 12) * d);
  shadow.height = Math.round((h + 12) * d);
  const s = shadow.getContext('2d');
  s.scale(d, d);
  s.filter = 'blur(3px)';
  s.fillStyle = 'rgba(30,25,15,0.2)';
  s.beginPath();
  s.moveTo(8, 6 + m);
  s.lineTo(32, 6 + m - r);
  s.lineTo(len + 4, 6 + m - r);
  s.lineTo(len + 4, 6 + m + r);
  s.lineTo(32, 6 + m + r);
  s.closePath();
  s.fill();

  return { cv, shadow, len, h };
}
