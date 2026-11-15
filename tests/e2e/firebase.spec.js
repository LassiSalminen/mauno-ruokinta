// Ajaa src/firebase-adapter.js:n selainkäynnistyksen (kirjautumisnäkymä, jäsenyys, synkronointi)
// feikattuja Firebase-moduuleja vasten. Oikeaa Firebasea ei tarvita.
const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { prepare } = require('./helpers');

const fakeFs = readFileSync(join(__dirname, '..', 'unit', 'fake-firestore.js'), 'utf8');

const MODULES = {
  'firebase-app.js': `export const initializeApp = c => ({ options: c });`,
  'firebase-firestore.js': `
    const module = { exports: {} };
    ${fakeFs}
    const f = window.__fake || (window.__fake = module.exports.createFakeFirestore());
    export const { doc, collection, where, orderBy, limit, query, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, writeBatch } = f.fs;
    export const initializeFirestore = () => f.db, getFirestore = () => f.db;
    export const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});`,
  'firebase-auth.js': `
    let cb = null, user = null;
    export const getAuth = () => ({});
    export const getRedirectResult = async () => null;
    export const onAuthStateChanged = (_a, f) => { cb = f; setTimeout(() => f(user)); return () => {}; };
    export class GoogleAuthProvider { setCustomParameters() {} }
    export const signInWithPopup = async () => { user = { uid: 'uid-' + window.__loginAs.split('@')[0], email: window.__loginAs, displayName: window.__loginName || 'Testi' }; cb(user); return { user }; };
    export const signInWithRedirect = signInWithPopup;
    export const signOut = async () => { user = null; };`,
};

async function withFakeFirebase(page, loginAs, name) {
  await prepare(page);
  await page.route('**/src/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body:
    `window.FIREBASE_CONFIG={apiKey:'test',projectId:'test'}; window.MAUNO_HOUSEHOLD='mauno'; window.MAUNO_OWNER='lassi.salminen3@gmail.com';
     window.__loginAs=${JSON.stringify(loginAs)}; window.__loginName=${JSON.stringify(name)};` }));
  await page.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/, r => {
    const file = r.request().url().split('/').pop();
    return MODULES[file] ? r.fulfill({ contentType: 'text/javascript', body: MODULES[file], headers: { 'Access-Control-Allow-Origin': '*' } }) : r.abort();
  });
}
const store = (page, path) => page.evaluate(p => { const d = window.__fake.store.get(p); return d ? JSON.parse(JSON.stringify(d)) : null; }, path);

test('omistaja kirjautuu, kotitalous luodaan ja data tallentuu Firestoreen', async ({ page }) => {
  await withFakeFirebase(page, 'lassi.salminen3@gmail.com', 'Lassi Salminen');
  await page.goto('./');
  await expect(page.locator('#fbGate')).toContainText('Kirjaudu Googlella');
  await expect(page.locator('#wiz')).toBeHidden(); // käyttöönotto odottaa kirjautumista
  await page.click('#fbLogin');

  await expect(page.locator('#fbGate')).toBeHidden();
  await expect(page.locator('#wiz')).toBeVisible();
  expect(await store(page, 'households/mauno')).toEqual({ owner: 'lassi.salminen3@gmail.com', members: ['lassi.salminen3@gmail.com'] });
  expect((await store(page, 'households/mauno/profiles/uid-lassi.salminen3')).name).toBe('Lassi Salminen');
  await expect(page.locator('#acct')).toContainText('Lassi Salminen');
  await expect(page.locator('#acct')).toContainText('Ota muistutukset käyttöön');
  await expect(page.locator('#acct')).toContainText('Lisää jäsen');

  // Pikakäyttöönotto: nimi ja päiväannos, loput oletuksilla
  await page.fill('#wName', 'Mauno');
  for (let i = 0; i < 3; i++) await page.click('#wizNext');
  await page.fill('#wDaily', '180');
  while ((await page.locator('#wizNext').textContent()) !== 'Aloita 🐾') await page.click('#wizNext');
  await page.click('#wizNext');
  await expect(page.locator('#dogName')).toContainText('Mauno');
  await expect(page.locator('#foot')).toContainText('Tiedot jaetaan');
  expect((await store(page, 'households/mauno/config/settings')).dogName).toBe('Mauno');

  // Aterian kirjaus menee jaettuun tietoon ja näkyy kirjaajan nimellä
  await page.click('#meals [data-slot="0"]');
  await expect(page.locator('#meals [data-slot="0"]')).toContainText('Lassi');
  const feeds = await page.evaluate(() => [...window.__fake.store.keys()].filter(k => k.startsWith('households/mauno/feeds/')));
  expect(feeds).toHaveLength(1);

  // Jäsenen lisäys
  page.once('dialog', d => d.accept('Annika@Example.com'));
  await page.click('#acct [data-fb="member"]');
  await expect(page.locator('#toastTxt')).toContainText('annika@example.com lisätty');
  expect((await store(page, 'households/mauno')).members).toEqual(['lassi.salminen3@gmail.com', 'annika@example.com']);
});

test('jäsen näkee jaetun datan; ulkopuolinen ei pääse', async ({ page, context }) => {
  await withFakeFirebase(page, 'annika@example.com', 'Annika');
  await page.goto('./');
  await expect(page.locator('#fbLogin')).toBeVisible(); // Firebase-moduulit ladattu
  // Esitäytetään feikki-Firestore ennen kirjautumista
  await page.evaluate(() => {
    const s = window.__fake.store;
    s.set('households/mauno', { owner: 'lassi.salminen3@gmail.com', members: ['lassi.salminen3@gmail.com', 'annika@example.com'] });
    s.set('households/mauno/config/settings', { dogName: 'Mauno', setupDone: true, dailyG: 180 });
  });
  await page.click('#fbLogin');
  await expect(page.locator('#dogName')).toContainText('Mauno');
  await expect(page.locator('#wiz')).toBeHidden();
  await expect(page.locator('#acct')).not.toContainText('Lisää jäsen'); // vain omistajalle

  const other = await context.newPage();
  await withFakeFirebase(other, 'vieras@example.com', 'Vieras');
  await other.goto('./');
  await other.click('#fbLogin');
  await expect(other.locator('#fbGate')).toContainText('Ei pääsyä');
  await other.click('#fbLocal');
  await expect(other.locator('#fbGate')).toBeHidden();
  await expect(other.locator('#foot')).toContainText('vain tähän selaimeen');
});

test('paikalliset tiedot voi siirtää jaettuun tietoon kirjautuessa', async ({ page }) => {
  await withFakeFirebase(page, 'lassi.salminen3@gmail.com', 'Lassi');
  await page.addInitScript(() => {
    if (!localStorage.getItem('koira-ruokinta-v1')) localStorage.setItem('koira-ruokinta-v1', JSON.stringify({
      cfg: { dogName: 'Mauno', setupDone: true, dailyG: 180 }, base: { g: 5000, t: 1 }, rawBase: null,
      feeds: [{ id: 'f1', t: 2, g: 80, slot: 0 }], rawlog: [], purchases: [], notes: [{ id: 'n1', t: 3, text: 'Moi' }], items: [] }));
  });
  await page.goto('./');
  page.once('dialog', d => d.accept());
  await page.click('#fbLogin');
  await expect(page.locator('#toastTxt')).toContainText('Tiedot siirretty');
  expect((await store(page, 'households/mauno/config/settings')).dogName).toBe('Mauno');
  expect(await store(page, 'households/mauno/stock/base')).toEqual({ g: 5000, t: 1 });
  expect(await store(page, 'households/mauno/feeds/f1')).toEqual({ t: 2, g: 80, slot: 0 });
  expect((await store(page, 'households/mauno/notes/n1')).text).toBe('Moi');
});
