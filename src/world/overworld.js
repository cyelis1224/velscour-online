// The Forsaken Wilds: connected outdoor dungeon carved from the existing Overworld/Town pack.
// Trees are collision walls, but the ground remains continuous; paths and quest landmarks are
// protected before placing any trees. All randomness is based on a single seed for reproducibility.
import { TileMap } from './map.js';
import { wildScenario } from '../game/overworld.js';
import { RNG } from '../core/util.js';
import { A } from '../core/assets.js';
import { TW } from '../core/view.js';
import { townObject, makeTownTiles } from './town.js';
import { overworldObject, EXTRA_TREES, SHRINES } from '../gfx/overworldart.js';
import { isoBarrier } from '../gfx/isobarriers.js';
import { rollLooks } from '../data/bestiary.js';
import { wallHangingAtBuilding } from '../gfx/wallhangings.js';
import { seaOfSandFloorTiles, seaOfSandObject, seaOfSandCliff, seaOfSandFrames } from '../gfx/seaofsand.js';
import { SAND_BOSSES } from '../data/seaofsand.js';
import { generateCastle } from './castleworld.js';

const W = 72, H = 72, N = W * H;
const K = TW / 160; // town-pack source 160 x 80 base tiles
const FLOOR_MATERIALS = ['grass', 'gravel', 'dirt', 'mud'];
const DOOR_X = new Set(['bakery']);
const SOURCE_TREES = ['t_medium_fir','t_old_cedar','t_scots_pine','t_mature_ash',
  't_twin_birch','t_crooked_oak','t_wind_juniper','t_ancient_oak','t_dead_oak'];
export const OVERWORLD_SITES = Object.freeze([
  [36.5,35.5],[20.5,20.5],[51.5,23.5],[21.5,49.5],[54.5,49.5],
  [36.5,17.5],[36.5,56.5],[16.5,35.5],[57.5,35.5],
]);
const ENTRY=[9.5,62.5], EXIT=[63.5,9.5], SHRINE=[36.5,35.5];
const SAND_SITES=[[18.5,19.5],[52.5,19.5],[18.5,51.5],[53.5,51.5],[36.5,35.5]];
// Sea of Sand objects' heights in world px (the hero stands 60): the pack draws each to fit one cell.
export const SAND_H={palm_stump:24,date_palm_sapling:40,bent_desert_palm:70,thorn_acacia:48,dead_snag:46,spiny_aloe:26,reed_bundle:30,dry_scrub:22,
  wind_carved_boulder:40,basalt_shards:24,fossil_ribcage:38,giant_skull:34,obelisk_fragment:56,toppled_column:28,buried_statue_head:42,
  carved_standing_stone:80,clay_water_jar:26,waterskin_rack:50,caravan_chest:24,reed_crate:26,rolled_carpet_stack:22,market_awning:70,
  broken_cart_wheel:26,pack_saddle:22,bronze_brazier:40,cold_firepit:14,rope_pulley_well:78,salt_trough:22,tent_poles:60,canvas_tent:66,
  desert_wind_vane:80,hanging_lantern:50,turquoise_ore:30,amber_crystal:34,salt_spires:46,broken_pottery:18,buried_weapon_cache:30,
  quest_shrine:66,desert_cairn:40,sand_swept_milestone:44,
  palm_seedling:34,dwarf_palm:50,young_thorn_acacia:56,saltbush:26,dry_reeds:30,short_bent_palm:84,wind_bent_acacia:88,dead_thorn_snag:74,
  date_palm:126,doum_palm:120,umbrella_acacia:104,tall_slender_palm:140,twin_palms:132,split_trunk_palm:128,fruiting_oasis_palm:132,
  storm_broken_giant_palm:112,fossilized_dead_tree:110};
function lineDist(x,y,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);
}
/**
 * The Forsaken Wilds' lie of the land (a height map, the Mountainside's engine, gfx/terrain.js): the woods stand up on
 * wooded ridges, their rock banks rising from the second row of trees in, and a few meadow terraces and a hillock rise a
 * hop (16 px) above the open ground, off the lanes and clearings. (Gentle rolling slopes drew as rows of thin steps.)
 */
function liftWilds(map,rng,flags,seed,reserved) {
  const N=W*H,id=(x,y)=>y*W+x;
  // how far each wood tile lies from the open ground (1 = the edge row)
  const into=new Uint8Array(N),q=[];
  for(let i=0;i<N;i++)if(flags[i]!==2){into[i]=0;q.push(i);}else into[i]=255;
  for(let a=0;a<q.length;a++){const i=q[a],x=i%W,y=(i/W)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const j=id(nx,ny);if(into[j]>into[i]+1){into[j]=into[i]+1;q.push(j);}}}
  const hgt=new Int16Array(N),ph=seed%997;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=id(x,y),cx=x+.5,cy=y+.5;   // the wooded ridge
    if(flags[i]===2&&into[i]>=2&&into[i]<255)hgt[i]=into[i]===2?4:8+Math.round(3*(Math.sin(cx*.5+cy*.3+ph)+1));}
  // meadow terraces: ragged blobs of open ground a hop up, the bigger ones with a second tier in the middle (a hillock)
  for(let n=0,t=0;n<rng.int(3,5)&&t<200;t++){
    const cx=rng.range(8,64),cy=rng.range(8,64),rx=rng.range(3,6.5),ry=rng.range(3,6.5),tiers=rx*ry>24?2:1,cells=[];
    for(let y=Math.floor(cy-ry-1);y<=Math.ceil(cy+ry+1);y++)for(let x=Math.floor(cx-rx-1);x<=Math.ceil(cx+rx+1);x++){
      if(x<2||y<2||x>=W-2||y>=H-2)continue;
      const d=Math.hypot((x+.5-cx)/rx,(y+.5-cy)/ry)+.18*Math.sin(x*1.3+y*.9+ph);
      if(d<1)cells.push([id(x,y),d]);}
    if(cells.length<10||cells.some(([i])=>flags[i]===1||flags[i]===3||(map.block[i]&&flags[i]!==2)||reserved(i%W+.5,((i/W)|0)+.5)))continue;
    for(const [i,d] of cells)if(flags[i]!==2)hgt[i]=Math.max(hgt[i],tiers===2&&d<.5?8:4);
    n++;
  }
  let lo=Infinity,hi=-Infinity;for(let i=0;i<N;i++){lo=Math.min(lo,hgt[i]);hi=Math.max(hi,hgt[i]);}
  Object.assign(map,{hgt,climb:4,drop:10,minLevel:lo,maxLevel:hi,baseLevel:lo-14,noSky:true,_terr:null});
}
export function generateOverworld(depth,biome,seed,variant=null) {
  if (biome.id === 'castle') return generateCastle(depth,biome,seed,variant);
  if (biome.id === 'sea_of_sand') return generateSeaOfSand(depth,biome,seed);
  const rng=new RNG(seed), map=new TileMap(W,H), flags=new Uint8Array(W*H);
  map.t.fill(1);map.losBlocks=true;
  const id=(x,y)=>y*W+x, dist=(x,y,a)=>Math.hypot(x-a[0],y-a[1]);
  const roads=[[ENTRY,SHRINE],[SHRINE,EXIT],[[14,35],SHRINE],[SHRINE,[58,36]],
    [[36,17],[36,57]],[[20,20],[51,23]],[[20,49],[54,49]],
    [[14,35],[27,42]],[[27,42],[36,44]]];
  const reserved=(x,y)=>[ENTRY,EXIT,...OVERWORLD_SITES].some(p=>dist(x,y,p)<6.4)
    || roads.some(([a,b])=>lineDist(x,y,a,b)<3.1);
  // The playable map is mainly grassland and ruin-pocked clearings. Forest stands form
  // impassable banks and winding walls around several always-accessible trunk roads.
  const groves=[
    {x:15,y:14,rx:18,ry:18},{x:58,y:14,rx:18,ry:17},
    {x:12,y:42,rx:14,ry:16},{x:60,y:59,rx:22,ry:20},
    {x:35,y:69,rx:21,ry:11},{x:35,y:7,rx:19,ry:9},
  ];
  const props=[],buildings=[],wallHangings=[];
  const add=(name,x,y,opts={})=>{
    // Legacy town 'stone_boundary' was drawn in one fixed direction and
    // mirrored as a second direction. Replace that old scatter, too.
    const normalized=name==='stone_boundary'
      ? isoBarrier('stone',((Math.floor(x)+Math.floor(y))%2)?'x':'y')
      : name;
    const sprite=typeof normalized==='string'?
      (overworldObject(normalized)||townObject(normalized)):normalized;
    if(!sprite)return false;
    props.push({kind:'scatter',x,y,spr:sprite,k:K*(sprite.pixelScale||1),flip:sprite.isometric?false:(opts.flip??rng.chance(.5)),
      light:opts.light||0});
    return true;
  };
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=id(x,y),cx=x+.5,cy=y+.5;
    if(x===0||y===0||x===W-1||y===H-1){map.block[i]=1;flags[i]=2;continue;}
    const roadDistance=Math.min(...roads.map(([a,b])=>lineDist(cx,cy,a,b)));
    const road=roadDistance<2.15;
    const landmark=OVERWORLD_SITES.some(p=>dist(cx,cy,p)<5);
    const noise=(Math.sin(x*.53+y*.13+seed*.00003)+Math.cos(y*.41-x*.29))/4;
    const woodland=groves.some(g=>{
      const r=((cx-g.x)/g.rx)**2+((cy-g.y)/g.ry)**2;
      return r<.62+noise*.25;
    });
    const border=Math.min(x,y,W-x-1,H-y-1);
    const forest=!reserved(cx,cy)&&(border<2||woodland||rng.chance(.018));
    if(forest){
      flags[i]=2;map.block[i]=1;
      // One tree per blocked tile would flood the renderer with oversized overlapping crowns;
      // staggering crowns maintains a solid, readable "living wall" without 1,500 draw calls.
      if((x+y)%3===0||rng.chance(.12)) {
        const t=rng.chance(.6)?rng.pick(SOURCE_TREES):rng.pick(EXTRA_TREES);
        add(t,cx+rng.range(-.18,.18),cy+rng.range(-.15,.15));
      }
    }else if(road){flags[i]=1;map.v[i]=roadDistance<1.35?1:2;}
    else if(landmark){map.v[i]=rng.chance(.25)?1:0;}
    else map.v[i]=rng.chance(.035)?2:rng.chance(.04)?3:0;
  }

  // Small neutral settlement in the western clearing. Reserve entire footprints and keep
  // buildings off roads; their graphics use the same native 3x3 footprint as Herrington Hollow.
  const houses=[['cottage',28,39],['inn',26,45],['bakery',36,44]];
  for(const [name,x0,y0] of houses){
    const spr=townObject('b_'+name);
    if(!spr)continue;
    const cx=x0+1.5,cy=y0+1.5;
    let valid=true;
    for(let y=y0;y<y0+3;y++)for(let x=x0;x<x0+3;x++)if(map.block[id(x,y)])valid=false;
    if(!valid)continue;
    for(let y=y0;y<y0+3;y++)for(let x=x0;x<x0+3;x++)map.block[id(x,y)]=1;
    const flip=DOOR_X.has(name); // mirror the bakery so all settlement doors face the same way
    const building={cx,cy,spr,k:K*1.5,depth:cx+cy,flip,name,x0,y0,entryAxis:'y'};
    buildings.push(building);
    if(rng.chance(.8))wallHangings.push(wallHangingAtBuilding(building,false,rng.int(0,49)));
    const door=[x0+1,y0+3],start=id(door[0],door[1]);
    const previous=new Int32Array(N).fill(-1),q=[start];previous[start]=start;
    let end=-1;
    for(let head=0;head<q.length&&end<0;head++){
      const i=q[head],x=i%W,y=(i/W)|0;
      if(i!==start&&flags[i]===1){end=i;break;}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy,j=id(nx,ny);
        if(map.walkableTile(nx,ny)&&previous[j]<0){previous[j]=i;q.push(j);}
      }
    }
    const approach=[];
    for(let i=end;i>=0;i=previous[i]){
      const x=i%W,y=(i/W)|0;
      if(flags[i]!==1){map.v[i]=1;flags[i]=3;}
      approach.push([x,y]);
      if(i===start)break;
    }
    building.approach=approach;
  }
  // Encode native transitions at the seams between grass, gravel, dirt and mud.
  // This gives the lanes soft, connected edges instead of scattered full-tile decals.
  const transitionPairs=Object.keys(A.town.meta.transitions),material=map.v.slice();
  const at=(x,y)=>material[Math.min(H-1,Math.max(0,y))*W+Math.min(W-1,Math.max(0,x))];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=id(x,y),m=material[i],sides=[at(x-1,y),at(x+1,y),at(x,y-1),at(x,y+1)];
    let n=99;for(const s of sides)if(s<m&&s<n)n=s;
    if(n===99)continue;
    const [left,right,up,down]=sides.map(s=>s===n);
    const shape=left&&!right&&!up&&!down?0:right&&!left&&!up&&!down?1:up&&!down&&!left&&!right?2:down&&!up&&!left&&!right?3:
      left&&up&&!right&&!down?4:right&&down&&!left&&!up?5:left&&down&&!right&&!up?6:right&&up&&!left&&!down?7:-1;
    const pair=transitionPairs.indexOf(FLOOR_MATERIALS[n]+'__'+FLOOR_MATERIALS[m]);
    map.v[i]=shape<0||pair<0?n:6+pair*8+shape;
  }
  liftWilds(map,rng,flags,seed,reserved);
  // Scatter by context (it was all of it dropped anywhere: a chest, a tent or bones alone in a meadow). What happened
  // here lies round the scenario clearings, a story to each: an old fight (bones, a shield, a fallen banner), an
  // abandoned camp (a tent, crates, a wrecked cart) or a lost cache (a sunken chest by a mossy log). Out in the open only
  // nature: flower patches and field stones in the meadows; logs, stumps, boulders, shrubs and mushrooms at the wood's
  // edge. All of it off the lanes and out of the fighting space.
  const openAt=(x,y)=>map.walkable(x,y)&&flags[id(x|0,y|0)]===0&&map.circleFree(x,y,.35);
  const STORY=[['ow_bone_pile','ow_discarded_shield','ow_fallen_banner','ow_bone_pile'],['ow_tattered_tent','ow_rotten_crate','ow_cart_wreck','ow_rotten_crate'],
    ['ow_sunken_chest','ow_mossy_log','ow_pale_mushrooms','mushrooms']];
  OVERWORLD_SITES.forEach((s,k)=>{if(s===SHRINE)return;const set=STORY[(k+rng.int(0,2))%3],a0=rng.range(0,Math.PI*2);
    for(let n=0,t=0;n<set.length&&t<40;t++){const a=a0+n*.55+rng.range(-.15,.15),r=rng.range(5,6.4),x=s[0]+Math.cos(a)*r,y=s[1]+Math.sin(a)*r;
      if(openAt(x,y)&&add(set[n],x,y))n++;}});
  const woodEdge=(x,y)=>[[1,0],[-1,0],[0,1],[0,-1],[2,0],[0,2],[-2,0],[0,-2]].some(([dx,dy])=>flags[id(Math.min(W-1,Math.max(0,(x|0)+dx)),Math.min(H-1,Math.max(0,(y|0)+dy)))]===2);
  // A woodcutter's spot or two where a lane runs by the trees: the chopping stump with its axe, a stacked woodpile, sawn
  // rounds, a felled trunk and the handcart that hauls it to the hamlet. (A template: laid out round its anchor.)
  const nearLane=(x,y)=>[[2,0],[-2,0],[0,2],[0,-2],[3,0],[0,3],[-3,0],[0,-3],[4,0],[0,4],[-4,0],[0,-4]].some(([dx,dy])=>flags[id(Math.min(W-1,Math.max(0,(x|0)+dx)),Math.min(H-1,Math.max(0,(y|0)+dy)))]===1);
  const WOODCUT=[['axe_stump',0,0],['firewood_stack',.9,-.5],['sawn_stump',-.8,.4],['sawn_stump',-.3,-.9],['fallen_log',1.3,.7],['handcart',-1.4,-.4]];
  for(let t=0,n=0;t<600&&n<2;t++){
    const cx=rng.int(4,W-5)+.5,cy=rng.int(4,H-5)+.5;
    if(!openAt(cx,cy)||reserved(cx,cy)||!woodEdge(cx,cy)||!nearLane(cx,cy)||dist(cx,cy,[32,43])<10)continue;
    const fit=WOODCUT.filter(([,dx,dy])=>openAt(cx+dx,cy+dy));
    if(fit.length<4||fit[0]!==WOODCUT[0])continue;   // the stump and most of the rest
    for(const [nm,dx,dy] of fit)add(nm,cx+dx,cy+dy);
    n++;
  }
  for(let i=0,n=0;i<900&&n<200;i++){
    const x=rng.int(2,W-3),y=rng.int(2,H-3),cx=x+.5,cy=y+.5;
    if(!openAt(cx,cy)||reserved(cx,cy))continue;
    if(woodEdge(cx,cy)){if(add(rng.pick(['fallen_log','hollow_stump','moss_boulder','leafy_shrub','mushrooms','ow_pale_mushrooms','ow_mossy_log']),cx+rng.range(-.2,.2),cy+rng.range(-.2,.2)))n++;}
    else if(rng.chance(.45)){const nm=rng.pick(['wildflowers','ow_blue_flowers','ow_red_flowers','wildflowers','fieldstone_cluster','leafy_shrub','dry_reeds']);
      for(let k=/flowers/.test(nm)?rng.int(2,3):1;k>0;k--){const sx=cx+rng.range(-.7,.7),sy=cy+rng.range(-.7,.7);if(openAt(sx,sy)&&add(nm,sx,sy))n++;}}
  }
  add(SHRINES[rng.int(0,SHRINES.length-1)],SHRINE[0],SHRINE[1],{light:5});
  // Reuse the town tiles and chest art; do NOT build indoor wall segments. (The hills' banks show turf over grass, earth
  // under the lanes.)
  const townTiles=makeTownTiles().map((f,k)=>({...f,soil:k?'dirt':'grass'}));
  // Living barriers outline the northwestern forest rather than obstructing
  // the guaranteed entrance/shrine/exit paths. Each segment has exact 2:1
  // endpoint geometry and no incorrect mirrored orientation.
  for(let j=0;j<7;j++){
    const x=6+j+.5,y=8.5;
    if(map.block[Math.floor(y)*W+Math.floor(x)])
      add(isoBarrier('thorn','x'),x,y,{flip:false});
  }
  const looks=rollLooks(biome,rng.fn()),spawns=[];
  const archs=biome.roster.filter(a=>!['golem','abomination'].includes(a));
  for(let i=0;i<24;i++){
    const x=rng.int(7,64)+.5,y=rng.int(7,64)+.5;
    if(!map.circleFree(x,y,.35)||dist(x,y,ENTRY)<11||dist(x,y,SHRINE)<7)continue;
    const arch=rng.pick(archs);
    spawns.push({x,y,arch,n:rng.int(2,4),rank:i%11===0?'champion':'normal',look:looks.pick(arch)});
  }
  const chests=[];
  for(const p of [OVERWORLD_SITES[2],OVERWORLD_SITES[3],OVERWORLD_SITES[4]]) {
    const at=map.randomNear(p[0]+3,p[1]-3,2,rng.fn());
    chests.push({x:at[0],y:at[1],rare:rng.chance(.17)});
  }
  // Every portal, shrine, village and challenge zone must remain accessible.
  const seen=new Uint8Array(W*H),q=[id(Math.floor(ENTRY[0]),Math.floor(ENTRY[1]))];seen[q[0]]=1;
  for(let a=0;a<q.length;a++){
    const i=q[a],x=i%W,y=(i/W)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,j=id(nx,ny);
      if(map.walkableTile(nx,ny)&&!seen[j]){seen[j]=1;q.push(j);}
    }
  }
  const targets=[EXIT,...OVERWORLD_SITES];
  if(targets.some(([x,y])=>!seen[id(Math.floor(x),Math.floor(y))]))
    throw new Error('Overworld generator produced unreachable objective; seed '+seed);
  if(map.hgt){   // and walked with the hills' hop rule (both ways): else the land lies flat
    const ok=(from)=>{const s=new Uint8Array(N),q=[id(Math.floor(from[0]),Math.floor(from[1]))];s[q[0]]=1;
      for(let a=0;a<q.length;a++){const i=q[a],x=i%W,y=(i/W)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const j=id(x+dx,y+dy);
        if(map.walkableTile(x+dx,y+dy)&&!s[j]&&map.stepOk(i,j)){s[j]=1;q.push(j);}}}
      return s;};
    const fwd=ok(ENTRY),back=[EXIT,...OVERWORLD_SITES].map(ok);
    if(targets.some(([x,y])=>!fwd[id(Math.floor(x),Math.floor(y))])||back.some(s=>!s[id(Math.floor(ENTRY[0]),Math.floor(ENTRY[1]))]))
      {map.hgt=null;map._terr=null;}
  }
  return {map,props,buildings,wallHangings,townTiles,looks,spawns,chests,torches:[],
    start:ENTRY,exit:EXIT,shrine:SHRINE,sites:OVERWORLD_SITES,
    scenarioId:wildScenario(((seed >>> 0) ^ depth) >>> 0),seed};
}


function generateSeaOfSand(depth,biome,seed) {
  if (!seaOfSandFloorTiles().length) throw new Error('Sea of Sand art must load before generating its overworld.');
  const rng=new RNG(seed),map=new TileMap(W,H),floors=seaOfSandFloorTiles(),props=[];
  const scenarioCount=1+((seed>>>5)%5),scenarioSites=SAND_SITES.slice(0,scenarioCount);
  map.t.fill(1);map.losBlocks=true;
  const I=(x,y)=>y*W+x,dist=(x,y,p)=>Math.hypot(x-p[0],y-p[1]);
  const links=[[ENTRY,SAND_SITES[0]],[SAND_SITES[0],SAND_SITES[4]],[SAND_SITES[4],SAND_SITES[1]],
    [SAND_SITES[4],SAND_SITES[2]],[SAND_SITES[4],SAND_SITES[3]],[SAND_SITES[1],EXIT]];
  // Each route is a seeded, gently meandering caravan track. The same anchor
  // network stays connected, while the curve bends, phase, and width vary per seed.
  const routes=links.map(([a,b],i)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
    const amp=rng.range(1.8,4.1),phase=rng.range(0,Math.PI*2),cycles=rng.range(1.2,2.5);
    const pts=[];for(let s=0;s<=40;s++){const t=s/40,env=Math.sin(Math.PI*t),bend=Math.sin(t*cycles*Math.PI*2+phase)*amp*env;
      pts.push([a[0]+dx*t+nx*bend,a[1]+dy*t+ny*bend]);}
    return {pts,radius:rng.range(1.75,2.15),trail:rng.range(.82,1.12),id:i};
  });
  const routeDistance=(x,y,routesToCheck=routes)=>Math.min(...routesToCheck.map(r=>r.pts.slice(1).reduce((best,p,i)=>Math.min(best,lineDist(x,y,r.pts[i],p)),Infinity)));
  const onRoute=(x,y,radius)=>routes.some(r=>routeDistance(x,y,[r])<radius);
  const outcrops=Array.from({length:36},()=>({
    x:rng.range(4,W-4),y:rng.range(4,H-4),rx:rng.range(2.2,5.2),ry:rng.range(.8,1.8),a:rng.range(0,Math.PI),
  }));
  const floorAt=(x,y)=>{
    // Fine dune sand stays dominant. Terrain changes follow long fields and
    // the dry wash; paving is confined to objective courtyards.
    const nearestSite=Math.min(...SAND_SITES.map(p=>dist(x,y,p)));
    if(nearestSite<1.8)return nearestSite<0.8?30:31;
    if(onRoute(x,y,.9))return 15; // caravan trail
    const washX=13+y*.49+Math.sin(y*.14+seed*.0003)*4;
    if(Math.abs(x-washX)<1.15)return 21;
    const dunes=(Math.sin(x*.12+seed*.0007)+Math.cos(y*.1-x*.055+seed*.0003))/2;
    if(dunes>.72)return 3;
    if(dunes<-.78)return 2;
    return 0;
  };
  const reserved=(x,y)=>[ENTRY,EXIT,...SAND_SITES].some(p=>dist(x,y,p)<9.5)||onRoute(x,y,3.1);
  const add=(spr,x,y,options={})=>{if(!spr)return;props.push({kind:'scatter',x,y,spr,k:TW/160*(options.scale||1),flip:false,light:options.light||0});};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=I(x,y),cx=x+.5,cy=y+.5;
    map.v[i]=floorAt(cx,cy);
    if(x===0||y===0||x===W-1||y===H-1){map.block[i]=1;continue;}
    const corridor=onRoute(cx,cy,2.7);
    // Eroded, wind-shaped outcrops replace the old rigid checkerboard wall
    // maze. The objective corridors remain clear and visually marked by tracks.
    const outcrop=outcrops.some(o=>{
      const dx=cx-o.x,dy=cy-o.y,ca=Math.cos(o.a),sa=Math.sin(o.a);
      const u=(dx*ca+dy*sa)/o.rx,v=(-dx*sa+dy*ca)/o.ry;
      const edge=1+.14*Math.sin(cx*1.7+seed*.013)*Math.cos(cy*1.9-seed*.009);
      return u*u+v*v<edge;
    });
    const dune=((Math.sin(x*.27+seed*.00003)+Math.cos(y*.31-x*.12))/2)>.82&&rng.chance(.12);
    if(!reserved(cx,cy)&&!corridor&&(outcrop||dune))map.block[i]=1;
  }
  const cliffs=seaOfSandFrames('cliff');
  const sandstone=cliffs.find(f=>f.material==='sunbaked_sandstone')?.material;
  const ruinBrick=cliffs.find(f=>f.material==='ruin_brick')?.material;
  const cliffByMask=new Map();
  for(const f of cliffs)if(f.connection_mask!=null){if(!cliffByMask.has(f.connection_mask))cliffByMask.set(f.connection_mask,[]);cliffByMask.get(f.connection_mask).push(f);}
  const dirs=[[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(map.block[I(x,y)]){
    // The blocked perimeter also gets cliff pieces, so the camera never looks
    // through an unfinished map edge into black void.
    let mask=0;for(const [dx,dy,bit] of dirs){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H&&map.block[I(nx,ny)])mask|=bit;}
    const variants=cliffByMask.get(mask)||cliffByMask.get(0);
    // One cliff material per broad region prevents a randomly patched wall
    // maze while retaining matching corner/end/tee topology pieces.
    const nearRuin=SAND_SITES.some(p=>dist(x+.5,y+.5,p)<4);
    const material=nearRuin&&ruinBrick?ruinBrick:sandstone;
    const family=variants.filter(v=>v.material===material);
    const f=rng.pick(family.length?family:variants);
    add(seaOfSandCliff(f?.name),x+.5,y+.5,{scale:1});
  }
  // Sizes and places. The pack draws every object to fit one cell (a well, a palm and a pot all ~59 px), so each gets
  // its own height in world px against the 60 px hero (SAND_H), and goes where it would be: palms by the dry wash and
  // the oasis, acacias and snags out on the dunes, the caravan's camp round the rest, its leftovers beside the trails,
  // ruins at the sites, ore at the foot of the rock. (It was all of it at half size anywhere: a well or a market
  // awning alone in the dunes, a shrine dropped at random.)
  const put=(name,x,y,o={})=>{const spr=seaOfSandObject(name,o.tree?'tree':undefined);if(!spr)return false;
    const h=(SAND_H[name]||40)*rng.range(.9,1.1),k=h/(spr.h*(spr.pixelScale||1)*TW/160);add(spr,x,y,{scale:k,light:o.light});return true;};
  const wash=(x,y)=>map.v[I(x|0,y|0)]===21||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map.v[I(Math.min(W-1,Math.max(0,(x|0)+dx)),Math.min(H-1,Math.max(0,(y|0)+dy)))]===21);
  const byRock=(x,y)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map.block[I((x|0)+dx,(y|0)+dy)]);
  const freeAt=(x,y)=>x>2&&y>2&&x<W-3&&y<H-3&&map.walkable(x,y)&&map.circleFree(x,y,.4);
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
    const i=I(x,y),cx=x+.5,cy=y+.5;
    if(map.block[i]||reserved(cx,cy))continue;
    const wet=wash(cx,cy);
    if(rng.chance(wet?.14:.016)){
      const name=wet?rng.pick(['date_palm','doum_palm','tall_slender_palm','twin_palms','split_trunk_palm','short_bent_palm','palm_seedling','dwarf_palm']):
        rng.pick(['young_thorn_acacia','wind_bent_acacia','umbrella_acacia','dead_thorn_snag','fossilized_dead_tree','dwarf_palm','storm_broken_giant_palm']);
      if(put(name,cx,cy,{tree:true}))map.block[i]=1;
    }
  }
  // the dunes: scrub, aloe, boulders, shards, salt spires and the bones of something huge; reeds along the wash
  for(let n=0,t=0;n<150&&t<2000;t++){
    const x=rng.int(2,W-3)+.5+rng.range(-.2,.2),y=rng.int(2,H-3)+.5+rng.range(-.2,.2);
    if(!freeAt(x,y)||reserved(x,y)||onRoute(x,y,1.4))continue;
    const nm=wash(x,y)?rng.pick(['reed_bundle','reed_bundle','spiny_aloe','dry_scrub']):byRock(x,y)?rng.pick(['basalt_shards','wind_carved_boulder','turquoise_ore','amber_crystal','salt_spires','dry_scrub']):
      rng.pick(['dry_scrub','dry_scrub','spiny_aloe','thorn_acacia','dead_snag','palm_stump','wind_carved_boulder','basalt_shards','salt_spires','desert_cairn','fossil_ribcage','giant_skull']);
    if(put(nm,x,y))n++;
    if(/scrub|aloe|reed/.test(nm))for(let k=rng.int(0,2);k>0;k--){const px=x+rng.range(-1,1),py=y+rng.range(-.7,.7);if(freeAt(px,py)&&!onRoute(px,py,1.4))put(nm,px,py);}
  }
  // beside the caravan trails: waymarkers where they wind, and what fell off the beasts
  for(const r of routes)for(let s=4;s<r.pts.length-4;s+=rng.int(7,11)){
    const [px,py]=r.pts[s],[qx,qy]=r.pts[s+1],l=Math.hypot(qx-px,qy-py)||1,side=rng.chance(.5)?1:-1,off=r.radius+.9;
    const x=px-(qy-py)/l*off*side,y=py+(qx-px)/l*off*side;
    if(freeAt(x,y)&&!onRoute(x,y,1.6))put(rng.pick(['sand_swept_milestone','desert_cairn','broken_cart_wheel','pack_saddle','clay_water_jar','broken_pottery']),x,y);
  }
  // the ruins at the sites: fallen columns, an obelisk's stump, a statue's head, a standing stone, a weapons cache
  for(const [sx,sy] of SAND_SITES.slice(0,4))for(let n=0,t=0;n<rng.int(3,5)&&t<40;t++){   // (the fifth is the caravan rest)
    const a=rng.range(0,Math.PI*2),r=rng.range(3.2,6.5),x=sx+Math.cos(a)*r,y=sy+Math.sin(a)*r;
    if(freeAt(x,y)&&!onRoute(x,y,1.2)&&put(rng.pick(['toppled_column','obelisk_fragment','buried_statue_head','carved_standing_stone','broken_pottery','buried_weapon_cache']),x,y))n++;
  }
  // Oasis palms ring the central caravan rest, and the caravan's camp is pitched round it.
  for(const [x,y] of [[34.5,33.5],[39.5,34.5],[34.5,38.5],[39.5,38.5]])put(rng.pick(['date_palm','doum_palm','fruiting_oasis_palm']),x,y,{tree:true});
  for(const [name,x,y] of [['canvas_tent',35.4,31.8],['canvas_tent',39.8,36.8],['bronze_brazier',37.2,32.8],['clay_water_jar',33.7,37.2],
    ['rolled_carpet_stack',33.2,34.6],['caravan_chest',36.1,31.2],['waterskin_rack',40.6,35.4],['rope_pulley_well',38.6,39.6],['salt_trough',37.4,40.2],['pack_saddle',33,36]])put(name,x,y);
  for(let i=0;i<scenarioSites.length;i++){
    const [x,y]=scenarioSites[i];
    put('quest_shrine',x,y,{light:4.5});
  }
  const chests=SAND_SITES.slice(0,3).map(([x,y],i)=>({x:x+2.5,y:y+1,rare:i===0||rng.chance(.2)}));
  const looks=rollLooks(biome,rng.fn()),spawns=[];
  for(let i=0;i<38;i++){
    const x=rng.int(7,64)+.5,y=rng.int(7,64)+.5;
    if(!map.circleFree(x,y,.35)||dist(x,y,ENTRY)<9)continue;
    const arch=rng.pick(biome.roster);
    spawns.push({x,y,arch,n:rng.int(1,3),rank:i%13===0?'champion':'normal',look:looks.pick(arch)});
  }
  // Named boss archetypes are included in the biome boss pool and rotate as
  // site guardians. They retain the normal boss patterns, loot and progression.
  const boss=SAND_BOSSES[(seed>>>0)%SAND_BOSSES.length];
  const [bx,by]=SAND_SITES[(seed>>>3)%SAND_SITES.length];
  spawns.push({x:bx+2,y:by-2,arch:boss[0],n:1,rank:'boss'});
  const seen=new Uint8Array(W*H),q=[I(Math.floor(ENTRY[0]),Math.floor(ENTRY[1]))];seen[q[0]]=1;
  for(let a=0;a<q.length;a++){const i=q[a],x=i%W,y=(i/W)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=I(nx,ny);if(map.walkableTile(nx,ny)&&!seen[j]){seen[j]=1;q.push(j);}}}
  if([EXIT,...SAND_SITES].some(p=>!seen[I(Math.floor(p[0]),Math.floor(p[1]))]))throw new Error('Sea of Sand maze blocked an objective at seed '+seed);
  return {map,props,buildings:[],wallHangings:[],townTiles:floors,looks,spawns,chests,torches:[],
    start:ENTRY,exit:EXIT,shrine:scenarioSites[0],sites:Array.from({length:9},(_,i)=>{
      const [cx,cy]=scenarioSites[0];const a=i*Math.PI*2/8;return [cx+Math.cos(a)*7,cy+Math.sin(a)*6];
    }),scenarioSites,scenarioCount,scenarioId:wildScenario(((seed>>>0)^depth)>>>0),seed};
}
