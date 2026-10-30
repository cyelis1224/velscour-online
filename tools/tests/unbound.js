// Velscour Unbound (docs/ENDGAME.md section 3): game/unbound.js, the Unbound branches of game/velscour.js, the Unbound
// Heirlooms in data/relics.js and their procs in game/relicprocs.js.
//   node tools/tests/unbound.js [noauto] [nophone] [autoonly] [runs]   (autoonly 4: four auto-play fights, for balance)
//   node tools/tests/unbound.js autoonly gear=5 [runs]   a weaker hero (the best of 5 drops a slot, not 60)
//   node tools/tests/unbound.js autoonly original [runs]   the same fights against the plain Velscour (a baseline)
//   node tools/tests/unbound.js autoonly court=organ,nyx/-,lith [trace]   these courts, one fight each ('-' any; trace: every 15 s)
//   node tools/tests/unbound.js worth [classes]   the Unbound Heirlooms' charScore gain over Commons at item level 300,
//                                                 beside a plain Heirloom and a Mythic of the slot (like relic_balance.js)
// 1. Relics: the Crown of the Demon Lord and the four Unbound Heirlooms are real (powers, lines, stats on the hero; the
//    Void Rift, three meteors, demon kills heal, the Crown's Pit Demon comes and goes with the Crown); 2,000 maybeRelic
//    rolls of item level 300 Legendaries never make one; makeHeirloom(.., { unbound }) gives only the four, the Crown
//    only by its id; the Codex counts them.
// 2. Abyssal Keys: keyChance by depth, rank, court and rift tier (one roll per boss); a BOSS ROOM at depth 605 under
//    Heresy rank 10 with the drop forced (G.forceKey, tests only) drops one key that outlasts 120 s; auto-play walks to
//    it; the pickup counts (c.keys, the account's keysFound) and the sheet shows it; enterUnbound refuses two keys and
//    takes three (the throne, not practice, c.depth untouched, the hero in the arena).
// 3. The fight stepped by hand (god mode): the first of the court at the east guard post and the Pact (a hit lands 40%;
//    it wanes after a courtier's two minutes);
//    its death breaks the Pact and opens nothing; the seals; phase 3's first hellgate brings the second; four Heart
//    Shards; two APOCALYPSE circles; the first binding, the second at 5%; his death drops the hoard, an Unbound Heirloom
//    and the Crown, counts the win, opens 'Exit — to town', clears no depth, shows no victory screen. Death in Unbound:
//    back to town, no Defiance, the keys stay spent.
// 4. Auto-play beats Velscour Unbound at depth 500 (god mode, depth-500 gear like velscour.js from a fixed seed): every
//    phase, the time (target 7-12 minutes; checked 6-14, the court drawn moves it), when each of the court fell.
// 5. Phone (844x390): the Pact on the boss bar, the death screen.
const { openGame, report } = require('./harness');
const noauto = process.argv.includes('noauto'), nophone = process.argv.includes('nophone'), autoonly = process.argv.includes('autoonly');
const runs = +(process.argv.find((a) => /^\d+$/.test(a)) || (process.argv.find((a) => a.startsWith('court=')) || '').split('/').length || 1); // auto-play fights (a new court each)
const original = process.argv.includes('original');
const courtArg = (process.argv.find((a) => a.startsWith('court=')) || '').slice(6); // court=organ,leonis[/kaela,nyx...]: one pair a fight
const trace = process.argv.includes('trace'); // a line every 15 s of each fight
const gearN = +((process.argv.find((a) => a.startsWith('gear=')) || 'gear=60').slice(5)); // gear=5: the best of 5 drops a slot (a weaker hero) // the same auto-play fights against the plain depth-500 Velscour, for comparison

(async () => {
  let fails = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
  if (process.argv.includes('worth')) return worth((process.argv[process.argv.indexOf('worth') + 1] || 'paladin,wizard,ranger').split(','));
  const { browser, page, errors, shot } = await openGame({ width: 1600, height: 900 });
  await page.evaluate(async () => { await window.VELSCOUR.game.newChar('paladin', 'Unboundbot'); });
  await page.waitForTimeout(1500);
  const step = (s) => page.evaluate(async (s) => { const { G, game } = window.VELSCOUR; for (let t = 0; t < s * 30; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (t % 60 === 0) await new Promise((r) => setTimeout(r, 0)); } }, s);

  if (!autoonly) {
    // ---- 1. the relics
    const r1 = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, c = G.char, p = G.player;
      const R = await import('/src/data/relics.js'), I = await import('/src/data/items.js');
      const U = R.HEIRLOOMS.filter((h) => h.unbound);
      const out = { ids: U.map((h) => h.id), bad: [], total: R.CODEX_TOTAL.h, heirs: R.HEIRLOOMS.length };
      for (const h of U) { if (!R.POWERS[h.power]) out.bad.push(h.id); for (const [s] of h.lines) if (!I.AFFIX_BY_STAT[s]) out.bad.push(h.id + ':' + s); if (!h.flavor || h.minIlvl !== 250) out.bad.push(h.id + ':flavor/minIlvl'); }
      let leaked = 0, heir = 0;
      for (let i = 0; i < 2000; i++) { const it = R.maybeRelic(I.rollItem(300, { rarity: 4 })); if (it.relic === 'heir') { heir++; if (R.HEIRLOOM_BY_ID[it.rid].unbound) leaked++; } }
      for (let i = 0; i < 500; i++) { const it = R.makeHeirloom(300); if (R.HEIRLOOM_BY_ID[it.rid].unbound) leaked++; }
      Object.assign(out, { leaked, heir, seen: {}, low: R.makeHeirloom(240, { unbound: true }) });
      for (let i = 0; i < 300; i++) { const it = R.makeHeirloom(300, { unbound: true }); out.seen[it.rid] = (out.seen[it.rid] || 0) + 1; }
      // on the hero
      c.level = 300; c.statPoints = 0;
      const mk = (id) => { const it = R.makeHeirloom(300, { id }); it.req = 1; return it; };
      const items = { head: mk('crown_demon'), weapon: mk('abyssal_edge'), body: mk('mantle_unbound'), ring1: mk('seal_of_the_pit'), offhand: mk('heart_of_the_abyss') };
      out.power = Object.fromEntries(Object.entries(items).map(([s, it]) => [it.rid, R.relicItemStats(it).map(([k, v]) => k + ' ' + v).join(', ')]));
      out.text = Object.fromEntries(Object.entries(items).map(([s, it]) => { const H = R.HEIRLOOM_BY_ID[it.rid]; return [it.rid, `${it.uname} [${it.slot}] ${R.powerText(R.POWERS[H.power], I.powerLevel(it.ilvl, 5))}`]; }));
      p.recompute(); const st0 = { ...p.st };
      Object.assign(c.equip, items); p.recompute(); const st = p.st;
      out.delta = { skillsAll: st.skillsAll - (st0.skillsAll || 0), bossDmg: st.bossDmg - (st0.bossDmg || 0), pierce: st.pierce - (st0.pierce || 0), reduce: +(st.reduce - (st0.reduce || 0)).toFixed(1) };
      out.dreadless = !!st.legendary.dreadless;
      out.procs = st.procs.map((pr) => pr.fx + (pr.n ? 'x' + pr.n : '') + (pr.only ? ':' + pr.only : '')).join(',');
      return out;
    });
    console.log(JSON.stringify(r1));
    check(r1.ids.length === 5 && !r1.bad.length && r1.total === r1.heirs && r1.heirs === 41, `five Unbound Heirlooms, powers and lines valid, the Codex counts them (${r1.ids.join(', ')}; ${r1.total} Heirlooms)`);
    check(r1.leaked === 0 && r1.heir > 300, `2,000 Legendary drops of item level 300 make ${r1.heir} Heirlooms, none Unbound (plain makeHeirloom x500 too)`);
    check(Object.keys(r1.seen).length === 4 && !r1.seen.crown_demon && !r1.low, `makeHeirloom({ unbound }) gives the four (never the Crown, none under item level 250): ${JSON.stringify(r1.seen)}`);
    check(r1.delta.skillsAll === 2 && r1.delta.bossDmg >= 25 && r1.delta.pierce === 1 && r1.delta.reduce >= 12 && r1.dreadless, `on the hero: +2 All Skills, +${r1.delta.bossDmg}% boss damage, +1 Pierce, +${r1.delta.reduce}% reduction, the dark's dread gone`);
    check(['void', 'starsx3', 'heal:demon', 'demon'].every((k) => r1.procs.includes(k)), `their procs: ${r1.procs}`);
    for (const t of Object.values(r1.text)) console.log('     ' + t);

    // ---- 2. Abyssal Keys
    const kc = await page.evaluate(async () => {
      const { keyChance } = await import('/src/game/unbound.js');
      const mk = () => ({ isRaid: true, raid: {} }), W = (depth, rank, rift) => ({ depth, heresy: { ids: [], rank }, rift });
      const r = (w, m = mk()) => +keyChance(w, m).toFixed(3);
      const m2 = mk(), w2 = W(700, 10);
      return { d605: r(W(605, 10)), d650: r(W(650, 12)), d700: r(W(700, 10)), d900: r(W(900, 26)), r9: r(W(700, 9)), d600: r(W(600, 26)), court: r(W(700, 10), { isRaid: true, raid: { court: true } }), plain: r(W(700, 10), {}),
        rift9: r({ depth: 590, rift: { tier: 9 } }), rift10: r({ depth: 600, rift: { tier: 10 } }), rift40: r({ depth: 900, rift: { tier: 40 } }), rift100: r({ depth: 1500, rift: { tier: 100 } }), twice: [r(w2, m2), r(w2, m2)] };
    });
    console.log(JSON.stringify(kc));
    check(kc.d605 === 0.07 && kc.d650 === 0.16 && kc.d700 === 0.25 && kc.d900 === 0.25, `BOSS ROOM key odds past depth 600: 605 ${kc.d605}, 650 ${kc.d650}, 700 ${kc.d700} (cap), 900 ${kc.d900}`);
    check(!kc.r9 && !kc.d600 && !kc.court && !kc.plain, 'no key under Heresy rank 10, at depth 600, from the court, or from a non-raid boss');
    check(!kc.rift9 && kc.rift10 === 0.17 && kc.rift40 === 0.32 && kc.rift100 === 0.5, `rift Guardians from tier 10: ${kc.rift10}, tier 40 ${kc.rift40}, tier 100 ${kc.rift100} (cap)`);
    check(kc.twice[0] === 0.25 && kc.twice[1] === 0, 'one roll per boss (dropLoot runs three times for a BOSS ROOM boss)');

    const k2 = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char, p = G.player;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js'), { kill } = await import('/src/game/combat.js'), { worldRank } = await import('/src/game/heresies.js');
      const { endgame } = await import('/src/game/endgame.js'), { GroundItem } = await import('/src/game/loot.js');
      c.heresy.on = ['iron', 'crowned', 'ambush', 'omens', 'glass', 'gaze']; G.godMode = true;
      game.buildDungeon(605, BIOME_BY_ID.catacombs);
      const w = G.world;
      const out = { raid: !!w.raid, rank: worldRank(w), found0: endgame().keysFound };
      G.forceKey = true; kill(w.boss, p); G.forceKey = false;
      const keys = w.loot.filter((l) => l.kind === 'key');
      out.keys = keys.length;
      for (const m of w.creatures) if (m.team === 'enemy') m.dead = true;
      const k = keys[0];
      if (k) {
        k.t = 125; const orb = new GroundItem(k.x + 0.5, k.y, 'orb_hp'); orb.t = 125; w.addLoot(orb);
        for (let a = 0; a < 6.3; a += 0.3) { const x = k.x + Math.cos(a) * 4.5, y = k.y + Math.sin(a) * 4.5; if (w.map.walkable(x, y)) { p.x = x; p.y = y; break; } } // out of the key's pull (3.2)
        G.keyRef = k; G.orbRef = orb;
      }
      return out;
    });
    check(k2.raid && k2.rank === 10 && k2.keys === 1, `a BOSS ROOM at depth 605 under Heresy rank ${k2.rank}, the drop forced: ${k2.keys} key on the floor`);
    await step(0.5);
    const k3 = await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world; return { key: w.loot.includes(G.keyRef), orb: w.loot.includes(G.orbRef) }; });
    check(k3.key && !k3.orb, 'past 120 s an orb fades, the Abyssal Key stays');
    await page.evaluate(() => { window.VELSCOUR.G.ui.msgEl.style.opacity = '0'; });
    await page.waitForTimeout(600);
    await shot('unbound_key_floor');
    k2.d0 = await page.evaluate(() => { // set the hero down ~6 tiles off (a walkable spot with a path)
      const { G } = window.VELSCOUR, w = G.world, p = G.player, k = G.keyRef;
      for (let a = 0; a < 6.3; a += 0.3) { const x = k.x + Math.cos(a) * 6, y = k.y + Math.sin(a) * 6; if (w.map.walkable(x, y) && w.map.findPath && w.map.findPath(x, y, k.x, k.y)) { p.x = x; p.y = y; break; } }
      return +Math.hypot(p.x - k.x, p.y - k.y).toFixed(1);
    });
    const k4 = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, c = G.char;
      const { Auto } = await import('/src/game/autoplay.js'), { endgame } = await import('/src/game/endgame.js');
      const keys0 = c.keys | 0;
      Auto.toggle(true);
      let t = 0;
      for (; t < 30 * 40 && (c.keys | 0) === keys0; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; window.VELSCOUR.game.update(1 / 30); if (t % 60 === 0) await new Promise((r) => setTimeout(r, 0)); }
      Auto.toggle(false);
      return { keys: c.keys, secs: +(t / 30).toFixed(1), found: endgame().keysFound };
    });
    check(k4.keys === 1 && k4.found === k2.found0 + 1, `auto-play walks ${k2.d0} tiles to the key and picks it up in ${k4.secs} s: c.keys ${k4.keys}, the account's keysFound ${k4.found}`);
    await page.evaluate(() => window.VELSCOUR.game.hudAction('inventory'));
    await page.waitForTimeout(400);
    const sheet = await page.evaluate(() => document.body.innerText.includes('Abyssal Keys'));
    check(sheet, 'the character sheet shows the Abyssal Keys');
    await shot('unbound_key_sheet');
    await page.evaluate(() => window.VELSCOUR.G.ui.closeAll && window.VELSCOUR.G.ui.closeAll());

    // enterUnbound: refused with two keys, three open it
    const e1 = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char;
      const E = await import('/src/game/endgame.js');
      c.heresy.on = []; E.unlockEndgame();
      game.enterTown(); await new Promise((r) => setTimeout(r, 600));
      c.keys = 2;
      const ok = await game.enterUnbound();
      return { ok, keys: c.keys, kind: G.world.kind };
    });
    check(e1.ok === false && e1.keys === 2 && e1.kind === 'town', 'enterUnbound refuses two keys (the keys stay, the hero stays in town)');
    const e2 = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char;
      const { endgame } = await import('/src/game/endgame.js');
      c.keys = 3; c.depth = 510; c.deepest = 509; c.cleared = {}; c.unbound = { wins: 0, best: 0 };
      const wins0 = endgame().unboundWins;
      const ok = await game.enterUnbound();
      const w = G.world, p = G.player;
      G.wins0 = wins0; G.marks0 = endgame().marks.pts;
      return { ok, keys: c.keys, unbound: w.unbound, practice: w.practice, biome: w.biome.id, depth: w.depth, cdepth: c.depth, boss: w.boss && w.boss.name, inArena: ((p.x - 22) / 16) ** 2 + ((p.y - 17.5) / 13.5) ** 2 < 1, hp: w.boss.maxHp, court: w.velscour.courtTpl.map((b) => b.id), area: document.body.innerText.includes('Velscour Unbound') };
    });
    console.log(JSON.stringify(e2));
    check(e2.ok && e2.keys === 0 && e2.unbound && !e2.practice && e2.biome === 'throne' && e2.depth === 510 && e2.cdepth === 510, `three keys open Velscour Unbound: the throne at depth ${e2.depth}, not practice, the keys spent, c.depth untouched`);
    check(e2.inArena && e2.boss === 'Velscour Unbound' && e2.court.length === 2 && e2.court[0] !== e2.court[1], `the hero in the arena; his court: ${e2.court.join(' + ')}`);

    // ---- 3. the fight by hand
    const ph = () => page.evaluate(() => { const w = window.VELSCOUR.G.world, V = w.velscour, m = V.m; const ex = w.portals.find((q) => q.type === 'exit');
      return { phase: V.phase, hp: +(m.hp / m.maxHp).toFixed(3), ward: m.ward, gate: V.gate, bound2: !!V.bound2, invuln: m.invuln > 0, label: V.label(), parts: V.parts.filter((c) => !c.dead).map((c) => c.vk), dark: w.darkK, court: V.court.map((b) => ({ id: b.raid.tpl.id, dead: !!b.dead, x: +b.x.toFixed(1), y: +b.y.toFixed(1), post: b.post, boss: w.boss === b })), exit: ex.active, msg: window.VELSCOUR.G.ui.msgEl.textContent, warded: document.getElementById('boss-bar').classList.contains('warded') }; });
    const dmg = (frac) => page.evaluate((frac) => { const V = window.VELSCOUR.G.world.velscour, m = V.m; m.hp = Math.max(1, m.hp - m.maxHp * frac); V.lastHp = m.hp; }, frac);
    const killAll = (vk) => page.evaluate(async (vk) => { const { kill } = await import('/src/game/combat.js'); const w = window.VELSCOUR.G.world; for (const c of w.velscour.parts) if (c.vk === vk && !c.dead) kill(c, w.player); if (vk === 'seal') for (const c of w.creatures) if (/^Warden of/.test(c.name)) kill(c, w.player); }, vk);
    const killCourt = (i) => page.evaluate(async (i) => { const { kill } = await import('/src/game/combat.js'); const w = window.VELSCOUR.G.world; kill(w.velscour.court[i], w.player); }, i);
    await step(1.5);
    let s = await ph();
    console.log(JSON.stringify(s));
    const c0 = s.court[0];
    check(s.phase === 1 && s.court.length === 1 && !c0.dead && Math.hypot(c0.post[0] - 31, c0.post[1] - 13) < 1.5 && !c0.boss, `phase 1: ${c0 && c0.id} of his court steps out at the east guard post (${c0 && c0.post.map((v) => v.toFixed(1))}); world.boss stays Velscour`);
    check(s.ward === 0.4 && s.warded && /Pact/.test(s.label), `the Pact: ward ${s.ward}, the boss bar warded (${s.label})`);
    // the Pact wanes once a courtier has stood two minutes (pactFor), whether or not it lives
    const wane = await page.evaluate(async () => { const { G, game } = window.VELSCOUR, V = G.world.velscour, b = V.court[0], t0 = b.bornT; b.bornT = V.t - 121; game.update(1 / 30); const w1 = V.m.ward; b.bornT = t0; b.waned = false; game.update(1 / 30); return [w1, V.m.ward]; });
    check(wane[0] === 1 && wane[1] === 0.4, `the Pact wanes after two minutes of a courtier (ward ${wane[0]}), and holds while it is fresh (${wane[1]})`);
    console.log('     in the arena: ' + await page.evaluate(() => window.VELSCOUR.G.world.creatures.filter((c) => !c.dead && c.team === 'enemy').map((c) => c.name + (c.summon ? '*' : '')).join(', ')));
    await page.evaluate(() => { window.VELSCOUR.G.ui.msgEl.style.opacity = '0'; });
    await shot('unbound_p1_court');
    const wh = await page.evaluate(async () => { const { hit } = await import('/src/game/combat.js'); const w = window.VELSCOUR.G.world, V = w.velscour, m = V.m, p = w.player;
      const R0 = Math.random; Math.random = () => 0.5;
      try { V.bank = m.maxHp; const h0 = m.hp; hit(p, m, m.maxHp * 0.01, 'phys', { force: true, crit: false }); const d1 = h0 - m.hp; m.ward = 1; V.bank = m.maxHp; const h1 = m.hp; hit(p, m, m.maxHp * 0.01, 'phys', { force: true, crit: false }); const d2 = h1 - m.hp; m.hp = m.maxHp; V.lastHp = m.hp; m.ward = 0.4; return +(d1 / d2).toFixed(3); } finally { Math.random = R0; } });
    check(Math.abs(wh - 0.4) < 0.01, `a hit on him under the Pact lands ${Math.round(wh * 100)}% of the same hit without it`);
    await killCourt(0); await step(0.3);
    s = await ph();
    check(s.ward === 1 && !s.warded && !s.exit && /PACT IS BROKEN/.test(s.msg), `his first courtier dies: the Pact breaks (ward ${s.ward}), the exit stays sealed (${s.msg})`);
    const cc = await page.evaluate(() => { const c = window.VELSCOUR.G.char; return { cleared: Object.keys(c.cleared).length, deepest: c.deepest, dark: window.VELSCOUR.G.world.darkK }; });
    check(!cc.cleared && cc.deepest === 509, 'and clears no depth');
    await dmg(0.5); await step(0.2);
    s = await ph();
    check(s.phase === 2 && s.parts.filter((k) => k === 'seal').length === 4, `at 80%: the Four Seals (${s.label})`);
    await killAll('seal'); await step(0.5);
    s = await ph();
    check(s.phase === 3, `the seals broken: phase 3 (${s.label})`);
    await page.evaluate(() => { window.VELSCOUR.G.world.velscour.cd.legion = 0; });
    await step(0.4);
    const gate = await page.evaluate(async () => { const { effects, Telegraph } = await import('/src/gfx/vfx.js'); return effects.some((e) => e instanceof Telegraph && e.color === '#ff4010' && e.r === 2.4); });
    await step(2);
    s = await ph();
    const c1 = s.court[1];
    console.log(JSON.stringify(s.court));
    check(gate && s.court.length === 2 && c1 && !c1.dead && c1.id !== c0.id && s.ward === 0.4 && s.warded, `phase 3's first hellgate: ${c1 && c1.id} climbs out, the Pact holds again`);
    await page.evaluate(() => { window.VELSCOUR.G.ui.msgEl.style.opacity = '0'; });
    await shot('unbound_p3_court2');
    await dmg(0.6); await step(0.3);
    s = await ph();
    check(s.phase === 4 && s.dark > 0.9 && s.parts.filter((k) => k === 'shard').length === 4, `at 50%: the abyss with four Heart Shards (${s.label})`);
    await step(2);
    await shot('unbound_p4_four_shards');
    const before = s.hp;
    await killAll('shard'); await step(0.5);
    s = await ph();
    check(s.phase === 5 && before - s.hp >= 0.145 && s.dark < 0.9, `four shards (-4% each) tear ${Math.round((before - s.hp) * 100)}% off him; True Form (${before} -> ${s.hp})`);
    await page.evaluate(() => { window.VELSCOUR.G.world.velscour.cd.apoc = 0; });
    await step(1);
    const circles = await page.evaluate(async () => { const { effects, Telegraph } = await import('/src/gfx/vfx.js'); return effects.filter((e) => e instanceof Telegraph && e.color === '#40ff60' && e.t < e.dur).length; });
    check(circles === 2, `APOCALYPSE leaves two safe circles (${circles})`);
    await shot('unbound_p5_two_circles');
    await step(5);
    await killCourt(1); await step(0.3);
    s = await ph();
    check(s.ward === 1 && /alone/.test(s.msg), `the second courtier dies: ${s.msg}`);
    await dmg(0.6); await step(0.3);
    s = await ph();
    check(s.phase === 6 && s.invuln && s.parts.filter((k) => k === 'obelisk').length === 4, `at 10%: bound to four obelisks (${s.label})`);
    await killAll('obelisk'); await step(0.5);
    s = await ph();
    check(s.phase === 5 && s.gate === 0.05 && !s.invuln && /CHAINS SNAP/.test(s.msg), `the chains snap, but he is not finished (gate ${s.gate})`);
    await dmg(0.3); await step(0.3);
    s = await ph();
    check(s.phase === 6 && s.bound2 && s.hp >= 0.049 && s.parts.filter((k) => k === 'obelisk').length === 4, `the Unbound Chains: at ${s.hp} he binds himself to four fresh obelisks (${s.label})`);
    await step(1);
    await shot('unbound_p6_second_binding');
    await killAll('obelisk'); await step(0.5);
    s = await ph();
    check(s.phase === 5 && s.gate === 0 && /FINISH HIM/.test(s.msg), 'the second chains broken: FINISH HIM');
    await page.evaluate(async () => { const { kill } = await import('/src/game/combat.js'); const w = window.VELSCOUR.G.world; kill(w.boss, w.player); });
    await step(0.6);
    const end = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, w = G.world, c = G.char, ex = w.portals.find((q) => q.type === 'exit');
      const { HEIRLOOM_BY_ID } = await import('/src/data/relics.js'), { endgame } = await import('/src/game/endgame.js');
      const rel = w.loot.filter((l) => l.kind === 'item' && l.item.relic).map((l) => l.item);
      const k = w.loot.find((l) => l.kind === 'item' && l.item.rid === 'crown_demon');
      return { dead: w.boss.dead, exit: ex.active, label: ex.label, msg: G.ui.msgEl.textContent, rids: rel.map((i) => i.rid), unbound: rel.filter((i) => HEIRLOOM_BY_ID[i.rid] && HEIRLOOM_BY_ID[i.rid].unbound).map((i) => i.rid), sealed: rel.filter((i) => i.sealed).map((i) => i.rid),
        hoard: rel.filter((i) => i.relic === 'cov').length + rel.filter((i) => i.relic === 'heir' && !HEIRLOOM_BY_ID[i.rid].unbound).length, wins: c.unbound.wins, best: c.unbound.best, acct: endgame().unboundWins - G.wins0, cleared: Object.keys(c.cleared).length, deepest: c.deepest, crownAt: k ? [k.x, k.y] : null,
        abyssal: w.loot.filter((l) => l.kind === 'item' && l.item.rarity === 6 && !l.item.relic && !l.item.sealed).length, marks: endgame().marks.pts - G.marks0 };
    });
    console.log(JSON.stringify(end));
    check(end.dead && end.exit && end.label === 'Exit — to town' && /UNBOUND HAS FALLEN/.test(end.msg), `he dies: '${end.msg}', the exit reads '${end.label}'`);
    check(end.unbound.includes('crown_demon') && end.unbound.length === 2 && end.hoard >= 2, `the drops: the Crown (first win), ${end.unbound.filter((r) => r !== 'crown_demon')[0]}, and his hoard (${end.rids.join(', ')})`);
    check(!end.unbound.some((r) => end.sealed.includes(r)), 'the Unbound relics arrive open (never sealed)');
    check(end.wins === 1 && end.acct === 1 && end.best > 0, `the win counts: c.unbound ${end.wins} win, best ${end.best} s; the account's unboundWins +${end.acct}`);
    check(!end.cleared && end.deepest === 509, 'no depth cleared, the deepest untouched');
    check(end.abyssal >= 3 && end.marks >= 20, `the win pays: ${end.abyssal} open Abyssal items and +${end.marks} Infernal Marks (a rift Guardian: one item, 1-8 Marks)`);
    const four = await page.evaluate(async () => {   // four wins whose drops are picked up find all four Unbound Heirlooms
      const { unboundSpoils } = await import('/src/game/unbound.js'), { noteFind, reliquary, saveReliquary } = await import('/src/game/reliquary.js');
      const { G } = window.VELSCOUR, r = reliquary(), keep = { ...r.codex }, got = [];
      for (const k of Object.keys(r.codex)) if (/^h:(abyssal_edge|mantle_unbound|seal_of_the_pit|heart_of_the_abyss)$/.test(k)) delete r.codex[k];
      for (let i = 0; i < 4; i++) unboundSpoils({ court: [], t: 300 }, 300, (it) => { if (it && it.relic === 'heir' && it.rid !== 'crown_demon') { got.push(it.rid); noteFind(it); } });
      r.codex = keep; saveReliquary();
      return got;
    });
    check(new Set(four).size === 4, `four wins, four different Unbound Heirlooms (${four.join(', ')})`);
    await page.evaluate(() => { const { G, game } = window.VELSCOUR; const k = G.world.loot.find((l) => l.kind === 'item' && l.item.rid === 'crown_demon'); if (k) { G.player.x = k.x - 1.5; G.player.y = k.y + 1.5; } });
    await step(0.3);
    await shot('unbound_drops');
    await page.waitForTimeout(3600);
    const vic = await page.evaluate(() => !!document.querySelector('.screen:not(.hidden)') && /VELSCOUR HAS FALLEN/.test(document.body.innerText));
    check(!vic, 'no victory screen');
    await shot('unbound_banner_after');
    const cx = await page.evaluate(async () => { const { G } = window.VELSCOUR, w = G.world; const { reliquary } = await import('/src/game/reliquary.js'); const k = w.loot.find((l) => l.kind === 'item' && l.item.rid === 'crown_demon'); const ok = k && G.player.pickup(k); if (ok) w.loot.splice(w.loot.indexOf(k), 1); return { ok: !!ok, codex: !!reliquary().codex['h:crown_demon'] }; });
    check(cx.ok && cx.codex, 'picked up, the Crown enters the Codex');

    // ---- 3b. procs in play (in the empty arena: a court-free dummy) and the Crown's Pit Demon
    await page.evaluate(async () => { // two still dummies (in the world's grid after a frame)
      const { G } = window.VELSCOUR, w = G.world, p = G.player, { makeMonster } = await import('/src/game/monster.js');
      const dummy = (arch) => { const [x, y] = w.map.randomNear(p.x + 2, p.y, 1); const m = makeMonster(w, arch, w.biome, 260, 'normal', x, y); m.maxHp = m.hp = 1e9; m.speed = 0; m.dmg = 0; w.add(m); return m; };
      G._t = dummy('skeleton'); G._d = dummy('demon'); G._d.demon = true;
    });
    await step(0.05);
    const pr = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, w = G.world, p = G.player, c = G.char;
      const { relicProc, crownWorn } = await import('/src/game/relicprocs.js'), { Delayed } = await import('/src/game/hazards.js');
      const out = {};
      p.pitDemonT = 0;
      const R0 = Math.random;
      const t = G._t, d = G._d, hp0 = t.hp;
      p.procT = {}; Math.random = () => 0; try { relicProc(p, 'hit', t, 1000); } finally { Math.random = R0; }
      out.void = hp0 - t.hp; out.voidExp = 2000 * 0.92 * (1 - Math.min(0.9, (t.res && t.res.shadow) || 0)); // (rand(0.92, 1.08) at Math.random 0)
      const h0 = w.hazards.filter((h) => h instanceof Delayed).length;
      p.procT = {}; Math.random = () => 0; try { relicProc(p, 'cast', t, 0); } finally { Math.random = R0; }
      out.meteors = w.hazards.filter((h) => h instanceof Delayed).length - h0;
      p.hp = p.maxHp * 0.5; relicProc(p, 'kill', t, 0); out.healPlain = +(p.hp / p.maxHp).toFixed(3);
      relicProc(p, 'kill', d, 0); out.healDemon = +(p.hp / p.maxHp).toFixed(3);
      out.demon = p.pitDemon ? { team: p.pitDemon.team, summon: p.pitDemon.summon, name: p.pitDemon.name, art: p.pitDemon.art, life: p.pitDemon.life, in: w.creatures.includes(p.pitDemon), dmg: Math.round(p.pitDemon.dmg), relicDmg: Math.round(p.relicDmg) } : null;
      out.worn = crownWorn(p);
      t.dead = true; d.dead = true;
      return out;
    });
    console.log(JSON.stringify(pr));
    check(Math.abs(pr.void / pr.voidExp - 1) < 0.02, `the Abyssal Edge tears a void rift: ${Math.round(pr.void)} damage from a 1,000 hit (200% Shadow after the dummy's resistance: ${Math.round(pr.voidExp)})`);
    check(pr.meteors === 3, `the Heart of the Abyss drops ${pr.meteors} meteors on a cast`);
    check(pr.healPlain === 0.5 && pr.healDemon >= 0.519, `the Seal of the Pit heals 2% for a demon (${pr.healDemon}) and nothing for a skeleton (${pr.healPlain})`);
    check(pr.demon && pr.demon.team === 'player' && pr.demon.summon && pr.demon.in && !pr.demon.life && pr.demon.art === 'carmine_gorehorn', `the Crown: a ${pr.demon && pr.demon.name} climbs out to fight for the hero (hits ${pr.demon && pr.demon.dmg} = 60% of the hero's ${pr.demon && pr.demon.relicDmg})`);
    await step(1);
    await shot('unbound_crown_demon');
    const pd = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, p = G.player, c = G.char, w = G.world, { relicProc } = await import('/src/game/relicprocs.js');
      const d = p.pitDemon, crown = c.equip.head;
      c.equip.head = null; p.recompute();
      for (let i = 0; i < 3; i++) { G.dt = 1 / 30; window.VELSCOUR.game.update(1 / 30); }
      const gone = d.dead;
      c.equip.head = crown; p.recompute(); p.procT = {};
      relicProc(p, 'hit', null, 500); const early = !!(p.pitDemon && !p.pitDemon.dead);
      p.pitDemonT = 0; p.procT = {}; relicProc(p, 'hit', null, 500);
      return { gone, early, back: !!(p.pitDemon && !p.pitDemon.dead && p.pitDemon !== d) };
    });
    check(pd.gone && !pd.early && pd.back, 'off comes the Crown, away goes the demon; it climbs back 20 s after (not before)');

    // ---- 3c. death in Unbound
    const dd = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char;
      game.enterTown(); await new Promise((r) => setTimeout(r, 600));
      c.keys = 3; c.equip.head = null; G.player.recompute();
      await game.enterUnbound();
      for (let t = 0; t < 45; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); }
      const def0 = JSON.stringify(c.defiance || null), deaths0 = c.deaths || 0;
      G.godMode = false; const p = G.player; p.hp = 0; p.die(G.world.velscour.m);
      await new Promise((r) => setTimeout(r, 2300));
      return { keys: c.keys, def: JSON.stringify(c.defiance || null) === def0, deaths: (c.deaths || 0) - deaths0, text: document.body.innerText.includes("Velscour's throne"), keysNote: document.body.innerText.includes('three keys are spent') };
    });
    check(dd.keys === 0 && dd.def && dd.deaths === 1 && dd.text && dd.keysNote, `death in Unbound: the death screen (Velscour's throne, the keys spent), keys ${dd.keys}, no Defiance`);
    await shot('unbound_death');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Return to Town'); if (b) b.click(); });
    await page.waitForTimeout(1500);
    const town = await page.evaluate(() => { const { G } = window.VELSCOUR; G.godMode = true; return G.world.kind; });
    check(town === 'town', 'back to town');
  }

  // ---- 4. auto-play wins at depth 500
  const fights = [];
  for (let run = 0; run < (noauto ? 0 : runs); run++) {
    const t0 = Date.now();
    const res = await page.evaluate(async ({ run, original, courtArg, trace: tracing, gearN }) => {
      const { G, game } = window.VELSCOUR;
      const { Auto, charScore } = await import('/src/game/autoplay.js');
      const { rollItem, rollGem, SLOTS } = await import('/src/data/items.js');
      const c = G.char, p = G.player;
      if (!run) { // gear like tools/tests/velscour.js: level 259, the best of many item level 262 drops per slot, +8, gems
        (await import('/src/game/endgame.js')).unlockEndgame();
        c.level = 259; c.statPoints = 258 * 5; c.skillPoints = 520; c.depth = 500; c.deepest = 499;
        for (const s of SLOTS) c.equip[s] = null;
        const real = Math.random; let seed = 20261027; // the same hero every time (fights compare like with like)
        Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
        for (const s of SLOTS) {
          let best = null, bs = -Infinity;
          for (let i = 0; i < gearN; i++) {
            const it = rollItem(262, { slot: s.startsWith('ring') ? 'ring' : s, mf: 300, bonus: 1.5 }); it.req = 1; it.upg = 8;
            it.sockets = it.maxSockets; it.gems = Array.from({ length: it.sockets }, () => { const g = rollGem(300); return { gem: g.gem, tier: 7 }; });
            c.equip[s] = it; p.recompute(); const sc = charScore(p); if (sc > bs) { bs = sc; best = it; }
          }
          c.equip[s] = best;
        }
        Math.random = real;
      }
      p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana; G.godMode = true;
      c.potions = { hp: 20, mp: 20, rejuv: 10, fury: 5 };
      c.keys = 3; c.unbound.wins = 1;
      game.enterTown(); await new Promise((r) => setTimeout(r, 800));
      G.unboundCourt = courtArg && courtArg !== '-' ? courtArg.split(',') : null; // (game/unbound.js: '-' or an unknown id leaves that seat to chance)
      if (original) await game.finalBoss(); else await game.enterUnbound();
      G.unboundCourt = null;
      const w = G.world, V = w.velscour;
      V.court = V.court || [];
      const trace = [];
      Auto.toggle(true);
      const phases = new Set(), at = {}, courtT = [], cs = [];
      let t = 0, shardsLeft = null, lastPh = -1; const trans = [];
      for (; t < 30 * 60 * 22 && !w.boss.dead; t++) {
        G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30);
        if (V.phase === 4) shardsLeft = V.parts.filter((x) => x.vk === 'shard' && !x.dead).length;
        if (!phases.has(V.phase)) { phases.add(V.phase); at[V.phase] = +(V.t / 60).toFixed(2); }
        if (V.phase !== lastPh) { trans.push(`${V.phase}@${(V.t / 60).toFixed(2)}`); lastPh = V.phase; }
        if (V.bound2 && !at.b2) at.b2 = +(V.t / 60).toFixed(2);
        V.court.forEach((b, i) => { if (b.dead && courtT[i] === undefined) courtT[i] = +(V.t / 60).toFixed(2);
          const k = cs[i] || (cs[i] = { alive: 0, inter: 0, aimed: 0, vel: 0 }); if (b.dead) return; // where the time goes while a courtier lives
          k.alive += 1 / 30; if (b.raid.inter) k.inter += 1 / 30; if (Auto.target === b) k.aimed += 1 / 30; else if (Auto.target === V.m) k.vel += 1 / 30; });
        if (tracing && t % 450 === 0) { const b = V.court.find((x) => !x.dead), pl = G.player; trace.push(`${(V.t / 60).toFixed(2)} ph${V.phase} V${(V.m.hp / V.m.maxHp).toFixed(2)} hero(${pl.x.toFixed(1)},${pl.y.toFixed(1)}) ${Auto.status || ''} tgt:${Auto.target ? Auto.target.name : '-'}` + (b ? ` | ${b.raid.tpl.id}(${b.x.toFixed(1)},${b.y.toFixed(1)}) ${(b.hp / b.maxHp).toFixed(2)} pi${b.raid.pi}${b.raid.inter ? ' inter' : ''} d${Math.hypot(b.x - pl.x, b.y - pl.y).toFixed(1)}` : '')); }
        if (t % 120 === 0) await new Promise((r) => setTimeout(r, 0));
        if (G.world !== w) break;
      }
      Auto.toggle(false);
      const { HEIRLOOM_BY_ID } = await import('/src/data/relics.js');
      return { depth: w.depth, dead: w.boss.dead, mins: +(V.t / 60).toFixed(2), phases: [...phases], at, court: V.court.map((b) => b.raid.tpl.id), courtT, trans: trans.join(' '), trace, cs: cs.map((k) => Object.fromEntries(Object.entries(k).map(([a, v]) => [a, Math.round(v)]))), seals: V.sealBuff, shardsLeft, hp: +(w.boss.hp / w.boss.maxHp).toFixed(3),
        unbound: w.loot.filter((l) => l.kind === 'item' && l.item.relic === 'heir' && HEIRLOOM_BY_ID[l.item.rid].unbound).length, log: (G.raidLog || []).filter((r) => r.court).slice(-2).map((r) => `${r.boss} ${r.secs}s ${r.mods}`) };
    }, { run, original, courtArg: courtArg.split('/')[run % Math.max(1, courtArg.split('/').length)], trace, gearN });
    res.wall = Math.round((Date.now() - t0) / 1000);
    fights.push(res);
    console.log(JSON.stringify(res));
    if (original) continue; // a baseline: the numbers only
    check(res.depth === 500 && res.dead, `auto-play beats Velscour Unbound at depth ${res.depth} (${res.mins} min, left at ${res.hp})`);
    check(res.mins >= 6 && res.mins <= 14, `the fight lasts 7-12 minutes, give or take the court it drew (${res.mins}; phases at ${JSON.stringify(res.at)}; the court ${res.court.join(' + ')} fell at ${res.courtT.join(' / ')} min; seals left ${res.seals}, shards left ${res.shardsLeft})`);
    check([1, 2, 3, 4, 5, 6].every((k) => res.phases.includes(k)) && res.at.b2, 'auto-play sees every phase and both bindings');
    check(res.courtT.length === 2, 'auto-play kills both of the court');
    check(res.unbound >= 1, 'the win drops an Unbound Heirloom');
    if (!run) await shot('unbound_auto_won');
  }
  if (fights.length > 1) { const m = fights.map((f) => f.mins).sort((a, b) => a - b); console.log(`     ${fights.length} fights: ${m.join(', ')} min (mean ${(m.reduce((a, b) => a + b, 0) / m.length).toFixed(2)})`); }
  report(errors);
  await browser.close();

  // ---- 5. phone
  if (!nophone) {
    const M = await openGame({ width: 844, height: 390, mobile: true });
    await M.page.evaluate(async () => { await window.VELSCOUR.game.newChar('wizard', 'Phonebot'); });
    await M.page.waitForTimeout(1200);
    const ok = await M.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char;
      (await import('/src/game/endgame.js')).unlockEndgame();
      c.level = 300; c.keys = 3; G.godMode = true; G.player.recompute();
      await game.enterUnbound();
      for (let t = 0; t < 60; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); }
      return { warded: document.getElementById('boss-bar').classList.contains('warded'), label: document.getElementById('boss-bar').innerText };
    });
    check(ok.warded && /Pact/.test(ok.label), `phone: the boss bar shows the Pact (${ok.label.replace(/\s+/g, ' ').slice(0, 90)})`);
    await M.shot('unbound_phone_pact');
    await M.page.evaluate(async () => { const { G } = window.VELSCOUR; G.godMode = false; G.player.hp = 0; G.player.die(G.world.velscour.m); await new Promise((r) => setTimeout(r, 2300)); });
    await M.shot('unbound_phone_death');
    report(M.errors);
    await M.browser.close();
  }
  if (fails) { console.log(fails + ' FAILED'); process.exitCode = 1; }
})();

/** The Unbound Heirlooms' worth beside a plain Heirloom and a Mythic of the slot (charScore gain, one slot at a time over
 *  Commons of item level 300; item levels stop telling them apart up there, a Common gains so little a level). */
async function worth(classes) {
  const { browser, page, errors } = await openGame();
  for (const cls of classes) {
    const res = await page.evaluate(async (cls) => {
      const { G, game } = window.VELSCOUR;
      const { charScore } = await import('/src/game/autoplay.js'), { Auto } = await import('/src/game/autoplay.js');
      const { rollItem } = await import('/src/data/items.js'), R = await import('/src/data/relics.js'), { CLASSES } = await import('/src/data/classes.js');
      await game.newChar(cls, 'Worth');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, p = G.player, C = CLASSES[cls], H = 300;
      c.level = H + 4; c.statPoints = (H + 3) * 5; c.skillPoints = (H + 4) * 2; Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
      const slots = ['weapon', ...(C.offhand ? ['offhand'] : []), 'head', 'body', 'hands', 'legs', 'feet', 'ring1', 'ring2', 'ring3', 'ring4'];
      const sl = (s) => (s.startsWith('ring') ? 'ring' : s), base = (s) => (s === 'weapon' ? C.weapon : s === 'offhand' ? C.offhand : undefined);
      const real = Math.random, seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const score = (slot, make, n = 12) => { let t = 0; const rb = seeded(4321), ri = seeded(8765);
        try { for (let i = 0; i < n; i++) { Math.random = rb; for (const x of slots) c.equip[x] = rollItem(H, { slot: sl(x), rarity: 0, base: base(x) }); Math.random = ri; const it = make(); if (it) { it.req = 1; c.equip[slot] = it; } Math.random = real; p.recompute(); t += charScore(p); } } finally { Math.random = real; }
        return t / n; };
      const out = {};
      for (const h of R.HEIRLOOMS.filter((x) => x.unbound)) {
        const slot = h.slot === 'ring' ? 'ring1' : h.slot;
        if (!slots.includes(slot)) continue;
        const s0 = score(slot, () => null), gain = (s) => +((s / s0 - 1) * 100).toFixed(1); // % over the hero all in Commons
        out[h.id] = { unbound: gain(score(slot, () => R.makeHeirloom(H, { id: h.id }))), heirloom: gain(score(slot, () => R.makeHeirloom(H, { slot: h.slot }))), mythic: gain(score(slot, () => rollItem(H, { slot: h.slot, rarity: 5, base: base(slot) }))) };
      }
      return out;
    }, cls);
    console.log(`${cls}: score gain over all-Commons at item level 300, one slot (% of charScore): ${JSON.stringify(res)}`);
  }
  report(errors);
  await browser.close();
}
