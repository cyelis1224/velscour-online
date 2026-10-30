// Stall finder: a hero on auto-play for N game minutes; prints the stretches where it gets nowhere, each with the
// auto-play state (goal, path, target, loot, cast lock, channel, move, watchdogs, the last skill tried).
//   node tools/tests/stalls.js [class] [minutes] [standard|rift|breach] [gift] [autoloot] [fullbag] [god]
// gift: Velscour's gift first (level 350, Mythic +10, the Endgame open: rifts and the Breach). Flags: the same status for
// > 7 s (fights, travel and town errands excepted), parked within 2 tiles for 10 s, 15 s with no kill while monsters
// live and nothing else is going on, and flip-flops (a non-fighting status pair alternating > 12 times in 4 s).
// A soak that finds nothing prints FLAGS (0). It never fails: read what it flags.
const { openGame, report } = require('./harness');
const [cls = 'lancer', minutes = '6', dest = 'standard'] = process.argv.slice(2);
const has = (k) => process.argv.includes(k);

(async () => {
  const { browser, page, errors, shot } = await openGame();
  try {
    await page.evaluate(async ({ cls, gift, fill, autoLoot, god }) => {
      const { G, game } = window.VELSCOUR;
      const clean = () => { document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll(); };
      await game.newChar(cls, 'Staller'); clean();
      if (gift) {
        const { endgame, saveEndgame, resetEndgameCache } = await import('/src/game/endgame.js');
        localStorage.removeItem('velscour_endgame_v1'); resetEndgameCache(); endgame().unlocked = Date.now(); saveEndgame();
        (await import('/src/game/deathgift.js')).grantDeathGift(); clean();
      }
      G.settings.autoLoot = autoLoot; G.godMode = god; G.autoOpenSeals = true;
      if (fill) { const { rollItem } = await import('/src/data/items.js'); const c = G.char; for (let i = 0; i < c.bag.length; i++) if (!c.bag[i]) { const it = rollItem(Math.max(5, c.level - 30), {}); it.unid = false; c.bag[i] = it; } }
    }, { cls, gift: has('gift'), fill: has('fullbag'), autoLoot: has('autoloot'), god: has('god') });
    await page.waitForTimeout(1200);
    const res = await page.evaluate(async ({ minutes, dest }) => {
      const { G, game } = window.VELSCOUR;
      const { Auto } = await import('/src/game/autoplay.js');
      G.autoDest = dest; Auto.toggle(true);
      let lastTry = '-';
      const P = G.player.constructor.prototype, tu = P.tryUseSkill;
      P.tryUseSkill = function (sk, ...a) { const ok = tu.call(this, sk, ...a); lastTry = `${sk.name} (${sk.kind}) ${ok ? 'cast' : 'refused'} at ${G.world.time.toFixed(1)}`; return ok; };
      const log = [], flags = [];
      let last = '', since = 0, lastKill = 0, kills = 0, wPrev = null, anchor = null, flips = [], gt = 0, loadT = 0;
      const ctx = () => {
        const p = G.player, w = G.world, R = w.rift, t = Auto.target, lf = Auto.lootFor, g = Auto.goal, f = (v) => v.toFixed(1);
        return `"${Auto.status}" hero [${f(p.x)},${f(p.y)}] ${Math.round(p.hp / p.maxHp * 100)}% goal ${g ? g.map(f).join(',') : '-'} path ${Auto.path ? Auto.path.length : '-'}`
          + (t ? ` target ${t.name}${t.dead ? ' (dead)' : ''} at ${f(Math.hypot(t.x - p.x, t.y - p.y))} los ${+w.map.los(p.x, p.y, t.x, t.y)} nav ${Auto.navDist(t.x, t.y)}` : '')
          + (lf ? ` loot ${lf.label || lf.kind} ${f(Auto.lootT)} s` : '')
          + ` | castLock ${p.castLock.toFixed(2)} channel ${p.channel ? p.channel.constructor.name : '-'} move ${p.moveVec.map((v) => v.toFixed(2))} stall ${Auto.stall ? f(Auto.stall.t) : '-'} edge ${f(Auto.edgeT || 0)} brave ${f(Auto.braveT || 0)}`
          + ` | last skill: ${lastTry} | bag free ${G.char.bag.filter((b) => !b).length}, foes ${w.creatures.filter((m) => m.team === 'enemy' && !m.dead).length}${R ? ' ' + R.label() : ''}${w.boss ? ` boss ${w.boss.name}${w.boss.dead ? ' (dead)' : w.boss.awake ? '' : ' (asleep)'}` : ''}`;
      };
      for (let fr = 0; fr < +minutes * 60 * 30; fr++) {
        if (!document.querySelector('#loading').classList.contains('hidden')) { // a level loading: real time, not game time
          await new Promise((r) => setTimeout(r, 30));
          if ((loadT += 0.03) > 60) { flags.push(`${gt.toFixed(1)} LOADING for over 60 s`); break; }
          continue;
        }
        loadT = 0;
        G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); gt += 1 / 30;
        if (fr % 90 === 0) await new Promise((r) => setTimeout(r, 0));
        const w = G.world, p = G.player, R = w.rift;
        if (w !== wPrev) { wPrev = w; log.push(`${gt.toFixed(1)} ===== ${w.kind}${R ? ' rift tier ' + R.tier : ''}${w.breach ? ' breach floor ' + w.breach.floor : ''} depth ${w.depth} ${w.biome ? w.biome.id : ''} level ${G.char.level}`); lastKill = gt; anchor = { x: p.x, y: p.y, t: gt }; since = gt; }
        const k = w.creatures.filter((m) => m.team === 'enemy' && m.dead).length;
        if (k !== kills) { kills = k; lastKill = gt; }
        const st = Auto.status.replace(/ — .*/, '').replace(/^(Fighting|Picking up|Listening to|Saying hello to|Paying respects to|Watching) .*/, '$1');
        if (st !== last) {
          if (gt - since > 7 && w.kind !== 'town' && !/Travelling|Fighting|Fallen|Hunting the guardian|Back to town|Victory|Thinking/.test(last)) flags.push(`${since.toFixed(1)}-${gt.toFixed(1)} SAME STATUS for ${(gt - since).toFixed(1)} s: "${last}"`);
          if (!/^(Fighting|Kiting)$/.test(st)) { flips.push([gt, st]); flips = flips.filter((x) => gt - x[0] < 4); }
          if (flips.length > 12) { const set = new Set(flips.map((x) => x[1])); if (set.size <= 3) { flags.push(`${gt.toFixed(1)} FLIP-FLOP ${[...set].join(' <> ')}: ${ctx()}`); flips = []; } }
          log.push(`${gt.toFixed(1)} ${Auto.status}`); last = st; since = gt;
        }
        if (w.kind !== 'town' && Auto.transitT <= 0 && !p.dead && !G.cine) {
          if (Math.hypot(p.x - anchor.x, p.y - anchor.y) > 2) anchor = { x: p.x, y: p.y, t: gt };
          else if (gt - anchor.t > 10) { flags.push(`${anchor.t.toFixed(1)}-${gt.toFixed(1)} PARKED within 2 tiles for 10 s: ${ctx()}`); anchor = { x: p.x, y: p.y, t: gt }; }
          const alive = w.creatures.some((m) => m.team === 'enemy' && !m.dead && m.targetable !== false);
          if (alive && gt - lastKill > 15 && !(R && R.done) && !/exit|Travelling|Picking|Collecting|Opening|Activating/.test(Auto.status)) { flags.push(`${(gt - 15).toFixed(1)}-${gt.toFixed(1)} NO KILL for 15 s: ${ctx()}`); lastKill = gt; }
        }
      }
      return { log, flags, gt, depth: G.char.depth, level: G.char.level, rift: G.char.rifts && G.char.rifts.best };
    }, { minutes, dest });
    console.log(res.log.slice(-30).join('\n'));
    console.log(`\n${cls} ${dest}: ${res.gt.toFixed(0)} game s, depth ${res.depth}, level ${res.level}${res.rift ? ', best rift tier ' + res.rift : ''}; FLAGS (${res.flags.length})`);
    console.log(res.flags.join('\n'));
    await page.waitForTimeout(300);
    await shot(`stalls_${cls}_${dest}`);
  } finally { report(errors); await browser.close(); }
})();
