// Cloud saves (game/cloud.js): Google sign-in + Firestore, against a fake Firebase shared by four "devices" (four
// browsers with their own storage). Push on sign-in, pull on another device, play on one and sync on the other,
// a conflict picked from the dialog, the in-game warning, deleting (tombstones), a first sign-in that must not
// overwrite, offline and back, reload resumes the session, sign out. No save is lost: every replaced hero is backed up
// (and restorable from Settings), a hero lost on either side is copied back instead of deleted, unreadable local saves
// and damaged cloud copies change nothing, a device without IndexedDB (no backups) changes nothing, the 5-minute push,
// the Abyssal Rifts' honour board (one entry per player that only a better run replaces, read signed out),
// the Endgame's account record (Infernal Marks earned on two devices apart add up, never lowered). Then a smoke test of the real SDK (12.19.0 from npm when the
// gstatic CDN is blocked): it loads, the popup goes to velscour.firebaseapp.com, and Firestore refuses a signed-out read.
// node tools/tests/cloud.js [nosdk]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { openGame, report, OUT_DIR } = require('./harness');

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const store = new Map();   // 'users/u1/heroes/paladin' -> record ({ gz: { b64 } })
const FAKE = {
  'firebase-app.js': `export const initializeApp = (cfg) => ({ cfg });`,
  'firebase-auth.js': `
    const K = '__fake_user';
    export class GoogleAuthProvider {}
    export const getAuth = () => ({ currentUser: JSON.parse(localStorage.getItem(K) || 'null'), authStateReady: async () => {} });
    export async function signInWithPopup(au) { au.currentUser = window.__FAKE_USER || { uid: 'u1', displayName: 'Test Player', email: 'player@example.com' }; localStorage.setItem(K, JSON.stringify(au.currentUser)); return { user: au.currentUser }; }
    export async function signOut(au) { au.currentUser = null; localStorage.removeItem(K); }`,
  'firebase-firestore-lite.js': `
    const net = async (op, a) => { if (window.__OFFLINE) { const e = new Error('Failed to get document because the client is offline.'); e.code = 'unavailable'; throw e; } return window.__store(op, a); };
    const b64 = (u) => btoa(String.fromCharCode(...u)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const wrap = (v) => v && v.gz && v.gz.b64 ? { ...v, gz: { toUint8Array: () => unb64(v.gz.b64) } } : v;
    export const Bytes = { fromUint8Array: (u) => ({ b64: b64(u) }) };
    export const getFirestore = () => ({});
    export const collection = (db, ...p) => ({ path: p.join('/') });
    export const doc = (db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] });
    export const serverTimestamp = () => Date.now();
    export async function deleteDoc(ref) { return net('put', [ref.path, null]); }
    export async function getDocs(col) { const docs = await net('list', col.path); return { forEach: (fn) => docs.forEach((d) => fn({ id: d.id, data: () => wrap(d.data) })) }; }
    export async function runTransaction(db, fn) {
      const writes = [];
      const t = { get: async (ref) => { const v = await net('get', ref.path); return { exists: () => !!v, data: () => wrap(v) }; },
        set: (ref, v) => writes.push([ref.path, v]), delete: (ref) => writes.push([ref.path, null]) };
      const r = await fn(t);
      for (const w of writes) await net('put', w);
      return r;
    }`,
};
function backend(op, a) {
  if (op === 'list') return [...store].filter(([k]) => k.startsWith(a + '/') && !k.slice(a.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), data: v }));
  if (op === 'get') return store.get(a) || null;
  if (op === 'put') { if (a[1]) store.set(a[0], a[1]); else store.delete(a[0]); return true; }
}
async function device(name, user, noIdb, opts) {
  const d = await openGame(opts);
  if (noIdb) { await d.page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); }); await d.page.reload(); await d.page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden')); }
  await d.ctx.route(SDK + '*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE[r.request().url().split('/').pop()] }));
  await d.page.exposeFunction('__store', backend);
  if (user) await d.page.addInitScript((u) => { window.__FAKE_USER = u; }, user);
  if (user) await d.page.evaluate((u) => { window.__FAKE_USER = u; }, user);
  d.name = name;
  return d;
}
const cloudHero = async (page, cls) => page.evaluate(async (cls) => {
  const { Cloud } = await import('/src/game/cloud.js');
  const r = await window.__store('get', 'users/u1/heroes/' + cls);
  if (!r) return null;
  if (r.deleted) return { deleted: true, id: r.id };
  const c = await Cloud.unpack({ ...r, gz: r.gz && Uint8Array.from(atob(r.gz.b64), (x) => x.charCodeAt(0)) });
  return { id: c.id, name: c.name, gold: c.gold, lastPlayed: c.lastPlayed, meta: r.lastPlayed === c.lastPlayed && r.name === c.name };
}, cls);
// helpers run in the page
const IN = {
  async seed(heroes) {
    const { newCharData, writeSave } = await import('/src/game/save.js');
    const out = {};
    for (const [cls, name, gold] of heroes) { const c = newCharData(cls, name); c.gold = gold; writeSave(c); out[cls] = c.id; }
    return out;
  },
  async local() {
    const { heroesByClass } = await import('/src/game/save.js');
    const h = heroesByClass(), out = {};
    for (const k in h) out[k] = { id: h[k].id, name: h[k].name, gold: h[k].gold, lastPlayed: h[k].lastPlayed };
    return out;
  },
  async backups() { const { listBackups } = await import('/src/game/herobackup.js'); return (await listBackups()).map((b) => ({ cls: b.cls, why: b.why, gold: b.hero.gold, name: b.hero.name, id: b.hero.id })); },
  async status() { const { Cloud } = await import('/src/game/cloud.js'); return { status: Cloud.status, error: Cloud.error, conflicts: [...Cloud.conflicts.keys()], signedIn: Cloud.signedIn, user: Cloud.user }; },
};
const run = (page, fn, ...a) => page.evaluate(`(${IN[fn].toString().replace(/^async \w+/, 'async function')})(...${JSON.stringify(a)})`);
const sync = (page) => page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.sync(true); });
const idle = (page) => page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.settle(8000); await new Promise((r) => setTimeout(r, 50)); await Cloud.settle(8000); });
const title = (page) => page.evaluate(async () => { const { titleScreen } = await import('/src/ui/screens.js'); titleScreen(); });
async function signInByClicks(d) {
  await d.page.click('.title-menu button:has-text("Settings")');
  await d.page.waitForSelector('[data-cloud]');
  const label = await d.page.textContent('[data-cloud]');
  await d.page.click('[data-cloud]');
  await d.page.waitForFunction(() => document.querySelector('[data-cloud]') && !/Signing in/.test(document.querySelector('[data-cloud]').textContent));
  await idle(d.page);
  return label;
}
const check = (ok, msg, fails) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const fails = [], errs = [];
  const A = await device('A'), B = await device('B');
  try {
    // 1. A has two heroes and signs in from Settings: both go up
    const idsA = await run(A.page, 'seed', [['paladin', 'Aria', 100], ['wizard', 'Wix', 200]]);
    await title(A.page);
    const before = await signInByClicks(A);
    check(before === 'Sign in with Google', `A: the settings row offered "${before}"`, fails);
    check(/Test Player · synced/.test(await A.page.textContent('[data-cloud]')), 'A: the row shows the account, synced', fails);
    await A.shot('cloud_settings');
    await A.page.click('[data-cloud]');
    await A.page.waitForSelector('.dialog-box:has(h2:text-is("Cloud Save"))');
    await A.shot('cloud_account');
    await A.page.click('.dialog-box:has(h2:text-is("Cloud Save")) button:has-text("Done")');
    await A.page.click('.dialog-box button:has-text("Done")');
    let p = await cloudHero(A.page, 'paladin');
    check(p && p.id === idsA.paladin && p.gold === 100 && p.meta, 'A: paladin is in the cloud (gzipped, meta matches)', fails);
    check(!!await cloudHero(A.page, 'wizard'), 'A: wizard is in the cloud', fails);
    check(/sync with your Google account/.test(await A.page.textContent('.title-foot')), 'A: the title foot says saves sync', fails);

    // 2. B has a ranger and signs in: it gets the paladin and wizard, the ranger goes up
    await run(B.page, 'seed', [['ranger', 'Rook', 300]]);
    await title(B.page);
    await signInByClicks(B);
    await B.page.click('.dialog-box button:has-text("Done")');
    let lb = await run(B.page, 'local');
    check(lb.paladin && lb.paladin.id === idsA.paladin && lb.wizard && lb.ranger, 'B: pulled paladin + wizard, kept ranger', fails);
    check(lb.paladin.lastPlayed === p.lastPlayed, 'B: the pulled paladin keeps its lastPlayed', fails);
    check(!!await cloudHero(B.page, 'ranger'), 'B: ranger went up', fails);
    check(/Heroes · 3\//.test(await B.page.textContent('.title-menu')), 'B: the title menu was rebuilt with 3 heroes', fails);
    await B.shot('cloud_title');

    // 3. B plays the paladin, quits: A syncs and has the new gold
    await B.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { heroesByClass } = await import('/src/game/save.js');
      await game.loadChar(heroesByClass().paladin);
      G.char.gold = 5555; game.autosave();
      game.quitToTitle();
    });
    await idle(B.page);
    p = await cloudHero(B.page, 'paladin');
    check(p.gold === 5555, 'B: playing the paladin and quitting pushed it (gold 5555)', fails);
    await sync(A.page);
    let la = await run(A.page, 'local');
    check(la.paladin.gold === 5555, 'A: synced and has gold 5555', fails);

    // 4. both play the paladin, A offline: back on the title, A is asked which to keep and keeps the cloud
    await A.page.evaluate(() => { window.__OFFLINE = true; });
    await A.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { heroesByClass } = await import('/src/game/save.js');
      await game.loadChar(heroesByClass().paladin);
      G.char.gold = 1111; game.autosave();
      const { Cloud } = await import('/src/game/cloud.js');
      await Cloud.flush();
    });
    let s = await run(A.page, 'status');
    check(s.status === 'offline', `A offline: status ${s.status} (${s.error})`, fails);
    await B.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { heroesByClass } = await import('/src/game/save.js');
      await game.loadChar(heroesByClass().paladin);
      G.char.gold = 2222; game.autosave(); game.quitToTitle();
    });
    await idle(B.page);
    await A.page.evaluate(() => { window.__OFFLINE = false; });
    await A.page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.flush(); });
    s = await run(A.page, 'status');
    check(s.conflicts.includes('paladin'), 'A in game: the paladin push found the cloud changed (conflict)', fails);
    const log = await A.page.evaluate(() => document.body.innerText);
    check(/also played on another device/.test(log), 'A in game: the warning is in the log', fails);
    check((await cloudHero(A.page, 'paladin')).gold === 2222, 'A in game: the cloud copy was not overwritten', fails);
    await A.page.evaluate(() => window.VELSCOUR.game.quitToTitle());
    await A.page.waitForSelector('.cloud-conflict', { timeout: 8000 }).catch(() => {});
    check(!!await A.page.$('.cloud-conflict'), 'A on the title: the conflict dialog is up', fails);
    await A.shot('cloud_conflict');
    const txt = await A.page.textContent('.cloud-conflict').catch(() => '');
    check(/Paladin/.test(txt) && /This device/.test(txt) && /Google cloud/.test(txt), 'A: the dialog names the class and both copies', fails);
    await A.page.click('.cloud-conflict button:has-text("Keep the cloud")');
    await idle(A.page);
    la = await run(A.page, 'local');
    check(la.paladin.gold === 2222, 'A: kept the cloud copy (gold 2222)', fails);
    let bk = await run(A.page, 'backups');
    check(bk.some((b) => b.cls === 'paladin' && b.why === 'cloud' && b.gold === 1111), 'A: its own copy (gold 1111) was backed up first', fails);
    s = await run(A.page, 'status');
    check(!s.conflicts.length && s.status === 'ok', `A: no conflicts left, status ${s.status}`, fails);

    // 5. B deletes the wizard on hero select: it leaves the cloud, then A
    await B.page.evaluate(async () => { const { deleteClassSaves } = await import('/src/game/save.js'); deleteClassSaves('wizard'); });
    await idle(B.page);
    const tomb = await cloudHero(B.page, 'wizard');
    check(tomb && tomb.deleted && tomb.id === idsA.wizard, 'B: deleting the wizard left a tombstone in the cloud', fails);
    await sync(A.page);
    la = await run(A.page, 'local');
    check(!la.wizard && la.ranger, 'A: the wizard is gone, the ranger came down', fails);
    bk = await run(A.page, 'backups');
    check(bk.some((b) => b.cls === 'wizard' && b.why === 'deleted' && b.id === idsA.wizard), 'A: the deleted wizard was backed up first', fails);

    // 6. A reloads: the session resumes on boot without a click
    await A.page.reload();
    await A.page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await A.page.waitForFunction(async () => { const { Cloud } = await import('/src/game/cloud.js'); return Cloud.status === 'ok'; }, null, { timeout: 8000 }).catch(() => {});
    s = await run(A.page, 'status');
    check(s.signedIn && s.status === 'ok', `A reloaded: signed in, status ${s.status}`, fails);

    // 7. C: a fresh device with its own paladin signs in: asked, nothing overwritten; keeps its own
    const C = await device('C');
    try {
      const idsC = await run(C.page, 'seed', [['paladin', 'Cyra', 7]]);
      await title(C.page);
      await signInByClicks(C);
      await C.page.waitForSelector('.cloud-conflict', { timeout: 8000 }).catch(() => {});
      check(!!await C.page.$('.cloud-conflict'), 'C: first sign-in with a different paladin asks', fails);
      check((await cloudHero(C.page, 'paladin')).gold === 2222 && (await run(C.page, 'local')).paladin.gold === 7, 'C: neither copy was overwritten before the choice', fails);
      await C.page.click('.cloud-conflict button:has-text("Keep this device")');
      await idle(C.page);
      p = await cloudHero(C.page, 'paladin');
      check(p.id === idsC.paladin && p.gold === 7, 'C: kept its own paladin, now in the cloud', fails);
      check((await run(C.page, 'backups')).some((b) => b.cls === 'paladin' && b.why === 'cloudcopy' && b.gold === 2222), 'C: the cloud copy it wrote over (gold 2222) was backed up on C', fails);
      check((await run(C.page, 'local')).ranger, 'C: got the ranger too', fails);
      await sync(A.page);
      check((await run(A.page, 'local')).paladin.id === idsC.paladin, 'A: synced C\'s paladin', fails);
      errs.push(...C.errors.map((e) => 'C ' + e));
    } finally { await C.browser.close(); }

    // 8. a hero gone from this device without a delete (lost, cleared) comes back from the cloud; the cloud keeps it
    await A.page.evaluate(() => { const k = 'velscour_saves_v1'; localStorage.setItem(k, JSON.stringify(JSON.parse(localStorage.getItem(k)).filter((c) => c.classId !== 'ranger'))); });
    await sync(A.page);
    check(!!(await run(A.page, 'local')).ranger && !!(await cloudHero(A.page, 'ranger')) && !(await cloudHero(A.page, 'ranger')).deleted, 'A: a ranger lost here (not deleted) came back; the cloud still has it', fails);
    // 9. a hero gone from the cloud without a tombstone is sent again, never deleted here
    store.delete('users/u1/heroes/ranger');
    await sync(A.page);
    check(!!(await run(A.page, 'local')).ranger && !!(await cloudHero(A.page, 'ranger')), 'A: a ranger missing from the cloud was sent again, still here', fails);
    // 10. unreadable saves on this device: cloud sync changes nothing, here or in the cloud
    const snap = JSON.stringify([...store]);
    const raw = await B.page.evaluate(() => { const r = localStorage.getItem('velscour_saves_v1'); localStorage.setItem('velscour_saves_v1', '[{"broken'); return r; });
    await sync(B.page);
    s = await run(B.page, 'status');
    check(s.status === 'error' && /could not be read/.test(s.error), `B unreadable saves: sync paused (${s.status})`, fails);
    check(await B.page.evaluate(() => localStorage.getItem('velscour_saves_v1')) === '[{"broken' && JSON.stringify([...store]) === snap, 'B unreadable saves: the saves and the cloud are untouched', fails);
    await B.page.evaluate((r) => localStorage.setItem('velscour_saves_v1', r), raw);
    // 11. a damaged cloud copy, newer than this device's: not loaded, the hero here is untouched
    const good = store.get('users/u1/heroes/ranger');
    store.set('users/u1/heroes/ranger', { ...good, gz: null, json: '{"id":', lastPlayed: good.lastPlayed + 1 });
    const before11 = (await run(A.page, 'local')).ranger;
    await sync(A.page);
    s = await run(A.page, 'status');
    const after11 = (await run(A.page, 'local')).ranger;
    check(s.status === 'error' && /damaged/.test(s.error) && after11 && after11.lastPlayed === before11.lastPlayed, `A damaged cloud copy: not loaded, the ranger here untouched (${s.status})`, fails);
    store.set('users/u1/heroes/ranger', good);
    await sync(A.page);
    // 12. a device without IndexedDB can't back up, so it never replaces a hero (keeping its own still works)
    const D = await device('D', null, true);
    try {
      await run(D.page, 'seed', [['ranger', 'Dov', 9]]);
      await title(D.page);
      await signInByClicks(D);
      await D.page.waitForSelector('.cloud-conflict', { timeout: 8000 }).catch(() => {});
      await D.page.click('.cloud-conflict button:has-text("Keep the cloud")');
      await idle(D.page);
      const ld = await run(D.page, 'local');
      s = await run(D.page, 'status');
      check(ld.ranger && ld.ranger.name === 'Dov' && s.status === 'error', `D without IndexedDB: "keep the cloud" changed nothing (${s.status}: ${s.error})`, fails);
      check((await cloudHero(D.page, 'ranger')).name !== 'Dov', 'D without IndexedDB: the cloud ranger is untouched too', fails);
      errs.push(...D.errors.filter((e) => !/IndexedDB/.test(e)).map((e) => 'D ' + e));
    } finally { await D.browser.close(); }
    // 13. the played hero goes up every 5 minutes (or when play stops), not on every autosave
    const pd = await B.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { Cloud } = await import('/src/game/cloud.js');
      const { heroesByClass } = await import('/src/game/save.js');
      await Cloud.sync(true);
      await game.loadChar(heroesByClass().ranger);
      G.char.gold = 4242; game.autosave();
      await new Promise((r) => setTimeout(r, 1500));
      return Cloud.PUSH_DELAY;
    });
    check(pd === 300000 && (await cloudHero(B.page, 'ranger')).gold !== 4242, 'B in game: an autosave does not go up at once (PUSH_DELAY 5 min)', fails);
    await B.page.evaluate(() => window.VELSCOUR.game.quitToTitle());
    await idle(B.page);
    check((await cloudHero(B.page, 'ranger')).gold === 4242, 'B: quitting to the title sent it', fails);
    // 14. Settings > Hero backups restores a backed-up hero
    await A.page.click('.title-menu button:has-text("Settings")');
    await A.page.click('[data-backups]');
    await A.page.waitForSelector('.backup-row');
    await A.shot('cloud_backups');
    await A.page.click('.backup-row:has-text("Aria") >> nth=0 >> button');
    await A.page.click('.dialog-box:has(h2:text-is("Restore hero?")) button:has-text("Restore")');
    await A.page.waitForSelector('.dialog-box:has-text("is restored")');
    la = await run(A.page, 'local');
    check(la.paladin && la.paladin.name === 'Aria', `A: restored Aria from the backups (gold ${la.paladin && la.paladin.gold})`, fails);
    bk = await run(A.page, 'backups');
    check(bk.some((b) => b.why === 'restore' && b.name === 'Cyra'), 'A: the paladin it replaced (Cyra) was backed up', fails);

    // 15. sign out: heroes stay on the device, nothing syncs
    await A.page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.signOut(); });
    s = await run(A.page, 'status');
    la = await run(A.page, 'local');
    check(!s.signedIn && s.status === 'off' && la.paladin && la.ranger, 'A signed out: heroes kept, status off', fails);
    await run(A.page, 'seed', [['bard', 'Lyre', 1]]);
    await idle(A.page);
    check(!await cloudHero(A.page, 'bard'), 'A signed out: a new hero does not go up', fails);

    // 16. the Endgame's account record (users/{uid}/account/endgame) on two more devices of one account: Infernal
    // Marks earned apart add up (a three-way merge against the record each device last synced), spending holds, the
    // unlock keeps the earliest time, rift bests merge per class, a damaged cloud copy lowers nothing, sign-out keeps it
    const U = { uid: 'u3', displayName: 'Mark Player', email: 'marks@example.com' }, DOC = 'users/u3/account/endgame';
    const E = await device('E', U), F = await device('F', U);
    try {
      const rec = (d) => d.page.evaluate(async () => { const { endgame } = await import('/src/game/endgame.js'); const r = endgame(); return { pts: r.marks.pts, spent: r.marks.spent, bests: Object.keys(r.bests).sort().join(','), unlocked: r.unlocked }; });
      const doc = () => E.page.evaluate((p) => window.__store('get', p), DOC);
      const act = (d, fn, ...a) => d.page.evaluate(`(async () => { const M = await import('/src/game/marks.js'); const E = await import('/src/game/endgame.js'); (${fn})(M, E, ...${JSON.stringify(a)}); })()`);
      const signIn = (d) => d.page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.signIn(); });
      const sp = (r) => `${r.pts} (life ${r.spent.life}, crit ${r.spent.crit})`;
      await signIn(E);
      await act(E, (M) => { M.grantMarks(10, 'test'); M.spendMark('life', 4); });
      await sync(E.page); await idle(E.page);
      let c = await doc();
      check(c && c.marks.pts === 10 && c.marks.spent.life === 4, `account E: earns 10 Marks, 4 on Vitality, syncs: the cloud holds ${c && c.marks.pts}/${c && c.marks.spent.life}`, fails);
      await signIn(F); await idle(F.page);
      let rf = await rec(F);
      check(rf.pts === 10 && rf.spent.life === 4, `account F signs in: sees ${sp(rf)}`, fails);
      // apart: E offline earns 6 (and slays Velscour, a paladin rift best); F earns 3, spends 2 on Precision (an earlier unlock, a wizard best)
      await E.page.evaluate(() => { window.__OFFLINE = true; });
      await act(E, (M, E) => { M.grantMarks(6, 'test'); E.unlockEndgame(); E.noteRiftBest('paladin', 12, 300); });
      await sync(E.page); await idle(E.page);
      await act(F, (M, E, t) => { M.grantMarks(3, 'test'); M.spendMark('crit', 2); E.endgame().unlocked = t; E.noteRiftBest('wizard', 9, 200); }, Date.now() - 864e5);
      await sync(F.page); await idle(F.page);
      c = await doc();
      check(c.marks.pts === 13, `account F syncs while E is offline: the cloud holds ${c.marks.pts}`, fails);
      await E.page.evaluate(() => { window.__OFFLINE = false; });
      await sync(E.page); await idle(E.page);
      await sync(F.page); await idle(F.page);
      const re = await rec(E); rf = await rec(F); c = await doc();
      check(re.pts === 19 && rf.pts === 19 && c.marks.pts === 19, `account: 10 + 6 + 3 Marks earned apart -> E ${re.pts}, F ${rf.pts}, cloud ${c.marks.pts} (no Mark lost)`, fails);
      check(sp(re) === '19 (life 4, crit 2)' && sp(rf) === sp(re), `account: spending holds on both: E ${sp(re)}, F ${sp(rf)}`, fails);
      check(re.unlocked === rf.unlocked && re.unlocked < Date.now() - 8e7 && re.bests === 'paladin,wizard' && rf.bests === re.bests, `account: the unlock keeps the earliest time, rift bests merge (${re.bests})`, fails);
      // a damaged cloud copy: nothing lowered here, and the next sync mends it
      await E.page.evaluate((p) => window.__store('put', [p, { v: 1, unlocked: 'x', marks: { pts: 'x', xp: 'y', spent: { life: 99 } }, bests: { paladin: { tier: 'z' } }, keysFound: 'q' }]), DOC);
      await sync(F.page); await idle(F.page);
      rf = await rec(F); c = await doc();
      check(sp(rf) === '19 (life 4, crit 2)' && rf.bests === 'paladin,wizard' && rf.unlocked === re.unlocked, `account: a damaged cloud copy (pts 'x', 99 on Vitality) lowers nothing on F: ${sp(rf)}`, fails);
      check(c.marks.pts === 19 && c.marks.spent.life === 4 && c.marks.spent.crit === 2, `account: F's sync mends the cloud copy (${c.marks.pts}, life ${c.marks.spent.life})`, fails);
      await act(E, (M) => { M.grantMarks(1, 'test'); });
      await sync(E.page); await idle(E.page); await sync(F.page); await idle(F.page);
      rf = await rec(F);
      check(rf.pts === 20 && (await rec(E)).pts === 20, `account: one more Mark on E after the mend reaches F once (${rf.pts})`, fails);
      // sign-out keeps the record here and forgets the base
      await E.page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.signOut(); });
      const out = await E.page.evaluate(() => ({ rec: JSON.parse(localStorage.getItem('velscour_endgame_v1')).marks.pts, base: 'endBase' in JSON.parse(localStorage.getItem('velscour_cloud_v1')) }));
      check(out.rec === 20 && !out.base, `account E signs out: its record stays (${out.rec} Marks), the merge base goes`, fails);
    } finally {
      errs.push(...E.errors.map((e) => 'E ' + e), ...F.errors.map((e) => 'F ' + e));
      await E.browser.close(); await F.browser.close();
    }

    // 17. the Abyssal Rifts' honour board (game/leaderboard.js): one entry per player and class that only a better run
    // replaces (a read-compare-set), sorted tier first then time, read by a signed-out device and shown in its dialog
    const as = async (d, uid, name) => { await d.page.evaluate(async ([uid, name]) => { const { Cloud } = await import('/src/game/cloud.js'); if (Cloud.signedIn) await Cloud.signOut(); window.__FAKE_USER = { uid, displayName: name, email: name.toLowerCase() + '@example.com' }; await Cloud.signIn(); }, [uid, name]); await idle(d.page); };
    const post = (d, name, tier, time) => d.page.evaluate(async ([name, tier, time]) => {
      const { newCharData } = await import('/src/game/save.js');
      const { rollItem } = await import('/src/data/items.js');
      const { Board } = await import('/src/game/leaderboard.js');
      const { SKILLS } = await import('/src/data/skills.js');
      const c = newCharData('wizard', name); c.level = 270 + tier;
      Object.keys(SKILLS).filter((k) => k.startsWith('wizard.')).slice(0, 6).forEach((id, i) => { c.bar[i] = id; });
      c.equip.weapon = rollItem(272, { slot: 'weapon', rarity: 6 }); c.equip.body = rollItem(268, { slot: 'body', rarity: 5 }); c.equip.ring1 = rollItem(270, { slot: 'ring', rarity: 4 });
      return Board.submit(c, tier, time);
    }, [name, tier, time]);
    const entry = (uid) => A.page.evaluate((uid) => window.__store('get', 'boards/wizard/entries/' + uid), uid);
    await as(A, 'u-ann', 'Ann');
    const pAnn = await post(A, 'Ann', 12, 220);
    await as(B, 'u-bo', 'Bo');
    const pBo = await post(B, 'Bo', 12, 190);
    await as(A, 'u-cy', 'Cy');
    const pCy = await post(A, 'Cy', 15, 300);
    check(pAnn.ok && pBo.ok && pCy.ok, `board: Ann, Bo and Cy each post a run (${JSON.stringify([pAnn, pBo, pCy])})`, fails);
    await as(A, 'u-ann', 'Ann');
    const slower = await post(A, 'Ann', 12, 240), lower = await post(A, 'Ann', 11, 100);
    let e = await entry('u-ann');
    check(slower.kept && !slower.ok && lower.kept && e.tier === 12 && e.time === 220, `board: a slower tier 12 and a faster tier 11 from Ann are refused; her 3:40 stands (${e.tier} ${e.time})`, fails);
    const keys = Object.keys(e).sort().join();
    check(keys === 'at,build,cls,level,marks,name,tier,time,v' && e.v === 1 && Number.isInteger(e.tier) && e.time > 0 && e.cls === 'wizard' && e.build.gear.weapon.rarity === 6 && Array.isArray(e.build.bar), `board: the entry has the fields firestore.rules allows (${keys})`, fails);
    const top = await A.page.evaluate(async () => { const { Board } = await import('/src/game/leaderboard.js'); return (await Board.top('wizard')).map((x) => `${x.name} ${x.tier} ${x.time}`); });
    check(top.join(', ') === 'Cy 15 300, Bo 12 190, Ann 12 220', `board: top() orders Cy, Bo, Ann (${top.join(', ')})`, fails);
    // a hero that took Velscour's gift (game/deathgift.js) is never listed: Dax posts clean, takes the gift, and his entry
    // comes off at once; a gift taken signed out (or on another device) is caught by the next sync
    await as(A, 'u-dax', 'Dax');
    const pDax = await post(A, 'Dax', 14, 200), e0 = await entry('u-dax');
    const gifted = await A.page.evaluate(async () => {
      const { newCharData } = await import('/src/game/save.js'); const { Board } = await import('/src/game/leaderboard.js');
      const c = newCharData('wizard', 'Dax'); c.cheated = true; return Board.submit(c, 30, 100);
    });
    const e1 = await entry('u-dax');
    await A.page.evaluate((v) => window.__store('put', ['boards/wizard/entries/u-dax', v]), e0);
    const e2 = await entry('u-dax');
    await A.page.evaluate(async () => {
      const { newCharData, writeSave } = await import('/src/game/save.js'); const { Cloud } = await import('/src/game/cloud.js');
      const c = newCharData('wizard', 'Dax'); c.cheated = true; writeSave(c); await Cloud.sync(true);
    });
    const e3 = await entry('u-dax');
    check(pDax.ok && e0 && e0.tier === 14 && gifted.barred && !e1 && e2 && !e3, `board: Dax's clean run is listed; with Velscour's gift his post is refused and his entry comes off (${JSON.stringify(gifted)}), and a sync takes it off again`, fails);
    const V = await device('V'), W = await device('W', null, false, { width: 844, height: 390, mobile: true });
    try {
      for (const [d, nm] of [[V, 'rift_board'], [W, 'rift_board_phone']]) {
        const seen = await d.page.evaluate(async () => {
          const { G, game } = window.VELSCOUR;
          await game.newChar('wizard', 'Viewer');
          document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
          const { Cloud } = await import('/src/game/cloud.js');
          const { noteRiftBest } = await import('/src/game/endgame.js');
          noteRiftBest('wizard', 9, 251);
          const { Rifts } = await import('/src/ui/rifts.js');
          const dl = Rifts.board('wizard');
          await dl.ready;
          return { signedIn: Cloud.signedIn, names: [...dl.box.querySelectorAll('.rb-row[data-i] .rb-name')].map((x) => x.textContent), you: dl.box.querySelector('.rb-you').textContent };
        });
        check(!seen.signedIn && seen.names.join() === 'Cy,Bo,Ann' && /Tier 9 · 4:11/.test(seen.you) && /Sign in with Google/.test(seen.you), `board: signed-out device ${d.name} reads it after loading the SDK (${seen.names.join(', ')}; ${seen.you})`, fails);
        await d.page.click('.rb-row[data-i="2"]');
        const open = await d.page.evaluate(() => { const b = document.querySelector('.rb-row[data-i="2"] + .rb-build'); return !b.classList.contains('hidden') && /Abyssal/.test(b.innerHTML) && /Level 282/.test(b.textContent) && b.querySelectorAll('.rb-skills span').length === 6; });
        check(open, `board (${d.name}): Ann's row opens her build (skills, Abyssal weapon, level)`, fails);
        await d.page.waitForTimeout(200);
        await d.shot(nm);
      }
      await V.page.evaluate(async () => { window.__OFFLINE = true; document.querySelectorAll('.screen').forEach((s) => s.remove()); window.VELSCOUR.G.ui.modalCount = 0; const { Rifts } = await import('/src/ui/rifts.js'); await Rifts.board('wizard').ready; });
      check(/Could not reach the board/.test(await V.page.textContent('.rb-list')), 'board: offline, the dialog says it could not reach the board', fails);
    } finally {
      errs.push(...V.errors.map((x) => 'V ' + x).filter((x) => !/client is offline/.test(x)), ...W.errors.map((x) => 'W ' + x));
      await V.browser.close(); await W.browser.close();
    }
  } finally {
    errs.push(...A.errors.map((e) => 'A ' + e), ...B.errors.map((e) => 'B ' + e));
    await A.browser.close(); await B.browser.close();
  }

  // 9. the real SDK: loads, sends the popup to the auth domain, and Firestore refuses a signed-out read
  if (!process.argv.includes('nosdk')) {
    const dir = path.join(OUT_DIR, 'firebase-12.19.0');
    let route = false;
    try { execSync('curl -sSf -o /dev/null ' + SDK + 'firebase-app.js', { stdio: 'ignore', timeout: 15000 }); } catch (e) { route = true; }
    if (route && !fs.existsSync(path.join(dir, 'package/firebase-app.js'))) {
      fs.mkdirSync(dir, { recursive: true });
      execSync(`curl -sSf https://registry.npmjs.org/firebase/-/firebase-12.19.0.tgz | tar xz -C "${dir}" package/firebase-app.js package/firebase-auth.js package/firebase-firestore-lite.js`);
    }
    const R = await openGame();
    try {
      if (route) await R.ctx.route(SDK + '*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(dir, 'package', r.request().url().split('/').pop())) }));
      console.log(route ? '(gstatic is blocked here: the SDK comes from the npm package)' : '(SDK from gstatic)');
      await R.page.click('.title-menu button:has-text("Settings")');
      await R.page.evaluate(async () => { const { Cloud } = await import('/src/game/cloud.js'); await Cloud.preload(); });
      const popup = R.ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
      await R.page.click('[data-cloud]');   // a real tap, as the popup needs
      const r = await R.page.evaluate(async () => {
        const f = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js');
        const a = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
        try { await f.getDocs(f.collection(f.getFirestore(a.getApp()), 'users', 'nobody', 'heroes')); return 'READ ALLOWED'; } catch (e) { return (e.code || '') + ' ' + String(e.message).slice(0, 160); }
      });
      const pop = await popup;
      const url = pop ? pop.url() : '';
      let gapi = true;   // the popup waits on Google's auth iframe (apis.google.com), which cloud containers block
      try { execSync('curl -sSf -o /dev/null https://apis.google.com/js/api.js', { stdio: 'ignore', timeout: 15000 }); } catch (e) { gapi = false; }
      if (!gapi) console.log('skip real SDK popup: apis.google.com is unreachable here');
      else check(/velscour\.firebaseapp\.com\/__\/auth\/handler/.test(url) || /about:blank/.test(url), `real SDK: sign-in opened a popup (${url.slice(0, 70)})`, fails);
      check(/permission-denied/.test(r), `real SDK: Firestore refuses a signed-out read: ${r}`, fails);
    } finally { await R.browser.close(); }
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
  if (fails.length) process.exitCode = 1;
  report(errs);
})();
