// Bakes the procedural held gear (tools/weapons3d.js) into assets/sprites/held/: per set <set>.webp (lossless: held
// sprites, palette masks, icons, icon masks) and <set>.json (rects, offsets from the fist, sockets and effect points),
// and index.json (the sets, every class's fists on every armor). Sets with models: true also get one three.js JSON
// file per design in assets/models/held/<set>/NN.json (+ index.json), loaded live by src/gfx/heldmodel3d.js.
// The game draws the sprites with src/gfx/heldart.js.
// Needs the repo served (BASE_URL) and jsDelivr (three.js), and python with Pillow for the lossless WebP.
//   node tools/weapons3d_bake.js [sets,... | all]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8123';
const MODELS = process.env.MODELS_OUT || path.join(__dirname, '..', 'assets', 'models', 'held');
const OUT = process.env.HELD_OUT || path.join(__dirname, '..', 'assets', 'sprites', 'held'); // HELD_OUT: bake elsewhere, swap in when done
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  const page = await browser.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall/.test(m.text()) && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${BASE}/tools/weapons3d.html?bake`);
  await page.waitForFunction(() => window.FORGE?.ready, null, { timeout: 120000 });
  const all = await page.evaluate(() => window.FORGE.SETS);
  const which = !process.argv[2] || process.argv[2] === 'all' ? all : process.argv[2].split(',');
  const pngs = [];
  for (const s of which) {
    const t0 = Date.now(), { png, meta, models } = await page.evaluate((s) => window.FORGE.bakeSet(s), s);
    if (models.length) { // one three.js JSON file per design (THREE.ObjectLoader) in assets/models/held/<set>/
      const dir = path.join(MODELS, s);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      models.forEach((m, i) => fs.writeFileSync(path.join(dir, String(i).padStart(2, '0') + '.json'), JSON.stringify(m)));
      fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(models.map((m, i) => ({ file: String(i).padStart(2, '0') + '.json', ...m.object.userData }))));
      console.log('  wrote', models.length, 'three.js models to', dir);
    }
    const file = path.join(OUT, `${s}.png`);
    fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, `${s}.json`), JSON.stringify(meta));
    pngs.push(file);
    console.log('baked', s, meta.designs.length, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  const idxFile = path.join(OUT, 'index.json'), idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : { v: 1, sets: {} };
  for (const s of which) { const m = JSON.parse(fs.readFileSync(path.join(OUT, `${s}.json`), 'utf8')); idx.sets[s] = { cls: m.cls, slot: m.slot, hand: m.hand }; }
  idx.fists = await page.evaluate(() => window.FORGE.bakeFists());
  fs.writeFileSync(idxFile, JSON.stringify(idx));
  await browser.close();
  // lossless WebP (the masks must keep their exact codes)
  const py = 'import sys\nfrom PIL import Image\nimport os\nfor p in sys.argv[1:]:\n    Image.open(p).save(p[:-4] + ".webp", "WEBP", lossless=True, quality=100, method=6)\n    os.remove(p)\n';
  const r = spawnSync(process.env.PYTHON || 'python', ['-c', py, ...pngs], { stdio: 'inherit' });
  if (r.status !== 0) console.log('WebP conversion failed: the PNGs are left in', OUT);
  else console.log('wrote', pngs.length, 'sets to', OUT);
})();
