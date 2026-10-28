// Quest Log (HUD button "Quest", key Q): this depth's objectives, the road to Velscour, boss rooms conquered.
import { G } from '../state.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { UI } from './ui.js';
import { BIOME_BY_ID } from '../data/biomes.js';
import { isRaidDepth } from '../world/dungeon.js';
import { FINAL_DEPTH } from '../data/depth.js';
import { commissionsHtml } from '../game/commissions.js';
import { endgameUnlocked } from '../game/endgame.js';
import { heresyRankOf, heresiesOf, heresyText } from '../game/heresies.js';
import { riftOpen, fmtTime } from '../game/rifts.js';
import { marksTotal, marksFree } from '../game/marks.js';

const step = (done, html) => `<div class="q-step${done ? ' done' : ''}"><i>${done ? '&#10004;' : '&#9670;'}</i><span>${html}</span></div>`;
const nextRaid = (d) => { let n = Math.max(5, Math.ceil(d / 5) * 5); if (n === FINAL_DEPTH) n += 5; return n; };

export function renderQuest(body) {
  const c = G.char, w = G.world;
  if (!c) return;
  body.innerHTML = '';
  let h = '<div class="q-sec"><h3>Current Quest</h3>';
  if (!w || w.kind === 'town') {
    const b = BIOME_BY_ID[c.depth === FINAL_DEPTH ? 'throne' : c.nextBiome];
    h += `<div class="q-title">Descend to Depth ${c.depth}</div>`;
    h += step(false, `Step into the <b style="color:#ff8050">portal</b> at the edge of Herrington Hollow${b ? `. It opens on <b>${escapeHtml(b.name)}</b>` : ''}.`);
    if (c.depth === FINAL_DEPTH) h += step(false, '<b style="color:#ff4020">Demon Lord Velscour</b> waits on his throne.');
    else if (isRaidDepth(c.depth) && !b?.overworld) h += step(false, '<b style="color:#ff6030">A BOSS ROOM</b> lies at the end of this depth.');
    if (b?.id === 'sea_of_sand') h += step(false, 'A linked Sea of Sand route with one to five timed scenario areas lies beyond.');
    else if (b?.id === 'mountainside') h += step(false, 'The Mountainside (beta) lies beyond: a switchback climb up the cliffs to the summit.');
    else if (b?.id === 'skyship') h += step(false, "The Sky Lanes lie beyond: the Air Pirates board the heroes' airship in waves, then their flagship comes.");
    else if (b?.id === 'dark_forest') h += step(false, 'The Dark Forest lies beyond: trails, labyrinths, five trial glades and the Heart of the Forest.');
    else if (b?.tower) h += step(false, 'The Serpentine Tower lies beyond: a spiral stair to a roof where bosses and sky pirates wait.');
    else if (b?.cave) h += step(false, "The Depth's Edge Caverns lie beyond: passages and caverns, a lake under a waterfall, and a long climb to the top of the falls.");
    else if (b?.overworld) h += step(false, 'A Forsaken Wilds scenario shrine guards the way forward.');
    h += step(false, `Or take the <b style="color:#c080ff">purple portal</b> into <b>THE ETERNAL BREACH</b>: Floor ${((c.breach && c.breach.best) || 0) + 1} awaits (each floor as deadly as ten depths).`);
  } else {
    const boss = w.boss, slain = !!(boss && boss.dead);
    const raid = boss && boss.raid;
    h += `<div class="q-title">Depth ${w.depth} &middot; ${escapeHtml(w.biome ? w.biome.name : '')}</div>`;
    const who = boss && (boss.awake || slain) ? `<b>${escapeHtml(boss.name)}</b>` : raid || isRaidDepth(w.depth) ? 'the lord of the <b>Boss Room</b>' : w.depth === FINAL_DEPTH ? '<b>Demon Lord Velscour</b>' : 'the guardian of this depth';
    if (w.breach) {
      // THE ETERNAL BREACH (game/breach.js)
      const sc = w.overworldScenario, cur = sc.current, others = sc.scenarios.filter((S) => S !== sc.heart);
      h = '<div class="q-sec"><h3>Current Quest</h3>' + `<div class="q-title">The Eternal Breach &middot; Floor ${w.breach.floor} <span class="dim">(as deadly as Depth ${w.depth})</span></div>`;
      h += step(sc.won === others.length, `Win the shrines on the medium and large islands: <b>${sc.won}/${others.length}</b>. Each won lifts the wards on the walkways leading on.`);
      for (const S of others) h += step(S.completed, `${escapeHtml(S.title)}${S.boss ? ' <span style="color:#ff80c0">(boss)</span>' : ''} <span class="dim">— ${escapeHtml(S.description)}</span>`);
      if (cur && cur !== sc.heart) h += step(false, `In progress: <b>${escapeHtml(cur.title)}</b> — ${escapeHtml(cur.progress() || cur.description)}`);
      h += step(sc.completed, `Then face the keeper of the <b style="color:#ff70d0">Breach Heart</b>${cur === sc.heart ? ` — ${escapeHtml(cur.progress())}` : ''}.`);
      h += step(sc.completed, sc.completed ? 'The exit portal on the Heart island is open: on to the next floor, or home.' : 'The Heart opens the way on.');
      const b = c.breach || {};
      h += `<div class="dim q-note">Best floor beaten: ${b.best || 0}. Foes slain on this floor: ${fmtInt(w.kills || 0)}</div>`;
    } else if (w.overworldScenario) {
      const sc = w.overworldScenario;
      if (w.biome?.id === 'mountainside') {
        h += step(sc.reached, `Climb the switchback trail to the summit <span class="dim">— altitude ${sc.altitude}%</span>.`);
        h += step(false, '<span class="dim">A ledge up to a hop high can be climbed; taller cliffs only jumped down, and the tallest not at all.</span>');
        h += step(sc.completed, 'Defeat the <b>Summit Warden</b> on the peak.');
        h += step(sc.completed, sc.completed ? 'The exit on the peak is open — descend or return to town.' : "The Warden's fall opens the way on.");
      } else if (w.biome?.id === 'skyship') {
        const ph = sc.phase, at = ['intro', 'waves', 'mid', 'parley', 'flagship', 'hooks', 'final', 'victory', 'done'].indexOf(ph), waves = sc.wave + 1;
        h += step(at > 0, `<b>${escapeHtml(sc.variant.name)}</b> <span class="dim">— ${escapeHtml(sc.variant.weather)}</span>`);
        h += step(at > 2 || (ph === 'waves' && waves > 3), 'Defeat the captain who swings aboard after the third wave.');
        h += step(at > 2, `Hold the deck against five boarding waves${ph === 'waves' ? `: <b>${waves}/5</b>` : ''}.`);
        h += step(at > 5, "Survive the flagship's broadsides.");
        h += step(sc.completed, 'Defeat the two captains who board from her.');
        h += step(sc.completed, sc.completed ? 'The gate is the exit now, and the hoard chest waits on the hatch.' : escapeHtml(sc.description));
      } else if (w.biome?.tower) {
        const top = sc.phase !== 'climb';
        h += step(top, `Climb ${escapeHtml(sc.variant.name)} to the stairhead door <span class="dim">— ${sc.altitude}% of the way up</span>.`);
        h += step(false, '<span class="dim">Packs wait on the floors above; some drop down, some charge up from behind, and pirates come over the railing on hooks.</span>');
        h += step(sc.completed || !!sc.top?.final, `Hold the roof: <b>${escapeHtml(sc.scenario.name)}</b> — three waves of bosses${top ? ` (wave ${Math.min(3, sc.wave)} of 3)` : ''}.`);
        h += step(sc.completed, 'Defeat the captain who comes on the airship.');
        h += step(sc.completed, sc.completed ? 'A portal burns on the roof — descend or return to town.' : 'The portal opens on the roof when the last boss falls.');
      } else if (w.biome?.cave) {
        const up = sc.phase === 'climb' || sc.phase === 'summit' || sc.completed, top = sc.phase === 'summit' || sc.completed;
        h += step(sc.lakeSeen || up, `Follow the passages and caverns of ${escapeHtml(sc.variant.name)} down to the underground lake.`);
        h += step(up, 'Take the passage in the cliff at the foot of the waterfall.');
        h += step(top, `Climb the ledge spiralling up the shaft to the top of the falls${sc.phase === 'climb' ? ` <span class="dim">— ${sc.altitude}% of the way up</span>` : ''}.`);
        h += step(sc.completed, `Defeat what waits at the top of the falls${sc.top && sc.top.n ? ` (${Math.min(sc.top.i, sc.top.n)} of ${sc.top.n})` : ''}.`);
        h += step(sc.completed, sc.completed ? 'A portal burns above the falls — descend or return to town.' : 'The portal opens at the top of the falls when the last of them falls.');
      } else if (w.biome?.id === 'dark_forest') {
        const cur = sc.current;
        h += step(sc.cleared > 0, `Win the trial glades along the trails (optional, each pays fine gear: Epic or better once deep enough): <b>${sc.cleared}/${sc.trials.length}</b>.`);
        for (const t of sc.trials) h += step(t.completed, `${escapeHtml(t.title)} <span class="dim">— ${escapeHtml(t.description)}</span>`);
        if (cur) h += step(false, `In progress: <b>${escapeHtml(cur.title)}</b> — ${escapeHtml(cur.progress() || cur.description)}`);
        h += step(sc.heart.completed, 'Reach the Heart of the Forest, deep in the mossy labyrinth to the north-east, and still the <b>Elder Heartwood</b>.');
        h += step(sc.completed, sc.completed ? 'The exit is open — descend or return to town.' : 'The trial at the Heart opens the way on.');
      } else if (w.biome?.id === 'sea_of_sand') {
        const beat=sc.current, total=sc.total||1, done=sc.beat||0;
        h += step(done>0, `Secure the marked Sea of Sand areas: <b>${Math.min(done+1,total)}/${total}</b> current · ${done}/${total} complete.`);
        if (beat) {
          const timer=beat.timer>0?` Timer: ${Math.max(0,Math.ceil(beat.timer-beat.seconds))}s.`:'';
          const progress=beat.failed?'Failed — return to the shrine to retry.':beat.goal>0?`${beat.kills||0}/${beat.goal} objective progress.`:beat.description||'Scenario in progress.';
          h += step(beat.completed, `${escapeHtml(beat.title)} — ${escapeHtml(progress)}${timer}`);
        }
        h += step(sc.completed, sc.completed ? 'The exit is open — descend or return to town.' : 'Clear each scenario shrine to unseal the exit. Every area grants fine gear (Epic or better once deep enough).');
      } else {
      h += step(sc.active || sc.completed, `Activate the glowing scenario shrine: <b>${escapeHtml(sc.title)}</b>.`);
      let progress = sc.description;
      if (sc.active && ['waves','battle','bridge','ward','defend','infestation'].includes(sc.type)) progress += ` Wave ${sc.stage} in progress.`;
      if (sc.active && sc.markers.length) progress += ` ${sc.remaining} objectives remaining.`;
      if (sc.active && sc.type === 'zones') progress += ` Control point ${sc.stage+1}/3, ${Math.floor(sc.capture)}/10 seconds.`;
      if (sc.active && sc.type === 'trial') progress += ` ${sc.kills}/${sc.goal} slain; ${Math.ceil(sc.remaining)}s left.`;
      if (sc.failed) progress = 'Scenario failed. Return to the shrine to retry.';
      h += step(sc.completed, escapeHtml(progress));
      h += step(sc.completed, sc.completed ? 'The exit is open — descend or return to town.' : 'Complete the scenario to unseal the exit.');
      }
    } else {
      const sc = w.scenario;
      if (sc) h += step(sc.done, `<b style="color:#ffb347">${escapeHtml(sc.title)}</b> <span class="dim">(optional)</span> — ${sc.failed ? 'failed.' : escapeHtml(sc.desc)}${sc.progress && !sc.done && !sc.failed ? ` <span class="dim">${escapeHtml(sc.progress())}</span>` : ''}`);
      h += step(slain, `Slay ${who}${raid && !slain ? ` <span class="dim">(phase ${raid.pi + 1} of ${raid.phases.length})</span>` : ''}.`);
      h += step(false, slain ? 'The exit is open: pass through it to go deeper or return to town.' : 'Reach the exit. It stays sealed until the guardian falls.');
    }
    h += `<div class="dim q-note">Foes slain on this depth: ${fmtInt(w.kills || 0)}</div>`;
  }
  h += '</div>';
  const deepest = c.deepest || 0, pctV = Math.min(100, deepest / FINAL_DEPTH * 100);
  h += commissionsHtml(c, w, step);
  h += `<div class="q-sec"><h3>The Great Quest</h3><div class="q-title">Slay Demon Lord Velscour at Depth ${FINAL_DEPTH}</div>`;
  h += `<div class="q-bar"><div style="width:${pctV}%"></div><span>Deepest depth cleared: ${deepest} / ${FINAL_DEPTH}</span></div>`;
  if (deepest >= FINAL_DEPTH) h += step(true, 'Velscour has fallen. The Endless Torment goes on below.');
  else h += step(false, `Next boss room: <b>Depth ${nextRaid(Math.max(c.depth, (w && w.depth) || 1))}</b>`);
  h += '</div>';
  // the Endgame (docs/ENDGAME.md)
  if (endgameUnlocked(c)) {
    const rank = heresyRankOf(c), R = w && w.rift;
    h += '<div class="q-sec"><h3>The Endgame</h3>';
    if (R) h += step(R.done, `<b style="color:#20e0ff">Abyssal Rift Tier ${R.tier}</b> — ${R.done ? 'closed' : R.failed ? 'collapsed' : R.guardian ? 'slay the Guardian' : `${R.pct}% of the quota`} · ${fmtTime(R.left)} left`);
    h += step(false, `Heresy rank <b>${rank}</b>${rank ? ` (${escapeHtml(heresyText(heresiesOf(c)))})` : ' — none embraced; the Altar of Heresy stands by the plaza'}`);
    h += step(c.rifts.best > 0, `Abyssal Rifts: best Tier <b>${c.rifts.best || 0}</b>, Tier ${riftOpen(c)} open${c.rifts.best ? ` · ${c.rifts.runs || 0} runs, ${c.rifts.fails || 0} collapsed` : ''}`);
    h += step(c.unbound.wins > 0, `Velscour Unbound: <b>${Math.min(3, c.keys)}/3</b> Abyssal Keys${c.unbound.wins ? ` · beaten ${c.unbound.wins}x` : ''}`);
    h += step(false, `Infernal Marks: <b>${marksTotal()}</b> (${marksFree()} free)`);
    h += '</div>';
  } else if (deepest >= FINAL_DEPTH - 50) h += `<div class="q-sec"><h3>The Endgame</h3>${step(false, 'Slay Velscour at Depth 500: the Altar of Heresy and the Abyssal Rift gate open for every hero.')}</div>`;
  const raids = Object.keys(c.cleared || {}).map(Number).filter((d) => isRaidDepth(d)).sort((a, b) => a - b);
  h += `<div class="q-sec"><h3>Boss Rooms Conquered</h3>${raids.length ? `<div class="q-raids">${raids.map((d) => `<span>${d}</span>`).join('')}</div>` : '<div class="dim">None yet. Every 5th depth ends in one.</div>'}</div>`;
  h += `<div class="q-sec dim">Depths cleared: ${Object.keys(c.cleared || {}).length} &middot; Foes slain: ${fmtInt(c.kills || 0)} &middot; Deaths: ${c.deaths || 0}</div>`;
  body.appendChild(el('div', 'quest-log', h));
}

export function toggleQuest() {
  if (UI.isOpen('quest')) UI.closePanel('quest');
  else UI.openPanel('quest', 'Quest Log', renderQuest, { width: 'min(400px, 92vw)' });
}
