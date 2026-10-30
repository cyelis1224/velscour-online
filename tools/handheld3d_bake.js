// Sheets of random Paladins holding the three.js maces and shields (tools/handheld3d.html, tools/handheld3d.js): per
// fitting attempt a sheet of 8 heroes, a 6x close-up of the hands and a 12x one of the weapon fist, in art-review/handheld/.
// Needs the repo served (python -m http.server 8123) and jsDelivr (three.js, for this tool only).
//   node tools/handheld3d_bake.js [attempts: 1,2,... | all (default: the last)] [seed]
//   node tools/handheld3d_bake.js classes [class,... | all] [seed]   (every class's kit, tools/handheld3d_kits.js)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8123';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'art-review', 'handheld');
const data = (u) => Buffer.from(u.split(',')[1], 'base64');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${BASE}/tools/handheld3d.html`);
  await page.waitForFunction(() => window.HAND?.ready, null, { timeout: 90000 });
  const n = await page.evaluate(() => window.HAND.ATTEMPTS.length), seed = +(process.argv[3] || 7);
  const arg = process.argv[2] || String(n);
  if (arg === 'classes') { // every class's kit: a sheet of 8 per class and an overview, in art-review/handheld/classes/
    const dir = path.join(OUT, 'classes'), all = await page.evaluate(() => window.HAND.CLS), sd = +(process.argv[4] || 7);
    fs.mkdirSync(dir, { recursive: true });
    const which = !process.argv[3] || process.argv[3] === 'all' ? all : process.argv[3].split(',');
    const tag = sd === 7 ? '' : '_s' + sd;
    if (!process.argv[3] || process.argv[3] === 'all') {
      fs.writeFileSync(path.join(dir, `overview${tag}.png`), data(await page.evaluate((s) => window.HAND.overview(s), sd)));
      fs.writeFileSync(path.join(dir, `overview_large${tag}.png`), data(await page.evaluate((s) => window.HAND.overview(s, 3, 4), sd))); // 4 x 4 at 3x
      console.log('wrote', path.join(dir, `overview${tag}.png`));
    }
    for (const c of which) {
      fs.writeFileSync(path.join(dir, `${c}${tag}.png`), data(await page.evaluate(([c, s]) => window.HAND.classSheet(c, s), [c, sd])));
      console.log('wrote', path.join(dir, `${c}${tag}.png`));
    }
  } else {
    const which = arg === 'all' ? Array.from({ length: n }, (_, i) => i + 1) : arg.split(',').map(Number);
    for (const a of which) {
      const [s, c, f] = await page.evaluate(async ([a, seed]) => [await window.HAND.sheet(a - 1, seed), await window.HAND.closeup(a - 1, seed), await window.HAND.fists(a - 1, seed)], [a, seed]);
      const tag = `attempt_${String(a).padStart(2, '0')}${seed === 7 ? '' : '_s' + seed}`;
      fs.writeFileSync(path.join(OUT, `${tag}.png`), data(s));
      fs.writeFileSync(path.join(OUT, `${tag}_hands.png`), data(c));
      fs.writeFileSync(path.join(OUT, `${tag}_fist.png`), data(f));
      console.log('wrote', path.join(OUT, `${tag}.png`));
    }
  }
  // a gallery of every class and every Paladin attempt baked so far (index.html beside the sheets)
  const list = await page.evaluate(() => window.HAND.ATTEMPTS.map((a) => [a.name, a.note]));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = list.map(([name, note], i) => {
    const tag = `attempt_${String(i + 1).padStart(2, '0')}`, shots = ['', '_hands', '_fist'].filter((s) => fs.existsSync(path.join(OUT, tag + s + '.png')));
    return shots.length ? `<section id="${tag}"><h2>${esc(name)}</h2><p>${esc(note)}</p>${shots.map((s) => `<img src="${tag}${s}.png" alt="${esc(name)}${s.replace('_', ' ')}">`).join('')}</section>` : '';
  }).join('\n');
  const CLS = await page.evaluate(() => window.HAND.CLS.map((c) => [c, window.HAND.className(c)]));
  const cdir = path.join(OUT, 'classes'), have = (f) => fs.existsSync(path.join(cdir, f));
  const ov = ['overview_large.png', 'overview.png'].find(have);
  const classes = (ov ? `<section id="classes"><h2>Every class</h2><img src="classes/${ov}" alt="every class"></section>\n` : '')
    + CLS.filter(([c]) => have(c + '.png')).map(([c, name]) => `<section id="${c}"><h2>${esc(name)}</h2><img src="classes/${c}.png" alt="${esc(name)}"></section>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Hand-held Gear</title>
<style>body{margin:0;padding:16px 20px;background:#141217;color:#e8dfcf;font:13px/1.5 Consolas,monospace}h1{color:#f0c870;font-size:18px}
h2{color:#f0c870;font-size:15px;margin:28px 0 2px;border-top:1px solid #3a332c;padding-top:14px}p{color:#a39a8c;margin:0 0 8px}
img{display:block;max-width:100%;margin:0 0 8px;image-rendering:pixelated}nav a{color:#f0c870;margin-right:10px}</style>
<h1>Hand-held gear: every class, then every Paladin attempt (random heroes, seed 7)</h1>
<nav><a href="#classes">Every class</a>${CLS.map(([c, name]) => `<a href="#${c}">${esc(name)}</a>`).join('')}</nav>
<nav>${list.map(([n], i) => `<a href="#attempt_${String(i + 1).padStart(2, '0')}">${esc(n)}</a>`).join('')}</nav>
${classes}\n${rows}\n`);
  await browser.close();
})();
