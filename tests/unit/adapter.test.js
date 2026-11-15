const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeUser, soft } = require('../../src/firebase-adapter.js');
const { createFakeFirestore } = require('./fake-firestore.js');

const HH = 'households/mauno';
const setup = () => { const f = createFakeFirestore(); return { f, db: makeDb(f.fs, f.db, HH, { writeWaitMs: 50 }) }; };

test('doc.set/get prefixoi polun kotitalouden alle', async () => {
  const { f, db } = setup();
  await db.doc('config/settings').set({ dogName: 'Mauno' });
  assert.deepEqual(f.store.get('households/mauno/config/settings'), { dogName: 'Mauno' });
  const s = await db.doc('config/settings').get();
  assert.equal(s.exists, true);
  assert.equal(s.data().dogName, 'Mauno');
  assert.equal((await db.doc('stock/base').get()).exists, false);
});

test('doc.update yhdistää kentät ja delete poistaa', async () => {
  const { f, db } = setup();
  await db.doc('stock/base').set({ g: 1000, t: 1 });
  await db.doc('stock/base').update({ g: 500 });
  assert.deepEqual(f.store.get(`${HH}/stock/base`), { g: 500, t: 1 });
  await db.doc('stock/base').delete();
  assert.equal(f.store.has(`${HH}/stock/base`), false);
});

test('collection.add palauttaa id:n ja doc(id).delete poistaa', async () => {
  const { f, db } = setup();
  const { id } = await db.collection('feeds').add({ t: 10, g: 80 });
  assert.ok(id);
  assert.deepEqual(f.store.get(`${HH}/feeds/${id}`), { t: 10, g: 80 });
  await db.collection('feeds').doc(id).delete();
  assert.equal(f.store.size, 0);
});

test('collection.doc(id).set kirjoittaa annetulla id:llä', async () => {
  const { f, db } = setup();
  await db.collection('items').doc('abc').set({ name: 'Namit', qty: 3 });
  assert.equal(f.store.get(`${HH}/items/abc`).name, 'Namit');
});

test('where/orderBy/limit ja onSnapshot palauttavat sovelluksen odottaman muodon', async () => {
  const { db } = setup();
  for (const t of [1, 5, 3, 9]) await db.collection('feeds').add({ t, g: t * 10 });
  const q = await db.collection('feeds').where('t', '>=', 3).orderBy('t', 'desc').limit(2).get();
  assert.deepEqual(q.docs.map(d => d.data().t), [9, 5]);
  assert.equal(typeof q.docs[0].id, 'string');

  const seen = [];
  const unsub = db.collection('feeds').orderBy('t').onSnapshot(s => seen.push(s.docs.map(d => d.data().t)));
  await db.collection('feeds').add({ t: 0, g: 1 });
  unsub();
  await db.collection('feeds').add({ t: 100, g: 1 });
  assert.deepEqual(seen, [[1, 3, 5, 9], [0, 1, 3, 5, 9]]);
});

test('doc.onSnapshot: exists on ominaisuus ja metadata.fromCache on mukana', async () => {
  const { db } = setup();
  const snaps = [];
  const unsub = db.doc('config/settings').onSnapshot(s => snaps.push(s));
  await db.doc('config/settings').set({ dogName: 'Mauno' });
  unsub();
  assert.equal(snaps[0].exists, false);
  assert.equal(snaps[1].exists, true);
  assert.equal(snaps[1].data().dogName, 'Mauno');
  assert.equal(snaps[1].metadata.fromCache, false);
});

test('virhekoodit muunnetaan sovelluksen käyttämään muotoon', async () => {
  const { f, db } = setup();
  f.fail.next = Object.assign(new Error('quota'), { code: 'resource-exhausted' });
  await assert.rejects(db.doc('config/settings').set({}), e => e.code === 'quota_exceeded');
  f.fail.next = Object.assign(new Error('nope'), { code: 'permission-denied' });
  await assert.rejects(db.collection('notes').add({ t: 1 }), e => e.code === 'permission_denied');
});

test('soft(): offline-kirjoitus ei jumita käyttöliittymää', async () => {
  const never = new Promise(() => {});
  const t0 = Date.now();
  await soft(never, 30);
  assert.ok(Date.now() - t0 < 500);
});

test('user: id, can ja profiles', async () => {
  const f = createFakeFirestore();
  f.store.set(`${HH}/profiles/u1`, { name: 'Lassi Salminen' });
  const u = makeUser(f.fs, f.db, HH, { uid: 'u1', email: 'a@b.fi', displayName: 'Lassi' }, true);
  assert.equal(await u.id(), 'u1');
  assert.equal(await u.can('data.write'), true);
  assert.equal(await u.can('admin'), false);
  assert.deepEqual(await u.profiles(['u1', 'u2']), { u1: { name: 'Lassi Salminen' } });
  const denied = makeUser(f.fs, f.db, HH, { uid: 'x' }, false);
  assert.equal(await denied.can('data.write'), false);
});
