// Escenario: el sismógrafo arriba y el paisaje abajo, dibujados de a poco en dos
// lienzos circulares (anillos) que se desplazan bajo un lápiz quieto.
import { INK, LABEL_FONT, clamp, lerp, mod, rnd, noise, fbm, line } from './core.js';

const GREEN = 'rgb(64,150,112)';
import { makePencil } from './pencil.js';

export const SPEED = 72; // px de papel por segundo
const TICK = 18; // separación de la grilla del sismógrafo
const MAJOR = SPEED * 5; // una marca con hora cada 5 s

const ring = () => {
  const cv = document.createElement('canvas');
  return { cv, c: cv.getContext('2d') };
};

export class Stage {
  constructor(canvas, header) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.header = header;
    this.S = ring(); // sismógrafo
    this.L = ring(); // paisaje
    this.tape = ring();
    this.pts = new Float32Array(1024);
    this.birds = Array.from({ length: 48 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, ph: 0, fr: 9, s: 1 }));
    this.trees = Array.from({ length: 24 }, () => ({ on: false, x: 0, s: 1 }));
    this.drops = Array.from({ length: 320 }, () => ({ on: false, x: 0, y: 0, v: 0, l: 0 }));
    this.bolt = new Float32Array(64); // rayo: pares x, y en pantalla
    this.winds = Array.from({ length: 80 }, () => ({ on: false, x: 0, y: 0, v: 0, l: 0, ph: 0 }));
    this.meteors = Array.from({ length: 8 }, () => ({ on: false, x: 0, y: 0, t: 0 }));
    this.fires = Array.from({ length: 12 }, () => ({ on: false, x: 0, y: 0, t: 0, r: 0, n: 0, ink: '' }));
    this.k = { x: 0, px: 0, fy: 0, pfy: 0, ny: 0, pny: 0, tx: 0, ts: 1, sx: 0, sy: 0, sr: 0, wet: 0, text: '', storm: 0, night: 0, drop: 0 };
    this.t = 0;
    this.resize();
  }

  resize() {
    const W = innerWidth, H = innerHeight, d = Math.min(devicePixelRatio || 1, 2);
    this.W = W; this.H = H; this.d = d;
    this.cv.width = Math.round(W * d);
    this.cv.height = Math.round(H * d);
    this.sTop = Math.round(this.header.getBoundingClientRect().bottom + 22);
    this.sH = Math.round(clamp(H * 0.17, 84, 150));
    this.lTop = this.sTop + this.sH + 14;
    this.lH = H - this.lTop;
    this.ground = this.lH - 16;
    this.headX = Math.round(W * (W < 700 ? 0.7 : 0.8));
    this.rW = W + 64;
    for (const [r, h] of [[this.S, this.sH], [this.L, this.lH], [this.tape, this.sH]]) {
      r.cv.width = Math.round((r === this.tape ? W : this.rW) * d);
      r.cv.height = Math.round(h * d);
    }
    this.nearHist = new Float32Array(this.rW);
    this.farHist = new Float32Array(this.rW);
    this.pencil = makePencil(d);
    this.drawTape();
    this.reset();
  }

  reset() {
    for (const r of [this.S, this.L]) {
      r.c.setTransform(1, 0, 0, 1, 0, 0);
      r.c.clearRect(0, 0, r.cv.width, r.cv.height);
      r.c.lineCap = 'round';
    }
    this.head = this.prevHead = 0;
    this.seisY = this.sTip = this.sH / 2;
    this.landX = 0;
    this.lowV = this.midV = 0;
    this.farY = this.ground - 6;
    this.nearY = this.ground - 12;
    this.nearHist.fill(this.nearY);
    this.farHist.fill(this.farY);
    this.calm = 0; // segundos de silencio seguido: se forma un lago
    this.wet = 0;
    this.rainV = 0;
    this.padV = 0;
    this.lastCloud = -99;
    this.boltT = 9; // tiempo desde el último rayo
    this.boltN = 0;
    // Forma del tema: noche (corte sin bajo), viento (subida) y drop.
    this.v = SPEED;
    this.lowSlow = 0;
    this.lowRef = 0;
    this.playing = 0;
    this.night = 0;
    this.nightHeld = 0;
    this.windV = 0;
    this.windPeak = 0;
    this.dropV = 0;
    this.dropT = 0;
    this.flashT = 9;
    this.shake = 0;
    this.lastMoon = -99;
    this.lTip = this.farY;
    this.nextTick = 0;
    this.lastSun = -99;
    this.started = 0;
    for (const b of this.birds) b.on = false;
    for (const t of this.trees) t.on = false;
    for (const r of this.drops) r.on = false;
    for (const p of [...this.winds, ...this.meteors, ...this.fires]) p.on = false;
  }

  // Fondo fijo de la cinta: renglones azules y la línea central.
  drawTape() {
    const { c } = this.tape, W = this.W, h = this.sH, d = this.d;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, W, h);
    c.fillStyle = 'rgba(255,253,246,0.72)';
    c.fillRect(0, 0, W, h);
    for (let i = 1; i < 8; i++) {
      const y = Math.round((h * i) / 8) + 0.5;
      line(c, 0, y, W, y, i === 4 ? 0.9 : 0.6, i === 4 ? 0.3 : 0.13, INK.b);
    }
    line(c, 0, 0.5, W, 0.5, 1, 0.35);
    line(c, 0, h - 0.5, W, h - 0.5, 1, 0.35);
  }

  // Ejecuta fn sobre el anillo en coordenadas de mundo; si el trazo cruza el borde
  // del anillo, lo repite del otro lado para que la costura no se note.
  paint(r, x, ext, fn) {
    const W = this.rW, d = this.d, rx = mod(x, W), c = r.c;
    c.setTransform(d, 0, 0, d, d * (rx - x), 0);
    fn.call(this, c);
    if (rx + ext > W) { c.setTransform(d, 0, 0, d, d * (rx - x - W), 0); fn.call(this, c); }
    if (rx - ext < 0) { c.setTransform(d, 0, 0, d, d * (rx - x + W), 0); fn.call(this, c); }
  }

  // Borra el papel que el lápiz todavía no alcanzó (lo más viejo del anillo).
  clearAhead(r, h) {
    const W = this.rW, d = this.d, c = r.c;
    const a = mod(this.head + 3, W), len = this.W - this.headX + 12;
    c.setTransform(d, 0, 0, d, 0, 0);
    if (a + len <= W) c.clearRect(a, 0, len, h);
    else { c.clearRect(a, 0, W - a, h); c.clearRect(0, 0, a + len - W, h); }
  }

  nearAt(x) { return this.nearHist[mod(Math.floor(x), this.rW)]; }
  farAt(x) { return this.farHist[mod(Math.floor(x), this.rW)]; }

  // ---------- Paso de simulación ----------

  step(dt, f) {
    this.t += dt;
    this.stepMood(f, dt);
    this.v += (SPEED * (1 + 0.6 * this.dropV) - this.v) * (1 - Math.exp(-dt / 0.5));
    this.prevHead = this.head;
    this.head += this.v * dt;
    this.clearAhead(this.S, this.sH);
    this.clearAhead(this.L, this.lH);
    this.stepSeis(f);
    this.stepLand(f, dt);
    this.stepLife(f, dt);
  }

  stepSeis(f) {
    const x0 = this.prevHead, x1 = this.head, dx = x1 - x0;
    if (dx <= 0) return;
    const n = Math.min(500, Math.max(2, Math.ceil(dx * 1.8)));
    const T = f.time, TL = T.length, mid = this.sH / 2, amp = this.sH * 0.44, p = this.pts;
    p[0] = x0; p[1] = this.seisY;
    let y = this.seisY;
    for (let i = 1; i <= n; i++) {
      const s = T[(Math.random() * TL) | 0];
      const v = Math.sign(s) * Math.min(1, Math.pow(Math.abs(s) * 1.7, 0.8));
      y = mid - v * amp + (Math.random() - 0.5) * 0.8;
      p[i * 2] = x0 + (dx * i) / n;
      p[i * 2 + 1] = y;
    }
    this.seisN = n;
    this.seisY = y;
    this.paint(this.S, x1, 4, this.drawSeis);
    while (this.nextTick <= x1) {
      this.k.x = this.nextTick;
      this.paint(this.S, this.nextTick, 60, this.drawTick);
      this.nextTick += TICK;
    }
  }

  drawSeis(c) {
    const p = this.pts, n = this.seisN;
    c.strokeStyle = INK.g;
    c.lineJoin = 'round';
    c.lineWidth = 1.05;
    c.globalAlpha = 0.86;
    c.beginPath();
    c.moveTo(p[0], p[1]);
    for (let i = 1; i <= n; i++) c.lineTo(p[i * 2], p[i * 2 + 1]);
    c.stroke();
    c.globalAlpha = 1;
  }

  drawTick(c) {
    const x = this.k.x, h = this.sH, major = x % MAJOR === 0;
    line(c, x, 12, x, h - 12, major ? 0.9 : 0.6, major ? 0.32 : 0.1, INK.b);
    // Perforaciones de la cinta.
    c.globalAlpha = 0.3;
    c.strokeStyle = INK.soft;
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(x, 6, 2.1, 0, 7); c.stroke();
    c.beginPath(); c.arc(x, h - 6, 2.1, 0, 7); c.stroke();
    if (major && x > 0) {
      const s = Math.round(this.t);
      c.globalAlpha = 0.55;
      c.fillStyle = INK.b;
      c.font = `12px ${LABEL_FONT}`;
      c.textAlign = 'right';
      c.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x - 4, h - 14);
    }
    c.globalAlpha = 1;
  }

  stepLand(f, dt) {
    this.lowV += (f.low - this.lowV) * (1 - Math.exp(-dt / 0.45));
    this.midV += (f.mid - this.midV) * (1 - Math.exp(-dt / 0.22));
    this.calm = this.lowV < 0.08 && this.midV < 0.1 ? this.calm + dt : 0;
    this.wet += ((this.calm > 0.7 ? 1 : 0) - this.wet) * (1 - Math.exp(-dt / 0.5));
    while (this.landX + 2 <= this.head) this.column(this.landX + 2);
  }

  column(x) {
    const g = this.ground, H = this.lH, lo = this.lowV, mi = this.midV;
    const farH = 6 + lo * H * 0.42 * (0.75 + 0.4 * fbm(x * 0.004, 1)) + (1 - Math.abs(fbm(x * 0.014, 2))) * lo * H * 0.22 + fbm(x * 0.06, 3) * lo * 12 + fbm(x * 0.2, 9) * 1.6;
    const hill = 10 + (noise(x * 0.006, 4) + 1) * 7 + mi * H * 0.26 * (0.8 + 0.3 * fbm(x * 0.01, 5)) + fbm(x * 0.06, 6) * mi * 10 + fbm(x * 0.25, 7) * 1.2;
    const nearH = lerp(hill, 30, this.wet); // en el silencio el valle se llena de agua
    const k = this.k;
    k.x = x; k.px = this.landX;
    k.pfy = this.farY; k.fy = g - Math.max(4, farH);
    k.pny = this.nearY; k.ny = g - nearH;
    this.nearHist[mod(x, this.rW)] = k.ny;
    this.nearHist[mod(x - 1, this.rW)] = (k.ny + k.pny) / 2;
    this.farHist[mod(x, this.rW)] = this.farHist[mod(x - 1, this.rW)] = k.fy;
    k.wet = this.wet;
    k.night = this.night;
    k.drop = this.dropV;
    this.paint(this.L, x, 40, this.drawColumn);
    this.landX = x; this.farY = k.fy; this.nearY = k.ny;
  }

  drawColumn(c) {
    const { x, px, fy, pfy, ny, pny } = this.k, g = this.ground, H = this.lH;
    // Cordillera (graves): cresta y sombreado inclinado, más denso en la ladera que baja.
    const { night, drop } = this.k;
    // Noche: el cielo se sombrea con trazos horizontales y aparecen estrellas.
    for (let i = 0; i < 2; i++) {
      if (night > 0.05 && rnd(x, 60 + i * 7) < night * 0.75) {
        const y = 6 + rnd(x, 61 + i * 7) ** 0.8 * (fy - 30);
        if (y > 6) line(c, x - 6 - rnd(x, 62 + i * 7) * 14, y, x, y + 0.4, 0.8, 0.05 + 0.09 * night);
      }
    }
    if (night > 0.3 && rnd(x, 63) < night * 0.04) {
      const y = 8 + rnd(x, 64) * (fy - 50), r = 1.5 + rnd(x, 65) * 2.5;
      if (y > 8) { line(c, x - r, y, x + r * 0.2, y, 0.8, 0.75); line(c, x - r * 0.4, y - r, x - r * 0.4, y + r, 0.8, 0.75); }
    }
    // Drop: cortina de aurora en tinta azul y verde.
    if (drop > 0.1 && x % 2 === 0) {
      const yA = H * 0.1 + Math.sin(x * 0.007 + Math.sin(x * 0.0021) * 2.2) * H * 0.05;
      const sway = (noise(x * 0.02, 50) + 1) * 0.5, fold = (noise(x * 0.11, 52) + 1) * 0.5;
      let len = (10 + 70 * sway * sway + 18 * fold) * drop;
      if (yA + len > fy - 14) len = fy - 14 - yA;
      if (len > 4) line(c, x, yA, x - 1.5, yA + len, 0.9, (0.12 + 0.22 * rnd(x, 51)) * drop, x % 4 ? INK.b : GREEN);
    }
    line(c, px, pfy, x, fy, 1.25 + drop * 0.9, 0.82);
    if (x % 4 === 0 && g - fy > 12) {
      const slope = (fy - pfy) / 2, r = rnd(x, 1);
      const len = Math.min((g - fy) * 0.55, 16 + this.lowV * 26) * (0.55 + 0.45 * r);
      const y0 = fy + (g - fy > H * 0.36 ? 7 : 1.5); // las cumbres altas quedan nevadas
      let y1 = y0 + len;
      const lim = this.nearAt(x - len * 0.42) - 3;
      if (y1 > lim) y1 = lim;
      if (y1 - y0 > 2) {
        line(c, x, y0, x - (y1 - y0) * 0.42, y1, 0.8, 0.13 + clamp(slope * 0.6) * 0.32 + r * 0.06);
        if (slope > 0.35 && rnd(x, 2) > 0.4) {
          const y2 = Math.min(y0 + 3 + len * 0.7, lim);
          if (y2 - y0 > 5) line(c, x - 2, y0 + 3, x - 2 - (y2 - y0 - 3) * 0.25, y2, 0.7, 0.16);
        }
      }
    }
    // Las colinas tapan lo que quedó detrás.
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    // Arranca 1,5 px antes: la punta redonda del tramo de cordillera se asoma hacia atrás.
    c.moveTo(px - 1.5, pny + 0.5 - (ny - pny) * 0.75);
    c.lineTo(x, ny + 0.5);
    c.lineTo(x, H);
    c.lineTo(px - 1.5, H);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    // Colinas (medios).
    line(c, px, pny, x, ny, 1.6, 0.9);
    const wet = this.k.wet;
    if (wet > 0.5) {
      // Lago: ondas en tinta azul y el reflejo de la cordillera, cortado.
      line(c, px, pny + 2.5, x, ny + 2.5, 0.9, 0.5 * wet, INK.b);
      if (rnd(x, 11) < 0.32) {
        const y = ny + 6 + rnd(x, 12) ** 1.3 * (H - ny - 10), l = 4 + rnd(x, 13) * 12;
        line(c, x - l, y, x, y, 0.85, (0.55 - 0.3 * (y - ny) / (H - ny)) * wet, INK.b);
      }
      if (x % 4 === 0 && g - fy > 14 && rnd(x, 14) < 0.7) {
        const depth = Math.min((g - fy) * 0.5, H - ny - 6), y0 = ny + 2 + rnd(x, 15) * 3;
        if (depth > 4) line(c, x, y0, x, y0 + depth * (0.5 + rnd(x, 16) * 0.5), 0.6, 0.12 * wet, INK.b);
      }
      return;
    }
    // Sombreado y textura con 4 px de atraso: así el borrado de las columnas siguientes no los corta.
    const hx = x - 4, hy = this.nearAt(hx);
    if (hx % 3 === 0) {
      const slope = (hy - this.nearAt(hx - 2)) / 2, r = rnd(hx, 3);
      const len = Math.min((g - hy) * 0.6, 7 + this.midV * 10) * (0.5 + 0.5 * r);
      if (len > 2) line(c, hx, hy + 2, hx - len * 0.3, hy + 2 + len, 0.75, 0.16 + clamp(slope * 0.7) * 0.3);
    }
    if (rnd(x, 5) < 0.2) line(c, x, ny, x - 1 - rnd(x, 8) * 1.5, ny - 2 - rnd(x, 9) * 4, 0.7, 0.45);
    if (rnd(hx, 6) < 0.07) {
      const y = hy + 12 + rnd(hx, 7) * (H - hy - 16);
      if (y < H - 3) line(c, hx - 3 - rnd(hx, 10) * 5, y, hx, y, 0.7, 0.14);
    }
  }

  // ---------- Árboles, pájaros y soles ----------

  stepLife(f, dt) {
    const o = f.onset;
    if (o[1] > 0) {
      for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) this.addTree(this.head - 2 - i * 8, 0.6 + o[1] * 0.8);
    }
    if (o[2] > 0) {
      if (this.night > 0.5) this.addMeteor();
      else for (let i = 0, n = 1 + ((o[2] * 3) | 0); i < n; i++) this.addBird(o[2]);
    }
    if (f.loud > 0 && this.dropV > 0) this.addFire(0);
    else if (f.loud > 0) {
      if (f.noise > 0.25 || this.rainV > 0.08 || f.onset[2] > 0) this.addBolt();
      else if (this.t - this.lastSun > 12) this.addSun();
    }
    this.rainV += (clamp(f.noise * 1.4) * clamp(f.high * 1.5) * (1 - this.night) - this.rainV) * (1 - Math.exp(-dt / 0.6));
    this.padV += (clamp(f.mid * 1.3) * (1 - clamp(f.noise * 2)) - this.padV) * (1 - Math.exp(-dt / 1.5));
    const cloudGap = this.rainV > 0.2 ? 1.6 : 3.2;
    if ((this.rainV > 0.2 || this.padV > 0.4) && this.t - this.lastCloud > cloudGap) this.addCloud(this.rainV > 0.2);
    this.boltT += dt;
    this.stepRain(dt);
    for (const t of this.trees) {
      if (t.on && this.head >= t.x + 16) {
        t.on = false;
        this.k.tx = t.x; this.k.ts = t.s;
        this.paint(this.L, t.x, 14, this.drawTree);
      }
    }
    const top = this.lTop + 10;
    for (const b of this.birds) {
      if (!b.on) continue;
      b.ph += dt * b.fr;
      b.vy += (-3 - b.vy) * dt * 0.6;
      b.x += (b.vx - this.v) * dt;
      b.y += (b.vy + Math.sin(b.ph * 0.3) * 6) * dt;
      if (b.y < top) { b.y = top; b.vy = 0; }
      if (b.x < -30) b.on = false;
    }
  }

  // ---------- La forma del tema ----------

  stepMood(f, dt) {
    const e = (tau) => 1 - Math.exp(-dt / tau);
    this.lowSlow += (f.sub - this.lowSlow) * e(1.6);
    this.playing += ((f.level > 0.015 ? 1 : 0) - this.playing) * e(0.8);
    // Corte: sigue sonando algo pero los graves cayeron a un tercio de lo que venían siendo.
    this.lowRef = Math.max(this.lowRef * Math.exp(-dt / 20), this.lowSlow);
    const cut = this.lowSlow < Math.max(0.13, this.lowRef * 0.35) && this.lowRef > 0.25 && this.playing > 0.5 && this.dropV < 0.3;
    this.night += ((cut ? 1 : 0) - this.night) * e(this.dropV > 0 ? 0.4 : 1.4);
    this.nightHeld = this.night > 0.6 ? this.nightHeld + dt : this.night < 0.3 ? 0 : this.nightHeld;
    // Subida: ruido que crece sin bajo.
    const rise = this.lowSlow < Math.max(0.2, this.lowRef * 0.4) ? clamp(f.noise * 1.6) * clamp(f.high * 1.6) : 0;
    this.windV += (rise - this.windV) * e(0.4);
    this.windPeak = Math.max(this.windPeak * Math.exp(-dt / 8), this.windV);
    // Drop: vuelven los graves de golpe después de una subida o de un corte largo.
    if (f.onset[0] > 0.4 && this.dropV < 0.3 && (this.windPeak > 0.3 || this.nightHeld > 10)) this.drop();
    if (this.dropV > 0) {
      this.dropT += dt;
      this.dropV = this.dropT < 4 || this.lowSlow > 0.12 ? Math.min(1, this.dropV + dt * 2) : Math.max(0, this.dropV - dt * 0.35);
    }
    this.shake *= Math.exp(-dt / 0.09);
    if (f.onset[0] > 0 && this.dropV > 0.3) this.shake = Math.max(this.shake, 3 * this.dropV * f.onset[0]);
    this.flashT += dt;
    if (this.night > 0.7 && this.t - this.lastMoon > 25) this.addMoon();
    this.stepFx(dt);
  }

  drop() {
    this.dropV = 0.05;
    this.dropT = 0;
    this.flashT = 0;
    this.shake = 7;
    this.windPeak = 0;
    this.nightHeld = 0;
    for (let i = 0; i < 4; i++) this.addFire(-i * 0.22);
  }

  stepFx(dt) {
    const want = this.windV * 140 * dt;
    let n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    for (const w of this.winds) {
      if (w.on) {
        w.x -= w.v * dt;
        if (w.x + w.l < -20) w.on = false;
      } else if (n > 0) {
        n--;
        w.on = true;
        w.x = this.W + Math.random() * 60;
        w.y = this.lTop + 10 + Math.random() * this.lH * 0.85;
        w.v = 700 + Math.random() * 600;
        w.l = 30 + Math.random() * 80;
        w.ph = Math.random() * 6;
      }
    }
    for (const m of this.meteors) if (m.on && (m.t += dt) > 0.8) m.on = false;
    for (const p of this.fires) {
      if (!p.on) continue;
      p.t += dt;
      p.x -= this.v * dt;
      if (p.t > 1.7) p.on = false;
    }
  }

  addMeteor() {
    const m = this.meteors.find((m) => !m.on);
    if (!m) return;
    m.on = true;
    m.t = 0;
    m.x = this.headX * (0.35 + Math.random() * 0.65);
    m.y = this.lTop + this.lH * (0.04 + Math.random() * 0.2);
  }

  addFire(delay) {
    const p = this.fires.find((p) => !p.on);
    if (!p) return;
    p.on = true;
    p.t = delay;
    p.x = this.headX * (0.25 + Math.random() * 0.65);
    p.y = this.lTop + this.lH * (0.1 + Math.random() * 0.22);
    p.r = 45 + Math.random() * 45;
    p.n = 14 + ((Math.random() * 10) | 0);
    p.ink = [INK.w, INK.b, INK.g, GREEN][(Math.random() * 4) | 0];
  }

  addMoon() {
    const r = 16, y = this.lH * 0.13;
    if (this.farY < y + r + 14) return;
    this.lastMoon = this.t;
    const k = this.k;
    k.sx = this.head - r - 16; k.sy = y; k.sr = r;
    this.paint(this.L, k.sx, r + 6, this.drawMoon);
  }

  drawMoon(c) {
    const { sx: x, sy: y, sr: r } = this.k;
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(x, y, r + 3, 0, 7); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = INK.g;
    for (const [o, a] of [[0, 0.85], [0.6, 0.3]]) {
      c.globalAlpha = a;
      c.lineWidth = 1.2 - o;
      c.beginPath();
      c.arc(x + o, y + o, r, Math.PI * 0.32, Math.PI * 1.68);
      c.arc(x + r * 0.55 + o, y - r * 0.08 + o, r * 0.82, Math.PI * 1.62, Math.PI * 0.38, true);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  stepRain(dt) {
    const want = this.rainV > 0.1 ? this.rainV * 260 * dt : 0;
    let n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    for (const r of this.drops) {
      if (n <= 0) break;
      if (r.on) continue;
      r.on = true;
      r.x = Math.random() * (this.headX + 60);
      r.y = this.lTop - Math.random() * 30;
      r.v = 420 + Math.random() * 160;
      r.l = 6 + Math.random() * 8;
      n--;
    }
    for (const r of this.drops) {
      if (!r.on) continue;
      r.y += r.v * dt;
      r.x -= (r.v * 0.18 + this.v) * dt;
      const wx = this.head - (this.headX - r.x);
      if (r.y - this.lTop > Math.min(this.farAt(wx), this.nearAt(wx)) || r.x < -10) r.on = false;
    }
  }

  // Rayo: zigzag desde el cielo hasta la cresta; deja una marca tenue en el papel.
  addBolt() {
    const b = this.bolt, sx = this.headX * (0.25 + Math.random() * 0.6);
    const wx = this.head - (this.headX - sx), end = Math.min(this.farAt(wx), this.nearAt(wx));
    const n = 14, y0 = 4;
    let x = sx;
    for (let i = 0; i <= n; i++) {
      b[i * 2] = x;
      b[i * 2 + 1] = y0 + ((end - y0) * i) / n;
      x += (Math.random() - 0.5) * 22;
    }
    this.boltN = n + 1;
    this.boltT = 0;
    this.k.x = wx;
    this.paint(this.L, wx, 140, this.drawScar);
  }

  drawScar(c) {
    const b = this.bolt, off = this.head - this.headX; // pantalla → mundo
    c.strokeStyle = INK.g;
    c.globalAlpha = 0.2;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < this.boltN; i++) c[i ? 'lineTo' : 'moveTo'](b[i * 2] + off, b[i * 2 + 1]);
    c.stroke();
    c.globalAlpha = 1;
  }

  addCloud(storm) {
    const w = 46 + Math.random() * 40, y = this.lH * (0.06 + Math.random() * 0.16);
    if (this.farY < y + 26) return;
    this.lastCloud = this.t;
    const k = this.k;
    k.sx = this.head - w * 0.6 - 10; k.sy = y; k.sr = w; k.storm = storm ? 1 : 0;
    this.paint(this.L, k.sx, w, this.drawCloud);
  }

  drawCloud(c) {
    const { sx: x, sy: y, sr: w, storm } = this.k, n = 4 + (rnd(x, 40) * 2 | 0);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.ellipse(x, y - w * 0.12, w * 0.58, w * 0.3, 0, 0, 7); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = INK.g;
    c.lineWidth = 1.15;
    c.globalAlpha = 0.78;
    // Cúmulo: lomos circulares, más altos en el centro, y una base casi plana.
    const step = (w * 1.1) / n;
    for (let i = 0; i < n; i++) {
      const cx = x - w * 0.55 + step * (i + 0.5), mid = 1 - Math.abs(i - (n - 1) / 2) / (n / 2);
      const r = step * (0.62 + mid * 0.75 + rnd(x, 41 + i) * 0.2);
      c.beginPath();
      c.arc(cx, y - r * 0.55, r, Math.PI * (0.92 + (i ? 0.08 : 0)), Math.PI * (i === n - 1 ? 2.08 : 1.97));
      c.stroke();
    }
    line(c, x - w * 0.6, y, x + w * 0.6, y + 0.5, 1, 0.7);
    if (storm) {
      for (let i = 0; i < w; i += 3) {
        const xx = x - w * 0.5 + i, top = y - w * 0.18 * (1 - Math.abs(i / w - 0.5) * 2);
        line(c, xx, y - 1, xx - 3, Math.max(top, y - 10), 0.7, 0.35);
      }
    }
    c.globalAlpha = 1;
  }

  annotate(text) {
    this.k.text = text;
    this.k.x = this.head;
    this.paint(this.S, this.head, 260, this.drawNote);
  }

  drawNote(c) {
    const x = this.k.x - 4;
    line(c, x + 2, 12, x + 2, this.sH - 12, 1.1, 0.55, INK.w);
    c.fillStyle = INK.w;
    c.globalAlpha = 0.85;
    c.font = `15px ${LABEL_FONT}`;
    c.textAlign = 'right';
    c.fillText(this.k.text, x - 3, 26);
    c.globalAlpha = 1;
  }

  addTree(x, s) {
    const t = this.trees.find((t) => !t.on);
    if (t) { t.on = true; t.x = x; t.s = s; }
  }

  addBird(strength) {
    const b = this.birds.find((b) => !b.on);
    if (!b) return;
    b.on = true;
    b.x = this.headX - 8 - Math.random() * 16;
    b.y = this.lTop + this.lTip - 14 - Math.random() * 20;
    b.vx = -10 + Math.random() * 40;
    b.vy = -26 - Math.random() * 30;
    b.ph = Math.random() * 6;
    b.fr = 9 + Math.random() * 4;
    b.s = 0.7 + strength * 0.7;
  }

  addSun() {
    const r = 13 + Math.random() * 8, y = this.lH * (0.1 + Math.random() * 0.1);
    if (this.farY < y + r + 14) return; // no lo pongas detrás de una montaña
    this.lastSun = this.t;
    const k = this.k;
    k.sx = this.head - r - 14; k.sy = y; k.sr = r;
    this.paint(this.L, k.sx, r + 12, this.drawSun);
  }

  drawTree(c) {
    const x = this.k.tx, h = 30 * this.k.ts, base = this.nearAt(x) + 1, w = h * 0.34;
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(x - w, base - h * 0.2); c.lineTo(x, base - h - 2); c.lineTo(x + w, base - h * 0.2); c.lineTo(x, base);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    line(c, x, base + 1, x, base - h * 0.3, 1.1, 0.85);
    for (let i = 0; i < 4; i++) {
      const y = base - h * 0.22 - i * h * 0.2, hw = w * (1 - i * 0.22), j = rnd(x, 20 + i) - 0.5;
      line(c, x - hw, y + j, x, y - h * 0.3, 1, 0.8);
      line(c, x, y - h * 0.3, x + hw, y - j, 1, 0.8);
    }
  }

  drawSun(c) {
    const { sx, sy, sr } = this.k;
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(sx, sy, sr + 3, 0, 7); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = INK.g;
    c.lineWidth = 1.1;
    c.globalAlpha = 0.8;
    c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 90) * Math.PI * 2, rr = sr * (0.95 + 0.05 * Math.sin(i * 0.31)) + i * 0.025;
      i ? c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr) : c.moveTo(sx + rr, sy);
    }
    c.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rnd(sx, i) * 0.2, r0 = sr + 4, r1 = sr + 9 + rnd(sx, 30 + i) * 5;
      line(c, sx + Math.cos(a) * r0, sy + Math.sin(a) * r0, sx + Math.cos(a) * r1, sy + Math.sin(a) * r1, 1, 0.7);
    }
  }

  // ---------- Pintado en pantalla ----------

  render() {
    const c = this.ctx, d = this.d, W = this.W;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, W, this.H);
    if (this.shake > 0.05) c.translate((Math.random() - 0.5) * 2 * this.shake, (Math.random() - 0.5) * 2 * this.shake);
    c.drawImage(this.tape.cv, 0, this.sTop, W, this.sH);
    this.blit(this.S, this.sTop, this.sH);
    this.blit(this.L, this.lTop, this.lH);

    // Pájaros: dos alas que aletean.
    c.save();
    c.beginPath(); c.rect(0, this.lTop, W, this.lH); c.clip();
    c.strokeStyle = INK.g;
    c.lineWidth = 1.25;
    c.globalAlpha = 0.85;
    c.beginPath();
    for (const b of this.birds) {
      if (!b.on) continue;
      const s = b.s * 7, w = Math.sin(b.ph);
      c.moveTo(b.x - s, b.y - s * 0.35 * w);
      c.quadraticCurveTo(b.x - s * 0.45, b.y - s * (0.3 + 0.45 * w), b.x, b.y);
      c.quadraticCurveTo(b.x + s * 0.45, b.y - s * (0.3 + 0.45 * w), b.x + s, b.y - s * 0.35 * w);
    }
    c.stroke();

    // Lluvia: rayitas inclinadas.
    if (this.rainV > 0.01) {
      c.lineWidth = 0.8;
      c.globalAlpha = 0.45;
      c.beginPath();
      for (const r of this.drops) {
        if (!r.on) continue;
        c.moveTo(r.x, r.y);
        c.lineTo(r.x - r.l * 0.18, r.y - r.l);
      }
      c.stroke();
    }

    // Rayo: dos destellos y se apaga; el papel se ilumina un instante.
    if (this.boltT < 0.45) {
      const t = this.boltT, a = t < 0.08 ? 1 : t < 0.14 ? 0.25 : t < 0.2 ? 1 : 1 - (t - 0.2) / 0.25;
      c.globalAlpha = 0.35 * a;
      c.fillStyle = 'rgb(255,253,240)';
      c.fillRect(0, this.lTop, W, this.lH);
      const b = this.bolt, top = this.lTop;
      for (const [w, al] of [[5, 0.15], [1.8, 0.95]]) {
        c.globalAlpha = al * a;
        c.lineWidth = w;
        c.beginPath();
        for (let i = 0; i < this.boltN; i++) c[i ? 'lineTo' : 'moveTo'](b[i * 2] - this.v * t, top + b[i * 2 + 1]);
        c.stroke();
      }
    }
    c.restore();

    this.renderFx(c);

    // Los lápices siguen la punta con un poco de inercia.
    this.sTip += (this.seisY - this.sTip) * 0.55;
    this.lTip += (this.farY - this.lTip) * 0.35;
    const wob = Math.sin(this.t * 1.7) * 0.015 + this.windV * Math.sin(this.t * 43) * 0.035 + (this.boltT < 0.6 ? Math.sin(this.t * 70) * 0.05 * (1 - this.boltT / 0.6) : 0);
    this.drawPencil(this.headX, this.sTop + this.sTip, 0.62 + wob + (this.sTip - this.sH / 2) * 0.0015);
    this.drawPencil(this.headX, this.lTop + this.lTip, -0.62 - wob);
  }

  renderFx(c) {
    const W = this.W;
    c.save();
    c.beginPath(); c.rect(0, this.lTop, W, this.lH); c.clip();
    // Viento de la subida: rayas veloces que ondulan.
    if (this.windV > 0.01) {
      c.strokeStyle = INK.g;
      c.lineWidth = 0.9;
      c.globalAlpha = 0.3;
      c.beginPath();
      for (const w of this.winds) {
        if (!w.on) continue;
        c.moveTo(w.x, w.y);
        c.quadraticCurveTo(w.x + w.l * 0.5, w.y + Math.sin(w.ph + w.x * 0.02) * 6, w.x + w.l, w.y);
      }
      c.stroke();
    }
    // Estrellas fugaces.
    c.strokeStyle = INK.g;
    for (const m of this.meteors) {
      if (!m.on) continue;
      const k = m.t / 0.8, x = m.x - 520 * m.t, y = m.y + 260 * m.t, a = 1 - k;
      c.globalAlpha = 0.25 * a; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 90, y - 45); c.stroke();
      c.globalAlpha = 0.9 * a; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 26, y - 13); c.stroke();
    }
    // Fuegos artificiales: rayos que se abren, caen un poco y se apagan.
    for (const p of this.fires) {
      if (!p.on || p.t < 0) continue;
      const e = 1 - (1 - Math.min(p.t / 1.1, 1)) ** 3, R = p.r * e, drop = p.t * p.t * 14;
      c.strokeStyle = p.ink;
      c.globalAlpha = 0.9 * (1 - p.t / 1.7);
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < p.n; i++) {
        const a = (i / p.n) * Math.PI * 2 + p.r, ca = Math.cos(a), sa = Math.sin(a);
        c.moveTo(p.x + ca * R * 0.7, p.y + sa * R * 0.7 + drop);
        c.lineTo(p.x + ca * R, p.y + sa * R + drop);
      }
      c.stroke();
      if (p.t < 0.15) {
        c.globalAlpha = 1 - p.t / 0.15;
        c.beginPath(); c.arc(p.x, p.y, 3 + p.t * 30, 0, 7); c.stroke();
      }
    }
    // Destello del drop sobre toda la hoja.
    if (this.flashT < 0.6) {
      c.globalAlpha = 0.55 * (1 - this.flashT / 0.6);
      c.fillStyle = 'rgb(255,253,240)';
      c.fillRect(0, this.lTop, W, this.lH);
    }
    c.restore();
  }

  blit(r, top, h) {
    const off = this.headX - mod(this.head, this.rW);
    for (let k = -1; k <= 1; k++) {
      const x = off + k * this.rW;
      if (x < this.W && x + this.rW > 0) this.ctx.drawImage(r.cv, x, top, this.rW, h);
    }
  }

  drawPencil(x, y, a) {
    const c = this.ctx, p = this.pencil;
    c.save();
    c.translate(x + 5, y + 8);
    c.rotate(a);
    c.drawImage(p.shadow, -6, -p.h / 2 - 6, p.len + 12, p.h + 12);
    c.restore();
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.drawImage(p.cv, 0, -p.h / 2, p.len, p.h);
    c.restore();
  }

  // Lámina para guardar: papel, título y lo dibujado hasta ahora.
  snapshot(paper) {
    const out = document.createElement('canvas'), d = this.d;
    out.width = this.cv.width;
    out.height = this.cv.height;
    const c = out.getContext('2d');
    c.scale(d, d);
    c.fillStyle = c.createPattern(paper, 'repeat');
    c.fillRect(0, 0, this.W, this.H);
    c.drawImage(this.cv, 0, 0, this.W, this.H);
    c.fillStyle = INK.g;
    c.globalAlpha = 0.8;
    c.font = `26px ${LABEL_FONT}`;
    c.fillText('Sonido visible', 24, 44);
    c.font = `14px ${LABEL_FONT}`;
    c.globalAlpha = 0.6;
    c.fillText(new Date().toLocaleString('es-AR'), 24, 66);
    return out;
  }
}
