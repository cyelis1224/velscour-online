// Bake the 3D castle (tools/castle3d.html, layout in src/world/castle3d.js) into per-tile pieces, roofs and frames:
// assets/source/castle3d/out/[<dir>/] (PNG pages + index.json); then `python tools/castle3d.py pack [ids]` writes
// assets/tiles/castle3d/[<dir>/]. One bake per castle variant (src/data/castles.js; `dir` is its look.dir, '' for the
// first castle). Needs the repo served (python -m http.server 8123) and jsDelivr (three.js, for this tool only). On
// Windows a GPU helps: CHROMIUM_ARGS="--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist".
//   node tools/castle3d_bake.js [ids|all]                 # bake (default: the first castle)
//   node tools/castle3d_bake.js preview x,y[,w,h] [id]    # one framed view -> tools/tests/out/castle3d_preview_<id>_<x>_<y>.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8123';
const ROOT = path.resolve(__dirname, '..');
const png = (u) => Buffer.from(u.split(',')[1], 'base64');
(async () => {
  const args = process.argv.slice(2);
  const { CASTLE_VARIANTS } = await import('../src/data/castles.js');
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  const page = await browser.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${BASE}/tools/castle3d.html?bake`);
  await page.waitForFunction(() => window.CASTLE3D, null, { timeout: 60000 });
  if (process.env.NOSHADOW) await page.evaluate(() => { window.NOSHADOW = true; });
  if (args[0] === 'preview') {
    const out = path.join(ROOT, 'tools/tests/out'); fs.mkdirSync(out, { recursive: true });
    const id = await page.evaluate((v) => window.CASTLE3D.setVariant(v), args.find((a, k) => k > 0 && !/^[\d.,]+$/.test(a)) || null);
    for (const a of args.slice(1).filter((a) => /^[\d.,]+$/.test(a))) {
      const [x, y, w, h, S] = a.split(',').map(Number);
      const u = await page.evaluate(([x, y, w, h, S]) => window.CASTLE3D.preview(x, y, w || 1400, h || 900, S || 1), [x, y, w, h, S]);
      fs.writeFileSync(path.join(out, `castle3d_preview_${id}_${x}_${y}.png`), png(u));
      console.log('preview', id, x, y);
    }
  } else {
    const ids = !args[0] ? [CASTLE_VARIANTS[0].id] : args[0] === 'all' ? CASTLE_VARIANTS.map((v) => v.id) : args[0].split(',');
    for (const id of ids) {
      const v = CASTLE_VARIANTS.find((q) => q.id === id);
      if (!v) throw new Error('no castle variant ' + id);
      await page.evaluate((id) => window.CASTLE3D.setVariant(id), id);
      const r = await page.evaluate(async (S) => window.CASTLE3D.bakeAll(S), Number(process.env.CASTLE3D_S || 1.5));
      const dir = path.join(ROOT, 'assets/source/castle3d/out', v.look.dir || ''); fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) if (fs.statSync(path.join(dir, f)).isFile()) fs.unlinkSync(path.join(dir, f));
      const pages = r.pages.map((u, i) => { fs.writeFileSync(path.join(dir, `pieces_${i}.png`), png(u)); return `pieces_${i}`; });
      fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ S: r.S, variant: id, pages, pieces: r.pieces, tiles: r.tiles, roofs: r.roofs, moving: r.moving }));
      console.log(`castle3d ${id}: ${r.renders} renders, ${r.pieces.length} pieces (tile layers ${r.tiles.length / 3}, roof strips ${r.roofs.reduce((n, f) => n + f.strips.length, 0)}), ${pages.length} pages in ${r.ms} ms`);
    }
  }
  await browser.close();
})();
