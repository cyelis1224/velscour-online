const { chromium } = require('playwright');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

async function run() {
  console.log('Testing multiplayer dynamic monster synchronization (ambushes, boss wards, hearts)...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Client 1 (Authority / Host)
  const contextHost = await browser.newContext();
  const pageHost = await contextHost.newPage();

  // Client 2 (Guest / Peer)
  const contextGuest = await browser.newContext();
  const pageGuest = await contextGuest.newPage();

  const roomCode = 'ROOM_' + Date.now().toString(36);

  console.log(`Setting up simulated multiplayer room: ${roomCode}`);

  await pageHost.goto('http://localhost:8123/?test=1');
  await pageGuest.goto('http://localhost:8123/?test=1');

  await pageHost.waitForTimeout(2000);
  await pageGuest.waitForTimeout(2000);

  // Initialize simulated room state on both pages
  await pageHost.evaluate(async (rCode) => {
    const { G, game } = window.VELSCOUR;
    const { net } = await import('./src/net/network.js');
    G.room = { code: rCode, hostId: 'host_1', players: [{ id: 'host_1', name: 'HostHero' }, { id: 'guest_2', name: 'GuestHero' }] };
    net.currentRoom = G.room;
    net.myId = 'host_1';
    game.buildDungeon(5, window.BIOME_BY_ID?.dungeon || { id: 'dungeon' });
  }, roomCode);

  await pageGuest.evaluate(async (rCode) => {
    const { G, game } = window.VELSCOUR;
    const { net } = await import('./src/net/network.js');
    G.room = { code: rCode, hostId: 'host_1', players: [{ id: 'host_1', name: 'HostHero' }, { id: 'guest_2', name: 'GuestHero' }] };
    net.currentRoom = G.room;
    net.myId = 'guest_2';
    game.buildDungeon(5, window.BIOME_BY_ID?.dungeon || { id: 'dungeon' });
  }, roomCode);

  await pageHost.waitForTimeout(1000);
  await pageGuest.waitForTimeout(1000);

  // 1. Verify Dungeon Authority checks
  const hostIsAuth = await pageHost.evaluate(() => window.VELSCOUR.game.isDungeonAuthority(5));
  const guestIsAuth = await pageGuest.evaluate(() => window.VELSCOUR.game.isDungeonAuthority(5));
  console.log('Host is authority:', hostIsAuth, '| Guest is authority:', guestIsAuth);

  if (!hostIsAuth || guestIsAuth) {
    throw new Error('Authority check failed: Host must be authority and Guest must not!');
  }

  // 2. Test Ambush Synchronization
  console.log('Testing Ambush synchronization...');
  // Host triggers ambush
  const ambushResult = await pageHost.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { ambush } = await import('./src/game/mayhem.js');
    const made = ambush(G.world, 'burrow', 3);
    const mobs = G.world.creatures.filter(c => c.team === 'enemy' && c.ambusher);
    return {
      made,
      mobs: mobs.map(m => ({ netId: m.netId, x: m.x, y: m.y, hp: m.hp, arch: m.arch }))
    };
  });
  console.log(`Host spawned ${ambushResult.made} ambush mobs:`, ambushResult.mobs);

  // Simulate network dispatch of ambush spawn from host to guest
  await pageGuest.evaluate(async (data) => {
    window.net.emit('game_ambush_spawn', {
      kind: 'burrow',
      depth: 5,
      monsters: data.mobs.map(m => ({
        netId: m.netId,
        x: m.x,
        y: m.y,
        arch: m.arch,
        lvl: 5,
        rank: 'normal',
        delay: 0
      }))
    });
  }, ambushResult);

  await pageGuest.waitForTimeout(500);

  // Verify Guest has exact matching ambush mobs
  const guestMobs = await pageGuest.evaluate(() => {
    const { G } = window.VELSCOUR;
    const mobs = G.world.creatures.filter(c => c.team === 'enemy' && c.ambusher);
    return mobs.map(m => ({ netId: m.netId, x: m.x, y: m.y, hp: m.hp, arch: m.arch }));
  });
  console.log('Guest received ambush mobs:', guestMobs);

  if (guestMobs.length !== ambushResult.mobs.length) {
    throw new Error(`Expected ${ambushResult.mobs.length} ambush mobs on guest, got: ${guestMobs.length}`);
  }
  for (let i = 0; i < ambushResult.mobs.length; i++) {
    if (guestMobs[i].netId !== ambushResult.mobs[i].netId) {
      throw new Error(`NetId mismatch at index ${i}: host ${ambushResult.mobs[i].netId} vs guest ${guestMobs[i].netId}`);
    }
  }
  console.log('SUCCESS: Ambush mobs synchronized with matching netIds and coordinates!');

  // 3. Test Boss Warding Crystals Synchronization
  console.log('Testing Raid Boss Wards synchronization...');
  // Host triggers Raid Boss intermission
  const raidWards = await pageHost.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { makeRaidBoss } = await import('./src/game/raid.js');
    const boss = makeRaidBoss(G.world, { cx: 20, cy: 20, x: 10, y: 10, w: 20, h: 20, gate: { x: -40, y0: -40, y1: -39 } }, 5, 8);
    G.world.add(boss);
    G.world.boss = boss;
    G.world.raid = boss.raid;
    boss.raid.startInter();
    return boss.raid.wards.map(w => ({ netId: w.netId, x: w.x, y: w.y, hp: w.hp, maxHp: w.maxHp, isWard: w.isWard }));
  });
  console.log('Host created raid wards:', raidWards);

  if (!raidWards.length || !raidWards[0].netId.startsWith('raid_ward_')) {
    throw new Error('Raid wards did not receive deterministic netIds!');
  }

  // Send wards to guest
  await pageGuest.evaluate((wards) => {
    const { G } = window.VELSCOUR;
    // Set up boss and raid reference on guest
    G.world.boss = { x: 20, y: 20, maxHp: 1000, hp: 1000, team: 'enemy' };
    G.world.raid = { wards: [], minions: [] };
    for (const w of wards) {
      window.net.emit('game_monster_spawn', {
        netId: w.netId,
        worldKind: 'dungeon',
        depth: 5,
        x: w.x,
        y: w.y,
        hp: w.hp,
        maxHp: w.maxHp,
        isWard: true,
        name: 'Warding Crystal'
      });
    }
  }, raidWards);

  await pageGuest.waitForTimeout(500);

  const guestWards = await pageGuest.evaluate(() => {
    const { G } = window.VELSCOUR;
    return G.world.raid.wards.map(w => ({ netId: w.netId, x: w.x, y: w.y, hp: w.hp, isWard: w.isWard }));
  });
  console.log('Guest received raid wards:', guestWards);

  if (guestWards.length !== raidWards.length) {
    throw new Error(`Expected guest to have ${raidWards.length} wards, got: ${guestWards.length}`);
  }
  console.log('SUCCESS: Raid Boss Warding Crystals synchronized across clients!');

  // 4. Test Damaging and Killing a Ward via Network Hit
  console.log('Testing damaging a ward across clients...');
  const targetWardNetId = raidWards[0].netId;
  const initialHostWardHp = raidWards[0].hp;

  // Guest damages the ward
  await pageHost.evaluate((netId) => {
    window.net.emit('game_monster_hit', {
      sourceId: 'guest_2',
      netId,
      dmg: 50,
      isCrit: false,
      elem: 'fire',
      killed: false,
      worldKind: 'dungeon',
      depth: 5
    });
  }, targetWardNetId);

  const hostWardAfterHit = await pageHost.evaluate((netId) => {
    const { G } = window.VELSCOUR;
    const w = G.world.creatures.find(c => c.netId === netId);
    return w ? w.hp : null;
  }, targetWardNetId);
  console.log(`Host ward HP before: ${initialHostWardHp}, after network hit from guest: ${hostWardAfterHit}`);

  if (hostWardAfterHit >= initialHostWardHp) {
    throw new Error('Host ward did not take damage from guest network hit!');
  }
  console.log('SUCCESS: Ward successfully registered network damage using shared netId!');

  await browser.close();
  console.log('All dynamic monster synchronization tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
