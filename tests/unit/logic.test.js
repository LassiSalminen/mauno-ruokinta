process.env.TZ = 'Europe/Helsinki';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/logic.js');

const at = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
// Aamulla 80 g kuivaa (slot 0), illalla 2 lihapullaa (slot 1)
const cfg = { setupDone: true, dogName: 'Mauno', meals: 2, mealTimes: ['07:30', '17:00'], dailyG: 180, alertDays: 7, thawH: 12, pullaG: 50,
  plan: [{ type: 'kuiva', unit: 'g', g: 80 }, { type: 'raaka', n: 2 }] };
const base = (over = {}) => ({ cfg, base: null, rawBase: null, feeds: [], rawlog: [], items: [], ...over });

test('rawNeed: loppupäivä + huominen − jääkaapissa', () => {
  const now = at('2026-11-16', '12:00');
  const st = base({ rawBase: { freezer: 20, fridge: 2, t: now - 3600e3 } });
  assert.equal(L.rawNeed(st, now), 2); // ilta 2 + huominen 2 − 2
  st.rawlog = [{ t: now - 60e3, kind: 'thaw', n: 2 }];
  assert.equal(L.rawNeed(st, now), 0);
  const rs = L.rawState(st, now);
  assert.equal(rs.fz, 18); assert.equal(rs.fr, 4); assert.equal(rs.thawing, 2); assert.equal(rs.ready, 2);
});

test('rawNeed: kun ilta on syöty, tarvitaan vain huominen', () => {
  const now = at('2026-11-16', '19:00');
  const st = base({ rawBase: { freezer: 20, fridge: 2, t: at('2026-11-16', '06:00') },
    feeds: [{ t: at('2026-11-16', '17:05'), g: 100, raw: 2, slot: 1 }] });
  assert.equal(L.rawState(st, now).fr, 0);
  assert.equal(L.rawNeed(st, now), 2);
});

test('stockG vähentää vain kuivaruoan', () => {
  const st = base({ base: { g: 5000, t: 0 }, feeds: [{ t: 5, g: 80 }, { t: 6, g: 100, raw: 2 }, { t: 7, g: 400, wet: true }] });
  assert.equal(L.stockG(st), 4920);
});

test('reminders: sulatus klo 17–21, ei ennen', () => {
  const st = base({ rawBase: { freezer: 20, fridge: 0, t: 0 } });
  assert.equal(L.reminders(st, at('2026-11-16', '16:30')).filter(r => r.key.startsWith('thaw')).length, 0);
  const r = L.reminders(st, at('2026-11-16', '17:30')).find(r => r.key.startsWith('thaw'));
  assert.equal(r.key, 'thaw-2026-11-16');
  assert.equal(r.body, '🧊 Ota 4 lihapullaa sulamaan huomiseksi');
  assert.equal(L.reminders(st, at('2026-11-16', '21:10')).filter(r => r.key.startsWith('thaw')).length, 0);
});

test('reminders: ateria yli 60 min myöhässä', () => {
  const st = base({ rawBase: { freezer: 20, fridge: 10, t: 0 }, feeds: [{ t: at('2026-11-16', '07:40'), g: 80, slot: 0 }] });
  assert.equal(L.reminders(st, at('2026-11-16', '17:50')).filter(r => r.key.startsWith('late')).length, 0);
  const late = L.reminders(st, at('2026-11-16', '18:05')).filter(r => r.key.startsWith('late'));
  assert.deepEqual(late.map(r => [r.key, r.body]), [['late-2026-11-16-1', '🍽️ Iltaruoka on kirjaamatta']]);
});

test('reminders: päivittäinen varastomuistutus klo 10 jälkeen', () => {
  const now = at('2026-11-16', '10:05');
  const st = base({ base: { g: 300, t: 0 }, rawBase: { freezer: 3, fridge: 1, t: 0 },
    feeds: [{ t: at('2026-11-16', '07:40'), g: 80, slot: 0 }],
    items: [{ id: 'a', name: 'Namit', icon: '🍬', unit: 'pss', qty: 1, low: 1 }, { id: 'b', name: 'Luut', unit: 'kpl', qty: 5, low: 1 }] });
  assert.equal(L.reminders(st, at('2026-11-16', '09:50')).filter(r => r.key.startsWith('daily')).length, 0);
  const d = L.reminders(st, now).find(r => r.key.startsWith('daily'));
  assert.equal(d.key, 'daily-2026-11-16');
  assert.match(d.body, /Kuivaruoka riittää n\. 2 pv/);
  assert.match(d.body, /lihapullat riittävät n\. 2 pv/);
  assert.match(d.body, /Namit vähissä: 1 pss/);
  assert.doesNotMatch(d.body, /Luut/);
});

test('reminders: ei mitään ennen käyttöönottoa', () => {
  assert.deepEqual(L.reminders({ cfg: { setupDone: false } }, at('2026-11-16', '18:00')), []);
});
