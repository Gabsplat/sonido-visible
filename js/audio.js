// Entrada de sonido (micrófono, archivo, canción, sintetizador, demo) y análisis por bandas.
import { clamp } from './core.js';
import { SONG } from './song.js';

const MINOR_PENT = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const BANDS = [[40, 250], [250, 2000], [2500, 9000]]; // graves, medios, agudos
const COOLDOWN = [0.3, 0.22, 0.09];

export const noteFreq = (base, step) => base * 2 ** (MINOR_PENT[step % MINOR_PENT.length] / 12 + Math.floor(step / MINOR_PENT.length));
const midiFreq = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.mode = 'silencio';
    this.onSection = null;
    // Rasgos que lee el dibujo en cada cuadro. Se reutiliza el mismo objeto.
    this.f = {
      low: 0, mid: 0, high: 0, level: 0,
      noise: 0, // qué tan parejo (ruidoso, sin tono) es el espectro agudo: lluvia
      onset: new Float32Array(3), // fuerza del ataque por banda (0 = nada este cuadro)
      loud: 0, // golpe fuerte de volumen general
      time: new Float32Array(2048),
    };
    this.floor = new Float32Array([0.04, 0.04, 0.03]);
    this.peak = new Float32Array([0.35, 0.35, 0.3]);
    this.avg = new Float32Array(3);
    this.last = new Float32Array([-9, -9, -9]);
    this.levelAvg = 0;
    this.lastLoud = -9;
    this.voices = new Map();
    this.demoTimer = 0;
    this.songTimer = 0;
  }

  ensure() {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext());
      const an = (this.analyser = ctx.createAnalyser());
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.45;
      an.minDecibels = -92;
      an.maxDecibels = -22;
      this.bins = new Uint8Array(an.frequencyBinCount);
      const hz = ctx.sampleRate / an.fftSize;
      this.ranges = BANDS.map(([a, b]) => [Math.max(1, Math.round(a / hz)), Math.round(b / hz)]);
      // Lo que suena por parlantes también se analiza; el micrófono sólo se analiza.
      this.out = ctx.createGain();
      this.out.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.out.connect(an);
      this.out.connect(comp).connect(ctx.destination);
      // Ruido blanco compartido por la lluvia y los truenos.
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  analyse(now) {
    const f = this.f;
    f.onset[0] = f.onset[1] = f.onset[2] = 0;
    f.loud = 0;
    if (!this.ctx) return;
    const an = this.analyser, bins = this.bins;
    an.getByteFrequencyData(bins);
    an.getFloatTimeDomainData(f.time);
    let sum = 0;
    for (let i = 0; i < f.time.length; i += 4) sum += f.time[i] * f.time[i];
    f.level = Math.sqrt(sum / (f.time.length / 4));

    for (let b = 0; b < 3; b++) {
      const [a, z] = this.ranges[b];
      let s = 0, mx = 0;
      for (let i = a; i < z; i++) { s += bins[i]; if (bins[i] > mx) mx = bins[i]; }
      const v = s / ((z - a) * 255);
      // Piso de ruido que sube despacio y pico que se olvida despacio: se adapta a cada micrófono.
      this.floor[b] = v < this.floor[b] ? v : this.floor[b] + (v - this.floor[b]) * 0.0006;
      this.peak[b] = Math.max(v, this.peak[b] * 0.9994, this.floor[b] + 0.18);
      const n = clamp((v - this.floor[b] - 0.015) / (this.peak[b] - this.floor[b]));
      if (b === 0) f.low = n; else if (b === 1) f.mid = n; else {
        f.high = n;
        // Un tono deja pocos bandas cerca del máximo; el ruido, casi todas.
        let near = 0;
        if (mx > 60) for (let i = a; i < z; i++) if (bins[i] > mx * 0.72) near++;
        const flat = n > 0.2 ? clamp((near / (z - a) - 0.2) / 0.45) : 0;
        f.noise += (flat - f.noise) * 0.15;
      }
      if (n - this.avg[b] > 0.2 && n > 0.32 && now - this.last[b] > COOLDOWN[b]) {
        f.onset[b] = n;
        this.last[b] = now;
      }
      this.avg[b] += (n - this.avg[b]) * 0.12;
    }
    if (f.level > 0.12 && f.level > this.levelAvg * 2.2 && now - this.lastLoud > 1) {
      f.loud = clamp(f.level * 2);
      this.lastLoud = now;
    }
    this.levelAvg += (f.level - this.levelAvg) * 0.05;
  }

  // ---------- Fuentes ----------

  stopSources() {
    this.stopDemo();
    this.stopSong();
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.micNode.disconnect(); this.stream = null; }
    if (this.fileEl) { this.fileEl.pause(); this.fileNode.disconnect(); URL.revokeObjectURL(this.fileEl.src); this.fileEl = null; }
    this.mode = 'silencio';
  }

  async useMic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('inseguro');
    const ctx = this.ensure();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.stopSources();
    this.stream = stream;
    this.micNode = ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.analyser);
    this.mode = 'micrófono';
  }

  async useFile(file) {
    const ctx = this.ensure();
    this.stopSources();
    const el = new Audio(URL.createObjectURL(file));
    el.loop = true;
    this.fileEl = el;
    this.fileNode = ctx.createMediaElementSource(el);
    this.fileNode.connect(this.out);
    await el.play();
    this.mode = file.name;
  }

  // ---------- Instrumentos ----------
  // Todos devuelven { srcs, g } para poder soltarlos; dest permite rutear la canción aparte.

  voice(kind, freq, t, vel = 1, dest = this.out) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const srcs = [];
    g.gain.setValueAtTime(0, t);
    const osc = (type, f, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.detune.value = detune;
      o.start(t);
      srcs.push(o);
      return o;
    };
    const lowpass = (hz, q = 0.7) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = hz;
      lp.Q.value = q;
      lp.connect(g);
      return lp;
    };
    if (kind === 'low') {
      osc('sawtooth', freq).connect(lowpass(480));
      g.gain.linearRampToValueAtTime(0.34 * vel, t + 0.05);
    } else if (kind === 'pad') {
      const lp = lowpass(900);
      for (const dt of [-9, 0, 8]) osc('sawtooth', freq, dt).connect(lp);
      g.gain.linearRampToValueAtTime(0.07 * vel, t + 1.2);
    } else if (kind === 'stab') {
      const lp = lowpass(2400);
      for (const dt of [-6, 6]) osc('sawtooth', freq, dt).connect(lp);
      g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.008);
      g.gain.setTargetAtTime(0.05 * vel, t + 0.02, 0.4);
    } else {
      osc('triangle', freq).connect(g);
      g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.012);
      if (kind === 'mid') g.gain.setTargetAtTime(0.1 * vel, t + 0.03, 0.3);
    }
    g.connect(dest);
    return { srcs, g };
  }

  release(v, t, tau = 0.12) {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, tau);
    for (const s of v.srcs) s.stop(t + tau * 8);
  }

  noiseSrc(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    n.loopStart = Math.random();
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur);
    return n;
  }

  rain(t, dur, vel = 1, dest = this.out) {
    const ctx = this.ctx, hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13 * vel, t + 1.5);
    g.gain.setValueAtTime(0.13 * vel, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    this.noiseSrc(t, dur + 0.1).connect(hp).connect(g).connect(dest);
  }

  thunder(t, vel = 1, dest = this.out) {
    const ctx = this.ctx;
    // Chasquido: ruido de banda ancha muy corto.
    const crack = ctx.createGain();
    crack.gain.setValueAtTime(0.9 * vel, t);
    crack.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    this.noiseSrc(t, 0.3).connect(crack).connect(dest);
    // Retumbo: ruido grave que se apaga lento y un golpe senoidal que cae.
    const lp = ctx.createBiquadFilter(), rum = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    rum.gain.setValueAtTime(0, t);
    rum.gain.linearRampToValueAtTime(1.4 * vel, t + 0.12);
    rum.gain.exponentialRampToValueAtTime(0.01, t + 2.4);
    this.noiseSrc(t, 2.5).connect(lp).connect(rum).connect(dest);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.8);
    og.gain.setValueAtTime(0.7 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.01, t + 1);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 1.1);
  }

  play(kind, freq, dur, at = 0) {
    const t = this.ensure().currentTime + at;
    if (kind === 'high') return this.chirp(freq, t);
    this.release(this.voice(kind, freq, t), t + dur, kind === 'low' ? 0.25 : 0.12);
  }

  chirp(freq, t, vel = 1, dest = this.out) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.92, t + 0.17);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  noteOn(id, kind, freq) {
    if (this.voices.has(id)) return;
    const ctx = this.ensure();
    if (kind === 'high') return this.chirp(freq, ctx.currentTime);
    this.voices.set(id, this.voice(kind, freq, ctx.currentTime));
  }

  noteOff(id) {
    const v = this.voices.get(id);
    if (!v) return;
    this.release(v, this.ctx.currentTime, 0.18);
    this.voices.delete(id);
  }

  bend(id, freq) {
    const v = this.voices.get(id);
    if (v) v.srcs[0].frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.025);
  }

  // ---------- Canción ----------
  // Agenda los eventos con un cuarto de segundo de anticipación sobre el reloj de audio
  // y vuelve a empezar al terminar. Va por su propio bus para poder cortarla de golpe.

  startSong() {
    const ctx = this.ensure();
    this.stopSources();
    this.mode = 'canción';
    this.bus = ctx.createGain();
    this.bus.connect(this.out);
    this.songT0 = ctx.currentTime + 0.15;
    this.ei = 0;
    this.songTimer = setInterval(() => this.songStep(), 40);
    this.songStep();
  }

  stopSong() {
    if (!this.songTimer) return;
    clearInterval(this.songTimer);
    this.songTimer = 0;
    const bus = this.bus, t = this.ctx.currentTime;
    bus.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => bus.disconnect(), 600);
    for (const id of this.sectionTimers || []) clearTimeout(id);
    this.sectionTimers = [];
  }

  songStep() {
    const ctx = this.ctx, ev = SONG.events, horizon = ctx.currentTime + 0.25;
    for (;;) {
      const e = ev[this.ei], t = this.songT0 + e[0];
      if (t > horizon) break;
      const [, kind, midi, dur, vel] = e, f = midiFreq(midi), bus = this.bus;
      if (kind === 'section') {
        const id = setTimeout(() => this.onSection?.(vel), Math.max(0, (t - ctx.currentTime) * 1000));
        (this.sectionTimers ||= []).push(id);
        if (this.sectionTimers.length > 12) this.sectionTimers.shift();
      } else if (kind === 'high') this.chirp(f, t, 1, bus);
      else if (kind === 'rain') this.rain(t, dur, vel, bus);
      else if (kind === 'thunder') this.thunder(t, vel, bus);
      else this.release(this.voice(kind, f, t, vel, bus), t + dur, kind === 'pad' ? 0.9 : kind === 'low' ? 0.2 : 0.12);
      if (++this.ei >= ev.length) { this.ei = 0; this.songT0 += SONG.dur; }
    }
  }

  // ---------- Demo generativa ----------
  // Recorre secciones con carácter propio para que aparezca todo el repertorio del paisaje.

  startDemo() {
    this.ensure();
    this.stopSources();
    this.mode = 'demo';
    this.section = 'cordillera';
    this.left = 14;
    this.tick = 0;
    this.demoTimer = setInterval(() => this.demoStep(), 250);
  }

  stopDemo() {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = 0;
  }

  demoStep() {
    const r = Math.random, k = this.tick++;
    if (--this.left <= 0) {
      const next = { cordillera: ['bosque', 'bandada', 'llanura'], bosque: ['bandada', 'cordillera', 'tormenta'], bandada: ['llanura', 'cordillera', 'bosque'], llanura: ['cordillera', 'tormenta', 'bosque'], tormenta: ['llanura', 'bandada'] }[this.section];
      this.section = next[(r() * next.length) | 0];
      this.left = this.section === 'llanura' ? 10 : 14 + ((r() * 10) | 0);
      if (this.section === 'tormenta') this.rain(this.ctx.currentTime, this.left * 0.25, 0.8);
    }
    switch (this.section) {
      case 'cordillera':
        if (k % 6 === 0) this.play('low', noteFreq(55, (r() * 6) | 0), 1.1 + r() * 0.8);
        if (r() < 0.12) this.play('mid', noteFreq(220, (r() * 8) | 0), 0.2);
        break;
      case 'bosque':
        if (k % 8 === 0) this.play('low', noteFreq(55, (r() * 3) | 0), 1.6);
        if (r() < 0.55) this.play('mid', noteFreq(220, (r() * 9) | 0), 0.18 + r() * 0.2);
        break;
      case 'bandada':
        if (r() < 0.4) for (let i = 0, n = 2 + ((r() * 3) | 0); i < n; i++) this.play('high', noteFreq(1760, (r() * 7) | 0), 0, i * 0.09);
        if (k % 8 === 0) this.play('mid', noteFreq(220, (r() * 5) | 0), 0.5);
        break;
      case 'llanura':
        if (r() < 0.08) this.play('mid', noteFreq(220, (r() * 5) | 0), 0.15);
        break;
      case 'tormenta':
        if (k % 4 === 0) this.play('low', noteFreq(55, (r() * 4) | 0), 0.9);
        if (r() < 0.4) this.play('mid', noteFreq(220, (r() * 9) | 0), 0.15);
        if (k % 14 === 7) this.thunder(this.ctx.currentTime);
        break;
    }
  }
}
