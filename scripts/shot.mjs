// Capturas y medición: node scripts/shot.mjs [segundos,...] [ancho] [alto]
// Arranca la demo, saca capturas en esos segundos y mide el costo por cuadro.
import { chromium } from 'playwright';
const [times = '8,20', w = '1440', h = '900'] = process.argv.slice(2);
const url = process.env.URL || 'http://127.0.0.1:4400/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 1) });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url);
await page.click(process.env.BTN || "#cancion");
const t0 = Date.now();
for (const s of times.split(',')) {
  await page.waitForTimeout(Math.max(0, +s * 1000 - (Date.now() - t0)));
  await page.screenshot({ path: `shots/demo-${s}s-${w}.png` });
}
const m = await page.evaluate(() => {
  const a = window.__app, n = Math.min(a.frames(), a.work.length);
  const v = [...a.work.slice(0, n)].sort((x, y) => x - y);
  return { cuadros: a.frames(), p50: v[n >> 1].toFixed(2), p95: v[Math.floor(n * 0.95)].toFixed(2), max: v[n - 1].toFixed(2) };
});
console.log('trabajo por cuadro (ms):', m, 'errores:', errs.length ? errs : 'ninguno');
await browser.close();
