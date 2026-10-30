// CASTLE overworld: a concentric castle laid out like Beaumaris and Harlech (docs/CASTLE_OVERWORLD.md), or one of its
// variants (src/data/castles.js, docs/CASTLE_VARIANTS.md). A wet moat fed by a river rings the curtain (round or square
// corner towers, interval towers, the twin-towered gatehouse and its drawbridge, a postern); the wards between the
// rings hold the stables, smithy, practice yard, mason's yard and kitchen garden; the innermost guards the great keep
// with its throne room, and the cathedral and great hall stand where the variant puts them, with a walled garden.
// Outside: the village on the approach road, fields and an orchard, a graveyard, the enemy siege lines, and a forest of
// the Dark Forest's towering trees round the edge; each variant dresses its own story over it (`story.set` below).
// 336 x 304 tiles (three times the old 192 x 176 board). Walls, towers and halls sit on a 2-tile cell grid.
import { TileMap } from './map.js';
import { RNG, TAU } from '../core/util.js';
import { TW } from '../core/view.js';
import { A } from '../core/assets.js';
import { rollLooks } from '../data/bestiary.js';
import { CASTLE_FURNITURE_HEIGHT } from '../gfx/castlescale.js';
import { castleFloorTiles, castleKeepFloorTiles, castleFrames, castleObject, castleCarpetTiles, castleRampartTops, castlePlankTile, castleFlipped, castleTent, castleScaled } from '../gfx/castle.js';
import { townObject } from './town.js';
import { MAT } from '../gfx/castleground.js';
import { FACE, castleSpan, castleLeaf, castlePanel } from '../gfx/castlewalls.js';
import { castle3d, C3, K as K3, BLD } from './castle3d.js';
import { castle3dState, roofStrip } from '../gfx/castle3dart.js';
import { HS } from '../gfx/terrain.js';
import { darkForestTree, darkTreeK, darkForestTreesReady } from '../gfx/darkforest.js';
import { SCENARIOS, CASTLE_SCENARIOS } from '../game/overworld.js';
import { CASTLE_VARIANTS, castleVariant } from '../data/castles.js';

export const CASTLE_SIZE=Object.freeze([336,304]);
const W=336,H=304;
// The first castle's curtain rings in wall cells (tile = cell * 2) and gates; every variant's are in src/data/castles.js.
const FIRST=CASTLE_VARIANTS[0].layout;
export const CASTLE_OUTER=Object.freeze({...FIRST.rings[0]});
export const CASTLE_INNER=Object.freeze({...FIRST.rings[1]});
export const CASTLE_WALL=CASTLE_OUTER;
export const CASTLE_GATES=Object.freeze({outer:[[84,100]],postern:[[104,34]],inner:[[96,86]],innerNorth:[[72,48]]});
// Height-map levels (gfx/terrain.js HS = 4 world px each): the moat and river lie sunk below the ground, the outer
// wall-walk 24 levels up (96 px, ~1.6 heroes), the inner one higher; merlons and crenels stand MERLON / SILL over a walk.
const LV=Object.freeze({water:-11,outer:24,inner:32}),STEP=4,SILL=3,MERLON=9,TOWER_UP=8,GATE_UP=12,HALL_LV=18;
const D4=[[1,0],[-1,0],[0,1],[0,-1]];
// Floor ids (1-based, as in the atlas) chosen by how each tile looks: several atlas names don't describe their art.
const F={meadow:[1,7,13,21],bright:[41,47],lush:[2,8,14,22,28,42],mid:[19,27,53,59],dirt:[4,24,44,36],
  mud:[50,10,16],sand:[30],gravel:[3,9,29],cobble:[15],pave:[35,35,35,23,43],dark:[37],moss:[33,39,34],herring:[40],
  plank:[56],slab:[55],water:[12,18,26],deep:[6]};
// Material classes (map.castleMat): the renderer blends the edges between them and floats flow on the water.
export { MAT };
// Prop heights in world px for a 60 px hero (the pack's own pixel sizes vary wildly).
const PROP_H={well_roofed:86,handcart:34,firewood_stack:30,broken_barrel:30,water_barrel:32,bucket_pair:16,grain_sack:26,
  crate_stack:34,trestle_table:30,guard_bench:22,grindstone:32,blacksmith_anvil:28,unlit_brazier:38,stoneware_jugs:16,
  herb_drying_rack:46,flower_box:24,rose_bush:38,clipped_hedge:34,ivy_bollard:46,fountain_fragment:36,birdbath:40,sundial:42,
  stone_blocks:26,mortar_trough:16,mason_tools:10,ladder:58,rope_coil:12,iron_chain:14,gate_winch:30,shield_rack:30,
  spear_bundle:58,archery_target:50,broken_wheel:22,statue_fragment:34,bird_cage:20,unlit_lantern:26,hand_bell:42,
  banner_pole:100,rubble_pile:24,cracked_paving:10,small_rubble:12,large_rubble:22,column_drums:30,carved_capital:26,
  spare_merlons:22,roof_slate_stack:26,mortar_bucket:22,stone_trowels:12,mason_square:18,plumb_bob:26,scaffold_frame:86,
  pulley_block:74,timber_brace:20,iron_spikes:22,gate_hinges:14,portcullis_teeth:32,chain_hook:56,stone_drain_grate:12,
  rain_barrel_stand:58,cistern_cover:20,stone_trough:20,shallow_basin:26,topiary_spiral:64,potted_cypress:66,potted_laurel:34,
  flower_urn:28,herb_bundle:26,rose_trellis:74,ivy_arch:90,gargoyle_spout:30,lion_fountain_nozzle:50,milestone:42,
  boundary_post:54,stone_bench:18,sundial_fragment:16,chess_table:26,bird_roost:72,nest_box:20,covered_basket:30,sandbags:20,
  wicker_barricade:40,timber_barricade:38,sharpened_stakes:54,stone_firepit:14,empty_brazier:46,water_cask:40,bucket_line:46,
  hand_pump:52,rope_pulley:66,grappling_hook:24,arrow_bundle:42,crossbow_rack:40,bow_rack:40,practice_dummy:60,helmet_post:58,
  armor_stand:62,leaned_shields:32,guard_stool:22,blank_map_stand:58,message_tube:14,wax_tablet:12,cookpot:28,bread_basket:20,
  apple_sack:18,cabbage_basket:18,laundry_line:52,folded_blankets:16,stretcher:20,medicine_box:14,dressing_bowl:14,empty_cage:34,
  feather_nest:16,pig_trough:22,fountain_statue:84,broken_bench:24,paving_drain:10,iron_bollard:30,wheelbarrow:28,siege_engine:96,lit_lantern:30,lantern_bell:38,tool_chest:22};
// Pack frames whose names drifted from their art (the art decides): logical name -> atlas frame.
const SCATTER_ART={siege_engine:'scatter_34_broken_wheel',broken_wheel:'scatter_35_statue_fragment',statue_fragment:'scatter_36_bird_cage',
  bird_cage:'scatter_37_unlit_lantern',lantern_bell:'scatter_38_hand_bell',covered_basket:'scatter_79_nest_box',lit_lantern:'scatter_80_covered_basket',
  tool_chest:'scatter_103_cookpot',cookpot:'scatter_104_bread_basket',bread_basket:'scatter_105_apple_sack',apple_sack:'scatter_106_cabbage_basket',
  cabbage_basket:'scatter_107_laundry_line',laundry_line:'scatter_108_folded_blankets',folded_blankets:'scatter_109_stretcher',stretcher:'scatter_110_medicine_box',
  medicine_box:'scatter_111_dressing_bowl',dressing_bowl:'scatter_112_empty_cage',empty_cage:'scatter_113_feather_nest',feather_nest:'scatter_114_pig_trough',
  pig_trough:'scatter_115_fountain_statue',fountain_statue:'scatter_116_broken_bench',broken_bench:'scatter_117_paving_drain',paving_drain:'scatter_118_iron_bollard',
  iron_bollard:'scatter_119_rubble_barrow',wheelbarrow:'scatter_120_covered_supply_crate'};
const TREE_H={apple:70,birch:84,pine:80,oak:74,juniper:64,thorn:66,ash:150,pear:128,fir:160,twin:150,willow:140,dead:150,
  ancient:230,elm:250,cedar:240,scots:260,storm:220};
const SOLID=/well|cart|engine|chest|firewood|barrel|crate|table|bench|grindstone|anvil|brazier|rack|box|bush|hedge|bollard|fountain|birdbath|sundial|blocks|trough|ladder|winch|bundle|target|statue|cage|pole|rubble_pile|large_rubble|drums|capital|merlons|stack|scaffold|pulley|spikes|teeth|hook|stand|basin|topiary|potted|urn|trellis|arch|spout|nozzle|milestone|post|roost|barricade|stakes|cask|line|pump|dummy|stool|cookpot|cage|barrow|bucket_line/;
const KEEP_STONE={colorize:[36,.3],light:.16,contrast:.9};   // tints the keep's dark brick to the curtain's limestone
const PILLAR_STONE={colorize:[34,.28],light:.06,contrast:1.05};
const FOREST_TREES=['ancient_black_oak','spire_pine','twisted_yew','cathedral_redwood','hollow_ash','hanging_moss_fir',
  'fungal_beech','root_fused_twins','thornbound_cypress','weeping_willow','split_lightning_oak','dead_crowned_elm'];

function noise2(seed){
  const h=(x,y)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(seed,1442695041)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  const v=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
    a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;};
  return (x,y,s)=>v(x/s,y/s)*.62+v(x/s*2.13+31.7,y/s*2.13+11.3)*.38;
}

/** The Castle overworld for `depth`; the castle pack (and the Dark Forest trees) must be loaded (game.loadLevelArt). */
export function generateCastle(depth,biome,seed,variant=null){
  const V=castleVariant(variant),P=V.plan,look=V.look||{};
  const floors=castleFloorTiles(look.ground||null),keepFloors=castleKeepFloorTiles();
  if(!floors.length)throw new Error('Castle floors and moat water must load before generating the overworld.');
  const rng=new RNG(seed),N=W*H,map=new TileMap(W,H),props=[],buildings=[],trees=[],I=(x,y)=>y*W+x,
    n=noise2(seed&0xffff),inb=(x,y)=>x>=0&&y>=0&&x<W&&y<H,dist=(x,y,p)=>Math.hypot(x-p[0],y-p[1]);
  const mat=new Uint8Array(N),clear=new Uint8Array(N),forest=new Uint8Array(N);   // clear: roads and yards stay free
  map.t.fill(1);map.losBlocks=true;map.castleMat=mat;
  for(const k of ['rampartDeck','rampartWall','castleRoomWalls'])map[k]=new Uint8Array(N);
  map.castleBridges=[];map.castleWater=look.water||null;map.castleGround=look.ground||null;map.castleVariant=V.id;
  const scenarioId=(((seed>>>0)^depth)>>>0)%CASTLE_SCENARIOS,type=SCENARIOS[scenarioId][1];
  const ENTRY=P.entry,EXIT=P.exit;
  const block=(x,y)=>{if(inb(x,y))map.block[I(x,y)]=1;};
  const rect=(x0,y0,x1,y1,fn)=>{for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++)fn(x,y,I(x,y));};
  // A blob with a ragged, noise-warped rim.
  const blob=(cx,cy,rx,ry,fn,amp=.3,s=5)=>rect(Math.floor(cx-rx*1.4),Math.floor(cy-ry*1.4),Math.ceil(cx+rx*1.4),Math.ceil(cy+ry*1.4),(x,y,i)=>{
    const d=Math.hypot((x+.5-cx)/rx,(y+.5-cy)/ry)+(n(x,y,s)-.5)*amp*2;if(d<1)fn(x,y,i,d);});
  // A smooth path through points (Catmull-Rom), `w` tiles wide, its edge frayed by noise.
  const trail=(pts,w,fn,fray=.6)=>{
    const P=[pts[0],...pts,pts[pts.length-1]],cm=(a,b,c,d,t)=>.5*(2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(3*b-a-3*c+d)*t*t*t);
    for(let s=1;s<P.length-2;s++){const len=Math.hypot(P[s+1][0]-P[s][0],P[s+1][1]-P[s][1]),steps=Math.ceil(len*3);
      for(let k=0;k<=steps;k++){const t=k/steps,x=cm(P[s-1][0],P[s][0],P[s+1][0],P[s+2][0],t),y=cm(P[s-1][1],P[s][1],P[s+1][1],P[s+2][1],t),
        r=w/2+(n(x*1.7,y*1.7,4)-.5)*fray*2,R=Math.ceil(r+1);
        for(let yy=Math.floor(y-R);yy<=Math.ceil(y+R);yy++)for(let xx=Math.floor(x-R);xx<=Math.ceil(x+R);xx++)
          if(inb(xx,yy)&&Math.hypot(xx+.5-x,yy+.5-y)<=r)fn(xx,yy,I(xx,yy));}}
  };
  const H_=(id)=>{const m=id.match(/^scatter_\d+_(.+)$/);return m?PROP_H[m[1]]:null;};
  // A pack prop at tile (x,y), sized to its height in world px; solid ones block their tile.
  const add=(asset,category,x,y,h=null,extra=null)=>{
    const spr=castleObject(asset,category);if(!spr)return null;
    const hh=h??H_(asset)??Math.min(46,spr.h*.4),p={kind:'scatter',x,y,spr,k:hh/spr.h,flip:false,z:0,fixedK:true,...extra};
    props.push(p);if(extra?.solid??(category==='scatter'&&SOLID.test(asset)))block(Math.floor(x),Math.floor(y));return p;
  };
  const scatterIds=new Map(castleFrames('scatter').map(f=>[f.id.replace(/^scatter_\d+_/,''),f.id]));
  const P_=(name,x,y,extra=null)=>add(SCATTER_ART[name]||scatterIds.get(name)||name,'scatter',x,y,PROP_H[name]??null,{solid:SOLID.test(name)||/engine|wheel/.test(name),...extra});
  const S=(id,x,y,extra=null)=>P_(id.replace(/^\d+_/,''),x,y,extra);
  const art=(asset,x,y,k,extra=null)=>{   // world-scale landmark art
    const spr=castleObject(asset,'castle_landmarks');if(!spr)throw new Error('Missing castle art '+asset);
    const p={kind:'scatter',x,y,spr,k,flip:false,z:0,fixedK:true,...extra};props.push(p);return p;
  };
  const scr=(x,y)=>[32*(x-y),16*(x+y)];     // tile -> world px
  // a copy of a sprite keeping a lazily drawn image's getter (castleSpan, castleTent), with fields overridden
  const sub=(spr,o)=>Object.assign(Object.defineProperties({},Object.getOwnPropertyDescriptors(spr)),o);
  // A big sprite cut into 32 px screen columns, each sorted from the front edge of its footprint [fx0,fy0,fx1,fy1]
  // (tiles) under that column, so walkers beside it sort as they would round a solid block. Drawn at ground level
  // even where a column's sort tile is raised.
  const slicedRect=(spr,Pt,k,[fx0,fy0,fx1,fy1],extra=null)=>{
    const [px,py]=scr(Pt[0],Pt[1]),left=px+spr.ox*k,right=left+spr.w*k;
    for(let m=Math.floor(left/32);m*32<right;m++){
      const X=m*32+16;let qx=X/32+fy1,qy=fy1;if(qx>fx1){qx=fx1;qy=fx1-X/32;}if(qx<fx0){qx=fx0;qy=fx0-X/32;}
      qy=Math.max(fy0,Math.min(fy1,qy))+.02;
      const a=Math.max(0,Math.floor((m*32-left)/k)),b=Math.min(spr.w,Math.ceil((m*32+32-left)/k));if(b<=a)continue;
      const [ax,ay]=scr(qx,qy);
      props.push({kind:'scatter',x:qx,y:qy,spr:sub(spr,{sx:spr.sx+a,w:b-a,ox:spr.ox+a+(px-ax)/k,oy:spr.oy+(py-ay)/k,strip:true}),k,flip:false,
        z:-(map.hgt?map.hgt[map.tileIdx(qx,qy)]*HS:0),fixedK:true,...extra});
    }
  };

  // the castle's masonry (3D, src/world/castle3d.js): its rings, gates and buildings place everything else
  const L=castle3d(V),RG=L.rings,R0=RG[0],RI=RG[RG.length-1],S3=V.layout;
  const MOAT=Object.freeze({x0:R0.X0-10,y0:R0.Y0-10,x1:R0.X1+10,y1:R0.Y1+10,w:8});   // an 8-tile ring one berm cell outside the curtain
  const gateX=S3.gate*2+1,gy=R0.Y1-5,D0=L.drawbridge;
  // each twin gate's mouths (tiles: a step outside and inside the tunnel) and which way is in
  const gateInfo=S3.twins.map(([cx,cy,r])=>{const R=RG[r],side=cy===S3.rings[r].y0?'N':cy===S3.rings[r].y1?'S':cx===S3.rings[r].x0?'W':'E',g=(side==='N'||side==='S'?cx:cy)*2+1;
    const [o,i_]={N:[[g,R.Y0-3],[g,R.Y0+3]],S:[[g,R.Y1+3],[g,R.Y1-3]],W:[[R.X0-3,g],[R.X0+3,g]],E:[[R.X1+3,g],[R.X1-3,g]]}[side];
    return {ring:r,side,g,out:o,in:i_,dir:{N:[0,1],S:[0,-1],W:[1,0],E:[-1,0]}[side]};});
  const postern=gateInfo.find(g=>g.ring===0&&g.side==='N'),pgX=postern?postern.g:null;

  // ---------------------------------------------------------------- ground
  // Meadow with lush hollows and dry patches; the forest closes in round the edge.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=I(x,y),g=n(x,y,22),d=n(x+300,y,9);
    mat[i]=g>.68?MAT.lush:g>.56?MAT.mid:d>.76?MAT.bright:MAT.meadow;
    const edge=Math.min(x,y,W-1-x,H-1-y),reach=12+n(x,y+500,18)*22;
    if(edge<reach)forest[i]=1;
    if(edge<2)block(x,y);
  }
  // ---------------------------------------------------------------- water
  // The river comes down from the north-west (or out of a mere), feeds the moat and leaves by the east; the moat is a
  // ring round the curtain.
  const water=(x,y,i)=>{mat[i]=MAT.water;map.block[i]=1;forest[i]=0;};
  const inMoat=(x,y)=>x>=MOAT.x0&&x<=MOAT.x1&&y>=MOAT.y0&&y<=MOAT.y1&&(x<MOAT.x0+MOAT.w||x>MOAT.x1-MOAT.w||y<MOAT.y0+MOAT.w||y>MOAT.y1-MOAT.w);
  rect(MOAT.x0,MOAT.y0,MOAT.x1,MOAT.y1,(x,y,i)=>{if(inMoat(x,y))water(x,y,i);});
  if(P.lake)blob(P.lake[0],P.lake[1],P.lake[2],P.lake[3],water,.25,7);
  trail(P.river.in,9,water,1.1);trail(P.river.out,8,water,1);
  for(const [cx,cy,rx,ry] of P.pools||[])blob(cx,cy,rx,ry,water,.35,4);
  // sandy banks along the river
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=I(x,y);if(mat[i]===MAT.water||inMoat(x,y))continue;
    let near=false;for(let d=1;d<=2&&!near;d++)for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d]])if(mat[I(Math.min(W-1,Math.max(0,x+dx)),Math.min(H-1,Math.max(0,y+dy)))]===MAT.water&&!inMoat(x+dx,y+dy))near=true;
    if(near&&n(x,y,3)>.35)mat[i]=MAT.sand;}

  // ---------------------------------------------------------------- curtain walls, towers, gates, stairs (3D)
  // The curtains, towers, gatehouses, stairs, the keep and the halls are one baked 3D model (src/world/castle3d.js,
  // docs/CASTLE_3D.md) on the height map: walk along the tops of the walls, up the stairs from the wards, through the
  // gate tunnels. Its tiles draw the baked pieces (gfx/castle3dart.js); the moat and river stay sunk below the ground.
  const hgt=new Int16Array(N),faceArt=new Uint8Array(N),faceBand=new Int16Array(N),faceArch=new Uint8Array(N),bridgeWater=new Uint8Array(N);
  Object.assign(map,{hgt,faceArt,faceBand,faceArch,bridgeWater,climb:STEP,drop:10,walkStep:STEP,tallOcclusion:true,baseLevel:0,flowRange:96,
    minLevel:LV.water,maxLevel:C3.KT});   // (minimap shading: water darkest, walls palest)
  for(let i=0;i<N;i++)if(mat[i]===MAT.water)hgt[i]=LV.water;
  map.c3struct=L.struct;map.c3bld=L.bld;map.c3kind=L.kind;map.c3cover=L.cover;
  // kind, as the rest of this file reads it: 1 walk, 2 parapet, 3 tower floor, 4 tower parapet, 5 stair, 6 gate passage
  const kind=new Uint8Array(N);
  const K6={[K3.walk]:1,[K3.parapet]:2,[K3.stair]:5};
  for(let i=0;i<N;i++){
    if(!L.struct[i]&&!L.bld[i])continue;
    forest[i]=0;clear[i]=1;
    if(L.kind[i]===K3.bridge&&L.solid[i])continue;   // the drawbridge's tiles: moat until it comes down (game/castle3d.js)
    if(L.struct[i]||L.kind[i]!==K3.floor)hgt[i]=L.hgt[i];
    if(L.bld[i]&&L.kind[i]===K3.floor&&!L.struct[i]){hgt[i]=L.hgt[i];continue;}
    map.block[i]=L.solid[i];
    const k=L.kind[i];
    kind[i]=K6[k]||(k===K3.tower?(L.solid[i]?4:3):(k===K3.gate&&L.cover[i])?6:k===K3.gate?4:0);
    if(kind[i]&&kind[i]!==6){mat[i]=MAT.rampart;map.rampartWall[i]=1;faceBand[i]=L.hgt[i];}
    else if(L.struct[i])mat[i]=MAT.dark;
    if(L.walk[i]&&!L.solid[i])map.rampartDeck[i]=1;
  }
  // an apron of clear ground at every doorway and gate mouth
  for(const d of L.doors)rect(Math.floor(d.x)-2,Math.floor(d.y)-2,Math.floor(d.x)+2,Math.floor(d.y)+2,(x,y,i)=>{if(!L.solid[i]){clear[i]=1;forest[i]=0;}});
  const towers=[];
  const stairs=L.stairs.map(st=>{const [dx,dy]={'+x':[1,0],'-x':[-1,0],'+y':[0,1],'-y':[0,-1]}[st.dir];return {x:st.x0,y:st.y0,dx,dy,lv:st.lv,n:st.steps.length};});
  map.castleTowers=towers;map.castleStairs=stairs;

  // ---------------------------------------------------------------- wards
  const ox0=R0.X0+3,oy0=R0.Y0+3,ox1=R0.X1-3,oy1=R0.Y1-3;     // outer ward interior (tiles: the wall cells and a tile of walk)
  const ix0=RI.X0+2,iy0=RI.Y0+2,ix1=RI.X1-2,iy1=RI.Y1-2;     // inner ward interior
  const inInner=(x,y)=>x>=RI.X0&&x<=RI.X1&&y>=RI.Y0&&y<=RI.Y1;
  const inOuter=(x,y)=>x>=R0.X0&&x<=R0.X1&&y>=R0.Y0&&y<=R0.Y1;
  rect(ox0,oy0,ox1,oy1,(x,y,i)=>{forest[i]=0;if(map.rampartWall[i]||mat[i]===MAT.dark)return;
    if(inInner(x,y))mat[i]=n(x,y,7)>.62?MAT.mid:MAT.meadow;else mat[i]=n(x,y,6)>.68?MAT.dirt:n(x,y,11)>.58?MAT.mid:MAT.meadow;});
  // a paved strip along the foot of the walls, and the berm round the outside of the curtain
  rect(ox0,oy0,ox1,oy1,(x,y,i)=>{if(map.rampartWall[i]||RG.length>1&&inInner(x,y)&&!kind[i])return;
    if(!kind[i]&&(x<ox0+2||x>ox1-2||y<oy0+2||y>oy1-2||D4.some(([dx,dy])=>kind[I(x+dx,y+dy)]===5))){mat[i]=MAT.dark;clear[i]=1;}});
  rect(R0.X0-2,R0.Y0-2,R0.X1+2,R0.Y1+2,(x,y,i)=>{if(!inOuter(x,y)&&!inMoat(x,y)){forest[i]=0;clear[i]=1;}});
  // the moat is a stone-lined cut: its banks drop to the water as masonry; the river's banks are earth
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=I(x,y);if(hgt[i]!==0||faceArt[i])continue;
    if(inMoat(x+1,y)||inMoat(x,y+1))faceArt[i]=FACE.moat;else if(mat[i+1]===MAT.water||mat[i+W]===MAT.water)faceArt[i]=FACE.earth;}

  // Roads: the approach from the south through the village to the bridge, the bailey lanes from gate to gate, the
  // postern road north to the exit, and the old tracks to the siege lines, the graveyard and the fields.
  const road=(pts,w,m=MAT.road)=>trail(pts,w,(x,y,i)=>{if(mat[i]===MAT.water||map.rampartWall[i]||kind[i])return;mat[i]=m;clear[i]=1;forest[i]=0;},.5);
  const [KX0,KY0,KX1,KY1]=L.keep,kx=KX0-130,KEEP=[(KX0+KX1)/2|0,(KY0+KY1)/2|0],keepDoor=[167+kx,KY1+4.5];
  const VX=P.village;
  const roadList=P.roads||autoRoads();
  for(const [pts,w,m] of roadList)road(pts,w,m==='cobble'?MAT.cobble:MAT.road);
  function autoRoads(){
    const out=[],hinge=D0.hinge,E=ENTRY;
    // the approach, through the village, to the causeway
    const app=[[E[0],H+2]];if(VX)app.push([E[0]+(VX[0]-E[0])*.5-3,(E[1]+VX[1])/2],[VX[0]+4,VX[1]-6]);
    app.push([gateX,hinge+22],[gateX,hinge+10]);
    out.push([app.filter((p,k)=>k===0||p[1]>=hinge+10&&p[1]<app[k-1][1]+.01),5.2]);
    // bailey lanes: from each ring's gates to the nearest gate of the next ring in, and from the innermost to the keep
    const mouths=[[[gateX,gy],[0,-1],0],...gateInfo.filter(g=>g.ring===0&&g!==postern).map(g=>[g.in,g.dir,0]),...(postern?[[postern.in,postern.dir,0]]:[])];
    for(let r=1;r<=RG.length;r++){
      const next=gateInfo.filter(g=>g.ring===r);
      for(const [m,d] of mouths.filter(q=>q[2]===r-1)){
        if(next.length){const t=next.reduce((a,b)=>dist(m[0],m[1],a.out)<=dist(m[0],m[1],b.out)?a:b);
          out.push([[m,[m[0]+d[0]*10,m[1]+d[1]*10],[t.out[0]-t.dir[0]*6,t.out[1]-t.dir[1]*6],t.out],4.4,'cobble']);}
        else out.push([[m,[m[0]+d[0]*8,m[1]+d[1]*8],[keepDoor[0],keepDoor[1]+3],keepDoor],4.4,'cobble']);
      }
      for(const g of next)mouths.push([g.in,g.dir,r]);
    }
    if(postern){const y0=MOAT.y0;out.push([[[pgX,y0-1],[pgX+4,y0-16],[EXIT[0]-6,Math.min(22,y0-20)],[EXIT[0],-2]],4.2]);}
    else out.push([[[gateX+3,hinge+14],[MOAT.x1+10,(MOAT.y0+MOAT.y1)/2],[MOAT.x1+6,MOAT.y0-8],[EXIT[0],-2]],4.2]);
    // the east loop past the siege lines and over the river to the exit; the old tracks west
    const ry=P.river.out[2][1],bx=P.riverBridge;
    if(VX)out.push([[[VX[0]+6,VX[1]-12],[MOAT.x1-20,MOAT.y1+22],[bx-14,MOAT.y1+14],[bx-1,ry+24],[bx,ry],[bx-2,ry-30],[MOAT.x1+12,MOAT.y0+20],[EXIT[0]+6,24]],3.4]);
    if(VX&&P.fields)out.push([[[VX[0]-4,VX[1]-2],[(VX[0]+P.fields[0]+40)/2,VX[1]+4],[P.fields[0]+40,P.fields[1]+12]],3.2]);
    if(VX&&P.graveyard)out.push([[[VX[0]-6,VX[1]+6],[(VX[0]+P.graveyard[0])/2,(VX[1]+P.graveyard[1])/2+14],[P.graveyard[0]+6,P.graveyard[1]+12]],2.8]);
    if(VX&&P.orchard)out.push([[[E[0]-4,E[1]-24],[(E[0]+P.orchard[0])/2,E[1]-18],[P.orchard[0]+20,P.orchard[1]+20]],2.6]);
    return out;
  }

  // ---------------------------------------------------------------- bridges
  // Stone bridges at ground level over the sunken water: a deck between two low parapets, the side the camera sees
  // opening in arches (the artwork's arch piece) down to the water. The main bridge's last tiles before the gate are
  // the drawbridge's planks.
  const bridge=(x0,x1,y0,y1,name,planks=0,ends=[0,1])=>{
    for(let y=y0-ends[0];y<=y1+ends[1];y++)for(let x=x0-1;x<=x1+1;x++){const i=I(x,y),edge=x<x0||x>x1;
      if(mat[i]===MAT.water)bridgeWater[i]=1;
      hgt[i]=edge?SILL:0;map.block[i]=edge?1:0;mat[i]=!edge&&y<y0+planks?MAT.plank:MAT.rampart;faceArt[i]=FACE.bridge;forest[i]=0;clear[i]=1;}
    const len=y1-y0+1,n=Math.max(1,Math.round(len/4));
    for(let a=0;a<n;a++){const ya=y0+Math.round(a*len/n),yb=y0+Math.round((a+1)*len/n)-1,span=yb-ya+1;
      for(let y=ya;y<=yb;y++)faceArch[I(x1+1,y)]=1+(yb-y)+(span<<4);}
    map.castleBridges.push({x:(x0+x1+1)/2,y:(y0+y1+1)/2,kind:name,near:y1+1,far:y0,x0,x1});
    for(const [lx,ly] of [[(x0+x1+1)/2,y1+3],[(x0+x1+1)/2,y0-3]])blob(lx,ly,7,7,(xx,yy,i)=>{clear[i]=1;forest[i]=0;},.2);   // open landings
  };
  {const D=L.drawbridge;   // the main crossing (3D): the drawbridge over the moat to a stone pier, a causeway to the bank
    rect(D.x0-2,D.y1,D.x1+1,D.y1+3,(x,y,i)=>{if(L.struct[i]){map.block[i]=0;mat[i]=MAT.dark;forest[i]=0;clear[i]=1;hgt[i]=0;}});
    rect(D.x0,D.hinge,D.x1-1,D.y1-1,(x,y,i)=>{mat[i]=MAT.water;hgt[i]=LV.water;});
    map.castleBridges.push({x:(D.x0+D.x1)/2,y:(D.hinge+D.y1+4)/2,kind:'main',near:D.y1+4,far:D.hinge,x0:D.x0,x1:D.x1-1});
    map.drawbridge={...D};
    blob(gateX,D.y1+6,7,7,(xx,yy,i)=>{clear[i]=1;forest[i]=0;},.2);}
  if(postern)bridge(pgX-1,pgX,MOAT.y0,MOAT.y0+MOAT.w-1,'postern',0,[1,0]);
  // the east road crosses the river's outflow
  {const bx=P.riverBridge-1,ry=P.river.out[2][1];let y0=999,y1=-1;
    for(let y=ry-28;y<ry+42;y++)for(let x=bx-1;x<=bx+3;x++)if(mat[I(x,y)]===MAT.water){y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(y1>0)bridge(bx,bx+2,y0,y1,'river',0,[1,1]);}
  // ---------------------------------------------------------------- the keep and the halls (3D)
  // The keep is explored inside: an entrance hall, the throne room in its west wing, the council chamber and the armoury
  // in its great tower. The cathedral and the great hall are buildings too; their roofs lift off while you are inside.
  rect(KX0-6,KY0-4,KX1+6,KY1+6,(x,y,i)=>{if(!L.bld[i]&&!L.struct[i]&&!map.block[i]&&mat[i]!==MAT.water)mat[i]=MAT.pave;});
  const TH_F=F.pave[0]-1,CH_F=F.gravel[2]-1,GH_F=F.plank[0]-1;
  // rooms: `tiles` is the outer bound (walls included, two tiles thick where the old halls had them)
  const room3=(id)=>L.rooms.find(r=>r.id===id||r.id===BLD[id]),grow=(r)=>[r.tiles[0]-2,r.tiles[1]-2,r.tiles[2]+2,r.tiles[3]+2];
  const rooms=[
    {id:'throne_hall',name:'Throne Room',tiles:grow(room3('throne_hall')),floor:TH_F},
    {id:'cathedral',name:'Cathedral',tiles:grow(room3('cathedral')),floor:CH_F},
    {id:'great_hall',name:'Great Hall',tiles:grow(room3('great_hall')),floor:GH_F},
  ];
  for(let i=0;i<N;i++){if(!L.bld[i])continue;
    if(L.kind[i]===K3.floor&&!L.struct[i]){mat[i]=MAT.hall;map.block[i]=0;clear[i]=1;}
    else if(L.kind[i]===K3.keep)map.castleRoomWalls[i]=1;}
  const floorRoom=(t,f)=>rect(t[0],t[1],t[2],t[3],(x,y,i)=>{if(L.bld[i]&&!L.struct[i])map.v[i]=f;});
  floorRoom(room3('keep_hall').tiles,F.slab[0]-1);floorRoom(room3('council').tiles,F.herring[0]-1);floorRoom(room3('armoury').tiles,F.dark[0]-1);
  for(const r of rooms)floorRoom(r.tiles,r.floor);
  // A banner hung flat on a wall face (the pack's hangings are painted face on: castlePanel shears them onto the face):
  // axis 'x' on the face looking down +y at row Y (the tile in front, X..X+1), 'y' on the face looking down +x at column
  // X (Y..Y+1); its top `topPx` world px above the ground plane.
  const hung=new Set();
  const hang=(X,Y,axis,topPx,hpx,id)=>{
    const art=castleObject(id,'wall_hangings');if(!art)return;
    const [x,y]=axis==='x'?[X+.03,Y+.04]:[X+.04,Y+.97];
    props.push({kind:'scatter',x,y,spr:castlePanel(art,{len:1,hpx,axis,trim:[2,0,2,4]}),k:1,flip:false,z:topPx-hpx-hgt[I(X,Y)]*HS,fixedK:true,banner:true});
    for(let d=-2;d<=2;d++)hung.add(axis==='x'?(X+d)+','+Y+',x':X+','+(Y+d)+',y');
  };
  const furnish=(fid,x,y,light=0,flip=false,z=0,hk=1)=>{
    const art=castleObject(fid,'furniture');if(!art)throw new Error('Missing keep furnishing '+fid);
    const [spr,k]=castleScaled(art,CASTLE_FURNITURE_HEIGHT[fid]*hk/art.h);
    props.push({kind:'scatter',x,y,spr,k,flip,light,z,fixedK:true});return spr;
  };
  const wallArt=(asset,category,x,y,h)=>add(asset,category,x,y,h,{solid:false});
  const tilesOf=(r)=>r.tiles;
  const CARPET=floors.length+keepFloors.length;
  const carpet=(xa,xb,ya,yb)=>rect(xa,ya,xb,yb,(x,y,i)=>{map.v[i]=CARPET+(x===xa?1:x===xb?2:0);});
  const pillar=(x,y)=>{const spr=castleObject('keep_wall_01_pale_quarry_stone_pillar','keep_walls',PILLAR_STONE);if(!spr)return;
    props.push({kind:'scatter',x:x+.5,y:y+.5,spr,k:1.2,flip:false,z:0,fixedK:true,pillar:true});block(x,y);};
  const sconce=(x,y,side)=>add('torch_04_twin_sconce_'+side,'torches',x,y,46,{light:3.4,solid:false});
  // Throne hall: a carpet from the doors up the nave to the dais, colonnades either side, armour and banners on the walls.
  {const [x0,y0,x1,y1]=tilesOf(rooms[0]),cx=(x0+x1+1)/2;
    carpet(cx-2,cx+1,y0+7,y1+1);
    furnish('furniture_01_throne_dais',cx,y0+5.4,0,false,0,1.45);rect(cx-3,y0+2,cx+2,y0+6,(x,y,i)=>{map.block[i]=1;});
    for(let y=y0+9;y<=y1-4;y+=5)for(const x of [cx-7,cx+6])pillar(x,y);
    for(let y=y0+11;y<=y1-4;y+=5)for(const x of [cx-3.4,cx+2.6]){furnish('furniture_05_floor_candelabrum',x,y,3.2);block(Math.floor(x),Math.floor(y));}
    for(const x of [cx-4.5,cx+3.5])add('torch_06_unlit_brazier_SE','torches',x,y0+5.5,46,{light:5,solid:true});
    for(const [nm,x,y] of [['banner_pole',cx-6.5,y0+3.4],['banner_pole',cx+5.5,y0+3.4],['shield_rack',x0+4.5,y0+3.4],['spear_bundle',x1-3.5,y0+3.4],
      ['armor_stand',x0+3.4,y0+12],['armor_stand',x0+3.4,y0+17],['armor_stand',x0+3.4,y0+22],['armor_stand',x1-2.6,y0+12],['armor_stand',x1-2.6,y0+22],
      ['blank_map_stand',x1-3.5,y1-3.6],['trestle_table',x1-5.5,y1-5],['guard_stool',x1-5.4,y1-3.4],['guard_stool',x1-7.4,y1-5.2],['wax_tablet',x1-5.6,y1-5.2]])P_(nm,x,y);
    for(const x of [cx-9.5,cx+8.5])hang(Math.floor(x),y0+2,'x',HALL_LV*HS-6,56,'castle_hanging_01_05_crown_roots_SE');
    for(const x of [cx-3.5,cx+2.5])wallArt('window_03_lancet_keep_SE','windows',x,y0+2.1,64);
    for(const y of [y0+9.5,y0+19.5])hang(x0+2,Math.floor(y),'y',HALL_LV*HS-6,56,'castle_hanging_01_04_gate_sun_SE');
    for(const y of [y0+14.5,y0+24.5])sconce(x0+2.1,y,'SW');
    for(const y of [y0+11,y0+21])furnish('furniture_04_hanging_chandelier',cx,y,3.0,false,34);}
  // Chapel: the pulpit and altar candles in the apse, pews either side of a carpeted nave, side aisles behind colonnades.
  {const [x0,y0,x1,y1]=tilesOf(rooms[1]),cx=(x0+x1+1)/2;
    carpet(cx-2,cx+1,y0+8,y1+1);
    rect(cx-5,y0+2,cx+4,y0+7,(x,y,i)=>{map.v[i]=F.pave[0]-1;});
    furnish('furniture_03_cathedral_pulpit',cx,y0+5.4,1.8,false,0,1.35);rect(cx-2,y0+3,cx+1,y0+6,(x,y,i)=>{map.block[i]=1;});
    for(let row=0;row<6;row++){const y=y0+10.6+row*2.8;for(const x of [cx-7.4,cx-4.6,cx+3.8,cx+6.6]){furnish('furniture_02_cathedral_pew',x,y,0,x>cx);block(Math.floor(x),Math.floor(y));}}
    for(let y=y0+9;y<=y1-4;y+=5)for(const x of [x0+5,x1-5])pillar(x,y);
    for(const [x,y] of [[cx-4.5,y0+4.5],[cx+3.5,y0+4.5],[cx-3.4,y1-3.5],[cx+2.6,y1-3.5]]){furnish('furniture_05_floor_candelabrum',x,y,4.5);block(Math.floor(x),Math.floor(y));}
    for(const y of [y0+12.5,y0+19.5,y0+26.5])furnish('furniture_04_hanging_chandelier',cx,y,3.0,false,34);
    for(const x of [cx-8.5,cx+7.5])wallArt('window_05_twin_lancet_SE','windows',x,y0+2.1,66);
    hang(Math.floor(cx),y0+2,'x',HALL_LV*HS-4,60,'castle_hanging_02_05_pilgrim_stars_SE');
    for(const y of [y0+11.5,y0+21.5])wallArt('window_08_deep_recess_arch_SW','windows',x0+2.1,y,64);
    for(const y of [y0+16.5,y0+26.5])sconce(x0+2.1,y,'SW');
    for(const [nm,x,y] of [['flower_urn',cx-2.6,y0+7.4],['flower_urn',cx+1.6,y0+7.4],['lantern_bell',x0+3.5,y0+3.5],['statue_fragment',x1-3,y0+3.6],['potted_cypress',x0+3.5,y1-3.5],['potted_cypress',x1-3,y1-3.5]])P_(nm,x,y);}
  // Great hall: the high table at the far end, two long feasting tables down a timber floor, the hearth between them.
  {const [x0,y0,x1,y1]=tilesOf(rooms[2]),cx=(x0+x1+1)/2;
    const table=(x,y,flip)=>add('scatter_09_trestle_table','scatter',x,y,44,{flip,solid:true}),bench=(x,y,flip)=>add('scatter_10_guard_bench','scatter',x,y,30,{flip,solid:true});
    for(let x=cx-6;x<=cx+5;x+=1.5)table(x,y1-5,false);
    for(let x=cx-5.5;x<=cx+5;x+=2.6)P_('guard_stool',x,y1-3.4);
    for(const tx of [cx-6,cx+5]){for(let y=y0+6;y<=y1-10;y+=1.5)table(tx,y,true);
      for(let y=y0+6.4;y<=y1-10;y+=2.2){bench(tx-1.6,y,true);bench(tx+1.6,y,true);}
      for(let y=y0+7;y<=y1-11;y+=3.5)P_(rng.pick(['stoneware_jugs','bread_basket','iron_cups']),tx+.1,y+.4,{solid:false});}
    P_('stone_firepit',cx,y0+13,{light:5.5,smoke:3});rect(cx-1,y0+12,cx,y0+13,(x,y,i)=>{map.block[i]=1;});P_('cookpot',cx+.6,y0+12.2);
    for(const [nm,x,y] of [['cookpot',x0+3.5,y0+3.5],['bread_basket',x0+6,y0+3.2],['stoneware_jugs',x0+8.4,y0+3.2],['water_cask',x1-3,y0+3.5],
      ['crate_stack',x1-3,y1-3],['grain_sack',x1-5.6,y1-2.8],['apple_sack',x0+3.6,y1-3.4],['cabbage_basket',x0+6,y1-3.2],['leaned_shields',x0+3.4,y0+14],['armor_stand',x1-2.6,y0+9]])P_(nm,x,y);
    for(const x of [cx-8.5,cx+7.5])wallArt('window_04_shuttered_square_SE','windows',x,y0+2.1,60);
    hang(Math.floor(cx),y0+2,'x',HALL_LV*HS-4,60,'castle_hanging_01_09_crossed_hammers_SE');
    for(const y of [y0+9.5,y0+19.5])sconce(x0+2.1,y,'SW');
    for(const y of [y0+8,y0+18])furnish('furniture_04_hanging_chandelier',cx,y,3.0,false,32);
    wallArt('sign_11_kitchen_plaque_SW','signs',x1+1.6,y0+11,60);}

  // ---------------------------------------------------------------- inner ward: courtyard and garden
  // Flagstones round the keep and the halls, a walled garden with cross paths and a fountain, the well and stores.
  rect(ix0,iy0,ix1,iy1,(x,y,i)=>{if(mat[i]!==MAT.hall&&!map.castleRoomWalls[i]&&(y<iy0+3||x<ix0+3||x>ix1-3||y>iy1-3))mat[i]=MAT.pave;});
  rect(KX0+26,KY1-1,KX1+3,KY1+5,(x,y,i)=>{if(mat[i]!==MAT.hall&&!map.castleRoomWalls[i])mat[i]=MAT.pave;});
  const innerGates=gateInfo.filter(g=>g.ring===RG.length-1&&RG.length>1);
  for(const g of innerGates.filter(g=>g.side==='S'))rect(g.g-2,Math.min(KY1+5,iy1),g.g+1,iy1,(x,y,i)=>{mat[i]=MAT.pave;});
  // The walled garden: four lawns quartered by gravel walks, clipped hedges round each, the fountain at the crossing.
  const GDN=P.garden?[P.garden[0],P.garden[1],P.garden[0]+26,P.garden[1]+20]:null;
  const gcx=GDN?(GDN[0]+GDN[2]+1)/2:keepDoor[0],gcy=GDN?(GDN[1]+GDN[3]+1)/2:keepDoor[1];
  if(GDN){
    rect(GDN[0],GDN[1],GDN[2],GDN[3],(x,y,i)=>{mat[i]=MAT.bright;});
    const walk=(x,y,i)=>{mat[i]=MAT.moss;clear[i]=1;};
    rect(GDN[0],Math.floor(gcy)-1,GDN[2],Math.floor(gcy),walk);rect(Math.floor(gcx)-1,GDN[1],Math.floor(gcx),GDN[3],walk);
    rect(GDN[0],GDN[1],GDN[2],GDN[1]+1,walk);rect(GDN[0],GDN[3]-1,GDN[2],GDN[3],walk);rect(GDN[0],GDN[1],GDN[0]+1,GDN[3],walk);rect(GDN[2]-1,GDN[1],GDN[2],GDN[3],walk);
    blob(gcx,gcy,3.6,3.6,walk,.01);
    P_('fountain_statue',gcx,gcy);rect(Math.floor(gcx)-1,Math.floor(gcy)-1,Math.floor(gcx),Math.floor(gcy),(x,y,i)=>{map.block[i]=1;});
    for(const [qx0,qy0,qx1,qy1] of [[GDN[0]+2,GDN[1]+2,gcx-2,gcy-2],[gcx+1,GDN[1]+2,GDN[2]-2,gcy-2],[GDN[0]+2,gcy+1,gcx-2,GDN[3]-2],[gcx+1,gcy+1,GDN[2]-2,GDN[3]-2]]){
      // a hedge round the lawn, open at the corner nearest the fountain
      for(let x=qx0+.5;x<=qx1;x+=1.15)for(const y of [qy0+.2,qy1+.6])if(Math.hypot(x-gcx,y-gcy)>5)P_('clipped_hedge',x,y);
      for(let y=qy0+1.4;y<=qy1-.4;y+=1.15)for(const x of [qx0+.2,qx1+.6])if(Math.hypot(x-gcx,y-gcy)>5)P_('clipped_hedge',x,y);
      const mx=(qx0+qx1)/2,my=(qy0+qy1)/2;P_(rng.chance(.5)?'topiary_spiral':'potted_cypress',mx,my);
      for(const [dx,dy] of [[-2.5,-1.5],[2.5,1.5],[-2.5,1.5],[2.5,-1.5]])P_(rng.chance(.6)?'rose_bush':'flower_urn',mx+dx,my+dy);
    }
    for(const [x,y] of [[gcx-4.6,gcy-2.4],[gcx+3.8,gcy+1.8]])P_('stone_bench',x,y);
    for(const [x,y] of [[gcx,GDN[1]-.4],[gcx,GDN[3]+1],[GDN[0]-.4,gcy],[GDN[2]+1,gcy]])P_('ivy_arch',x,y,{solid:false});
    P_('sundial',GDN[0]+3.5,gcy+3.5);P_('birdbath',GDN[2]-3,gcy-3.5);
    for(const [x,y] of [[gcx-2.5,gcy-2.5],[gcx+2.5,gcy+2.5]])P_('flower_urn',x,y);
  }
  // the well and the kitchen stores
  if(P.well){const [wx,wy]=P.well;
    for(const [nm,x,y] of [['well_roofed',.5,.5],['stone_trough',3.6,2.6],['bucket_pair',-1,3.4],['water_barrel',6.5,8.5],['crate_stack',8.5,10.5],
      ['grain_sack',6.6,12.4],['firewood_stack',8.6,5],['handcart',3,14.5],['herb_drying_rack',-3.5,14.5],['cookpot',-1,11.8],['laundry_line',10,-2]])P_(nm,wx+x,wy+y);}
  for(const [x,y] of [...innerGates.filter(g=>g.side==='S').flatMap(g=>[[g.g-3,RI.Y1-4],[g.g+2,RI.Y1-4]]),[KEEP[0]-6,KEEP[1]+9],[KEEP[0]+6,KEEP[1]+9]])
    add('torch_06_unlit_brazier_SE','torches',x+.5,y+.5,46,{light:5,solid:true});

  // ---------------------------------------------------------------- outer ward
  // South bailey: the cobbled lane from the gatehouse to the inner gate, the practice yard, market stalls, banners.
  for(const [x,y] of [[gateX-3,gy-3],[gateX+2,gy-3]])P_('banner_pole',x+.5,y+.5);
  if(P.practice){const [ax,ay]=P.practice;
    for(let i=0;i<3;i++){P_('practice_dummy',ax+6.5+i*4,ay+6.5);P_('archery_target',ax+6.5+i*4,ay+.5);}
    for(const [nm,x,y] of [['bow_rack',.5,3.5],['arrow_bundle',.5,0],['crossbow_rack',20.5,-.4],['guard_bench',20,6],['helmet_post',24.6,3],['shield_rack',1,8.6]])P_(nm,ax+x,ay+y);}
  // the smithy and the armoury
  const town=(nm)=>A.town?townObject(nm):null;
  const T=(name,x,y,h,solid=true)=>{const spr=town(name);if(!spr)return null;const p={kind:'scatter',x,y,spr,k:h/spr.h,flip:false,z:0,fixedK:true};props.push(p);if(solid)block(Math.floor(x),Math.floor(y));return p;};
  // a town-pack house on an n x n footprint (the pack draws its 2 x 2 house art at n/2 x)
  const house=(name,x0,y0,flip=false,tag=null,fp=3)=>{const spr=town('b_'+name);if(!spr)return null;
    for(let y=y0;y<y0+fp;y++)for(let x=x0;x<x0+fp;x++){block(x,y);clear[I(x,y)]=1;forest[I(x,y)]=0;}
    const b={cx:x0+fp/2,cy:y0+fp/2,spr,k:TW/160*fp/2,depth:x0+y0+fp,flip,name,x0,y0,tag,fp};buildings.push(b);
    if(/cottage|inn|bakery|upgrade/.test(name))props.push({kind:'emitter',x:b.cx-.6,y:b.cy-.6,smoke:1.6,smokeZ:spr.h*b.k*.78});return b;};
  // the town pack's houses are 3 x 3; the castle's outbuildings are drawn 1.7x on a 5 x 5 footprint
  const hall=(name,x0,y0,flip=false,tag=null)=>house(name,x0,y0,flip,tag,5);
  if(P.smithy){const [ax,ay]=P.smithy;
    hall('upgrade',ax,ay,false,'smithy');P_('stone_firepit',ax+1.4,ay+7.2,{light:4,smoke:3});hall('weapons',ax+10,ay,false,'armoury');
    for(const [nm,x,y] of [['blacksmith_anvil',4,7],['grindstone',7.6,6.6],['water_barrel',15.5,7.4],['crate_stack',18,6.6],['iron_chain',5.6,8.6]])P_(nm,ax+x,ay+y);}
  // The stables and paddock, hay and troughs.
  if(P.stables){const [ax,ay]=P.stables;
    hall('stables',ax,ay,true,'stables');hall('stables',ax,ay+20,true,'stables');
    for(const [nm,x,y] of [['pig_trough',7.5,3.5],['stone_trough',7.5,23.5],['water_barrel',7.4,7],['handcart',8.6,28],['grain_sack',6.5,11.4],['bucket_pair',8,15.5]])P_(nm,ax+x,ay+y);
    for(const [x,y] of [[9.5,1],[10.6,2.4],[9.2,21],[10.8,22.2],[14,10],[15.2,11.4]])T('hay_bale',ax+x,ay+y,26);
    for(const [x,y] of [[12,6.5],[12,26.5]])T('horse_trough',ax+x,ay+y,24);
    T('cart_debris',ax+15,ay+30,30);T('workbench',ax+14.5,ay+16.5,28);T('tool_rack',ax+13,ay+18.6,40);}
  if(P.paddock){const [ax,ay]=P.paddock;
    for(let y=ay;y<=ay+20;y+=2){add('scatter_83_timber_barricade','scatter',ax+.5,y+.5,26);add('scatter_83_timber_barricade','scatter',ax+13.5,y+.5,26);}
    rect(ax+1,ay,ax+13,ay+21,(x,y,i)=>{mat[i]=MAT.mud;});
    for(const [nm,x,y] of [['pig_trough',6.5,10.5],['firewood_stack',9,4.5],['broken_wheel',3.4,14.6]])P_(nm,ax+x,ay+y);}
  // The kitchen garden (tilled beds), orchard, beehive roosts and the dovecote.
  if(P.kgarden){const [ax,ay]=P.kgarden;
    for(let b=0;b<5;b++){const x0=ax+b*7;rect(x0,ay,x0+4,ay+12,(x,y,i)=>{mat[i]=MAT.field;clear[i]=1;});
      for(let y=ay+1;y<ay+12;y+=3)S(rng.chance(.5)?'106_cabbage_basket':'68_herb_bundle',x0+2.5,y+.5,{solid:false});}}
  if(P.orchardN){const O=P.orchardN;
    for(const [x,y] of O.trees)add(rng.pick(['tree_01_small_young_apple','tree_08_medium_orchard_pear']),'trees',x+.5,y+.5,rng.chance(.5)?70:110,{solid:true});
    if(O.roost)for(const [nm,x,y] of [['bird_roost',0,0],['nest_box',2.6,1.6]])P_(nm,O.roost[0]+x,O.roost[1]+y);
    if(O.herbs)for(const [nm,x,y] of [['herb_drying_rack',0,0],['covered_basket',2,.4],['apple_sack',5.6,-.4]])P_(nm,O.herbs[0]+x,O.herbs[1]+y);}
  // The mason's yard, where a stretch of the curtain is being repaired: scaffolds and a hoist against it, dressed stone,
  // spare merlons and mortar troughs in the yard.
  if(P.mason){const [ax,ay]=P.mason,big=(nm,x,y,h)=>add(SCATTER_ART[nm]||scatterIds.get(nm),'scatter',x,y,h,{solid:true});
    for(const y of [0,5,10])big('scaffold_frame',ax+.5,ay+y,128);
    big('pulley_block',ax-1.6,ay+7.6,110);big('rope_pulley',ax-1.4,ay+13.4,96);big('ladder',ax-.4,ay+15.6,80);
    for(const [nm,x,y] of [['stone_blocks',-9,2],['stone_blocks',-10.4,4.4],['stone_blocks',-7,15],['spare_merlons',-13,8],['spare_merlons',-11.4,10.4],
      ['mortar_trough',-8.4,10.2],['mortar_bucket',-6.6,11.4],['wheelbarrow',-5,18.6],['roof_slate_stack',-15,17],['column_drums',-13,24],
      ['carved_capital',-10,25.6],['mason_square',-7,22.4],['stone_trowels',-14.6,21],['large_rubble',-3,24],['rubble_pile',-1,21.4],['tool_chest',-9,20]])P_(nm,ax+x,ay+y);}
  if(P.barracks){const [ax,ay]=P.barracks;
    hall('cottage',ax,ay,true,'barracks');hall('inn',ax,ay+12,true,'barracks');
    for(const [nm,x,y] of [['guard_stool',-3,6],['folded_blankets',-2.6,8],['stretcher',-3.4,16],['medicine_box',-3,19],['dressing_bowl',-1.4,20.4]])P_(nm,ax+x,ay+y);}
  // Lanterns along the wall-walk, against the parapet; braziers either side of the gatehouse's inner mouth.
  for(const [x,y] of P.lanterns||autoLanterns())add('torch_05_stone_lantern_SE','torches',x,y,40,{light:4.2,solid:true,onWall:true});
  function autoLanterns(){   // on the outer curtain's walk a tile in from its face, clear of towers, gates and stair heads
    const out=[],ok=(x,y,dx,dy)=>{const X=Math.floor(x),Y=Math.floor(y),i=I(X,Y),j=I(X+dx,Y+dy);
      if(!map.rampartDeck[i]||!map.rampartDeck[j]||map.block[i]||map.block[j]||L.kind[i]!==K3.walk)return false;
      for(let d=-3;d<=3;d++)for(const k of [I(X+d*Math.abs(dy),Y+d*Math.abs(dx)),I(X+d*Math.abs(dy)+dx,Y+d*Math.abs(dx)+dy)])if(L.kind[k]===K3.stair||L.kind[k]===K3.tower||L.kind[k]===K3.gate)return false;
      return true;};
    for(let x=R0.X0+16;x<=R0.X1-14;x+=28){if(ok(x,R0.Y0+1.5,0,1))out.push([x,R0.Y0+1.5]);if(ok(x,R0.Y1-.5,0,-1))out.push([x,R0.Y1-.5]);}
    for(let y=R0.Y0+28;y<=R0.Y1-14;y+=28){if(ok(R0.X0+1.5,y,1,0))out.push([R0.X0+1.5,y]);if(ok(R0.X1-.5,y,-1,0))out.push([R0.X1-.5,y]);}
    return out;
  }
  for(const [x,y] of [[gateX-3,gy-3.4],[gateX+2.6,gy-3.4]])add('torch_06_unlit_brazier_SE','torches',x+.5,y,46,{light:5,solid:true});

  // Banners all round the castle, on the faces the camera sees: every few tiles along the curtains (inside the wards,
  // and outside over the moat), one in the middle of each visible tower face under its corbels, and round the halls.
  {const busy=props.filter(p=>p.roomDoor||p.gateArch||p.banner||/^(windows|signs|torches)$/.test(p.spr?.category||'')).map(p=>[p.x,p.y]);
    const free=(x,y)=>busy.every(([bx,by])=>Math.abs(bx-x)+Math.abs(by-y)>2.2);
    const OUT=['castle_hanging_01_01_eclipse_sun_SE','castle_hanging_01_07_wingless_raven_SE'],IN=['castle_hanging_01_02_crescent_stars_SE','castle_hanging_01_06_crossed_keys_SE'],
      HALLS=['castle_hanging_01_05_crown_roots_SE','castle_hanging_01_04_gate_sun_SE'],TOWER=['castle_hanging_01_03_thorn_tree_SE','castle_hanging_01_08_four_rayed_star_SE'];
    const pickId=(list,k)=>castleObject(list[k%list.length],'wall_hangings')?list[k%list.length]:'castle_hanging_01_01_eclipse_sun_SE';
    // a face of wall tile w looking at front tile f, part of a straight run (its neighbours along the run have it too)
    const face=(x,y,axis)=>{const i=I(x,y),f=axis==='x'?I(x,y+1):I(x+1,y);
      return !!(kind[i]||map.castleRoomWalls[i])&&!kind[f]&&!map.castleRoomWalls[f]&&hgt[i]-hgt[f]>=16;};
    const run=(x,y,axis)=>face(x,y,axis)&&(axis==='x'?face(x-1,y,axis)&&face(x+1,y,axis):face(x,y-1,axis)&&face(x,y+1,axis));
    let k=0;
    const put=(x,y,axis,topPx,hpx,list)=>{const fx=axis==='x'?x:x+1,fy=axis==='x'?y+1:y;
      if(hung.has(fx+','+fy+','+axis)||!free(fx+.5,fy+.5)||topPx-hpx<hgt[I(fx,fy)]*HS+8)return;hang(fx,fy,axis,topPx,hpx,pickId(list,k++));};
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const i=I(x,y);
      if(map.castleRoomWalls[i]){for(const a of ['x','y'])if((a==='x'?x:y)%6===3&&run(x,y,a))put(x,y,a,HALL_LV*HS-6,52,HALLS);continue;}
      if(kind[i]!==1&&kind[i]!==2)continue;
      const top=(kind[i]===2?faceBand[i]:hgt[i])*HS-6,outside=kind[i]===2;
      for(const a of ['x','y'])if((a==='x'?x:y)%8===(outside?6:2)&&run(x,y,a))put(x,y,a,top,62,outside?OUT:IN);
    }
    for(const t of map.castleTowers){const mx=(t.x0+t.x1)>>1,my=(t.y0+t.y1)>>1,top=t.top*HS-20;
      if(run(mx,t.y1,'x'))put(mx,t.y1,'x',top,58,TOWER);
      if(run(t.x1,my,'y'))put(t.x1,my,'y',top,58,TOWER);}
  }

  // ---------------------------------------------------------------- outside the walls
  // The village on the approach road: cottages, the inn and the bakery round a green with a well and a market stall,
  // fenced kitchen gardens, hay and woodpiles; the town pack's houses at castle scale (4 x 4 tiles).
  const [vx,vy]=VX||[gateX,MOAT.y1+40];
  if(VX){
    rect(vx-16,vy-9,vx+16,vy+9,(x,y,i)=>{if(mat[i]!==MAT.road&&mat[i]!==MAT.water)mat[i]=n(x,y,4)>.55?MAT.dirt:MAT.meadow;forest[i]=0;clear[i]=1;});
    for(const [name,x0,y0,flip] of [['cottage',vx-13,vy-8,false],['bakery',vx-13,vy+3,true],['inn',vx+8,vy-8,true],['cottage',vx+8,vy+4,true],
      ['stables',vx+14,vy-2,true],['cottage',vx-22,vy-4,false],['cottage',vx+19,vy+9,true],['cottage',vx-8,vy+14,false]])house(name,x0,y0,flip,null,4);
    for(const [nm,x,y] of [['well_roofed',vx-4.5,vy+.5,{h:104}],['handcart',vx+4,vy+5],['crate_stack',vx-7.5,vy-1.4],['water_barrel',vx+5.6,vy-3.6],['apple_sack',vx+3.6,vy+6.6],
      ['laundry_line',vx-9,vy+7.6],['firewood_stack',vx-16.5,vy-1],['bucket_pair',vx-3,vy+2.6],['bread_basket',vx-8.8,vy+2.4]])nm==='well_roofed'?add(SCATTER_ART[nm]||'scatter_01_well_roofed','scatter',x,y,104,{solid:true}):P_(nm,x,y);
    T('market_table',vx+4.5,vy-1.5,34);T('vegetable_basket',vx+5.6,vy-.2,18,false);T('hay_bale',vx+17,vy+3.4,26);T('hay_bale',vx+18.4,vy+4.6,26);T('horse_trough',vx+13,vy+3.5,24);
    // kitchen gardens behind the houses, fenced with split rails
    for(const [gx0,gy0] of [[vx-22,vy+2],[vx+20,vy-7]]){rect(gx0,gy0,gx0+5,gy0+4,(x,y,i)=>{mat[i]=MAT.field;clear[i]=1;});
      for(let x=gx0;x<=gx0+5;x+=1.6){T('split_rail_fence',x+.5,gy0-.3,30);T('split_rail_fence',x+.5,gy0+5.3,30);}
      for(let y=gy0+1;y<=gy0+4;y+=2.4)T('vegetable_basket',gx0+2.5,y+.5,16,false);}
    for(let t=0;t<14;t++){const x=vx+rng.range(-15,15),y=vy+rng.range(-8,8),i=I(x|0,y|0);if(!map.block[i]&&mat[i]!==MAT.road)T(rng.pick(['wildflowers','leafy_shrub','sawn_stump']),x,y,rng.range(16,26),false);}
  }
  // Fields and an orchard: furrowed strips, a scarecrow, split-rail fences and haystacks.
  if(P.fields){const [fx,fy]=P.fields;
    for(let f=0;f<4;f++){const x0=fx+f*19,y0=fy+(f%2)*14;rect(x0,y0,x0+14,y0+11,(x,y,i)=>{if(mat[i]===MAT.water||mat[i]===MAT.road)return;mat[i]=MAT.field;forest[i]=0;clear[i]=1;});
      P_('practice_dummy',x0+7.5,y0+5.5);T('hay_bale',x0+15.2,y0+2,26);
      for(let x=x0;x<=x0+14;x+=1.6)T('split_rail_fence',x+.5,y0+11.8,30);}}
  if(P.orchard){const [ox,oy]=P.orchard;
    for(let r=0;r<4;r++)for(let c=0;c<6;c++){const x=ox+c*7+(r%2)*3,y=oy+r*7;if(!clear[I(x,y)]&&mat[I(x,y)]!==MAT.water){forest[I(x,y)]=0;
      add(rng.pick(['tree_01_small_young_apple','tree_08_medium_orchard_pear','tree_01_small_young_apple']),'trees',x+.5,y+.5,rng.chance(.4)?110:72,{solid:true});}}}
  // reeds along the river
  for(let t=0;t<900;t++){const x=rng.int(4,W-5),y=rng.int(4,H-5),i=I(x,y);if(mat[i]!==MAT.sand||map.block[i])continue;T(rng.chance(.7)?'dry_reeds':'fieldstone_cluster',x+rng.range(.2,.8),y+rng.range(.2,.8),rng.range(22,34),false);}
  // The graveyard by the river: headstones in rows, a broken statue, an old wall.
  const GY=P.graveyard;
  if(GY){rect(GY[0]-14,GY[1]-12,GY[0]+14,GY[1]+12,(x,y,i)=>{if(mat[i]!==MAT.water&&mat[i]!==MAT.sand){mat[i]=n(x,y,3)>.6?MAT.lush:MAT.grave;forest[i]=0;clear[i]=1;}});
    for(let r=0;r<5;r++)for(let c=0;c<6;c++)if(rng.chance(.82))S(rng.chance(.7)?'73_milestone':'74_boundary_post',GY[0]-10+c*4+(r%2)*1.5,GY[1]-8+r*4);
    S('35_statue_fragment',GY[0],GY[1]-11);S('44_column_drums',GY[0]+11,GY[1]-10);S('116_broken_bench',GY[0]-11,GY[1]+10);
    art('castle_landmark_02_gatehouse_wall_turn',GY[0]+1,GY[1]+13.5,.5,{ruin:true});rect(GY[0]-6,GY[1]+11,GY[0]+8,GY[1]+13,(x,y,i)=>{map.block[i]=1;});}
  // The enemy's siege lines: a palisade of wicker, stakes and sandbags facing the walls, the siege engines behind it
  // with their ammunition, and the camp of tents round its fires.
  const SG=P.siege;
  blob(SG[0],SG[1],26,19,(x,y,i)=>{if(mat[i]===MAT.water||mat[i]===MAT.road)return;mat[i]=n(x,y,3)>.5?MAT.mud:MAT.dirt;forest[i]=0;clear[i]=1;},.25,6);
  for(let a=0;a<30;a++){const t=a/29,x=SG[0]-23+t*40,y=SG[1]-17+t*6-Math.sin(t*Math.PI)*5;
    if(a%10===5)continue;   // gaps to sally out through
    P_(a%3===0?'sharpened_stakes':a%3===1?'wicker_barricade':'sandbags',x,y);}
  const engines=[],tents=[];
  for(const [x,y] of [[SG[0]-13,SG[1]-6],[SG[0]-3,SG[1]-9],[SG[0]+7,SG[1]-7],[SG[0]+15,SG[1]-2]]){engines.push([x+1.5,y+3]);
    P_('siege_engine',x,y);rect(Math.floor(x)-1,Math.floor(y)-1,Math.floor(x)+1,Math.floor(y),(xx,yy,i)=>{map.block[i]=1;});
    P_('stone_blocks',x+2.4,y+.6);P_('large_rubble',x+2.2,y+2);P_('rope_coil',x-1.6,y+1.6,{solid:false});}
  P_('scaffold_frame',SG[0]-24,SG[1]-2);P_('scaffold_frame',SG[0]-22.6,SG[1]-.8);P_('pulley_block',SG[0]-21.4,SG[1]-2.6);P_('ladder',SG[0]-25,SG[1]+.8);
  const tent=(x,y,v)=>{const spr=castleTent(v),p={kind:'scatter',x,y,spr,k:.95,flip:rng.chance(.4),z:0,fixedK:true,tent:true};props.push(p);tents.push([x,y]);
    rect(Math.floor(x)-1,Math.floor(y)-1,Math.floor(x)+1,Math.floor(y),(xx,yy,i)=>{map.block[i]=1;});};
  for(const [x,y,v] of [[SG[0]-11,SG[1]+3,0],[SG[0]-6,SG[1]+6,1],[SG[0]-1,SG[1]+8,0],[SG[0]+5,SG[1]+8,2],[SG[0]+11,SG[1]+6,0],[SG[0]+15,SG[1]+3,1],[SG[0]-14,SG[1]+9,2],[SG[0]+8,SG[1]+13,0],[SG[0]-5,SG[1]+13,1],[SG[0]+2,SG[1]+2,2]])
    tent(x,y,V.story.tents?V.story.tents[v]:v);
  for(const [x,y] of [[SG[0]-7,SG[1]+1],[SG[0]+8,SG[1]+2],[SG[0]+1,SG[1]+11]]){P_('stone_firepit',x,y,{light:4.5,smoke:4});P_('cookpot',x+.6,y-.4);
    for(const [dx,dy] of [[-2,1],[2,1.4],[0,-2.2]])P_(rng.pick(['folded_blankets','guard_stool','covered_basket']),x+dx,y+dy);}
  for(const [nm,x,y] of [['banner_pole',SG[0]-4,SG[1]-2],['banner_pole',SG[0]+12,SG[1]],['banner_pole',SG[0]+4,SG[1]+5],['crate_stack',SG[0]+18,SG[1]+9],['grain_sack',SG[0]+19.6,SG[1]+10.4],
    ['arrow_bundle',SG[0]-17,SG[1]+3],['spear_bundle',SG[0]-18,SG[1]+5],['crossbow_rack',SG[0]-16,SG[1]+6.6],['empty_cage',SG[0]+4,SG[1]+17],['empty_cage',SG[0]+6.5,SG[1]+17.6],
    ['iron_spikes',SG[0]-19,SG[1]-4],['water_cask',SG[0]+17,SG[1]+12],['stretcher',SG[0]-9,SG[1]+15],['medicine_box',SG[0]-10,SG[1]+17],['covered_supply_crate',SG[0]+19,SG[1]+7],
    ['handcart',SG[0]-2,SG[1]+3],['firewood_stack',SG[0]+10,SG[1]+9.6],['water_barrel',SG[0]-12,SG[1]+12],['sandbags',SG[0]+14,SG[1]+14]])P_(nm,x,y);
  // A ruined watchtower in the woods.
  const RW=P.ruin;
  if(RW){blob(RW[0],RW[1],9,7,(x,y,i)=>{mat[i]=n(x,y,3)>.5?MAT.moss:MAT.meadow;forest[i]=0;clear[i]=1;},.3);
    art('castle_landmark_03_round_tower_upper',RW[0]-1,RW[1]+1,.92,{ruin:true});rect(RW[0]-3,RW[1]-3,RW[0]+1,RW[1]+1,(x,y,i)=>{map.block[i]=1;});
    for(const [nm,x,y] of [['large_rubble',RW[0]+3,RW[1]+2],['rubble_pile',RW[0]-4,RW[1]+3],['stone_blocks',RW[0]+4,RW[1]-2],['spare_merlons',RW[0]-1,RW[1]+4.5]])P_(nm,x,y);}
  // more of the town round the castle (Thornwick)
  for(const [name,x0,y0,flip] of P.town||[])house(name,x0,y0,flip,null,4);
  // the variant's story, dressed on the ground
  const SET={P_,S,T,add,house,tent,blob,rect,trail,rng,n,mat,clear,forest,map,I,inb,L,V,P,R0,RI,RG,MOAT,gateX,gy,vx,vy,GY,SG,RW,KEEP,keepDoor,gateInfo,ENTRY,EXIT,props,buildings,dist};
  if(V.story.set&&STORY_SETS[V.story.set])STORY_SETS[V.story.set](SET);

  // ---------------------------------------------------------------- loose scatter and trees
  // Loose scatter goes where it belongs: masonry knocked off the walls lies at their foot (mostly outside, where the
  // siege engines aim), spent shot and wreckage on the ground between the siege lines and the curtain, milestones
  // beside the roads, and out in the meadows and along the wood's edge only nature: stones, shrubs, flowers, logs.
  // Nothing on a road. (It used to be rubble, sandbags, headstones and apple sacks dropped anywhere.)
  const reserved=(x,y)=>[ENTRY,EXIT].some(p=>dist(x,y,p)<6);
  const wallD=new Uint8Array(N).fill(9),wq=[];   // tiles from the nearest wall or tower, up to 5
  for(let i=0;i<N;i++)if(map.rampartWall[i]){wallD[i]=0;wq.push(i);}
  for(let a=0;a<wq.length;a++){const i=wq[a];if(wallD[i]>=5)continue;for(const j of [i+1,i-1,i+W,i-W])if(j>=0&&j<N&&wallD[j]>wallD[i]+1){wallD[j]=wallD[i]+1;wq.push(j);}}
  const open=(x,y,r=.55)=>{const i=I(x|0,y|0);return inb(x|0,y|0)&&!map.block[i]&&!kind[i]&&hgt[i]===0&&mat[i]!==MAT.water&&mat[i]!==MAT.road&&mat[i]!==MAT.cobble&&
    mat[i]!==MAT.hall&&mat[i]!==MAT.sand&&faceArt[i]!==FACE.bridge&&!reserved(x,y)&&map.circleFree(x,y,r);};
  const nearAny=(x,y,r,test)=>{for(let yy=(y|0)-r;yy<=(y|0)+r;yy++)for(let xx=(x|0)-r;xx<=(x|0)+r;xx++)if(inb(xx,yy)&&test(I(xx,yy)))return true;return false;};
  // fallen masonry: a block or a heap with smaller stones round it
  for(let t=0,n=0;t<6000&&n<64;t++){const x=rng.int(4,W-5)+.5,y=rng.int(4,H-5)+.5,i=I(x|0,y|0);
    if(wallD[i]<1||wallD[i]>3||!open(x,y,.6)||(inOuter(x,y)&&rng.chance(.75))||nearAny(x,y,2,(j)=>kind[j]===5))continue;   // (never at a stair's foot)
    const big=!clear[i];   // on the paved strip along the wall's foot only stones you can walk over
    if(!S(big?rng.pick(['40_rubble_pile','43_large_rubble','24_stone_blocks','spare_merlons']):'42_small_rubble',x,y,{solid:big}))continue;n++;
    for(let k=rng.int(1,3);k>0;k--){const a=rng.range(0,TAU),r=rng.range(.7,1.4),sx=x+Math.cos(a)*r,sy=y+Math.sin(a)*r;if(open(sx,sy,.3))S('42_small_rubble',sx,sy,{solid:false});}}
  // the bombardment: spent shot and wreckage on the ground between the siege lines and the south-east walls
  for(let t=0,n=0;t<3000&&n<30;t++){const x=SG[0]+rng.range(-46,10),y=SG[1]+rng.range(-46,4),i=I(x|0,y|0);
    if(clear[i]||forest[i]||inOuter(x,y)||!open(x,y,.6))continue;
    if(S(rng.chance(.6)?'43_large_rubble':rng.pick(['34_broken_wheel','04_broken_barrel','81_sandbags']),x,y,{solid:true}))n++;}
  // milestones beside the roads where they fork or leave the woods
  for(const [mx,my] of P.milestones||roadList.map(r=>r[0][1])){
    let best=null,bd=9;
    for(let yy=my-4;yy<=my+4;yy++)for(let xx=mx-4;xx<=mx+4;xx++){const x=xx+.5,y=yy+.5,d=Math.hypot(x-mx,y-my);
      if(d<2||d>=bd||!open(x,y,.45)||!nearAny(x,y,1,(j)=>mat[j]===MAT.road))continue;bd=d;best=[x,y];}
    if(best)T('arrow_milestone',best[0],best[1],40);}
  // nature: patches of flowers and stones in the meadows; logs, stumps, boulders, shrubs and mushrooms along the wood's edge
  for(let t=0,n=0;t<14000&&n<300;t++){const x=rng.int(4,W-5)+.5,y=rng.int(4,H-5)+.5,i=I(x|0,y|0);
    if(clear[i]||forest[i]||inOuter(x,y)||wallD[i]<5||!open(x,y,.6))continue;
    if(nearAny(x,y,2,(j)=>forest[j])){
      const nm=rng.pick(['fallen_log','hollow_stump','sawn_stump','moss_boulder','leafy_shrub','thorn_bush','mushrooms','mushrooms']),solid=!/mushrooms|leafy/.test(nm);
      if(T(nm,x+rng.range(-.2,.2),y+rng.range(-.2,.2),{fallen_log:26,hollow_stump:24,sawn_stump:18,moss_boulder:36,leafy_shrub:30,thorn_bush:32,mushrooms:12}[nm]*rng.range(.85,1.15),solid))n++;
    }else if(rng.chance(.5)){
      const nm=rng.chance(.55)?'wildflowers':rng.chance(.6)?'fieldstone_cluster':rng.chance(.7)?'leafy_shrub':'moss_boulder';
      for(let k=nm==='wildflowers'?rng.int(2,4):1;k>0;k--){const sx=x+rng.range(-.8,.8),sy=y+rng.range(-.8,.8);
        if(open(sx,sy,.3)&&T(nm,sx,sy,{wildflowers:16,fieldstone_cluster:20,leafy_shrub:28,moss_boulder:34}[nm]*rng.range(.85,1.15),nm==='moss_boulder'))n++;}}}
  // Ground cover you walk over: a cracked cobble here and there on the cobbled lanes, chips of stone near the walls.
  for(let t=0;t<9000;t++){const x=rng.int(3,W-4)+.5,y=rng.int(3,H-4)+.5,i=I(x|0,y|0);
    if(map.block[i]||kind[i]||faceArt[i]===FACE.bridge||!rng.chance(.06))continue;
    if(mat[i]===MAT.cobble)S('41_cracked_paving',x+rng.range(-.3,.3),y+rng.range(-.3,.3),{solid:false});
    else if(wallD[i]<=4&&mat[i]!==MAT.water&&mat[i]!==MAT.hall&&mat[i]!==MAT.road)S('42_small_rubble',x+rng.range(-.3,.3),y+rng.range(-.3,.3),{solid:false});}
  // The forest: the Dark Forest's towering trees in the deep wood, the castle pack's trees on its fringe and in groves.
  const dfOK=darkForestTreesReady(),grid=new Int32Array(N),woods=look.forest||FOREST_TREES;
  const fringeTrees=castleFrames('trees').filter(f=>/medium|large/.test(f.id)).map(f=>f.id);
  const treeH=(id)=>{for(const [k,h] of Object.entries(TREE_H))if(id.includes(k))return h;return 120;};
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
    const i=I(x,y);if(clear[i]||mat[i]===MAT.water||map.block[i])continue;
    const deep=forest[i]&&Math.min(x,y,W-1-x,H-1-y)<8+n(x,y+500,18)*16,grove=!forest[i]&&!inOuter(x,y)&&n(x+90,y+40,14)>.7;
    if(!forest[i]&&!grove)continue;
    const sp=deep?2.5:forest[i]?3:3.4;
    if(!rng.chance(deep?.5:forest[i]?.36:.18)||dist(x,y,ENTRY)<9)continue;   // a glade where the hero arrives
    const px=x+.5+rng.range(-.25,.25),py=y+.5+rng.range(-.25,.25),R=Math.ceil(sp);let ok=true;
    for(let dy=-R;dy<=R&&ok;dy++)for(let dx=-R;dx<=R&&ok;dx++){const j=I(Math.min(W-1,Math.max(0,x+dx)),Math.min(H-1,Math.max(0,y+dy)));
      if(grid[j]){const t=trees[grid[j]-1];if(Math.hypot(t.x-px,t.y-py)<sp)ok=false;}}
    if(!ok)continue;
    let p=null;
    if(dfOK&&forest[i]&&(deep||rng.chance(.45))){const spr=darkForestTree(rng.pick(woods));if(spr)p={kind:'scatter',x:px,y:py,spr,k:darkTreeK(rng.range(.62,.82)),flip:rng.chance(.5),tree:true};}
    if(!p){const id=rng.pick(fringeTrees),spr=castleObject(id,'trees',look.trees||null);if(!spr)continue;
      p={kind:'scatter',x:px,y:py,spr,k:treeH(id)*rng.range(.85,1.15)/spr.h,flip:rng.chance(.5),z:0,fixedK:true};}
    trees.push(p);grid[i]=trees.length;map.block[i]=1;
    if(forest[i])mat[i]=n(x,y,5)>.5?MAT.forest:MAT.lush;
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=I(x,y);if(forest[i]&&!clear[i]&&mat[i]!==MAT.water&&mat[i]!==MAT.sand)mat[i]=n(x,y,4)>.55?MAT.forest:MAT.lush;}
  // Undergrowth between the trunks at the wood's edge.
  for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++){const i=I(x,y);if(!forest[i]||clear[i]||map.block[i]||mat[i]===MAT.water)continue;
    if(rng.chance(.025))S(rng.pick(['18_rose_bush','40_rubble_pile','34_broken_wheel']),x+.5,y+.5,{solid:true});}
  const B=8,bw=W/B,bh=H/B,cells=Array.from({length:bw*bh},()=>[]);
  for(const t of trees){if(t.tree)cells[Math.floor(t.y/B)*bw+Math.floor(t.x/B)].push(t);else props.push(t);}
  map.treeCells={B,bw,bh,cells};

  // ---------------------------------------------------------------- floors
  // Each material picks its tiles from low-frequency noise, so patches of one texture run together instead of a checker.
  const pick=(list,x,y,s=7,salt=0)=>list[Math.min(list.length-1,Math.floor(n(x+salt,y-salt,s)*list.length*1.15)%list.length)]-1;
  // the walls' flagstone tops: a painted slab to a tile, eight turns of two slabs (castleRampartTops); the halls' wall
  // tops the same stone in the keep's limestone
  const RAMP=floors.length+keepFloors.length+3,WARM=RAMP+8,slab=(x,y)=>((Math.imul(x,73856093)^Math.imul(y,19349663))>>>4)&7;
  for(let i=0;i<N;i++)if(kind[i]&&kind[i]!==6&&mat[i]!==MAT.plank)mat[i]=MAT.rampart;   // later ground work may have painted over them
  const floorAt=(x,y)=>{const i=I(x,y),m=mat[i];if(m===MAT.hall)return;
    if(m===MAT.rampart||m===MAT.wall&&map.castleRoomWalls[i]){map.v[i]=(m===MAT.rampart?RAMP:WARM)+slab(x,y);return;}
    if(m===MAT.plank&&faceArt[i]===FACE.bridge){map.v[i]=WARM+8;return;}   // the drawbridge
    map.v[i]=m===MAT.meadow?pick(F.meadow,x,y,9):m===MAT.mid?pick(F.mid,x,y,8,20):m===MAT.bright?pick(F.bright,x,y,6,40):m===MAT.lush||m===MAT.grave?pick(F.lush,x,y,8,80):
      m===MAT.forest?pick(F.lush,x,y,5,120):m===MAT.dirt?pick(F.dirt,x,y,6,160):m===MAT.road?pick(F.dirt,x,y,10,200):
      m===MAT.mud?pick(F.mud,x,y,4,240):m===MAT.field?(y%2?F.mud[0]-1:pick(F.dirt,x,y,12,280)):m===MAT.sand?F.sand[0]-1:
      m===MAT.cobble?F.cobble[0]-1:m===MAT.pave?pick(F.pave,x,y,5,320):m===MAT.dark||m===MAT.wall?F.dark[0]-1:m===MAT.moss?F.herring[0]-1:
      m===MAT.plank?F.plank[0]-1:m===MAT.water?(n(x,y,8)>.62&&inMoat(x,y)?F.deep[0]-1:pick(F.water,x,y,6,360)):pick(F.meadow,x,y,9);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)floorAt(x,y);

  // ---------------------------------------------------------------- spawns, chests, sites
  const reach=new Uint8Array(N),q=[I(ENTRY[0],ENTRY[1])];reach[q[0]]=1;
  for(let a=0;a<q.length;a++){const i=q[a],x=i%W,y=(i/W)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy;if(inb(nx,ny)&&!reach[I(nx,ny)]&&map.walkableTile(nx,ny)&&map.stepOk(i,I(nx,ny))){reach[I(nx,ny)]=1;q.push(I(nx,ny));}}}
  const ok=(p)=>reach[I(Math.floor(p[0]),Math.floor(p[1]))]&&map.circleFree(p[0],p[1],.35);
  const near=(p,r=3)=>{if(ok(p))return p;for(let k=0;k<200;k++){const t=[p[0]+rng.range(-r,r),p[1]+rng.range(-r,r)];if(ok(t))return t;}
    for(let rr=1;rr<14;rr++)for(let k=0;k<40;k++){const a=k/40*Math.PI*2,t=[p[0]+Math.cos(a)*rr,p[1]+Math.sin(a)*rr];if(ok(t))return t;}return p;};
  const hallC=(id)=>{const r=rooms.find(r=>r.id===id).tiles;return [(r[0]+r[2]+1)/2,(r[1]+r[3]+1)/2];};
  // Named places for scenario sites; each scenario takes a compact cluster that fits its story, so objectives sit
  // a short walk apart instead of across the whole board. A place a variant leaves out stands in for a near one.
  const cath=room3('cathedral').tiles,firstIn=innerGates[0]||gateInfo.find(g=>g.ring>0);
  const bailey=[gateX+.5,gy-7.5];
  const place={courtyard:GDN?[gcx+.5,GDN[3]+4.5]:[KX0+38,KY1+3.5],gardenNW:GDN?[GDN[0]+4,GDN[1]+4]:[KX0+6,KY1+5],gardenSE:GDN?[GDN[2]-4,GDN[3]-4]:[KX1-4,KY1+6],
    keepSteps:keepDoor,kitchen:P.well?[P.well[0]+2,P.well[1]+8]:keepDoor,hallsWest:[KX0+28,KY1+3],chapelFront:[cath[0]+12,cath[3]+8],
    innerGateIn:firstIn?[firstIn.in[0]+.5+firstIn.dir[0]*3,firstIn.in[1]+firstIn.dir[1]*3]:[gateX+.5,gy-12],
    bailey,lists:P.practice?[P.practice[0]+12.5,P.practice[1]+10.5]:bailey,baileyEast:P.smithy?[P.smithy[0]-2,P.smithy[1]+9]:bailey,baileySW:P.baileySW,gateIn:[gateX+.5,gy-1],
    stables:P.stables?[P.stables[0]+10,P.stables[1]+18]:P.paddock?[P.paddock[0]+7,P.paddock[1]+10]:bailey,
    orchard:P.orchardN?.site||(P.kgarden?[P.kgarden[0]+16,P.kgarden[1]+6]:P.orchardN?[P.orchardN.trees[0][0]+3,P.orchardN.trees[0][1]+2]:[gcx,gcy+6]),
    posternIn:postern?[pgX+.5,R0.Y0+8]:[gateX+.5,gy-1],mason:P.mason?[P.mason[0]-19,P.mason[1]+12]:P.barracks?[P.barracks[0]-6,P.barracks[1]+10]:bailey,
    bridge:[gateX+.5,MOAT.y1+6.5],village:[vx+.5,vy+.5],villageEast:[vx+12,vy+10],fields:P.fields?[P.fields[0]+36,P.fields[1]+12]:[vx-14,vy+12],
    siegeWest:[SG[0]-20,SG[1]-9],siege:[SG[0],SG[1]+4],siegeEast:[SG[0]+20,SG[1]+2],cages:[SG[0]+5.5,SG[1]+19.5],siegeSouth:[SG[0]-10,SG[1]+18],
    graveyard:GY?[GY[0],GY[1]]:[vx-16,vy],graveyardN:GY?[GY[0]-6,GY[1]-14]:[vx-20,vy-12],graveyardS:GY?[GY[0]+8,GY[1]+9]:[vx-12,vy+12],riverbank:P.riverbank,
    orchardSW:P.orchard?[P.orchard[0]+18,P.orchard[1]]:P.fields?[P.fields[0]+20,P.fields[1]+20]:[vx-20,vy+14],
    northBank:[(pgX??gateX)+.5,MOAT.y0-6],ruin:RW?[RW[0]+4,RW[1]+6]:[MOAT.x1+18,MOAT.y0+10]};
  const innerSites=['courtyard','keepSteps','kitchen','hallsWest','chapelFront','gardenNW','gardenSE','innerGateIn','bailey'];
  const plan={
    bridge:['bridge','village','bailey','siegeWest','gateIn','lists','fields','villageEast','siege'],
    defend:['village','villageEast','fields','siegeWest','bridge','orchardSW','bailey','siege','graveyard'],
    infestation:['village','villageEast','fields','siegeWest','bridge','orchardSW','bailey','siege','graveyard'],
    siege:['siegeWest','siege','siege','siege','cages','siegeEast','siegeSouth','bridge','village'],
    camps:['siegeWest','siege','siegeEast','siegeSouth','cages','village','bridge','fields','bailey'],
    rescue:['siegeWest','cages','siegeSouth','siegeEast','siege','village','bridge','fields','bailey'],
    captains:['bailey','lists','baileyEast','baileySW','gateIn','stables','mason','courtyard','orchard'],
    necros:['graveyard','graveyardN','graveyardS','riverbank','fields','orchardSW','village','bridge','stables'],
    totems:['graveyard','graveyardN','riverbank','graveyardS','fields','orchardSW','village','bridge','stables'],
    zones:['bailey','lists','baileyEast','gateIn','baileySW','courtyard','stables','mason','orchard'],
    escort:['orchard','bailey','northBank','courtyard','mason','posternIn','stables','lists','kitchen'],
  }[type]||(type.startsWith('rampart_')?['bailey','lists','baileyEast','gateIn','baileySW','mason','stables','orchard','posternIn']:innerSites);
  const sites=plan.map((k,j)=>near(k==='siege'&&type==='siege'&&j>0&&j<4?engines[j-1]:place[k],4));
  if(type==='defend'||type==='infestation')sites[0]=near([vx+9.5,vy-6.5],3);
  const looks=rollLooks(biome,rng.fn()),spawns=[];
  for(let k=0;k<70;k++){
    const x=rng.int(10,W-11)+.5,y=rng.int(10,H-11)+.5;
    if(!ok([x,y])||dist(x,y,ENTRY)<24||sites.some(s=>dist(x,y,s)<9)||mat[I(x|0,y|0)]===MAT.hall)continue;
    const arch=rng.pick(biome.roster);spawns.push({x,y,arch,n:rng.int(2,4),rank:k%10===0?'champion':'normal',look:looks.pick(arch)});
  }
  // packs on the wall-walks and tower tops: they hold the walls, or come down the stairs at the hero
  const walkTiles=[];for(let i=0;i<N;i++)if(map.rampartDeck[i]&&reach[i]&&!map.block[i])walkTiles.push(i);
  for(let k=0,t=0;k<12&&t<600&&walkTiles.length;t++){const i=rng.pick(walkTiles),x=i%W+.5,y=((i/W)|0)+.5;
    if(!ok([x,y])||sites.some(s=>dist(x,y,s)<8)||spawns.some(s=>Math.hypot(s.x-x,s.y-y)<14))continue;
    const arch=rng.pick(biome.roster);spawns.push({x,y,arch,n:rng.int(2,3),rank:k%4===0?'champion':'normal',look:looks.pick(arch),rampart:true});k++;}
  for(const id of ['throne_hall','cathedral','great_hall']){const [x,y]=near(hallC(id),3),arch=rng.pick(biome.roster);spawns.push({x,y,arch,n:2,rank:'normal',look:looks.pick(arch),castleRoom:id});}
  const chests=[[rooms[0].tiles[0]+5.5,rooms[0].tiles[1]+12.5],[rooms[1].tiles[2]-4.5,rooms[1].tiles[1]+5.5],[rooms[2].tiles[0]+4.5,rooms[2].tiles[3]-3.5],
    GY?[GY[0]+8,GY[1]+6]:place.graveyardS,RW?[RW[0]+5,RW[1]+3]:place.ruin,[SG[0]+16,SG[1]+12]].map(([x,y],j)=>{const [px,py]=near([x,y],3);return {x:px,y:py,rare:j===0||rng.chance(.2)};});
  const exit=near(EXIT,4);
  // ---------------------------------------------------------------- trails
  // Every place worth walking to has a way there: a trail from each house's door, every scenario site (the shrine
  // first), the chests, the stairs and the exit to the nearest road, lane or paving, the cheapest way over open ground
  // (round props and trees, over no wall or water). map.road marks the whole network: auto-play keeps to it.
  const ROADS=new Set([MAT.road,MAT.cobble,MAT.dark,MAT.pave,MAT.moss,MAT.plank,MAT.hall]);   // (the halls' floors are the way indoors)
  const onRoad=(i)=>ROADS.has(mat[i])||faceArt[i]===FACE.bridge&&!map.block[i];
  const groundOK=(i)=>!map.block[i]&&hgt[i]===0&&mat[i]!==MAT.water&&mat[i]!==MAT.hall&&!kind[i];
  const touched=[];
  const trailFrom=(px,py)=>{
    let s0=I(Math.floor(px),Math.floor(py));
    if(!groundOK(s0)&&!onRoad(s0)){let best=-1;for(let r=1;r<4&&best<0;r++)for(let dy=-r;dy<=r&&best<0;dy++)for(let dx=-r;dx<=r;dx++){const j=I(Math.floor(px)+dx,Math.floor(py)+dy);if(groundOK(j)){best=j;break;}}if(best<0)return;s0=best;}
    const cost=new Map([[s0,0]]),prev=new Map(),Q=[[s0]];let end=-1;
    for(let c=0;c<Q.length&&c<900&&end<0;c++)for(const i of Q[c]||[]){
      if(cost.get(i)!==c)continue;if(onRoad(i)){end=i;break;}
      const x=i%W,y=(i/W)|0;
      for(const [dx,dy] of D4){const X=x+dx,Y=y+dy;if(!inb(X,Y))continue;const j=I(X,Y);
        if(!groundOK(j)&&!onRoad(j))continue;
        const nc=c+(onRoad(j)?1:forest[j]?7:4);if(nc>=(cost.get(j)??1e9))continue;
        cost.set(j,nc);prev.set(j,i);(Q[nc]||(Q[nc]=[])).push(j);}
    }
    if(end<0)return;
    for(let i=prev.get(end);i!==undefined;i=prev.get(i)){
      // two tiles wide: the path's tile and the one beside it across the way it runs
      const x=i%W,y=(i/W)|0,q=prev.get(i),ax=q!==undefined&&Math.abs(q-i)===1?0:1,ay=1-ax;
      for(const j of [i,I(x+ax,y+ay)])if(groundOK(j)&&!onRoad(j)){mat[j]=MAT.road;clear[j]=1;touched.push(j);}
    }
  };
  const DOOR_X=new Set(['alchemist','gems','socket','gamble','bakery']);   // world/town.js: the art's door on its +x face
  for(const b of buildings){const dx=DOOR_X.has(b.name)!==b.flip;trailFrom(dx?b.x0+b.fp+.5:b.x0+b.fp/2,dx?b.y0+b.fp/2:b.y0+b.fp+.5);}
  for(const p of [...sites,exit,ENTRY,...chests.map(c=>[c.x,c.y])])trailFrom(p[0],p[1]);
  for(const st of stairs)trailFrom(st.x-st.dx+.5,st.y-st.dy+.5);
  // then join every stretch of road, lane, paving or hall floor that the props and walls cut off to the network the
  // hero arrives on, by the cheapest trail between them
  const roadOK=(i)=>onRoad(i)&&!map.block[i];
  for(let pass=0;pass<4;pass++){
    const comp=new Int32Array(N).fill(-1),size=[];
    for(let i=0;i<N;i++){if(!roadOK(i)||comp[i]>=0)continue;const q=[i];comp[i]=size.length;
      for(let a=0;a<q.length;a++){const k=q[a];for(const j of [k+1,k-1,k+W,k-W])if(j>=0&&j<N&&comp[j]<0&&roadOK(j)&&map.stepOk(k,j)){comp[j]=size.length;q.push(j);}}
      size.push(q.length);}
    const main=comp[I(ENTRY[0],ENTRY[1]-2)]>=0?comp[I(ENTRY[0],ENTRY[1]-2)]:size.indexOf(Math.max(...size));
    let joined=0;
    for(let c=0;c<size.length;c++){if(c===main||size[c]<6)continue;
      const cost=new Map(),prev=new Map(),Q=[[]];
      for(let i=0;i<N;i++)if(comp[i]===c){cost.set(i,0);Q[0].push(i);}
      let end=-1;
      for(let k=0;k<Q.length&&k<500&&end<0;k++)for(const i of Q[k]||[]){
        if(cost.get(i)!==k)continue;if(comp[i]===main){end=i;break;}
        const x=i%W,y=(i/W)|0;
        for(const [dx,dy] of D4){const X=x+dx,Y=y+dy;if(!inb(X,Y))continue;const j=I(X,Y);
          if(!(groundOK(j)||roadOK(j))||!map.stepOk(i,j))continue;
          const nc=k+(roadOK(j)?1:forest[j]?7:4);if(nc>=(cost.get(j)??1e9))continue;cost.set(j,nc);prev.set(j,i);(Q[nc]||(Q[nc]=[])).push(j);}
      }
      if(end<0)continue;joined++;
      for(let i=prev.get(end);i!==undefined&&comp[i]!==c;i=prev.get(i)){const x=i%W,y=(i/W)|0,q=prev.get(i),ax=q!==undefined&&Math.abs(q-i)===1?0:1;
        for(const j of [i,I(x+ax,y+1-ax)])if(groundOK(j)&&!onRoad(j)){mat[j]=MAT.road;clear[j]=1;touched.push(j);}}
    }
    if(!joined)break;
  }
  for(const i of touched)floorAt(i%W,(i/W)|0);
  map.road=new Uint8Array(N);for(let i=0;i<N;i++)if(roadOK(i))map.road[i]=1;
  if(!globalThis.CASTLE_DEBUG)for(const p of [exit,...sites])if(!reach[I(Math.floor(p[0]),Math.floor(p[1]))])throw new Error('Castle moat, gate or wall blocked a route; '+V.id+' seed '+seed+' at '+p.map(v=>v.toFixed(1)));
  map.castleRooms=rooms.map(r=>({id:r.id,name:r.name,rect:r.tiles,floor:r.floor}));
  map.castleDoors=L.doors.map(d=>({...d,x:d.x+(d.axis==='y'?(d.open<0?.5:-.5):0),y:d.y+(d.axis==='x'?(d.open<0?.5:-.5):0)}));
  // Rampart posts: muster points along the south and east wall-walk, the front facing the siege lines.
  map.rampartPosts=L.posts.filter(p=>map.rampartDeck[I(p[0]|0,p[1]|0)]===1&&!map.block[I(p[0]|0,p[1]|0)]);
  // nothing old stands in the masonry (the lanterns on the wall-walk stand on it); each building's roof is cut into 32 px columns, sorted from its front edge
  for(let k=props.length-1;k>=0;k--){const pr=props[k],i=I(Math.floor(pr.x),Math.floor(pr.y));
    if(inb(Math.floor(pr.x),Math.floor(pr.y))&&(L.solid[i]||(L.struct[i]&&L.kind[i]!==K3.floor))&&!pr.c3&&!pr.banner&&!pr.onWall)props.splice(k,1);}
  const st=castle3dState(V.id);
  if(st)for(const r of st.roofs){
    let fx0=W,fy0=H,fx1=0,fy1=0;for(let i=0;i<N;i++)if(L.bld[i]===r.bld){const x=i%W,y=(i/W)|0;fx0=Math.min(fx0,x);fy0=Math.min(fy0,y);fx1=Math.max(fx1,x+1);fy1=Math.max(fy1,y+1);}
    for(const [id,col] of r.strips){
      const X=col*32+16;let qx=X/32+fy1,qy=fy1;if(qx>fx1){qx=fx1;qy=fx1-X/32;}if(qx<fx0){qx=fx0;qy=fx0-X/32;}
      qy=Math.max(fy0,Math.min(fy1,qy))+.02;
      const s=roofStrip(id),ax=(qx-qy)*32,ay=(qx+qy)*16,lv=hgt[I(Math.min(W-1,Math.floor(qx)),Math.min(H-1,Math.floor(qy)))];
      props.push({kind:'scatter',x:qx,y:qy,spr:{...s,ox:s.ox-ax*st.S,oy:s.oy-ay*st.S},k:1/st.S,flip:false,z:-lv*HS,fixedK:true,roofOf:r.bld,c3:true});
    }
  }
  // the moving parts (game/castle3d.js): the drawbridge and portcullis, every door; the drawbridge starts raised
  if(st?.moving){
    const mover=(kind_,anchor,ids,extra={})=>{const [ax,ay]=anchor,lv=hgt[I(Math.floor(ax),Math.floor(ay))],fr=ids.map(id=>({...roofStrip(id),roof:false}));
      // frame offsets are from the anchor's ground point (no elevation): z cancels the tile's
      props.push({kind:'scatter',x:ax,y:ay,spr:fr[0],k:1/st.S,flip:false,z:-lv*HS,fixedK:true,c3:true,c3move:{kind:kind_,frames:fr,f:0,...extra}});};
    mover('drawbridge',st.moving.drawbridge.anchor,st.moving.drawbridge.frames);
    mover('portcullis',st.moving.portcullis.anchor,st.moving.portcullis.frames);
    for(const d of st.moving.doors)mover('door',d.anchor,d.frames,{door:L.doors[d.i]});
  }
  {const D=map.drawbridge;D.tiles=[];rect(D.x0,D.hinge,D.x1-1,D.y1-1,(x,y,i)=>{D.tiles.push(i);map.block[i]=1;});D.down=false;D.lowering=false;
    // route planners (auto-play) may plan across it while it is up: it comes down as the hero nears it
    map.planOpen=(x,y)=>!D.down&&x>=D.x0&&x<D.x1&&y>=D.hinge&&y<D.y1;}
  map.castleKeep={x:KEEP[0],y:KEEP[1]};map.castleGarden=GDN;map.castleSiege=SG;map.castleVillage=[vx,vy];
  // the story's people: the herald by the road where the hero arrives, the lord in the keep's council chamber
  const council=room3('council').tiles;
  const story={herald:near([ENTRY[0]+3.5,ENTRY[1]-9],3),lord:near([(council[0]+council[2]+1)/2,(council[1]+council[3]+1)/2],2)};
  map.stepMask();   // (auto-play's road field reads it: built here, behind the loading screen)
  return {map,props,buildings,trees,wallHangings:[],townTiles:[...floors,...keepFloors,...castleCarpetTiles(),...castleRampartTops(),...castleRampartTops(KEEP_STONE),castlePlankTile()],looks,spawns,chests,torches:[],
    start:ENTRY,exit,shrine:sites[0],sites,scenarioId,seed,engines,tents,variant:V,story};
}

// ---------------------------------------------------------------- the variants' stories, dressed on the ground
// Each gets the generator's helpers (`P_` castle scatter by name, `T` town-pack props, `add`, `house`, `tent`, ...).
// Clear tiles (roads, yards, doorways) stay clear; anything set on masonry is dropped with the rest at the end.
const free=(s,x,y)=>{const X=Math.floor(x),Y=Math.floor(y),i=s.I(X,Y);if(!s.inb(X,Y)||s.map.block[i]||s.L.struct[i]||s.L.bld[i]||s.mat[i]===MAT.water)return false;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(s.inb(X+dx,Y+dy)&&s.L.kind[s.I(X+dx,Y+dy)]===K3.stair)return false;   // a stair's foot stays open
  return true;};
const ring=(s,cx,cy,r,k,fn)=>{for(let j=0;j<k;j++){const a=j/k*Math.PI*2,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(free(s,x,y))fn(x,y,j);}};
// props strewn at random over the free, unreserved ground of a box
const strew=(s,x0,y0,x1,y1,k,fn)=>{for(let t=0;t<k*12&&k>0;t++){const x=s.rng.range(x0,x1),y=s.rng.range(y0,y1),i=s.I(Math.floor(x),Math.floor(y));
  if(!free(s,x,y)||s.clear[i]||s.forest[i])continue;fn(x,y);k--;}};
const smokeAt=(s,x,y,rate=2.4,z=10)=>s.props.push({kind:'emitter',x,y,smoke:rate,smokeZ:z});
const STORY_SETS={
  // Blackfen: bog round the pools, drowned cottages sinking in the mud, lanterns on poles along the causeway, dead wood.
  bog(s){
    for(const [cx,cy,rx,ry] of s.P.pools||[])s.blob(cx,cy,rx+4,ry+4,(x,y,i)=>{if(s.mat[i]!==MAT.water&&!s.clear[i])s.mat[i]=s.n(x,y,3)>.45?MAT.mud:MAT.lush;},.4,4);
    for(const [cx,cy,rx,ry] of s.P.pools||[])ring(s,cx,cy,Math.max(rx,ry)+2,10,(x,y)=>s.T(s.rng.chance(.7)?'dry_reeds':'fallen_log',x,y,s.rng.range(22,34),false));
    s.blob(s.vx-18,s.vy+6,9,6,(x,y,i)=>{if(!s.clear[i]||s.mat[i]===MAT.dirt||s.mat[i]===MAT.meadow)s.mat[i]=MAT.mud;},.3,4);
    for(const [x,y] of [[s.vx-24,s.vy+2],[s.vx-16,s.vy+11]])if(free(s,x,y)&&free(s,x+3,y+3))s.house('cottage',x,y,s.rng.chance(.5),null,4);
    for(let y=s.MOAT.y1+12;y<s.vy-8;y+=7)for(const dx of [-4,5])if(free(s,s.gateX+dx,y))s.P_('lit_lantern',s.gateX+dx,y,{light:3.2});
    strew(s,20,20,s.L.rings[0].X0-14,280,26,(x,y)=>s.T(s.rng.pick(['t_dead_oak','hollow_stump','fallen_log','moss_boulder','mushrooms']),x,y,s.rng.range(26,90),true));
    strew(s,s.MOAT.x1+6,30,316,200,18,(x,y)=>s.T(s.rng.pick(['t_dead_oak','hollow_stump','moss_boulder','mushrooms']),x,y,s.rng.range(26,90),true));
  },
  // Solenne: pavilions and banners lining the bride's way from the gate to the keep, rose arches, a feast in the north
  // bailey, flowers everywhere; the rival suitor's army in the siege lines.
  wedding(s){
    const [kx,ky]=s.keepDoor;
    for(let y=s.gy-6;y>ky+4;y-=5)for(const dx of [-3.5,3])if(free(s,s.gateX+dx,y))s.P_(((s.gy-y)/5|0)%2?'banner_pole':'rose_trellis',s.gateX+dx,y);
    for(const [x,y] of [[kx-1,ky+1.5],[s.gateX,s.gy-4]])if(free(s,x,y))s.P_('ivy_arch',x,y,{solid:false});
    for(const [x,y,v] of [[s.R0.X0+12,s.R0.Y1-12,3],[s.R0.X0+20,s.R0.Y1-10,4],[s.R0.X1-14,s.R0.Y1-12,3],[s.R0.X1-22,s.R0.Y1-10,5],[s.vx-4,s.vy-12,3],[s.vx+6,s.vy-13,4]])
      if(free(s,x,y)&&free(s,x-1,y-1)&&free(s,x+1,y))s.tent(x,y,v);
    const fx=s.R0.X0+8,fy=s.R0.Y0+6;
    for(let r=0;r<3;r++){const y=fy+r*4;for(let x=fx;x<fx+30;x+=1.5)if(free(s,x,y))s.add('scatter_09_trestle_table','scatter',x,y,44,{solid:true});
      for(let x=fx+.5;x<fx+30;x+=3.2)if(free(s,x,y+1.4))s.P_(s.rng.pick(['guard_stool','guard_bench']),x,y+1.4);
      for(let x=fx+1;x<fx+30;x+=4)if(s.rng.chance(.7))s.P_(s.rng.pick(['stoneware_jugs','bread_basket','apple_sack']),x,y+.3,{solid:false});}
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,60,(x,y)=>s.P_(s.rng.pick(['flower_urn','rose_bush','potted_laurel','flower_box']),x,y));
    strew(s,s.vx-30,s.vy-24,s.vx+30,s.vy+20,40,(x,y)=>s.T('wildflowers',x,y,s.rng.range(16,24),false));
  },
  // Sunscar: drifts of sand over the fields and the bailey, thorn and deadwood, water casks and cisterns everywhere.
  desert(s){
    for(let k=0;k<26;k++){const x=s.rng.range(20,316),y=s.rng.range(20,290);s.blob(x,y,s.rng.range(6,16),s.rng.range(4,10),(xx,yy,i)=>{if(s.mat[i]!==MAT.water&&s.mat[i]!==MAT.road&&s.mat[i]!==MAT.pave&&!s.L.struct[i]&&!s.L.bld[i])s.mat[i]=MAT.sand;},.45,4);}
    s.rect(s.R0.X0+3,s.R0.Y0+3,s.R0.X1-3,s.R0.Y1-3,(x,y,i)=>{if((s.mat[i]===MAT.meadow||s.mat[i]===MAT.mid)&&s.n(x,y,5)>.42)s.mat[i]=MAT.sand;});
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,30,(x,y)=>s.P_(s.rng.pick(['water_cask','water_barrel','cistern_cover','rain_barrel_stand','stone_trough']),x,y));
    strew(s,10,10,326,294,70,(x,y)=>s.T(s.rng.pick(['t_dead_thorn','thorn_bush','fieldstone_cluster','t_storm_deadwood','dry_reeds']),x,y,s.rng.range(24,80),true));
    for(const [x,y] of [[s.vx-6,s.vy-12],[s.vx+8,s.vy-13],[s.vx-12,s.vy+12]])if(free(s,x,y)&&free(s,x-1,y-1))s.tent(x,y,6);
  },
  // Hoarfrost: the garrison frozen in its ranks in the bailey, braziers that never warm anyone, snowdrifts and firewood.
  frost(s){
    const [ax,ay]=s.P.practice||[s.gateX-10,s.gy-20];
    for(let r=0;r<3;r++)for(let c=0;c<7;c++){const x=ax+c*2.4,y=ay-6-r*2.6;if(free(s,x,y))s.P_(r===1&&c%3===1?'helmet_post':'armor_stand',x,y);}
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,18,(x,y)=>s.add('torch_06_unlit_brazier_SE','torches',x,y,46,{light:4.6,solid:true}));
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,24,(x,y)=>s.P_(s.rng.pick(['firewood_stack','statue_fragment','spear_bundle','leaned_shields']),x,y));
    strew(s,10,10,326,294,40,(x,y)=>s.T(s.rng.pick(['moss_boulder','fieldstone_cluster','fallen_log']),x,y,s.rng.range(24,40),true));
  },
  // Cinderhold: the west ward and the village burned: smoke rising from the ruins, rubble where houses stood, wrecked
  // carts, the Ashen Host's camp grown to twice its size.
  burned(s){
    const wx1=s.RI.X0-4;
    s.rect(s.R0.X0+3,s.R0.Y0+3,wx1,s.R0.Y1-3,(x,y,i)=>{if((s.mat[i]===MAT.meadow||s.mat[i]===MAT.mid||s.mat[i]===MAT.dirt)&&s.n(x,y,4)>.38)s.mat[i]=MAT.mud;});
    strew(s,s.R0.X0+4,s.R0.Y0+4,wx1,s.R0.Y1-4,26,(x,y)=>{s.P_(s.rng.pick(['large_rubble','rubble_pile','broken_wheel','broken_barrel']),x,y);if(s.rng.chance(.45))smokeAt(s,x,y,2.6,6);});
    // every other house in the village burned to its footings: rubble on the footprint, smoke, a fire still going
    const village=s.buildings.filter((b)=>b.fp===4&&Math.abs(b.cx-s.vx)<26&&Math.abs(b.cy-s.vy)<20);
    village.forEach((b,k)=>{if(k%2)return;s.buildings.splice(s.buildings.indexOf(b),1);
      for(let y=b.y0+.4;y<b.y0+b.fp;y+=1.3)for(let x=b.x0+.4;x<b.x0+b.fp;x+=1.3)s.P_(s.rng.pick(['large_rubble','rubble_pile','roof_slate_stack','broken_barrel']),x+s.rng.range(-.2,.2),y+s.rng.range(-.2,.2));
      smokeAt(s,b.cx,b.cy,3.6,12);s.P_('stone_firepit',b.cx+.3,b.cy+.2,{light:4,smoke:2.5});});
    for(const b of [[s.vx-30,s.vy-2],[s.vx+24,s.vy-14],[s.vx-4,s.vy+22]]){if(!free(s,b[0],b[1]))continue;
      for(const [dx,dy] of [[0,0],[1.6,.8],[-.8,1.4],[.6,-1.2]])s.P_(s.rng.pick(['large_rubble','rubble_pile','roof_slate_stack']),b[0]+dx,b[1]+dy);smokeAt(s,b[0],b[1],3.2,8);s.P_('stone_firepit',b[0]+2,b[1]+2.4,{light:3.4,smoke:2});}
    const SG=s.SG;
    for(const [x,y,v] of [[SG[0]-20,SG[1]+10,7],[SG[0]+20,SG[1]+8,7],[SG[0]-17,SG[1]+15,1],[SG[0]+15,SG[1]+17,7],[SG[0]-2,SG[1]+18,1]])if(free(s,x,y)&&free(s,x-1,y-1)&&free(s,x+1,y))s.tent(x,y,v);
    strew(s,10,10,326,294,36,(x,y)=>s.T(s.rng.pick(['t_storm_deadwood','hollow_stump','fallen_log','tiles_and_bricks','cart_debris']),x,y,s.rng.range(24,80),true));
  },
  // Mourncross: quarantine barricades across the approach, plague carts and stretchers by the infirmary, candles at the
  // cloister's gates, bonfires, and the graveyard spilled over into open graves.
  plague(s){
    const by=s.MOAT.y1+16;
    for(let x=s.gateX-14;x<=s.gateX+14;x+=1.4)if(Math.abs(x-s.gateX)>3&&free(s,x,by))s.P_(Math.round(x)%3?'wicker_barricade':'sharpened_stakes',x,by);
    for(const [x,y] of [[s.gateX-3.5,by+1.5],[s.gateX+3.5,by+1.5]])if(free(s,x,y))s.P_('stone_firepit',x,y,{light:4,smoke:3});
    if(s.P.barracks){const [ax,ay]=s.P.barracks;strew(s,ax-14,ay,ax-2,ay+24,14,(x,y)=>s.P_(s.rng.pick(['stretcher','stretcher','medicine_box','dressing_bowl','folded_blankets','covered_basket']),x,y,{solid:false}));}
    for(const g of s.gateInfo.filter((g)=>g.ring>0))for(const d of [-2.5,2.5]){const [x,y]=[g.out[0]+(g.dir[1]?d:0),g.out[1]+(g.dir[0]?d:0)];if(free(s,x,y))s.P_('lit_lantern',x,y,{light:3});}
    if(s.GY){const [gx,gy]=s.GY;s.rect(gx-14,gy+14,gx+14,gy+30,(x,y,i)=>{if(s.mat[i]!==MAT.water&&!s.clear[i]){s.mat[i]=s.n(x,y,3)>.5?MAT.mud:MAT.grave;s.forest[i]=0;s.clear[i]=1;}});
      for(let r=0;r<3;r++)for(let c=0;c<6;c++){const x=gx-11+c*4.4,y=gy+17+r*4.6;if(free(s,x,y))s.P_(c%2?'rubble_pile':'boundary_post',x,y);}}
    strew(s,s.vx-26,s.vy-16,s.vx+26,s.vy+20,12,(x,y)=>s.P_(s.rng.pick(['handcart','stretcher','covered_basket','broken_barrel']),x,y));
    for(const [x,y] of [[s.vx-10,s.vy-12],[s.vx+12,s.vy+14]])if(free(s,x,y))s.P_('stone_firepit',x,y,{light:4.5,smoke:4});
  },
  // Goldspire: a guard post at every gate, the treasury's carts and chests left where the thieves dropped them.
  treasury(s){
    for(const g of s.gateInfo)for(const d of [-3,3]){const [x,y]=[g.in[0]+(g.dir[1]?d:0)+g.dir[0]*2,g.in[1]+(g.dir[0]?d:0)+g.dir[1]*2];if(free(s,x,y))s.P_(d<0?'armor_stand':'spear_bundle',x,y);}
    const [kx,ky]=s.keepDoor;
    for(const [dx,dy,nm] of [[-6,3,'crate_stack'],[-4.4,4.2,'iron_chain'],[5,3.4,'tool_chest'],[6.6,4.4,'covered_supply_crate'],[-7,5.6,'handcart'],[7.4,2,'crate_stack'],[0,6,'broken_barrel']])if(free(s,kx+dx,ky+dy))s.P_(nm,kx+dx,ky+dy);
    for(const R of s.RG)for(const [x,y] of [[R.X0+5,R.Y1-5],[R.X1-5,R.Y1-5]])if(free(s,x,y))s.P_('banner_pole',x,y);
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,20,(x,y)=>s.P_(s.rng.pick(['crate_stack','covered_supply_crate','shield_rack','guard_stool','iron_bollard']),x,y));
  },
  // Morvane: cages hung along the approach, iron spikes and red banners at the bridge, the tithe table with its cups,
  // braziers burning all night.
  blood(s){
    for(let y=s.MOAT.y1+14;y<s.ENTRY[1]-10;y+=9)for(const dx of [-5,5.5])if(free(s,s.gateX+dx,y))s.P_(s.rng.chance(.6)?'empty_cage':'iron_spikes',s.gateX+dx,y);
    const by=s.MOAT.y1+9;
    for(const [nm,dx,dy] of [['trestle_table',-6,0],['stoneware_jugs',-6,.3],['banner_pole',-9,-1],['banner_pole',9,-1],['iron_spikes',-11,1],['iron_spikes',11,1]])if(free(s,s.gateX+dx,by+dy))s.P_(nm,s.gateX+dx,by+dy,nm==='stoneware_jugs'?{solid:false}:null);
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,14,(x,y)=>s.add('torch_06_unlit_brazier_SE','torches',x,y,46,{light:5,solid:true}));
    strew(s,10,10,326,294,40,(x,y)=>s.T(s.rng.pick(['t_dead_oak','t_dead_thorn','thorn_bush','hollow_stump']),x,y,s.rng.range(30,90),true));
  },
  // Hexenmere: witch-circles of standing stones round fires on the shore, cauldrons, drying herbs and potion jars, a
  // witch's cottage, mushrooms in the dark.
  witch(s){
    const spots=[[s.MOAT.x0-18,s.MOAT.y1-20],[s.MOAT.x1+18,s.MOAT.y0+30],[s.vx+26,s.vy-4]];
    if(s.P.lake)spots.push([s.P.lake[0]+s.P.lake[2]+8,s.P.lake[1]+12]);
    for(const [cx,cy] of spots){if(!free(s,cx,cy))continue;
      s.blob(cx,cy,6,6,(x,y,i)=>{if(s.mat[i]!==MAT.water){s.mat[i]=MAT.moss;s.clear[i]=1;s.forest[i]=0;}},.2);
      ring(s,cx,cy,4.4,9,(x,y,j)=>s.P_(j%3?'milestone':'boundary_post',x,y));s.P_('stone_firepit',cx,cy,{light:5,smoke:2.5});s.P_('cookpot',cx+1.2,cy+.6);}
    if(free(s,s.vx-26,s.vy+2)&&free(s,s.vx-23,s.vy+5))s.house('alchemist',s.vx-26,s.vy+2,false,null,4);
    strew(s,s.R0.X0+4,s.R0.Y0+4,s.R0.X1-4,s.R0.Y1-4,22,(x,y)=>s.P_(s.rng.pick(['herb_drying_rack','herb_bundle','bird_cage','cookpot','covered_basket']),x,y));
    strew(s,10,10,326,294,70,(x,y)=>s.T(s.rng.pick(['mushrooms','mushrooms','hollow_stump','t_dead_oak','moss_boulder']),x,y,s.rng.range(18,80),true));
  },
  // Thornwick: the harvest fair: stalls and striped tents on the town's lanes, hay, ale casks, a maypole, scarecrows
  // that may have moved.
  fair(s){
    const [vx,vy]=[s.vx,s.vy];
    for(const [x,y,v] of [[vx-24,vy+16,4],[vx+24,vy+18,3],[vx-30,vy-6,5],[vx+30,vy-4,4],[vx,vy+26,3]])if(free(s,x,y)&&free(s,x-1,y-1)&&free(s,x+1,y))s.tent(x,y,v);
    for(const [x,y] of [[vx-14,vy+18],[vx+12,vy+20],[vx-20,vy+26],[vx+20,vy+28],[vx-6,vy+30],[vx+4,vy+31]])if(free(s,x,y)){s.T('market_table',x,y,34);s.T(s.rng.pick(['vegetable_basket','potion_jars','grain_sacks','cloth_crate']),x+1.1,y+1.1,18,false);}
    if(free(s,vx,vy+20))s.P_('banner_pole',vx,vy+20);
    strew(s,vx-34,vy-14,vx+34,vy+34,30,(x,y)=>s.T(s.rng.pick(['hay_bale','closed_barrel','water_barrel','crate_stack','wildflowers']),x,y,s.rng.range(18,30),true));
    strew(s,10,150,330,294,12,(x,y)=>s.P_('practice_dummy',x,y));
  },
};
