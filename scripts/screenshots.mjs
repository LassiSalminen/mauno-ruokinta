// Ottaa README:n kuvakaappaukset esimerkkidatalla: npm run screenshots
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const PORT = 4174, URL = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));

const NOW = new Date('2026-11-16T18:10:00+02:00').getTime(), H = 36e5, D = 864e5;
const day0 = new Date('2026-11-16T00:00:00+02:00').getTime();
const feeds = [];
for (let d = 1; d <= 6; d++) {
  feeds.push({ id: 'k' + d, t: day0 - d * D + 7.6 * H, g: 80, dl: 2, slot: 0 });
  feeds.push({ id: 'r' + d, t: day0 - d * D + 17.1 * H, g: 100, raw: 2, slot: 1 });
}
feeds.push({ id: 'k0', t: day0 + 7.6 * H, g: 80, dl: 2, slot: 0 });
const data = {
  cfg: { dogName: 'Mauno', breed: 'cockerspanieli', age: 'aikuinen', weightKg: 13.5, meals: 2, mealTimes: ['07:30', '17:00'],
    dailyG: 180, dailyUnit: 'dl', gPerDl: 40, pullaG: 50, bagKg: 12, foodName: 'Kuivaruoka Adult', thawH: 12, alertDays: 7, setupDone: true,
    plan: [{ type: 'kuiva', unit: 'dl', dl: 2 }, { type: 'raaka', n: 2 }] },
  base: { g: 6400, t: day0 - 7 * D }, rawBase: { freezer: 24, fridge: 4, t: day0 - 7 * D },
  feeds: feeds.sort((a, b) => b.t - a.t),
  rawlog: [{ id: 'th1', t: day0 - 5 * D + 19 * H, kind: 'thaw', n: 4 }, { id: 'th2', t: day0 - 3 * D + 19 * H, kind: 'thaw', n: 4 }, { id: 'th3', t: day0 - D + 19 * H, kind: 'thaw', n: 2 }],
  purchases: [], items: [
    { id: 'i1', name: 'Namit', icon: '🍬', unit: 'pss', qty: 1, low: 1, order: 1 },
    { id: 'i2', name: 'Puruluut', icon: '🦴', unit: 'kpl', qty: 6, low: 2, order: 2 },
    { id: 'i3', name: 'Märkäruoka', icon: '🥫', unit: 'prk', qty: 4, low: 1, link: 'wet', order: 3 }],
  notes: [{ id: 'n1', t: day0 - 2 * D + 9 * H, text: 'Maitohappobakteeri annettu' }, { id: 'n2', t: day0 - 20 * D + 9 * H, text: 'Kynnet leikattu' }],
};

await mkdir('docs', { recursive: true });
const browser = await chromium.launch();
for (const [file, viewport] of [['docs/mobiili.png', { width: 390, height: 1100 }], ['docs/tyopoyta.png', { width: 1100, height: 860 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'fi-FI', timezoneId: 'Europe/Helsinki', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(d => localStorage.setItem('koira-ruokinta-v1', JSON.stringify(d)), data);
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.screenshot({ path: file });
  console.log('✓', file);
  await ctx.close();
}
await browser.close();
server.kill();
