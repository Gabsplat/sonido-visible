// Arranque: papel, controles, teclado, theremín y bucle de animación.
import { INK, clamp } from './core.js';
import { Sound, noteFreq } from './audio.js';
import { Stage } from './stage.js';
import { SONG } from './song.js';

const $ = (s) => document.querySelector(s);

// Textura de papel: grano y alguna fibra. Se genera una vez.
function makePaper() {
  const n = 256, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  c.fillStyle = INK.paper;
  c.fillRect(0, 0, n, n);
  const img = c.getImageData(0, 0, n, n), p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = (Math.random() - 0.5) * 14;
    p[i] += v; p[i + 1] += v; p[i + 2] += v * 0.9;
  }
  c.putImageData(img, 0, 0);
  c.strokeStyle = 'rgba(120,100,70,0.06)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * n, y = Math.random() * n, a = Math.random() * 6.3, l = 4 + Math.random() * 14;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  return cv;
}

const paper = makePaper();
document.body.style.backgroundImage = `url(${paper.toDataURL()})`;

const sound = new Sound();
const stage = new Stage($('#hoja'), $('header'));
const status = $('#estado');
const meters = [...document.querySelectorAll('.k i b')];
const buttons = { mic: $('#mic'), demo: $('#demo'), song: $('#cancion') };

const say = (t) => (status.textContent = t);
const mark = () => {
  buttons.mic.classList.toggle('on', sound.mode === 'micrófono');
  buttons.demo.classList.toggle('on', sound.mode === 'demo');
  buttons.demo.textContent = sound.mode === 'demo' ? 'Parar demo' : 'Demo';
  buttons.song.classList.toggle('on', sound.mode === 'canción');
  buttons.song.textContent = sound.mode === 'canción' ? 'Parar canción' : 'Canción';
};

buttons.mic.addEventListener('click', async () => {
  if (sound.mode === 'micrófono') { sound.stopSources(); say('Micrófono apagado.'); return mark(); }
  try {
    say('Pidiendo permiso para el micrófono…');
    await sound.useMic();
    say('Escuchando. Hablá, cantá, silbá, aplaudí.');
  } catch (e) {
    say(e.message === 'inseguro'
      ? 'El navegador sólo da el micrófono en HTTPS. Probá con Demo o el teclado.'
      : 'No hay acceso al micrófono (permiso denegado o sin dispositivo).');
  }
  mark();
});

buttons.song.addEventListener('click', () => {
  if (sound.mode === 'canción') { sound.stopSources(); say('Canción detenida.'); }
  else { sound.startSong(); say(`♪ ${SONG.title}`); }
  mark();
});
sound.onSection = (name) => {
  stage.annotate(name);
  say(`♪ ${SONG.title} — ${name}`);
};

buttons.demo.addEventListener('click', () => {
  if (sound.mode === 'demo') { sound.stopSources(); say('Demo detenida.'); }
  else { sound.startDemo(); say('Demo: una pieza generativa que pasa por cordilleras, bosques, bandadas y llanuras.'); }
  mark();
});

$('#archivo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { await sound.useFile(file); say(`Sonando «${file.name}» en bucle.`); }
  catch { say('No se pudo reproducir ese archivo.'); }
  e.target.value = '';
  mark();
});

$('#guardar').addEventListener('click', () => {
  stage.snapshot(paper).toBlob((blob) => {
    const a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `paisaje-sonoro-${d.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

$('#nueva').addEventListener('click', () => stage.reset());

// Teclado: tres filas, tres capas del paisaje.
const ROWS = [['zxcvbnm', 'low', 55], ['asdfghjkl', 'mid', 220], ['qwertyuiop', 'high', 1760]];
const KEYS = {};
for (const [row, kind, base] of ROWS) [...row].forEach((ch, i) => (KEYS[ch] = [kind, noteFreq(base, i)]));

addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = KEYS[e.key.toLowerCase()];
  if (k) sound.noteOn(e.key.toLowerCase(), k[0], k[1]);
});
addEventListener('keyup', (e) => sound.noteOff(e.key.toLowerCase()));
addEventListener('blur', () => { for (const id of [...sound.voices.keys()]) sound.noteOff(id); });

// Theremín: arrastrar sobre la hoja. Arriba agudo, abajo grave.
const hoja = $('#hoja');
const pitch = (y) => 50 * 2 ** ((1 - clamp((y - stage.sTop) / (stage.H - stage.sTop))) * 6.2);
hoja.addEventListener('pointerdown', (e) => {
  hoja.setPointerCapture(e.pointerId);
  sound.noteOn('theremin', 'theremin', pitch(e.clientY));
});
hoja.addEventListener('pointermove', (e) => sound.bend('theremin', pitch(e.clientY)));
const stopTheremin = () => sound.noteOff('theremin');
hoja.addEventListener('pointerup', stopTheremin);
hoja.addEventListener('pointercancel', stopTheremin);

addEventListener('resize', () => stage.resize());

// Bucle. Registra cuánto tarda cada cuadro para poder medirlo desde las pruebas.
const work = new Float32Array(600);
let wi = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sound.analyse(now / 1000);
  stage.step(dt, sound.f);
  stage.render();
  const f = sound.f;
  meters[0].style.transform = `scaleX(${f.low.toFixed(3)})`;
  meters[1].style.transform = `scaleX(${f.mid.toFixed(3)})`;
  meters[2].style.transform = `scaleX(${f.high.toFixed(3)})`;
  work[wi++ % work.length] = performance.now() - now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__app = { stage, sound, work, frames: () => wi };
