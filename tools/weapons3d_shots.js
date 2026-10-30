// Review sheets of the procedural held gear (tools/weapons3d.html): per class one sheet, a row per rarity of random heroes
// holding that rarity's designs with their effects, in art-review/weapons/<class>.png.
// Needs the repo served (python -m http.server, BASE_URL) and jsDelivr (three.js, for this tool only).
//   node tools/weapons3d_shots.js [classes,... | all] [seed]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8123';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'art-review', 'weapons');
const data = (u) => Buffer.from(u.split(',')[1], 'base64');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall/.test(m.text()) && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${BASE}/tools/weapons3d.html`);
  await page.waitForFunction(() => window.FORGE?.ready, null, { timeout: 120000 });
  const all = await page.evaluate(() => window.FORGE.CLS), seed = +(process.argv[3] || 7);
  const which = !process.argv[2] || process.argv[2] === 'all' ? all : process.argv[2].split(',');
  for (const c of which) {
    const t0 = Date.now();
    fs.writeFileSync(path.join(OUT, `${c}${seed === 7 ? '' : '_s' + seed}.png`), data(await page.evaluate(([c, s]) => window.FORGE.sheet(c, s), [c, seed])));
    console.log('wrote', c, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
  // a gallery of the sheets (index.html beside them)
  const have = all.filter((c) => fs.existsSync(path.join(OUT, `${c}.png`)));
  const name = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).replace('Arcane Sorcerer', 'Astronomer');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Weapon Forge</title>
<style>body{margin:0;padding:16px 20px;background:#141217;color:#e8dfcf;font:13px/1.5 Consolas,monospace}h1{color:#f0c870;font-size:18px}
h2{color:#f0c870;font-size:15px;margin:28px 0 6px;border-top:1px solid #3a332c;padding-top:14px}img{display:block;max-width:100%;image-rendering:pixelated}
nav a{color:#f0c870;margin-right:10px}p{color:#a39a8c}</style>
<h1>Held gear: every class, a row per rarity (Common to Mythic), random heroes, effects at one moment</h1>
<p>Each class has 50 designs for its weapon and 50 for its off-hand; every row shows that rarity's designs on random armor and helmets.</p>
<nav>${have.map((c) => `<a href="#${c}">${name(c)}</a>`).join('')}</nav>
${have.map((c) => `<section id="${c}"><h2>${name(c)}</h2><img src="${c}.png" alt="${name(c)}">${fs.existsSync(path.join(OUT, 'ingame', `${c}.png`)) ? `<p>In game (tools/tests/heldgear.js): Common, Rare, Epic, Legendary, Mythic, facing right then left</p><img src="ingame/${c}.png" alt="${name(c)} in game">` : ''}</section>`).join('\n')}\n`);
})();
