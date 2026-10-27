// Cloud saves: Google sign-in (Firebase Auth) and one Firestore document per hero, users/{uid}/heroes/{classId}.
// localStorage stays the real save and the game never waits on the network; the cloud is a copy kept in step.
// Each class merges three ways against what this device last synced (base): only this device changed -> push,
// only the cloud changed -> pull, both -> the player picks one (screens.js asks). A change is a different hero id
// or lastPlayed. The Firebase SDK loads from Google's CDN only for players who sign in.
// No save is ever lost to a sync: a hero missing on one side is only a deletion when the player deleted it (a
// tombstone in the cloud, st.deleted here); otherwise it's copied back. Every hero replaced or deleted on this device,
// and every cloud copy this device writes over, is backed up first (herobackup.js); no backup, no change.
import { G } from '../state.js';
import { heroesByClass, replaceClassHero, classSaves, savesReadable, onSaveChange } from './save.js';
import { backupHeroes } from './herobackup.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const CONFIG = {
  apiKey: 'AIzaSyAGqRSMtHdwt73HVyrcL0b_47pjoRz_fUg',
  authDomain: 'velscour.firebaseapp.com',
  projectId: 'velscour',
  storageBucket: 'velscour.firebasestorage.app',
  messagingSenderId: '368591862441',
  appId: '1:368591862441:web:77117f1ec81c33192387b8',
};
const KEY = 'velscour_cloud_v1';
const PUSH_DELAY = 300e3;  // a played hero goes up at most once every 5 minutes (and when the tab hides or play stops)
const RETRY = 120e3;       // offline: try again this often
const RESYNC = 20e3;       // back on the title or the tab: a full sync if the last is older than this

/** Firebase behind the few calls the sync needs (tests swap in a fake with Cloud.useBackend). */
function firebaseBackend() {
  let auth, fs, au, db;
  return {
    async init() {
      const [app, a, f] = await Promise.all(['app', 'auth', 'firestore-lite'].map((m) => import(SDK + 'firebase-' + m + '.js')));
      const fbApp = app.initializeApp(CONFIG);
      auth = a; fs = f; au = a.getAuth(fbApp); db = f.getFirestore(fbApp);
      await au.authStateReady();
    },
    user() { const u = au.currentUser; return u && { uid: u.uid, name: u.displayName || '', email: u.email || '' }; },
    async signIn() {
      console.log('[Cloud] Initiating Google Sign-In...');
      const provider = new auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await auth.signInWithPopup(au, provider);
      console.log('[Cloud] Google Sign-In finished, user:', cred && cred.user);
      const u = (cred && cred.user) || au.currentUser;
      return u && { uid: u.uid, name: u.displayName || '', email: u.email || '' };
    },
    signOut() {
      return auth.signOut(au);
    },
    async list(uid) {
      const out = {};
      (await fs.getDocs(fs.collection(db, 'users', uid, 'heroes'))).forEach((d) => { out[d.id] = fromDoc(d.data()); });
      return out;
    },
    /** Write rec (a hero or a tombstone) if the document still holds `expect` (meta or null): { ok } or
     * { ok: false, cur }. Documents are never deleted: a deleted hero leaves a tombstone. */
    commit(uid, cls, expect, rec) {
      const ref = fs.doc(db, 'users', uid, 'heroes', cls);
      return fs.runTransaction(db, async (t) => {
        const d = await t.get(ref), cur = d.exists() ? fromDoc(d.data()) : null;
        if (!same(meta(cur), expect)) return { ok: false, cur };
        t.set(ref, { ...rec, gz: rec.gz ? fs.Bytes.fromUint8Array(rec.gz) : null, at: fs.serverTimestamp() });
        return { ok: true };
      });
    },
  };
  function fromDoc(r) { return { ...r, gz: r.gz && r.gz.toUint8Array ? r.gz.toUint8Array() : r.gz || null }; }
}

/** A hero (local save or cloud record) as { id, lastPlayed }; a tombstone or nothing is null. */
const meta = (r) => (r && !r.deleted ? { id: r.id, lastPlayed: r.lastPlayed } : null);
const same = (a, b) => (!a || !b ? !a && !b : a.id === b.id && a.lastPlayed === b.lastPlayed);

/** A hero as a cloud record: a few fields to show in a conflict, and the save gzipped (plain JSON where the browser
 * has no CompressionStream). A full 300-slot stash is ~150 KB of JSON, ~18 KB gzipped. */
async function pack(c) {
  const json = JSON.stringify(c);
  const rec = { v: 1, id: c.id, classId: c.classId, name: c.name, level: c.level, depth: c.depth, gold: c.gold, lastPlayed: c.lastPlayed, gz: null, json: null };
  if (typeof CompressionStream === 'undefined') rec.json = json;
  else rec.gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return rec;
}
async function unpack(r) {
  if (r.json) return JSON.parse(r.json);
  return JSON.parse(await new Response(new Blob([r.gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
/** A cloud hero good enough to replace one on this device: it unpacks and looks like a save of its class. */
async function unpackChecked(cls, r) {
  let h = null;
  try { h = await unpack(r); } catch (e) { /* damaged */ }
  const ok = h && typeof h.id === 'string' && h.id === r.id && h.classId === cls && h.lastPlayed === r.lastPlayed &&
    Number.isFinite(h.level) && h.equip && typeof h.equip === 'object' && Array.isArray(h.bag);
  if (!ok) throw new Error(`The cloud copy of this ${cls} hero is damaged, so it was not loaded. Your hero here is untouched.`);
  return h;
}

function loadState() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') return { base: {}, deleted: {}, ...s }; } catch (e) { /* fresh */ }
  return { uid: null, name: '', email: '', base: {}, deleted: {}, last: 0 };
}

let be = null, ready = null, st = loadState(), chain = Promise.resolve(), pushT = 0, retryT = 0, busy = 0;
const dirty = new Set(), listeners = [], warned = new Set();
const saveState = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full: the base is rebuilt next sync */ } };
const emit = (what) => { for (const fn of listeners) try { fn(what); } catch (e) { console.warn(e); } };
const setStatus = (s, err) => { Cloud.status = s; Cloud.error = err || ''; emit('status'); };
const playing = (cls) => G.mode === 'game' && G.char && G.char.classId === cls;
/** Run sync steps one at a time; a network failure leaves the work dirty and retries later. */
function queue(fn) {
  busy++;
  const p = chain.then(() => ready).then(fn).catch((e) => {
    console.warn('Cloud save:', e);
    const off = !navigator.onLine || /unavailable|network|offline|fetch/i.test(String(e && (e.code || e.message)));
    setStatus(off ? 'offline' : 'error', off ? 'Offline: saved on this device, will sync later.' : String(e && (e.message || e)));
    clearTimeout(retryT); retryT = setTimeout(() => Cloud.sync(true), RETRY);
  }).finally(() => { if (!--busy) emit('idle'); });
  chain = p;
  return p;
}

/** The player deleted this hero here (not merely missing: unreadable or lost saves never count as a deletion). */
const deletedHere = (cls, id) => !!id && (st.deleted[cls] || []).includes(id);
const UNREADABLE = 'The heroes saved on this device could not be read, so cloud sync is paused and changes nothing.';

/** Send this device's hero, or (hero null) a tombstone naming the cloud hero it replaces, so the devices that hold
 * that hero know the player deleted it. expect: what the cloud must still hold; B: what this device last synced. */
async function push(cls, hero, expect, B) {
  const gone = expect || B;
  if (!hero && !gone) return;
  const rec = hero ? await pack(hero) : { v: 1, deleted: true, id: gone.id, classId: cls, lastPlayed: Date.now() };
  const r = await be.commit(st.uid, cls, expect, rec);
  if (r.ok) {
    st.base[cls] = meta(hero);
    if (!hero) delete st.deleted[cls];
    Cloud.conflicts.delete(cls);
    return;
  }
  if (same(meta(r.cur), meta(hero))) { st.base[cls] = meta(hero); return; }   // another tab already sent it
  conflict(cls, hero, r.cur);
}
/** Take the cloud's hero (or its tombstone) for a class. Everything of that class here is backed up first. */
async function pull(cls, rec) {
  const hero = rec && !rec.deleted ? await unpackChecked(cls, rec) : null;
  if (!savesReadable()) throw new Error(UNREADABLE);
  await backupHeroes(classSaves(cls), hero ? 'cloud' : 'deleted');   // throws (and nothing changes) if it can't
  if (!replaceClassHero(cls, hero)) throw new Error('Could not write the save on this device (storage full?). Nothing was changed.');
  st.base[cls] = meta(hero);
  if (!hero) delete st.deleted[cls];
  Cloud.conflicts.delete(cls);
  emit('change');
}
function conflict(cls, local, cloud) {
  Cloud.conflicts.set(cls, { cls, local: local || null, cloud: cloud || null });
  emit('conflict');
}

/** One class's three-way merge. A hero missing on one side without a deletion there is copied back, never deleted. */
async function mergeClass(cls, L, C, B) {
  const lm = meta(L), cm = meta(C);
  if (same(lm, cm)) { st.base[cls] = lm; Cloud.conflicts.delete(cls); if (!lm) delete st.deleted[cls]; return; }
  let lc = !same(lm, B), cc = !same(cm, B);
  if (!lm && B && !deletedHere(cls, B.id)) lc = false;               // gone here, not deleted: restore it below
  if (!cm && B && !(C && C.deleted && C.id === B.id)) cc = false;    // gone from the cloud, no tombstone: send it again
  if (lc && cc) conflict(cls, L, C);
  else if (lc || (!cc && lm)) await push(cls, L, cm, B);
  else if (playing(cls)) conflict(cls, L, C);                        // never swap the hero being played
  else await pull(cls, C);
}
async function syncAll() {
  if (!st.uid) return;
  if (!savesReadable()) { setStatus('error', UNREADABLE); return; }
  setStatus('syncing');
  const cloud = await be.list(st.uid), local = heroesByClass();
  let err = '';
  for (const cls of new Set([...Object.keys(local), ...Object.keys(cloud), ...Object.keys(st.base)])) {
    dirty.delete(cls);
    try { await mergeClass(cls, local[cls] || null, cloud[cls] || null, st.base[cls] || null); } catch (e) {
      if (/offline|unavailable|network|fetch/i.test(String(e && (e.code || e.message)))) throw e;
      err = String(e && (e.message || e)); console.warn('Cloud save:', e);   // this class waits; the others go on
    }
  }
  for (const cls of Object.keys(st.base)) if (!st.base[cls]) delete st.base[cls];
  st.last = Date.now();
  saveState();
  setStatus(err ? 'error' : Cloud.conflicts.size ? 'conflict' : 'ok', err);
}
async function flush() {
  if (!st.uid) return;
  clearTimeout(pushT); pushT = 0;
  if (!savesReadable()) { setStatus('error', UNREADABLE); return; }
  const local = heroesByClass();
  for (const cls of [...dirty]) {
    dirty.delete(cls);
    const L = local[cls] || null, B = st.base[cls] || null;
    if (Cloud.conflicts.has(cls)) { Cloud.conflicts.get(cls).local = L; continue; }
    if (same(meta(L), B) || (!L && !deletedHere(cls, B && B.id))) continue;   // only real deletions go up
    setStatus('syncing');
    try { await push(cls, L, B, B); } catch (e) { dirty.add(cls); throw e; }   // offline: still to send
  }
  saveState();
  setStatus(Cloud.conflicts.size ? 'conflict' : 'ok');
}

onSaveChange((cls, deleted) => {
  if (!st.uid) return;
  if (deleted && deleted.length) { st.deleted[cls] = [...new Set([...(st.deleted[cls] || []), ...deleted])]; saveState(); }
  dirty.add(cls);
  if (!ready) return;                                  // not connected yet: start()'s sync sends it
  if (G.mode !== 'game') queue(flush);                 // a deleted or new hero on the select screen goes up now
  else if (!pushT) pushT = setTimeout(() => queue(flush), PUSH_DELAY);
});

if (typeof addEventListener === 'function') addEventListener('visibilitychange', () => { if (document.hidden) setTimeout(() => Cloud.flush(), 0); else Cloud.sync(); });   // after main.js's autosave
if (typeof addEventListener === 'function') addEventListener('online', () => Cloud.sync(true));

export const Cloud = {
  status: 'off',     // off | loading | syncing | ok | conflict | offline | error
  error: '',
  conflicts: new Map(),   // classId -> { cls, local: hero | null, cloud: record | null }
  get signedIn() { return !!st.uid; },
  get user() { return st.uid ? { name: st.name, email: st.email } : null; },
  get lastSync() { return st.last; },
  /** fn(what): 'status' | 'change' (local heroes were replaced from the cloud) | 'conflict' | 'idle'. */
  on(fn) { listeners.push(fn); },
  useBackend(b) { be = b; ready = null; },
  /** Load the SDK (the settings dialog calls this so the sign-in popup opens inside the tap). */
  preload() {
    if (!ready) {
      be = be || firebaseBackend();
      ready = be.init().catch((e) => { ready = null; throw e; });
    }
    return ready;
  },
  /** On boot: a device that was signed in picks its session back up and syncs. */
  async start() {
    if (!st.uid) return;
    setStatus('loading');
    try { await this.preload(); } catch (e) { setStatus('offline', 'Could not reach Google: saved on this device.'); clearTimeout(retryT); retryT = setTimeout(() => this.start(), RETRY); return; }
    const u = be.user();
    if (!u || u.uid !== st.uid) { st.uid = null; saveState(); setStatus('off', 'Your Google sign-in expired. Sign in again in Settings.'); return; }
    st.name = u.name; st.email = u.email;
    await this.sync(true);
  },
  async signIn() {
    await this.preload();
    const u = await be.signIn();
    if (!u) return;
    if (u.uid !== st.uid) { st.base = {}; st.deleted = {}; }   // a new account (or after a sign-out): everything merges afresh
    Object.assign(st, { uid: u.uid, name: u.name, email: u.email });
    saveState();
    await this.sync(true);
  },
  /** Signs out of the game's cloud copy. The heroes stay on this device. */
  async signOut() {
    await chain.catch(() => {});
    if (dirty.size) await queue(flush);
    try { if (be) await be.signOut(); } catch (e) { console.warn(e); }
    st = { uid: null, name: '', email: '', base: {}, deleted: {}, last: 0 };
    saveState();
    this.conflicts.clear(); dirty.clear();
    setStatus('off');
  },
  /** A full merge (skipped when one ran in the last 20 s unless forced). Resolves when done. */
  sync(force) {
    if (!st.uid || !ready) return chain;
    if (!force && (busy || Date.now() - st.last < RESYNC)) return chain;
    return queue(syncAll);
  },
  /** Send played heroes now (quitting to the title, the tab hiding). */
  flush() { return st.uid && ready ? queue(flush) : chain; },
  /** Wait for a sync in flight, at most ms. */
  settle(ms = 5000) { return busy ? Promise.race([chain, new Promise((r) => setTimeout(r, ms))]) : Promise.resolve(); },
  /** The player chose which copy of a class's hero to keep. */
  resolve(cls, keep) {
    const c = this.conflicts.get(cls);
    if (!c) return chain;
    return queue(async () => {
      setStatus('syncing');
      if (keep === 'cloud') await pull(cls, c.cloud);
      else {
        if (!savesReadable()) throw new Error(UNREADABLE);
        // the cloud copy being written over is kept on this device first (no backup, no push)
        if (meta(c.cloud)) await backupHeroes([await unpackChecked(cls, c.cloud).catch(() => null)], 'cloudcopy');
        this.conflicts.delete(cls);
        await push(cls, heroesByClass()[cls] || null, meta(c.cloud), st.base[cls] || null);
      }
      saveState();
      setStatus(this.conflicts.size ? 'conflict' : 'ok');
    });
  },
  /** Once per class and session: tell the player in a fight why this hero stopped syncing. */
  warnOnce(cls) { if (warned.has(cls)) return false; warned.add(cls); return true; },
  PUSH_DELAY,
  unpack,
};
