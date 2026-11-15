// Kevyt in-memory-toteutus Firestoren modulaarisen API:n osajoukosta adapterin yksikkötesteihin.
let seq = 0;
function createFakeFirestore() {
  const store = new Map(); // polku → data
  const listeners = new Set();
  const fail = { next: null }; // seuraava kirjoitus epäonnistuu tällä virheellä
  const db = { kind: 'db' };

  const segs = p => p.split('/').filter(Boolean);
  const doc = (base, path) => {
    if (base && base.kind === 'coll') { const id = path || ('auto' + (++seq)); return { kind: 'doc', path: base.path + '/' + id, id }; }
    const s = segs(path); if (s.length % 2) throw new Error('doc path must have even segments: ' + path);
    return { kind: 'doc', path: s.join('/'), id: s[s.length - 1] };
  };
  const collection = (_db, path) => { const s = segs(path); if (!(s.length % 2)) throw new Error('collection path must have odd segments'); return { kind: 'coll', path: s.join('/') }; };
  const where = (f, op, v) => ({ t: 'where', f, op, v });
  const orderBy = (f, dir = 'asc') => ({ t: 'orderBy', f, dir });
  const limit = n => ({ t: 'limit', n });
  const query = (coll, ...cons) => ({ kind: 'query', path: coll.path, cons });

  const snapDoc = ref => ({ id: ref.id, exists: () => store.has(ref.path), data: () => store.has(ref.path) ? structuredClone(store.get(ref.path)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } });
  const runQuery = q => {
    const depth = segs(q.path).length + 1;
    let docs = [...store.entries()].filter(([p]) => p.startsWith(q.path + '/') && segs(p).length === depth)
      .map(([p, d]) => ({ id: segs(p).pop(), d }));
    for (const c of q.cons || []) {
      if (c.t === 'where') docs = docs.filter(x => ({ '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '==': (a, b) => a === b, '>': (a, b) => a > b, '<': (a, b) => a < b })[c.op](x.d[c.f], c.v));
      if (c.t === 'orderBy') docs.sort((a, b) => (a.d[c.f] > b.d[c.f] ? 1 : a.d[c.f] < b.d[c.f] ? -1 : 0) * (c.dir === 'desc' ? -1 : 1));
      if (c.t === 'limit') docs = docs.slice(0, c.n);
    }
    const out = docs.map(x => ({ id: x.id, exists: () => true, data: () => structuredClone(x.d), metadata: { fromCache: false } }));
    return { docs: out, size: out.length, empty: !out.length, metadata: { fromCache: false } };
  };
  const resolveSentinels = (prev, data) => {
    const out = { ...data };
    for (const [k, v] of Object.entries(out)) if (v && v.__arrayUnion) out[k] = [...new Set([...((prev && prev[k]) || []), ...v.__arrayUnion])];
    return out;
  };
  const notify = () => listeners.forEach(l => l());
  const write = fn => { if (fail.next) { const e = fail.next; fail.next = null; return Promise.reject(e); } fn(); notify(); return Promise.resolve(); };

  return {
    store, fail, db,
    fs: {
      doc, collection, where, orderBy, limit, query,
      getDoc: async ref => snapDoc(ref),
      getDocs: async q => runQuery(q.kind === 'coll' ? { path: q.path, cons: [] } : q),
      setDoc: (ref, data, o) => write(() => { const prev = store.get(ref.path); store.set(ref.path, o && o.merge ? { ...(prev || {}), ...resolveSentinels(prev, data) } : resolveSentinels(null, data)); }),
      updateDoc: (ref, data) => store.has(ref.path) ? write(() => store.set(ref.path, { ...store.get(ref.path), ...resolveSentinels(store.get(ref.path), data) })) : Promise.reject(Object.assign(new Error('no doc'), { code: 'not-found' })),
      arrayUnion: (...v) => ({ __arrayUnion: v }),
      writeBatch: () => { const ops = []; return { set: (ref, d) => ops.push([ref, d]), commit: () => write(() => ops.forEach(([r, d]) => store.set(r.path, { ...d }))) }; },
      deleteDoc: ref => write(() => store.delete(ref.path)),
      onSnapshot: (target, next) => {
        const emit = () => next(target.kind === 'doc' ? snapDoc(target) : runQuery(target.kind === 'coll' ? { path: target.path, cons: [] } : target));
        listeners.add(emit); emit();
        return () => listeners.delete(emit);
      },
    },
  };
}
module.exports = { createFakeFirestore };
