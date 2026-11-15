// Lähettää Maunon ruokintamuistutukset FCM:llä. Ajetaan GitHub Actionsissa 30 min välein (TZ=Europe/Helsinki).
//   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' node scripts/send-reminders.mjs [--dry-run]
// Ilman salaisuutta skripti ohittaa ajon siististi (exit 0).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../src/logic.js');

const DRY = process.argv.includes('--dry-run');
const HID = process.env.HOUSEHOLD || 'mauno';
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw || !raw.trim()) {
  console.log('FIREBASE_SERVICE_ACCOUNT puuttuu – muistutuksia ei lähetetä (ohitetaan).');
  process.exit(0);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getMessaging } = await import('firebase-admin/messaging');

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const P = `households/${HID}`;
const now = Date.now();

const docData = async p => { const s = await db.doc(`${P}/${p}`).get(); return s.exists ? s.data() : null; };
const since = (col, t) => db.collection(`${P}/${col}`).where('t', '>=', t).orderBy('t', 'desc').limit(1000).get()
  .then(q => q.docs.map(d => ({ id: d.id, ...d.data() })));

const [cfg, base, rawBase] = await Promise.all([docData('config/settings'), docData('stock/base'), docData('raw/base')]);
const st = { cfg, base, rawBase, feeds: [], rawlog: [], items: [] };
const t0 = Math.min(L.dayStart(now - 20 * L.DAY), base ? base.t : Infinity, rawBase ? rawBase.t : Infinity);
[st.feeds, st.rawlog, st.items] = await Promise.all([
  since('feeds', t0), since('rawlog', Math.min(L.dayStart(now - 20 * L.DAY), rawBase ? rawBase.t : Infinity)),
  db.collection(`${P}/items`).get().then(q => q.docs.map(d => ({ id: d.id, ...d.data() }))),
]);

const due = L.reminders(st, now);
console.log(`${new Date(now).toLocaleString('fi-FI')}: ${due.length} muistutusehdokasta`);
if (!due.length) process.exit(0);

const tokenDocs = (await db.collection(`${P}/pushTokens`).get()).docs;
const tokens = [...new Set(tokenDocs.flatMap(d => d.data().tokens || []))];
if (!tokens.length) { console.log('Ei push-tokeneita – kukaan ei ole ottanut muistutuksia käyttöön.'); process.exit(0); }

for (const r of due) {
  const ref = db.doc(`${P}/sentReminders/${r.key}`);
  if (DRY) { console.log('[dry-run]', r.key, '→', r.body); continue; }
  try { await ref.create({ ...r, t: now }); } // atominen: epäonnistuu jos jo lähetetty
  catch (e) { if (e.code === 6) { console.log('Jo lähetetty:', r.key); continue; } throw e; }

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: r.title, body: r.body, tag: r.key },
    webpush: { headers: { Urgency: 'high', TTL: String(6 * 3600) } },
  });
  console.log(`${r.key}: ${res.successCount}/${tokens.length} lähetetty`);

  // Siivoa vanhentuneet tokenit
  const dead = res.responses.map((x, i) => (!x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error?.code || '')) ? tokens[i] : null).filter(Boolean);
  if (dead.length) await Promise.all(tokenDocs.map(d => d.ref.update({ tokens: FieldValue.arrayRemove(...dead) })));
  if (res.successCount === 0) await ref.delete(); // yritetään uudelleen seuraavalla ajolla
}
