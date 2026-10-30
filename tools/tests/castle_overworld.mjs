// Node-only asset contract, castle map reachability and overworld rotation checks, for every castle variant
// (src/data/castles.js): each one is generated for all 35 Castle scenarios and `seeds` more random seeds.
//   node tools/tests/castle_overworld.mjs [seeds] [ids]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const json=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const pack=json('assets/tiles/castle/pack.json'),trees=json('assets/tiles/dark_forest/trees.json'),ramparts=json('assets/tiles/castle/ramparts.json');
globalThis.fetch=async(url)=>({ok:true,json:async()=>String(url).includes('dark_forest')?trees:String(url).includes('ramparts')?ramparts:pack});
globalThis.Image=class{set src(_) {queueMicrotask(()=>this.onload?.());}};
const imp=(p)=>import(pathToFileURL(path.join(root,p)));
const {loadCastlePack,castleFrames}=await imp('src/gfx/castle.js');
const {loadDarkForestTrees}=await imp('src/gfx/darkforest.js');
const {A}=await imp('src/core/assets.js');
const {BIOME_BY_ID,OVERWORLD_BIOME_IDS,drawBiome,recordBiomeVisit}=await imp('src/data/biomes.js');
const {generateOverworld}=await imp('src/world/overworld.js');
const {SCENARIOS,CASTLE_SCENARIOS}=await imp('src/game/overworld.js');
const {CASTLE_SIZE,MAT}=await imp('src/world/castleworld.js');
const {castle3d,K:K3}=await imp('src/world/castle3d.js');
const {CASTLE_VARIANTS}=await imp('src/data/castles.js');
await loadCastlePack();await loadDarkForestTrees();
A.town={meta:json('assets/tiles/town/town.json'),objects:{},ground:{}};
const counts={floors:60,transitions:120,walls:200,roofs:96,gables:24,gateways:12,doors:40,windows:32,torches:32,signs:96,scatter:120,trees:18,castle_landmarks:19,castle_stairs:16,castle_bridges:20,wall_hangings:128,moat_edges:8,furniture:5,keep_floors:6,keep_walls:60};
for(const [k,n] of Object.entries(counts))if(castleFrames(k).length!==n)throw Error(`${k}: expected ${n} frames`);
if(BIOME_BY_ID.castle?.pack!=='castle'||!BIOME_BY_ID.castle.overworld)throw Error('Castle overworld not registered');
if(!BIOME_BY_ID.sea_of_sand?.overworld||OVERWORLD_BIOME_IDS.length<3)throw Error('Sea of Sand or multi-overworld pool missing');
if(CASTLE_VARIANTS.length!==11||new Set(CASTLE_VARIANTS.map(v=>v.id)).size!==11)throw Error('expected the first castle and ten variants');
for(const v of CASTLE_VARIANTS.slice(1))if(!fs.existsSync(path.join(root,'assets/tiles/castle3d',v.look.dir,'index.json')))console.warn(`WARN ${v.id}: no bake in assets/tiles/castle3d/${v.look.dir}/ (node tools/castle3d_bake.js ${v.id})`);
const I=(m,x,y)=>Math.floor(y)*m.w+Math.floor(x);
const flood=(m,start,ok)=>{const seen=new Uint8Array(m.w*m.h),q=[I(m,start[0],start[1])];seen[q[0]]=1;
 for(let j=0;j<q.length;j++){const i=q[j],x=i%m.w,y=(i/m.w)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=I(m,nx,ny);
  if(nx>=0&&ny>=0&&nx<m.w&&ny<m.h&&!seen[k]&&ok(nx,ny,k,i)&&m.stepOk(i,k)){seen[k]=1;q.push(k);}}}return seen;};
const SEEDS=process.argv[2]!=null?+process.argv[2]:20,ONLY=(process.argv[3]||'').split(',').filter(Boolean);
const scenarios=new Set(),stats={};
for(const V of CASTLE_VARIANTS.filter(v=>!ONLY.length||ONLY.includes(v.id))){
 const L=castle3d(V),RG=L.rings,st=stats[V.id]={minScatter:Infinity,minTrees:Infinity,minFree:Infinity,minBanners:Infinity,ms:0,runs:0};
 // a seed for every Castle scenario (the scenario is (seed ^ depth) % 35), then random ones
 const seeds=[];for(let k=0;k<CASTLE_SCENARIOS;k++){let s=k*7919+V.id.length*131;while((((s>>>0)^19)>>>0)%CASTLE_SCENARIOS!==k)s++;seeds.push(s);}
 for(let k=0;k<SEEDS;k++)seeds.push(k*1777+31);
 for(const seed of seeds){
  const t0=performance.now(),gen=generateOverworld(19,BIOME_BY_ID.castle,seed,V.id),m=gen.map,tag=`${V.id} seed ${seed}`;st.ms=Math.max(st.ms,performance.now()-t0);st.runs++;
  if(gen.variant?.id!==V.id||m.castleVariant!==V.id)throw Error(`${tag}: wrong variant`);
  if(m.w!==CASTLE_SIZE[0]||m.h!==CASTLE_SIZE[1]||m.w*m.h<3*192*176)throw Error(`Castle board must be three times the old 192x176; got ${m.w}x${m.h}`);
  st.minScatter=Math.min(st.minScatter,gen.props.filter(p=>p.spr?.category==='scatter').length);
  st.minTrees=Math.min(st.minTrees,gen.trees.length);
  st.minFree=Math.min(st.minFree,m.block.reduce((n,v)=>n+!v,0));scenarios.add(gen.scenarioId);
  // A height map: the walls stand up out of the ground, the water lies sunk below it; walkers hop up and drop down
  // only as far as the map allows (map.stepOk), so floods follow that rule.
  if(!m.hgt||!m.tallOcclusion)throw Error(`Castle has no height map ${tag}`);
  for(let i=0;i<m.w*m.h;i++)if(m.castleMat[i]===MAT.water&&m.hgt[i]>=0)throw Error(`water not sunk ${tag}`);
  // the drawbridge comes down as the hero nears it (game/castle3d.js): its tiles rise to the ground and open
  if(m.drawbridge?.tiles?.length!==8)throw Error(`drawbridge missing ${tag}`);
  for(const i of m.drawbridge.tiles){if(m.castleMat[i]!==MAT.water)throw Error(`drawbridge not over the moat ${tag}`);m.block[i]=0;m.hgt[i]=0;}
  m._stepMask=null;
  const seen=flood(m,gen.start,(x,y)=>m.walkableTile(x,y));
  for(const [x,y] of [gen.exit,...gen.sites])if(!seen[I(m,x,y)])throw Error(`unreachable ${tag} at ${x},${y} (${SCENARIOS[gen.scenarioId][1]})`);
  for(const p of [gen.story.herald,gen.story.lord])if(!seen[I(m,p[0],p[1])])throw Error(`${tag}: a story NPC stands out of reach at ${p}`);
  // Every curtain is the 3D layout's (src/world/castle3d.js): three tiles of masonry, the crenellated parapet along the
  // outside edge and the walk behind it, open only where a gate tunnel goes through at ground level. With the gate
  // tunnels shut, a ring's ward can't be reached from outside it.
  const gatePass=new Uint8Array(m.w*m.h);
  RG.forEach((R,r)=>{for(let y=R.Y0;y<=R.Y1;y++)for(let x=R.X0;x<=R.X1;x++){
   const d=Math.min(x-R.X0,R.X1-x,y-R.Y0,R.Y1-y);if(d>=3)continue;const i=I(m,x,y);
   if(!m.rampartWall[i]){if(m.block[i]&&(L.struct[i]||L.bld[i]))continue;   // a building's wall in the curtain
    if(m.hgt[i]!==0||m.block[i])throw Error(`curtain ${r} hole ${tag} at ${x},${y}`);gatePass[i]=1;continue;}
   if(m.hgt[i]<R.lv)throw Error(`curtain ${r} below its walk ${tag} at ${x},${y}: ${m.hgt[i]}`);
   if(d===0&&!m.block[i]&&m.c3kind[i]!==K3.tower)throw Error(`curtain ${r} open parapet ${tag} at ${x},${y}`);}});
  const inR=(R,x,y,pad=0)=>x>=R.X0-pad&&x<=R.X1+pad&&y>=R.Y0-pad&&y<=R.Y1+pad;
  RG.forEach((R,r)=>{
   // a ward tile of this ring (inside it, outside the next one in), on the ground
   let ward=null;for(let y=R.Y0+4;y<=R.Y1-4&&!ward;y++)for(let x=R.X0+4;x<=R.X1-4&&!ward;x++){const i=I(m,x,y);
    if(seen[i]&&!m.hgt[i]&&!L.bld[i]&&!L.struct[i]&&!(RG[r+1]&&inR(RG[r+1],x,y,3)))ward=[x+.5,y+.5];}
   if(!ward)throw Error(`ring ${r} ward unreachable ${tag}`);
   const shut=flood(m,gen.start,(x,y,k)=>m.walkableTile(x,y)&&!(gatePass[k]&&inR(R,x,y)&&!inR(R,x,y,-3)));
   if(shut[I(m,ward[0],ward[1])])throw Error(`ring ${r} ward reachable over or round its curtain ${tag}`);
  });
  // The masonry is the 3D layout's: towers, the gatehouse, the keep, stairs.
  const kinds=(k)=>{let n=0;for(let i=0;i<m.w*m.h;i++)if(m.c3kind[i]===k)n++;return n;};
  if(!m.c3struct||kinds(K3.tower)<150||kinds(K3.stair)<40||kinds(K3.gate)<120||kinds(K3.keep)<300)throw Error(`castle masonry missing ${tag}`);
  if(gen.props.some(p=>!p.c3&&!p.banner&&!p.onWall&&m.c3struct[I(m,p.x,p.y)]&&m.block[I(m,p.x,p.y)]&&m.c3kind[I(m,p.x,p.y)]!==K3.floor))throw Error(`a prop stands in the masonry ${tag}`);
  // Wall-walks: wide, most of each reached by the stairs; stairs from the ground to the walk.
  const walk=(k)=>m.rampartDeck[k]===1&&!m.block[k];let deck=0,lost=0;
  for(let k=0;k<m.w*m.h;k++)if(walk(k)){deck++;if(!seen[k])lost++;}
  st.lostWalk=Math.max(st.lostWalk??0,+(lost/deck).toFixed(3));
  if(deck<500||lost>deck*.4)throw Error(`wall-walk ${deck} tiles, ${lost} unreachable ${tag}`);
  RG.forEach((R,r)=>{let all=0,got=0;for(let y=R.Y0;y<=R.Y1;y++)for(let x=R.X0;x<=R.X1;x++){if(Math.min(x-R.X0,R.X1-x,y-R.Y0,R.Y1-y)>2)continue;const i=I(m,x,y);
   if(walk(i)){all++;if(seen[i])got++;}}
   const f=got/Math.max(1,all);st['walk'+r]=Math.min(st['walk'+r]??1,+f.toFixed(2));if(f<.6)throw Error(`ring ${r}: only ${Math.round(f*100)}% of its wall-walk can be reached ${tag}`);});
  if(m.castleStairs?.length!==V.layout.stairs.length)throw Error(`stairs missing ${tag}`);
  for(const s of m.castleStairs){const foot=I(m,s.x,s.y),top=I(m,s.x+s.dx*(s.n-1),s.y+s.dy*(s.n-1));
   if(!seen[foot]||!seen[top]||m.hgt[top]<s.lv-m.climb)throw Error(`stairs broken ${tag} at ${s.x},${s.y}`);}
  for(const [x,y] of m.rampartPosts)if(!m.rampartDeck[I(m,x,y)]||!m.walkable(x,y)||!seen[I(m,x,y)]||m.hgt[I(m,x,y)]<RG[0].lv)throw Error(`rampart post off the wall-walk ${tag} at ${x},${y}`);
  if(m.rampartPosts.length<6)throw Error(`too few rampart posts ${tag}`);
  if(gen.spawns.filter(s=>s.rampart).length<6)throw Error(`too few packs on the walls ${tag}`);
  // Bridges: a walkable deck at ground level over the sunken water, low parapets, arches on the side the camera sees;
  // the main crossing is the drawbridge, and there is a postern bridge where the first ring has a north gate.
  if(m.castleBridges.length!==2+(V.layout.twins.some(([,cy,r])=>r===0&&cy===V.layout.rings[0].y0)?1:0))throw Error(`bridges missing ${tag}`);
  for(const b of m.castleBridges.filter(b=>b.kind!=='main')){let over=0,arches=0;
   for(let y=b.far;y<b.near;y++){for(let x=b.x0;x<=b.x1;x++){const k=I(m,x,y);if(!m.walkableTile(x,y)||!seen[k]||m.hgt[k]!==0)throw Error(`bridge ${b.kind} deck blocked ${tag} at ${x},${y}`);if(m.bridgeWater[k])over++;}
    if(!m.block[I(m,b.x1+1,y)]||!m.block[I(m,b.x0-1,y)])throw Error(`bridge ${b.kind} parapet open ${tag}`);if(m.faceArch[I(m,b.x1+1,y)])arches++;}
   if(over<(b.near-b.far)*(b.x1-b.x0+1)*.6)throw Error(`bridge ${b.kind} not over water ${tag}`);
   if(arches!==b.near-b.far)throw Error(`bridge ${b.kind} arches missing ${tag}`);
   for(const y of [b.far-1,b.near])if(m.castleMat[I(m,(b.x0+b.x1)/2,y)]===MAT.water)throw Error(`bridge ${b.kind} ends in the water ${tag}`);
  }
  // a road, trail or paving reaches every door, site, chest, stair foot and the exit (map.road; auto-play keeps to it)
  const nearRoad=([x,y],r=3)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const X=Math.floor(x)+dx,Y=Math.floor(y)+dy;if(X>=0&&Y>=0&&X<m.w&&Y<m.h&&m.road[I(m,X,Y)])return true;}return false;};
  const DX=new Set(['alchemist','gems','socket','gamble','bakery']);
  for(const b of gen.buildings){const dx=DX.has(b.name)!==b.flip,d=dx?[b.x0+b.fp+.5,b.y0+b.fp/2]:[b.x0+b.fp/2,b.y0+b.fp+.5];if(!nearRoad(d))throw Error(`no trail to the ${b.name} door ${tag} at ${d}`);}
  for(const p of [...gen.sites,gen.exit,...gen.chests.map(c=>[c.x,c.y]),...m.castleStairs.map(s=>[s.x-s.dx+.5,s.y-s.dy+.5])])if(!nearRoad(p))throw Error(`no trail to ${p} ${tag}`);
  // the network is one piece from the arrival
  const roadSeen=flood(m,gen.start,(x,y,k)=>m.road[k]);let roads=0,cut=0;
  for(let k=0;k<m.w*m.h;k++)if(m.road[k]&&!m.hgt[k]){roads++;if(!roadSeen[k])cut++;}
  if(cut>roads*.03)throw Error(`road network in pieces ${tag}: ${cut} of ${roads} tiles cut off`);
  // Keep: three enterable halls with their own floors, doors and room to fight.
  if(m.castleRooms?.length!==3)throw Error(`three enterable keep interiors missing ${tag}`);
  if(m.castleDoors?.length<6)throw Error(`keep has too few doors ${tag}`);
  // the keep's and halls' walls are solid masonry; every doorway an open arch (its leaves are the 3D doors)
  for(let i=0;i<m.w*m.h;i++)if(m.castleRoomWalls[i]&&(m.hgt[i]<20||!m.block[i]))throw Error(`hall wall not solid ${tag}`);
  for(const d of m.castleDoors)if(!seen[I(m,d.x,d.y)]||!m.walkable(d.x,d.y))throw Error(`unreachable or blocked door ${tag} at ${d.x},${d.y}`);
  for(const r of m.castleRooms){const cx=(r.rect[0]+r.rect[2])/2|0,cy=(r.rect[1]+r.rect[3])/2|0;let free=0;
   for(let y=cy-10;y<cy+10;y++)for(let x=cx-10;x<cx+10;x++)if(m.walkableTile(x,y))free++;
   if(free<300)throw Error(`combat room ${r.id} too crowded ${tag}: ${free}`);
   if(!seen[I(m,cx+.5,cy+.5)]&&!seen[I(m,cx+.5,cy+2.5)])throw Error(`room ${r.id} out of reach ${tag}`);}
  const furnitureHeights={furniture_01_throne_dais:92,furniture_02_cathedral_pew:34,furniture_03_cathedral_pulpit:78,furniture_04_hanging_chandelier:55,furniture_05_floor_candelabrum:48};
  for(const p of gen.props.filter(p=>p.spr?.category==='furniture')){
   const expected=furnitureHeights[p.spr.name];
   const ratio=p.spr.h*p.k/expected;   // the hero-relative contract (gfx/castlescale.js), grand pieces up to 1.5x
   if(expected&&(ratio<.99||ratio>1.5))throw Error(`mis-sized Castle furniture ${p.spr.name}: ${p.spr.h*p.k} vs ${expected}`);
  }
  const caps={scatter:132,trees:300,torches:50,wall_hangings:80,doors:126,gateways:130,windows:70,signs:62};
  for(const p of gen.props.filter(p=>p.spr)){const max=caps[p.spr.category];if(max&&p.spr.h*p.k>max+.001)throw Error(`oversized Castle ${p.spr.name}: ${p.spr.h*p.k} > ${max}`);}
  const banners=gen.props.filter(p=>p.banner).length;st.minBanners=Math.min(st.minBanners,banners);
  if(banners<40)throw Error(`too few banners on the walls ${tag}: ${banners}`);
  for(const category of ['windows','signs','torches','furniture'])
   if(!gen.props.some(p=>p.spr?.category===category))throw Error(`missing Castle ${category} placements ${tag}`);
  // the lanterns along the wall-walk stand on it
  for(const p of gen.props.filter(p=>p.onWall))if(!m.rampartDeck[I(m,p.x,p.y)])throw Error(`lantern off the wall-walk ${tag} at ${p.x},${p.y}`);
  if(gen.buildings.length<10)throw Error(`outbuildings and village missing ${tag}: ${gen.buildings.length}`);
  for(const b of gen.buildings)for(let y=b.y0;y<b.y0+b.fp;y++)for(let x=b.x0;x<b.x0+b.fp;x++){const i=I(m,x,y);
   if(!m.block[i])throw Error(`building ${b.name} footprint open ${tag}`);if(L.struct[i]||L.bld[i]||m.castleMat[i]===MAT.water)throw Error(`building ${b.name} on masonry or water ${tag} at ${x},${y}`);}
  if(gen.spawns.filter(s=>s.castleRoom).length<3||gen.spawns.some(s=>s.castleRoom&&!m.circleFree(s.x,s.y,.7)))throw Error(`room encounter spawns blocked ${tag}`);
  if(!m.treeCells||gen.trees.filter(t=>t.tree).length<800)throw Error(`forest border missing ${tag}`);
  // Water is a connected river + moat system (it flows), never under a wall.
  for(let i=0;i<m.w*m.h;i++)if(m.castleMat[i]===MAT.water&&m.rampartWall[i])throw Error(`water under a wall ${tag}`);
 }
 if(st.minScatter<600)throw Error(`${V.id}: expected 600 scatter placements; got ${st.minScatter}`);
 if(st.minFree<38000)throw Error(`${V.id}: too little free combat space (${st.minFree})`);
 st.ms=Math.round(st.ms);
}
if(!ONLY.length&&scenarios.size!==35)throw Error(`expected all 35 Castle scenarios; saw ${scenarios.size}`);
if(CASTLE_SCENARIOS!==35||SCENARIOS.length<CASTLE_SCENARIOS)throw Error(`expected 35 Castle scenario definitions; saw ${CASTLE_SCENARIOS}`);
const selected=new Set();for(let i=0;i<120;i++)selected.add(drawBiome({overworldMisses:3,lastBiome:null,biomeBag:[]},22));
for(const id of OVERWORLD_BIOME_IDS)if(!selected.has(id))throw Error(`guarantee pool never selected ${id}`);
for(let run=0;run<30;run++){
 const c={overworldMisses:0,overworldLastVisit:null,biomeBag:[],lastBiome:null};
 for(let d=1;d<=100;d++){
  const id=drawBiome(c,d),b=BIOME_BY_ID[id];
  if(c.overworldMisses>=3&&!b.overworld)throw Error(`missed three-dungeon guarantee run ${run} depth ${d}`);
  recordBiomeVisit(c,b,d);recordBiomeVisit(c,b,d);c.lastBiome=id;
 }
}
if(drawBiome({overworldMisses:3},500)!=='throne')throw Error('final throne precedence regressed');
for(const [id,s] of Object.entries(stats))console.log(id.padEnd(11),JSON.stringify(s));
console.log('CASTLE overworld OK',JSON.stringify({variants:Object.keys(stats).length,seedsEach:SEEDS+CASTLE_SCENARIOS,scenarios:scenarios.size}));
