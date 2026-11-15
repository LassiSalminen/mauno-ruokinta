/* Maunon ruokinta – Firebase-adapteri.
 *
 * Toteuttaa saman rajapinnan kuin window.claude.use('db') / use('user') Firestoren ja Firebase Authin päälle,
 * jotta sovelluksen logiikkaa ei tarvitse muuttaa:
 *   db.doc(path)          → get / set / update / delete / onSnapshot
 *   db.collection(path)   → add / doc / where / orderBy / limit / get / onSnapshot
 *   user.id() / user.can('data.write') / user.profiles(ids)
 * Kaikki polut prefixataan: households/<MAUNO_HOUSEHOLD>/...
 *
 * Jos FIREBASE_CONFIG puuttuu, adapteri ei tee mitään ja sovellus toimii localStorage-tilassa.
 * Node-ympäristössä (yksikkötestit) tiedosto vie module.exportsiin puhtaat tehdasfunktiot.
 */
(function (root) {
  'use strict';

  /* ---------- puhdas ydin (testattava) ---------- */
  const ERR = { 'permission-denied': 'permission_denied', 'resource-exhausted': 'quota_exceeded', 'unavailable': 'unavailable', 'invalid-argument': 'invalid_argument' };
  function mapErr(e) {
    const n = new Error((e && e.message) || String(e));
    n.code = (e && ERR[e.code]) || (e && e.code) || 'unknown';
    n.cause = e;
    return n;
  }
  /** Odottaa kirjoituksen kuittausta enintään `ms` – offline-tilassa kirjoitus jää Firestoren jonoon eikä käyttöliittymä jää jumiin. */
  function soft(p, ms) {
    return new Promise((res, rej) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(); } }, ms);
      p.then(v => { if (!done) { done = true; clearTimeout(t); res(v); } },
        e => { const m = mapErr(e); if (!done) { done = true; clearTimeout(t); rej(m); } else console.warn('Firestore-kirjoitus epäonnistui', m); });
    });
  }

  function wrapDoc(s) {
    return { id: s.id, exists: typeof s.exists === 'function' ? s.exists() : !!s.exists, data: () => s.data(),
      metadata: { fromCache: !!(s.metadata && s.metadata.fromCache), hasPendingWrites: !!(s.metadata && s.metadata.hasPendingWrites) } };
  }
  function wrapQuery(q) {
    return { docs: q.docs.map(wrapDoc), size: q.size, empty: q.empty, metadata: { fromCache: !!(q.metadata && q.metadata.fromCache) } };
  }

  /** fs = Firestoren modulaarinen API (doc, collection, query, where, orderBy, limit, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot). */
  function makeDb(fs, fdb, prefix, opts) {
    const wait = (opts && opts.writeWaitMs) != null ? opts.writeWaitMs : 1500;
    const P = path => (prefix ? prefix + '/' : '') + String(path).replace(/^\/+/, '');
    const sub = (target, wrap, next, err) => fs.onSnapshot(target, s => next(wrap(s)), e => err && err(mapErr(e)));

    function docApi(path) {
      const ref = fs.doc(fdb, P(path));
      return {
        id: ref.id, path,
        get: async () => { try { return wrapDoc(await fs.getDoc(ref)); } catch (e) { throw mapErr(e); } },
        set: (data, o) => soft(o ? fs.setDoc(ref, data, o) : fs.setDoc(ref, data), wait),
        update: data => soft(fs.updateDoc(ref, data), wait),
        delete: () => soft(fs.deleteDoc(ref), wait),
        onSnapshot: (next, err) => sub(ref, wrapDoc, next, err),
      };
    }
    function queryApi(path, cons) {
      const target = () => cons.length ? fs.query(fs.collection(fdb, P(path)), ...cons) : fs.collection(fdb, P(path));
      return {
        where: (f, op, v) => queryApi(path, cons.concat([fs.where(f, op, v)])),
        orderBy: (f, dir) => queryApi(path, cons.concat([dir ? fs.orderBy(f, dir) : fs.orderBy(f)])),
        limit: n => queryApi(path, cons.concat([fs.limit(n)])),
        get: async () => { try { return wrapQuery(await fs.getDocs(target())); } catch (e) { throw mapErr(e); } },
        onSnapshot: (next, err) => sub(target(), wrapQuery, next, err),
      };
    }
    function collApi(path) {
      return Object.assign(queryApi(path, []), {
        path,
        doc: id => docApi(path + '/' + (id != null ? id : fs.doc(fs.collection(fdb, P(path))).id)),
        add: async data => { const ref = fs.doc(fs.collection(fdb, P(path))); await soft(fs.setDoc(ref, data), wait); return { id: ref.id }; },
      });
    }
    return { doc: docApi, collection: collApi };
  }

  function makeUser(fs, fdb, prefix, authUser, allowed) {
    return {
      id: async () => authUser.uid,
      can: async perm => (perm === 'data.write' || perm === 'data.read') ? !!allowed : false,
      profiles: async ids => {
        const out = {};
        await Promise.all((ids || []).map(async id => {
          try { const s = await fs.getDoc(fs.doc(fdb, prefix + '/profiles/' + id)); if (s.exists()) out[id] = s.data(); } catch (e) { /* ei nimeä */ }
        }));
        return out;
      },
      email: () => authUser.email,
      name: () => authUser.displayName,
    };
  }

  const core = { makeDb, makeUser, mapErr, soft, wrapDoc, wrapQuery };
  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }
  root.MaunoFirebaseCore = core;

  /* ---------- selaimen käynnistys ---------- */
  const C = root.FIREBASE_CONFIG;
  if (!C || !C.apiKey || !C.projectId) return; // ei konfiguroitu → localStorage-tila

  const V = '11.0.2', CDN = 'https://www.gstatic.com/firebasejs/' + V + '/';
  const HID = root.MAUNO_HOUSEHOLD || 'mauno', HH = 'households/' + HID;
  const OWNER = String(root.MAUNO_OWNER || '').toLowerCase();
  const LKEY = 'koira-ruokinta-v1', MKEY = 'mauno-member-', PKEY = 'mauno-push-';
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  root.claude = { use: name => ready.then(x => x ? (name === 'db' ? x.db : name === 'user' ? x.user : null) : null) };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const msg = t => (typeof root.toast === 'function' ? root.toast(t) : alert(t));
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  function gate(html) {
    let el = document.getElementById('fbGate');
    if (!el) { el = document.createElement('div'); el.id = 'fbGate'; el.className = 'wiz'; el.style.zIndex = '80'; document.body.appendChild(el); }
    el.hidden = false;
    el.innerHTML = '<div class="wiz-in" style="justify-content:center;align-items:center;text-align:center;gap:14px">' + html + '</div>';
    return el;
  }
  const hideGate = () => { const el = document.getElementById('fbGate'); if (el) el.hidden = true; };
  const goLocal = () => { hideGate(); resolveReady(null); renderAcct(null); };
  const PAW = '<svg viewBox="0 0 24 24" style="width:64px;height:64px;fill:var(--pri)"><use href="#paw"/></svg>';

  let app, A, F, auth, fdb, started = null;

  function renderAcct(u, isOwner) {
    const el = document.getElementById('acct'); if (!el) return;
    el.hidden = false;
    if (!u) { el.innerHTML = '<button class="ghost" data-fb="login">🔑 Kirjaudu jaettuun tietoon</button>'; }
    else {
      const pushOn = ls.get(PKEY + u.uid) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
      el.innerHTML = '<span>👤 ' + esc(u.displayName || u.email) + '</span>'
        + (pushOn ? '<span>🔔 Muistutukset päällä</span>' : '<button data-fb="push">🔔 Ota muistutukset käyttöön</button>')
        + (isOwner ? '<button class="ghost" data-fb="member">👥 Lisää jäsen</button>' : '')
        + '<button class="ghost" data-fb="out">Kirjaudu ulos</button>';
    }
    el.onclick = async e => {
      const b = e.target.closest('[data-fb]'); if (!b) return;
      const a = b.dataset.fb;
      if (a === 'login') location.reload();
      if (a === 'out') { await A.signOut(auth); location.reload(); }
      if (a === 'push') enablePush(u, isOwner);
      if (a === 'member') addMember();
    };
  }

  function showLogin(err) {
    gate(PAW + '<h2 style="margin:0">Maunon ruokinta</h2><p class="lead" style="margin:0">Kirjaudu Google-tilillä, niin näet samat tiedot kaikilla laitteilla.</p>'
      + '<button class="primary" id="fbLogin" style="padding:16px 22px;width:100%;max-width:320px">Kirjaudu Googlella</button>'
      + '<button class="ghost" id="fbLocal" style="width:100%;max-width:320px">Jatka ilman kirjautumista</button>'
      + '<p class="note" id="fbErr">' + esc(err || '') + '</p>');
    document.getElementById('fbLocal').onclick = goLocal;
    document.getElementById('fbLogin').onclick = async () => {
      const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return A.signInWithRedirect(auth, p);
        if (e.code !== 'auth/popup-closed-by-user') document.getElementById('fbErr').textContent = 'Kirjautuminen epäonnistui (' + (e.code || e.message) + ').';
      }
    };
  }

  async function membership(u) {
    const email = String(u.email || '').toLowerCase(), isOwner = !!OWNER && email === OWNER;
    const hh = F.doc(fdb, HH);
    try {
      const s = await F.getDoc(hh);
      if (s.exists() && (s.data().members || []).map(x => String(x).toLowerCase()).includes(email)) return { allowed: true, isOwner };
    } catch (e) {
      if (e.code !== 'permission-denied') return { allowed: ls.get(MKEY + u.uid) === '1', isOwner }; // offline: muista edellinen tulos
    }
    if (isOwner) { // omistaja luo kotitalouden ensimmäisellä kirjautumisella
      try { await soft(F.setDoc(hh, { owner: email, members: F.arrayUnion(email) }, { merge: true }), 5000); return { allowed: true, isOwner }; }
      catch (e) { console.warn('Kotitalouden luonti epäonnistui', e); }
    }
    return { allowed: false, isOwner };
  }

  async function migrateLocal(db) {
    let d; try { d = JSON.parse(ls.get(LKEY) || 'null'); } catch (e) { d = null; }
    if (!d || !d.cfg || !d.cfg.setupDone) return;
    try { if ((await db.doc('config/settings').get()).exists) return; } catch (e) { return; }
    if (!confirm('Tässä selaimessa on aiemmin tallennettuja tietoja (' + (d.cfg.dogName || 'koira') + '). Siirretäänkö ne jaettuun tietoon?')) return;
    const ops = [['config/settings', d.cfg], ['stock/base', d.base], ['raw/base', d.rawBase]].filter(x => x[1]);
    for (const k of ['feeds', 'rawlog', 'purchases', 'notes', 'items'])
      for (const it of (d[k] || [])) { const { id, ...rest } = it; ops.push([k + '/' + id, rest]); }
    for (let i = 0; i < ops.length; i += 400) {
      const b = F.writeBatch(fdb);
      ops.slice(i, i + 400).forEach(([p, v]) => b.set(F.doc(fdb, HH + '/' + p), v));
      await soft(b.commit(), 10000);
    }
    msg('Tiedot siirretty jaettuun tietoon ✓');
  }

  async function start(u) {
    gate(PAW + '<p class="lead">Ladataan…</p>');
    const { allowed, isOwner } = await membership(u);
    if (!allowed) {
      gate(PAW + '<h2 style="margin:0">Ei pääsyä</h2><p class="lead" style="margin:0">Tilillä <b>' + esc(u.email) + '</b> ei ole pääsyä Maunon tietoihin. Pyydä omistajaa lisäämään osoitteesi.</p>'
        + '<button class="primary" id="fbOther" style="width:100%;max-width:320px">Kirjaudu toisella tilillä</button>'
        + '<button class="ghost" id="fbLocal" style="width:100%;max-width:320px">Jatka ilman kirjautumista</button>');
      document.getElementById('fbOther').onclick = async () => { await A.signOut(auth); location.reload(); };
      document.getElementById('fbLocal').onclick = goLocal;
      return;
    }
    ls.set(MKEY + u.uid, '1');
    soft(F.setDoc(F.doc(fdb, HH + '/profiles/' + u.uid), { name: u.displayName || u.email, email: u.email, t: Date.now() }, { merge: true }), 3000).catch(() => {});
    const db = makeDb(F, fdb, HH);
    await migrateLocal(db);
    hideGate();
    resolveReady({ db, user: makeUser(F, fdb, HH, u, true), app, fdb });
    renderAcct(u, isOwner);
  }

  async function enablePush(u, isOwner) {
    try {
      if (!root.FIREBASE_VAPID_KEY) return msg('Muistutuksia ei ole vielä määritetty (VAPID-avain puuttuu).');
      if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') return msg('Tämä selain ei tue ilmoituksia. iPhonessa lisää sivu ensin kotinäytölle.');
      const M = await import(CDN + 'firebase-messaging.js');
      if (!(await M.isSupported())) return msg('Tämä selain ei tue ilmoituksia. iPhonessa lisää sivu ensin kotinäytölle.');
      if ((await Notification.requestPermission()) !== 'granted') return msg('Ilmoituslupa evättiin – salli ilmoitukset selaimen asetuksista.');
      const reg = await navigator.serviceWorker.ready;
      const token = await M.getToken(M.getMessaging(app), { vapidKey: root.FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
      await soft(F.setDoc(F.doc(fdb, HH + '/pushTokens/' + u.uid), { uid: u.uid, name: u.displayName || u.email, tokens: F.arrayUnion(token), t: Date.now() }, { merge: true }), 5000);
      ls.set(PKEY + u.uid, token);
      msg('🔔 Muistutukset käytössä');
      renderAcct(u, isOwner);
    } catch (e) { msg('Muistutusten käyttöönotto epäonnistui (' + (e.code || e.message) + ').'); }
  }

  async function addMember() {
    const em = (prompt('Lisättävän jäsenen Google-sähköpostiosoite:') || '').trim().toLowerCase();
    if (!em) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return msg('Tarkista sähköpostiosoite.');
    try { await soft(F.updateDoc(F.doc(fdb, HH), { members: F.arrayUnion(em) }), 5000); msg('👥 ' + em + ' lisätty jäseneksi'); }
    catch (e) { msg('Jäsenen lisäys epäonnistui (' + e.code + ').'); }
  }

  (async () => {
    gate(PAW + '<p class="lead">Ladataan…</p>');
    try {
      const [AppM, AuthM, FsM] = await Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js')]);
      A = AuthM; F = FsM;
      app = AppM.initializeApp(C);
      auth = A.getAuth(app);
      try { fdb = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
      catch (e) { fdb = F.getFirestore(app); }
    } catch (e) {
      console.warn('Firebasen lataus epäonnistui', e);
      gate(PAW + '<h2 style="margin:0">Ei yhteyttä</h2><p class="lead" style="margin:0">Jaettua tietoa ei voitu ladata. Tarkista verkkoyhteys.</p>'
        + '<button class="primary" id="fbRetry" style="width:100%;max-width:320px">Yritä uudelleen</button>'
        + '<button class="ghost" id="fbLocal" style="width:100%;max-width:320px">Jatka ilman kirjautumista</button>');
      document.getElementById('fbRetry').onclick = () => location.reload();
      document.getElementById('fbLocal').onclick = goLocal;
      return;
    }
    let redirectErr = '';
    try { await A.getRedirectResult(auth); } catch (e) { redirectErr = 'Kirjautuminen epäonnistui (' + (e.code || e.message) + ').'; }
    A.onAuthStateChanged(auth, u => {
      if (started) { if (!u || u.uid !== started) location.reload(); return; }
      if (!u) return showLogin(redirectErr);
      started = u.uid;
      start(u);
    });
  })();
})(typeof self !== 'undefined' ? self : this);
