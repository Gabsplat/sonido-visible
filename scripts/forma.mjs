// Recorre «Cumbre» y registra noche, viento y drop: node scripts/forma.mjs (servidor encendido).
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:4400/'); await p.click('#cumbre');
const t0 = Date.now();
for (const s of [20, 52, 61, 64, 80]) {
  await p.waitForTimeout(s * 1000 - (Date.now() - t0));
  const st = await p.evaluate(() => { const s = window.__app.stage; return { night: s.night.toFixed(2), wind: s.windV.toFixed(2), drop: s.dropV.toFixed(2), low: s.lowSlow.toFixed(2), v: s.v.toFixed(0) }; });
  console.log(s, JSON.stringify(st));
  await p.screenshot({ path: `shots/cumbre-${s}.png` });
}
console.log('errores', errs); await b.close();
