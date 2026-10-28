// World renderer: floors, decals, depth-sorted walls/entities, effects, lighting, minimap.
import { G } from '../state.js';
import { camera, isoX, isoY, HW, HH, TW, TH } from '../core/view.js';
import { makeCanvas, TAU, clamp, rgba, shade, hexToRgb, measureCtx } from '../core/util.js';
import { drawDecals, drawEffects, drawParticles, drawTexts, lights, glowSprite, stampDecals, bakedDecals } from '../gfx/vfx.js';
import { orbitShieldDepth } from '../gfx/lancershields.js';
import { drawWallTorch, wallTorchRect } from '../gfx/walltorches.js';
import { drawWallHanging, wallHangingRect } from '../gfx/wallhangings.js';
import { replacementImage } from '../core/replacementart.js';
import { classSprite } from '../core/assets.js';
import { pixelSprite } from '../gfx/pixelart.js';
import { gritAt } from '../gfx/grit.js';
import { townFrame, townFrameOf, townMotion, isLying, TOWN_FRAME_W, TOWN_FRAME_H, TOWN_BASELINE } from './townsfolkvisuals.js';
import { drawEmote } from '../gfx/emotes.js';
import { drawTownProp, TOWN_PROP_KINDS } from '../gfx/townprops.js';
import { drawTownSpeech } from './townspeech.js';
import { drawPlayerChatBubbles } from './playerbubble.js';
import { homunculusPose } from '../gfx/homunculus.js';
import { enemyImage } from '../core/enemyart.js';
import { drawPetCorpse } from '../core/petart.js';
import { drawLootLabels } from './loot.js';
import { castleTileDressing, drawCastleParticles, drawCastleWater } from '../gfx/castleground.js';
import { drawRim, RIM, xray, drawXray } from './creature.js';
import { drawNebula } from '../gfx/breach.js';
import { drawWyrm } from '../gfx/breachdragon.js';
import { skyBack, skyWorld, skyFx, skyFront, drawSkyGate } from '../gfx/skyship.js';
import { drawCine } from './cinema.js';
import { obelisk } from './happenings.js';
import { endgameUnlocked } from './endgame.js';
import { heresyRankOf } from './heresies.js';
import { addLight } from '../gfx/vfx.js';
import { drawTerrain, drawColumn, occludersFor, occludersOfRect, occluderObj, clipAdd, hiddenBehind, standKey, hopZ, drawSky, terrainShade, HS } from '../gfx/terrain.js';

let lightCanvas = null, glowCanvas = null, vignette = null, vigKey = '';
const transitionSprites = new Map();
/**
 * Forget the canvases render.js baked (floor chunks, light falloff, vignette, labels): a GPU reset (the computer
 * slept, the tab sat in the background) can wipe accelerated canvases, and the floor would then draw black for good.
 * main.js calls this when the page is shown again or the screen canvas is restored; everything rebakes as it's drawn.
 */
export function dropBakes() {
  if (G.world) G.world.floorChunks = G.world.floorChunksFlux = null;
  falloff = null; vignette = null; vigKey = ''; lightCanvas = null; glowCanvas = null;
  transitionSprites.clear(); labels.clear();
}
// Non-vendor people and animals use the People and Animals pack (assets/sprites/people/, one sheet each).
// Vendors keep their existing painted replacement sprites.
// Cache original PNG sheets and recolored variants separately. Recolored
// sheets are Canvas elements, not HTMLImageElements (no .complete/.naturalWidth).
const townSheets=new Map();
const townPaletteSheets=new Map();
function townSheet(id) {
  if(!id)return null;
  let img=townSheets.get(id);
  if(!img){
    img=new Image();
    townSheets.set(id,img);
    img.src=`assets/sprites/people/${id}.webp`;
  }
  return img;
}
/** Let the townsfolk sheets go (a town visit decodes ~20-30 of them, 2 MB each) in levels without townsfolk. */
export function releaseTownSheets() { townSheets.clear(); townPaletteSheets.clear(); advPortraits.clear(); }
export function preloadTownSheets(ids) {
  const unique=[...new Set(ids.filter(Boolean))];
  return Promise.all(unique.map(id=>{
    const img=townSheet(id);
    if(img.complete)return Promise.resolve(img.naturalWidth>0);
    return new Promise(resolve=>{
      img.addEventListener('load',()=>resolve(true),{once:true});
      img.addEventListener('error',()=>resolve(false),{once:true});
    });
  }));
}
function townPaletteSheet(id,img,palette) {
  if(!img?.complete||!img.naturalWidth||!palette)return img;
  const key=`${id}:${palette.hue||0}:${palette.sat??1}:${palette.light||0}`;
  if(townPaletteSheets.has(key))return townPaletteSheets.get(key);
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(img,0,0);
  const pixels=q.getImageData(0,0,c.width,c.height),d=pixels.data,hueShift=(palette.hue||0)/360,hairShift=hueShift*.38,satScale=palette.sat??1,light=palette.light||0;
  const rgbToHsv=(r,g,b)=>{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let h=0;if(delta){if(max===r)h=((g-b)/delta)%6;else if(max===g)h=(b-r)/delta+2;else h=(r-g)/delta+4;h/=6;if(h<0)h++;}return [h,max?delta/max:0,max];};
  const hsvToRgb=(h,s,v)=>{const k=n=>(n+h*6)%6,f=n=>v-v*s*Math.max(0,Math.min(k(n),4-k(n),1));return [f(5),f(3),f(1)];};
  for(let y=0;y<c.height;y++){const localY=y%TOWN_FRAME_H;for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(d[i+3]<8)continue;let [h,s,v]=rgbToHsv(d[i],d[i+1],d[i+2]);const skin=h>=.012&&h<=.12&&v>.32;if(localY>38&&s>.16&&!skin)h=(h+hueShift+1)%1;else if(localY>8&&localY<66&&s>.14&&v<.46)h=(h+hairShift+1)%1;s=Math.max(0,Math.min(1,s*satScale));v=Math.max(0,Math.min(1,v+light));const rgb=hsvToRgb(h,s,v);d[i]=Math.round(rgb[0]*255);d[i+1]=Math.round(rgb[1]*255);d[i+2]=Math.round(rgb[2]*255);}}
  q.putImageData(pixels,0,0);townPaletteSheets.set(key,c);
  if(townPaletteSheets.size>48)townPaletteSheets.delete(townPaletteSheets.keys().next().value);
  return c;
}
/** A decoded PNG or a palette-adjusted Canvas both satisfy the frame contract. */
export function townFrameReady(sheet,count=10) {
  const width=sheet?.naturalWidth||sheet?.width||0,height=sheet?.naturalHeight||sheet?.height||0;
  return width>=TOWN_FRAME_W*count && height>=TOWN_FRAME_H;
}
const advPortraits=new Map();
function advPortrait(id){let img=advPortraits.get(id);if(!img){img=new Image();img.src=`assets/sprites/select/${id}.webp`;advPortraits.set(id,img);}return img.complete&&img.naturalWidth?img:null;}
export function townSprite(id,palette=null) {
  const img=townSheet(id);
  return img?.complete&&img.naturalWidth ? townPaletteSheet(id,img,palette) : null;
}
/** One painted pose of a person or animal at screen (sx, sy), feet there (a fallen body in the dungeon's remains). */
export function drawFolkPose(ctx,spriteId,pose,sx,sy,flip=false,alpha=1) {
  const sheet=townSprite(spriteId),f=townFrameOf(spriteId,pose);
  if(!sheet||f<0)return false;
  const H=66.7,W=H*TOWN_FRAME_W/TOWN_FRAME_H,foot=H*(TOWN_FRAME_H-TOWN_BASELINE)/TOWN_FRAME_H;
  ctx.save();ctx.translate(Math.round(sx),Math.round(sy));if(flip)ctx.scale(-1,1);if(alpha<1)ctx.globalAlpha=alpha;
  ctx.drawImage(sheet,f*TOWN_FRAME_W,0,TOWN_FRAME_W,TOWN_FRAME_H,-W/2,-H+foot,W,H);ctx.restore();
  return true;
}
const MATERIALS = [
  [/water|moat|pond|river|stream|lake/, '#75b9be'],
  [/dune|desert|sand(?!stone)/, '#e0bd78'],
  [/gravel|scree|pebble|salt|gypsum|grit|chips/, '#c7b19a'],
  [/clay|mud|earth|loam|silt|wadi|rut|soil/, '#a97952'],
  [/pav|brick|slab|stone|rock|basalt|bedrock|slate|limestone/, '#aaa69a'],
  [/ore|quartz|crystal|gem|seam/, '#8bc4c2'],
  [/ice|snow|frost/, '#b5d9df'],
  [/ash|lava|volcanic/, '#bd7654'],
  [/grass|moss|root|reed|oasis|meadow|lawn|clover|wildflower|battlement|shaded/, '#a2ad72'],
  [/wood|plank|board|palm/, '#c49a60'],
];

function floorMaterial(world, variant) {
  const floor = floorEntry(world, variant);
  const key = `${floor?.material || ''} ${floor?.surface || ''} ${floor?.name || ''}`.toLowerCase();
  for (const [pattern, color] of MATERIALS) if (pattern.test(key)) {
    const material = key.match(pattern)[0];
    if (world.biome?.id === 'castle') {
      const castleColors = {
        water: '#477f8b', grass: '#a4ad6c', gravel: '#c2b69a',
        clay: '#a77b52', mud: '#9b704d', earth: '#ae8155',
        stone: '#a7a69b', brick: '#ae8d70', wood: '#9a7048',
      };
      return { key: material, color: castleColors[material] || color };
    }
    return { key: material, color };
  }
  return null;
}

function stableHash(x, y, salt) {
  let h = Math.imul(x ^ 0x45d9f3b, 0x45d9f3b) ^ Math.imul(y ^ salt, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function transitionSprite(color, size) {
  const key = `${color}:${size}`;
  if (!transitionSprites.has(key)) {
    const sprite = makeCanvas(size, size), g = sprite.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, size, size);
    transitionSprites.set(key, sprite);
  }
  return transitionSprites.get(key);
}

/** Cache crisp, deterministic 2–4px flecks on shared edges between unlike materials. */
function buildTransitionParticles(world) {
  if (world.transitionParticles) return world.transitionParticles;
  const { map } = world, particles = [];
  if (map.castleMat || map.hgt) return (world.transitionParticles = particles); // the Castle dresses its own seams; terrain has cliffs   // the Castle dresses its own seams (gfx/castleground.js)
  const addEdge = (x, y, variant, nx, ny, nextVariant, x1, y1, x2, y2, salt) => {
    if (map.t[ny * map.w + nx] !== 1) return;
    const a = floorMaterial(world, variant), b = floorMaterial(world, nextVariant);
    if (!a || !b || a.key === b.key) return;
    const hash = stableHash(x, y, salt);
    // Leave gaps along long boundaries so particles read as scattered debris,
    // not a dotted outline around every material patch.
    if (hash % 3 !== 0) return;
    const count = 1 + ((hash >>> 1) % 2);
    const colors = [a.color, b.color];
    for (let i = 0; i < count; i++) {
      const seed = stableHash(x + i * 13, y - i * 7, salt ^ hash);
      // Scatter along and just across the seam instead of making a dotted line.
      const t = 0.12 + ((seed >>> 8) % 77) / 100;
      const offset = ((seed >>> 16) % 9) - 4;
      // Larger flecks survive normal zoom and read as scattered grit at dune
      // and stone seams, rather than a hairline dotted border.
      const size = 3 + ((seed >>> 21) % 4);
      particles.push({ x: x1 + (x2 - x1) * t + offset, y: y1 + (y2 - y1) * t - offset, color: colors[i], size });
    }
  };
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    if (map.t[i] !== 1) continue;
    const cx = (x - y) * HW, cy = (x + y) * HH;
    if (x + 1 < map.w) addEdge(x, y, map.v[i], x + 1, y, map.v[i + 1], cx + HW, cy, cx, cy + HH, 0x1b);
    if (y + 1 < map.h) addEdge(x, y, map.v[i], x, y + 1, map.v[i + map.w], cx, cy + HH, cx - HW, cy, 0x71);
  }
  world.transitionParticles = particles;
  return particles;
}

function drawTransitionParticles(ctx, world, vr) {
  const particles = buildTransitionParticles(world);
  if (!particles.length) return;
  ctx.imageSmoothingEnabled = false;
  for (const particle of particles) {
    if (particle.x < vr.x0 - 2 || particle.x > vr.x1 + 2 || particle.y < vr.y0 - 2 || particle.y > vr.y1 + 2) continue;
    ctx.drawImage(transitionSprite(particle.color, particle.size), particle.x - particle.size / 2, particle.y - particle.size / 2);
  }
}

function floorEntry(world, v) {
  if (world.townTiles) return world.townTiles[v] || world.townTiles[0];
  return world.tileset.floors[v] || world.tileset.floors[0];
}

/** The atlas slice a wall item (a wall arm, an arch slice or a door part) shows now; null for a shut door's leaf. */
function wallSlice(o) {
  if (o.kind !== 'door') return o.r;
  const d = o.door;
  if (o.part === 'leaf' && !d.open) return null;
  return d.art[d.open ? 'open' : 'closed'].find((p) => p.part === o.part) || null;
}
/** Its rect [x, y, w, h] in world px. */
function wallRect(o, k) {
  const r = wallSlice(o);
  return r && [isoX(o.x, o.y) + r.ox * k, isoY(o.x, o.y) + r.oy * k, r.w * k, r.h * k];
}

function drawWall(ctx, o, k, alpha) {
  const r = wallSlice(o);
  if (!r) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  // 0.25px of overlap hides hairline seams between neighbouring slices
  ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, isoX(o.x, o.y) + r.ox * k - 0.25, isoY(o.x, o.y) + r.oy * k - 0.25, r.w * k + 0.5, r.h * k + 0.5);
  if (alpha < 1) ctx.globalAlpha = 1;
}

function drawProp(ctx, pr, alpha) {
  const x = isoX(pr.x, pr.y), y = isoY(pr.x, pr.y) - (pr.z || 0);
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (TOWN_PROP_KINDS.has(pr.kind)) { drawTownProp(ctx, pr, G.time); if (alpha < 1) ctx.globalAlpha = 1; if (pr.talkT > 0) drawTownSpeech(ctx, pr, x, y - (pr.kind === 'axe_rack' ? 96 : 60)); return; }
  if (pr.kind === 'flame') {
    // a lit wall torch on a town building: a flickering flame over the pack's unlit torch head
    const fx = x + pr.fx, fy = y + pr.fy, f = Math.sin(G.time * 11 + pr.x * 3) * 0.5 + Math.sin(G.time * 17 + pr.y) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + f * 0.1;
    ctx.drawImage(glowSprite('#ff9a40'), fx - 20, fy - 26, 40, 40);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff7a20';
    ctx.beginPath(); ctx.ellipse(fx, fy - 4 - f, 2.6, 5 + f, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe080';
    ctx.beginPath(); ctx.ellipse(fx, fy - 3 - f * 0.5, 1.3, 2.8 + f * 0.5, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (pr.k) {
    // biome pack scatter: drawn from its ground pivot (ox/oy in native px), maybe mirrored about it
    const s = pr.spr, w = s.w * pr.k, h = s.h * pr.k, dy = y + s.oy * pr.k;
    if (pr.flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, s.ox * pr.k, dy, w, h); ctx.restore(); }
    else ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, x + s.ox * pr.k, dy, w, h);
  } else if (pr.sprite) {
    const img = pr._img || (pr._img = pixelSprite(pr.sprite, pr.pal || {}, 4));
    const px = pr.px || 2.4;
    const w = (img.width / 4) * px, h = (img.height / 4) * px;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.35, w * 0.15, 0, 0, TAU); ctx.fill();
    if (pr.sway) {
      ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, Math.sin(G.time * 1.3 + pr.x) * 0.03, 1, 0, 0);
      ctx.drawImage(img, -w / 2, -h + 2, w, h); ctx.restore();
    } else ctx.drawImage(img, x - w / 2, y - h + 2, w, h);
    if (pr.light) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + Math.sin(G.time * 8 + pr.x) * 0.1;
      ctx.drawImage(glowSprite('#ffb050'), x - 22, y - h - 14, 44, 44);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (alpha < 1 || pr.light) ctx.globalAlpha = 1;
}

/** A Dark Forest tree (gfx/darkforest.js): trunk and canopy drawn apart at the pack's split row, so the canopy
 * (and, right over the hero, the trunk) can fade where the tree stands in front of the hero. */
function treeFade(o, hx, hy) {
  const s = o.spr, k = o.k, w = s.w * k, x = isoX(o.x, o.y), y = isoY(o.x, o.y);
  const top = y + s.oy * k, cut = top + s.split * k, py = hy - 30;
  // a see-through window round the hero: every canopy in front of him within ~a tree and a half fades, nearest most
  const dx = Math.abs(hx - x), reach = w * 0.5 + 70;
  if (py > y + 10 || py < top - 30 || dx > reach) return null;
  const t = clamp((dx - w * 0.1) / (reach - w * 0.1), 0, 1);
  const canopy = 0.22 + 0.78 * t * t;
  const trunk = py > cut - 20 && dx < w * 0.3 ? 0.45 + 0.55 * t : 1;
  return canopy < 0.98 || trunk < 1 ? [canopy, trunk] : null;
}
/** The tree's fade for everyone behind it: the hero's wide window, and a tight one right round anyone else. */
function treeHides(o, d, views) {
  let f = null;
  for (const v of views) {
    if (d <= v.d + 0.3) continue;
    let g;
    if (v.hero) g = treeFade(o, v.x, v.y1 + 4);
    else {
      const s = o.spr, k = o.k, w = s.w * k, x = isoX(o.x, o.y), y = isoY(o.x, o.y), top = y + s.oy * k;
      const cy = (v.y0 + v.y1) / 2;
      if (Math.abs(v.x - x) > w * 0.3 || cy < top || cy > y + 10) continue;
      g = [0.5, cy > top + s.split * k - 20 ? 0.6 : 1];
    }
    if (g) f = f ? [Math.min(f[0], g[0]), Math.min(f[1], g[1])] : g;
  }
  return f;
}
function drawTree(ctx, pr, fade) {
  const s = pr.spr, k = pr.k, x = isoX(pr.x, pr.y), y = isoY(pr.x, pr.y), sp = s.split;
  ctx.save();
  if (pr.flip) { ctx.translate(x, 0); ctx.scale(-1, 1); }
  const bx = pr.flip ? 0 : x;
  if (!fade) ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, bx + s.ox * k, y + s.oy * k, s.w * k, s.h * k);
  else {
    ctx.globalAlpha = fade[0];
    ctx.drawImage(s.img, s.sx, s.sy, s.w, sp, bx + s.ox * k, y + s.oy * k, s.w * k, sp * k);
    ctx.globalAlpha = fade[1];
    ctx.drawImage(s.img, s.sx, s.sy + sp, s.w, s.h - sp, bx + s.ox * k, y + (s.oy + sp) * k, s.w * k, (s.h - sp) * k);
  }
  ctx.restore();
}

/** A town building's rect [x, y, w, h] in world px (town-pack art drawn from the building's centre). */
function buildingRect(b) {
  const s = b.spr, k = b.k, X = isoX(b.cx, b.cy);
  return [b.flip ? X - (s.ox + s.w) * k : X + s.ox * k, isoY(b.cx, b.cy) + s.oy * k, s.w * k, s.h * k];
}

// b.flip: mirrored, which moves the door to the building's other street face (world/town.js)
function drawBuilding(ctx, b, alpha) {
  const s = b.spr, [x, y, w, h] = buildingRect(b);
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (b.flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, 0, 0, w, h); ctx.restore(); }
  else ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, x, y, w, h);
  if (alpha < 1) ctx.globalAlpha = 1;
}

function drawChest(ctx, c) {
  const x = isoX(c.x, c.y), y = isoY(c.x, c.y);
  if (c.draw) return c.draw(ctx, x, y); // shrines, remains, cursed chests (game/happenings.js)
  const art = G.world && G.world.tileset && G.world.tileset.chest;
  const s = art && (c.opened ? (c.rare ? art.rareOpen : art.open) : (c.rare ? art.rareClosed : art.closed));
  if (s) {
    // the biome's chest art, sized off the closed chest so opening it doesn't change the scale
    const k = 46 / (c.rare ? art.rareClosed : art.closed).w, w = s.w * k, h = s.h * k;
    ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, x - w / 2, y + w / 4 - h, w, h);
    if (!c.opened) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(G.time * 3) * 0.15;
      ctx.drawImage(glowSprite(c.rare ? '#c080ff' : '#ffd060'), x - 28, y - 40, 56, 46);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, 16, 7, 0, 0, TAU); ctx.fill();
  const body = c.rare ? '#5a3a6a' : '#5a3a1a', trim = c.rare ? '#e0c0ff' : '#d0a040';
  // box faces
  ctx.fillStyle = shade(body, -0.2);
  ctx.beginPath(); ctx.moveTo(x - 14, y - 4); ctx.lineTo(x, y + 3); ctx.lineTo(x, y - 9); ctx.lineTo(x - 14, y - 16); ctx.fill();
  ctx.fillStyle = shade(body, -0.4);
  ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + 14, y - 4); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x, y - 9); ctx.fill();
  ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - 14, y - 10); ctx.lineTo(x, y - 3); ctx.lineTo(x + 14, y - 10); ctx.stroke();
  if (c.opened) {
    ctx.fillStyle = shade(body, 0.1);
    ctx.beginPath(); ctx.moveTo(x - 14, y - 16); ctx.lineTo(x, y - 9); ctx.lineTo(x + 2, y - 26); ctx.lineTo(x - 12, y - 33); ctx.fill();
  } else {
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(x - 14, y - 16); ctx.lineTo(x, y - 9); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x, y - 23); ctx.fill();
    ctx.strokeStyle = trim; ctx.beginPath(); ctx.moveTo(x - 7, y - 19.5); ctx.lineTo(x + 7, y - 12.5); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(G.time * 3) * 0.15;
    ctx.drawImage(glowSprite(c.rare ? '#c080ff' : '#ffd060'), x - 24, y - 34, 48, 40);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

/** Scenario shrines and objective markers are not teleport portals: render a fitted
 * isometric glyph/stone marker over the separate sculpted shrine prop.
 */
function drawScenarioGlyph(ctx, p) {
  const x=isoX(p.x,p.y),y=isoY(p.x,p.y),t=G.time,col=p.color||'#80c8ff';
  const shrine=p.type==='shrine',radius=shrine?21:14;
  ctx.save();
  ctx.globalAlpha=.52+Math.sin(t*3+p.x)*.16;
  ctx.strokeStyle=col;ctx.lineWidth=shrine?2:1.5;
  ctx.beginPath();ctx.ellipse(x,y+1,radius,radius*.46,0,0,TAU);ctx.stroke();
  ctx.beginPath();ctx.ellipse(x,y+1,radius*.69,radius*.28,0,-t*.4,4.4-t*.4);ctx.stroke();
  ctx.globalAlpha=.66;
  ctx.fillStyle=col;
  const z=shrine?68:36,tipY=y-z+Math.sin(t*2+p.y)*2;
  ctx.beginPath();ctx.moveTo(x,tipY-9);ctx.lineTo(x+7,tipY);
  ctx.lineTo(x,tipY+11);ctx.lineTo(x-7,tipY);ctx.closePath();ctx.fill();
  ctx.globalAlpha=.85;ctx.fillStyle='#f7f1d6';
  ctx.beginPath();ctx.moveTo(x,tipY-6);ctx.lineTo(x+2,tipY);
  ctx.lineTo(x,tipY+5);ctx.lineTo(x-2,tipY);ctx.closePath();ctx.fill();
  ctx.restore();
}
function drawPortal(ctx, p) {
  if (p.skygate) return drawSkyGate(ctx, p);
  if (p.type === 'shrine' || p.type === 'objective') return drawScenarioGlyph(ctx, p);
  const x = isoX(p.x, p.y), y = isoY(p.x, p.y);
  const active = p.active;
  const col = active ? p.color || '#ff5020' : '#5a5a60';
  const t = G.time;
  // floor rune ring and swirling vortex, a free-standing portal drawn 1.3x around its foot
  ctx.save();
  ctx.translate(x, y); ctx.scale(1.3, 1.3);
  ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 17, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 13, 0, t, t + 5); ctx.stroke();
  ctx.translate(0, -34);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = active ? 0.45 - i * 0.05 : 0.15;
    ctx.strokeStyle = i % 2 ? col : '#ffffff';
    ctx.lineWidth = 3 - i * 0.3;
    ctx.beginPath(); ctx.ellipse(0, 0, 18 - i * 2.4, 30 - i * 4, 0, t * (2 + i * 0.6), t * (2 + i * 0.6) + 4.2); ctx.stroke();
  }
  ctx.globalAlpha = active ? 0.8 : 0.25;
  ctx.drawImage(glowSprite(col), -26, -38, 52, 76);
  ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function drawCorpse(ctx, c) {
  const img = c._img || (c._img = (c.art && enemyImage(c.art, c.swap, 'dark')) || pixelSprite(c.sprite, c.pal, 6, { dark: true }));
  const px = (c.px || 2.3) * (c.scale || 1) / 6;
  const h = img._art ? c.artH * (c.scale || 1) : img.height * px, w = img._art ? h * img.width / img.height : img.width * px;
  const x = isoX(c.x, c.y), y = isoY(c.x, c.y);
  const fade = c.t > 34 ? 1 - (c.t - 34) / 6 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.translate(x, y - 4);
  ctx.scale(c.flip ? -1 : 1, 0.62);
  ctx.rotate(-Math.PI / 2 * 0.92);
  ctx.drawImage(img, -h * 0.1 - h * 0.45, -w / 2, w, h * 0.95);
  ctx.restore();
}

function drawNpc(ctx, n) {
  if (n.altar) { // the Altar of Heresy (docs/ENDGAME.md): a dark obelisk, lit in Velscour's red once the Endgame is open, a skull glow while a Heresy is on
    const x = isoX(n.x, n.y), y = isoY(n.x, n.y), open = endgameUnlocked(), lit = open && heresyRankOf() > 0;
    if (lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + Math.sin(G.time * 2.5) * 0.12; ctx.drawImage(glowSprite('#ff3020'), x - 48, y - 70, 96, 80); ctx.restore(); }
    obelisk(ctx, x, y, open ? '#ff3020' : '#606070', open, 44);
    if (open) addLight(n.x, n.y, 2.6, lit ? 0.9 : 0.5, 30, '#ff3020');
    n.sbox = [x - 18, y - 56, x + 18, y + 6];
    return;
  }
  if (n.stash) {
    const x = isoX(n.x, n.y), y = isoY(n.x, n.y);
    if (n.reliquary) { // a golden glow round the vault every hero shares
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(G.time * 2) * 0.12;
      ctx.drawImage(glowSprite('#ffd070'), x - 40, y - 46, 80, 64); ctx.restore();
    }
    drawChest(ctx, { x: n.x, y: n.y, rare: true, opened: !!(n.reliquary ? G.ui.reliquary && G.ui.reliquary.active : G.ui.stash && G.ui.stash.active) });
    n.sbox = [x - 24, y - 40, x + 24, y + 6];
    return;
  }
  if (n.hidden) { n.sbox = null; return; }
  // Vendors retain their existing hand-painted artwork, names and shops.
  // Only visitors/civilians use the animated townsfolk collection; visiting adventurers use their class portrait.
  const spriteId=n.vendor||n.adv?null:(n.townsfolkSpriteId||n.spriteId||n.townsfolkId);
  const sheet=spriteId?townSprite(spriteId,n.palette||null):null;
  // Painted art for vendors and scenario civilians (n.art); never hue-shifted class sprites (they came out green).
  const hom=n.vendor&&n.vendor.id==='upgrade'?homunculusPose(n.pose||'confident'):null; // Homunculus the Proud's 30 poses
  const vendorArt=hom?hom.img:n.vendor
    ? replacementImage('npc_'+n.vendor.id) || classSprite(n.vendor.sprite,180)
    : n.adv ? advPortrait(n.adv)
    : !spriteId && (n.art && replacementImage(n.art) || classSprite(n.sprite||'paladin',180));
  // a people cell is 256 x 200 with the feet on row 194; adults are 172 px tall in it, animals their own size
  const H=66.7, W=H*TOWN_FRAME_W/TOWN_FRAME_H, foot=H*(TOWN_FRAME_H-TOWN_BASELINE)/TOWN_FRAME_H;
  const vh=hom?hom.h:n.adv?54:58, vw=vendorArt?vh*vendorArt.width/vendorArt.height:0;
  const x = isoX(n.x, n.y), y = isoY(n.x, n.y);
  const m=townMotion(n.animT||0,!!n.walking,n.emotionT>0?n.emotion:null,!!n.running,n.animal?n.species:null);
  const frame=townFrame(n), lying=isLying(n);
  const ready=!!sheet&&townFrameReady(sheet,n.frameCount||10);
  const tall=(n.idleH||(n.child?150:172))*H/TOWN_FRAME_H, sw=n.animal?Math.max(5,tall*0.42):13;
  const alpha=n.alpha??1;
  // shadow: wider when lying down
  ctx.fillStyle = `rgba(0,0,0,${0.36*alpha})`;
  ctx.beginPath(); ctx.ellipse(x + m.dx, y, lying ? (n.animal ? sw * 1.4 : 22) : sw - m.bob * 0.6, (lying ? 7 : 6) * (n.animal ? Math.min(1, sw / 10) : 1) - m.bob * 0.25, 0, 0, TAU); ctx.fill();
  if (n.aura > 0) {
    // Homunculus's "holy" light (game/homunculus.js): really the axe's
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, n.aura) * (0.55 + Math.sin(G.time * 9) * 0.15);
    ctx.drawImage(glowSprite(n.auraCol || '#9fffc8'), x - 30, y - vh - 6, 60, vh + 14); ctx.restore();
  }
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(Math.round(x + m.dx), Math.round(y - m.bob));
  // a scripted motion (the Sky Battle's knights: hops, spins, faints, leaps between ships)
  const q=n.motion?n.motion():null;
  if(q){ctx.translate(q.dx||0,-(q.dy||0));if(q.flip)ctx.scale(-1,1);if(q.rot)ctx.rotate(q.rot);if(q.sx||q.sy)ctx.scale(q.sx||1,q.sy||1);}
  // squash and stretch about the feet, a lean into the walk, and the emotion's tilt; the facing mirrors it all
  if (n.flip) ctx.scale(-1, 1);
  ctx.rotate(m.rot + (n.walking ? m.lean : 0));
  ctx.scale(m.sx, m.sy);
  // the rim like the monsters': cyan round vendors and crafters, violet round everyone else (creature.js RIM)
  let top;
  const rim = n.vendor ? RIM.vendor : RIM.folk;
  if (vendorArt && !(n.adv && lying)) {
    drawRim(ctx, rim, vendorArt, 0, 0, vendorArt.width, vendorArt.height, -vw / 2, -vh, vw, vh);
    ctx.drawImage(vendorArt, -vw / 2, -vh, vw, vh); top = vh * m.sy;
  } else if (vendorArt) {
    // a fallen adventurer: the portrait laid on its side
    ctx.rotate(-Math.PI / 2);
    drawRim(ctx, rim, vendorArt, 0, 0, vendorArt.width, vendorArt.height, -vw / 2, -vh * 0.5 - 4, vw, vh);
    ctx.drawImage(vendorArt, -vw / 2, -vh * 0.5 - 4, vw, vh); top = vw * 0.6;
  } else if (ready) {
    drawRim(ctx, rim, sheet, frame * TOWN_FRAME_W, 0, TOWN_FRAME_W, TOWN_FRAME_H, -W / 2, -H + foot, W, H);
    ctx.drawImage(sheet, frame * TOWN_FRAME_W, 0, TOWN_FRAME_W, TOWN_FRAME_H, -W / 2, -H + foot, W, H); top = (lying ? Math.min(20, tall) : tall - 2) * m.sy;
  } else top = 50;
  ctx.restore();
  if (alpha < 1) ctx.globalAlpha = 1;
  const spriteY = y - m.bob - top;
  if (n.vendor) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(G.time * 3) * 0.1;
    ctx.drawImage(glowSprite('#ffd060'), x - 6, y - vh - 18, 12, 12);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  n.sbox = n.animal ? [x - Math.max(8, sw * 1.2), spriteY, x + Math.max(8, sw * 1.2), y] : [x - 16, spriteY, x + 16, y];
  n.viewH = top; // next frame's see-through hole in walls/buildings in front of them
  // an emotion bubble over the head (not while a speech bubble is up)
  if (n.icon && n.iconT > 0 && !(n.talkT > 0)) n.iconRect = drawEmote(ctx, n.icon, x + 10, spriteY + 2, n.iconAge || 0, n.iconT, G.time + (n.idleSeed || 0));
  else n.iconRect = null;
  if(n.bounty&&n.bounty.state!=='paid'){
    // a wanderer's bounty (game/wanderers.js): a bobbing gold "!" to take it, a silver "?" while it runs
    const offer=n.bounty.state==='offer',by=spriteY-16+Math.sin(G.time*4)*3;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.7;ctx.drawImage(glowSprite(offer?'#ffd040':'#c0d0ff'),x-16,by-22,32,32);ctx.restore();
    ctx.save();ctx.font='900 22px Cinzel, Georgia, serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#1a1006';ctx.fillStyle=offer?'#ffd040':'#d8e0ff';
    ctx.strokeText(offer?'!':'?',x,by);ctx.fillText(offer?'!':'?',x,by);ctx.restore();
  }
  drawTownSpeech(ctx,n,x,spriteY);
}

// Floors (tiles, grit, seam flecks) never change after generation, so they are baked into screen-aligned chunks of
// CW world px at the current device scale and blitted: ~6 drawImages a frame instead of hundreds. Chunks rebuild when
// the zoom/DPR changes; at most two are baked per frame, the rest of the view draws tile by tile until its turn.
const CW = 384;
// a Castle column top's grit and blended seams, as the flat floors get them (also when a column is redrawn over someone)
const castleDressWith = (force) => (g, w, tx, ty, px, py, f) => {
  const gr = gritAt(w, f, w.map.v[ty * w.map.w + tx], tx, ty, force);
  if (gr) g.drawImage(gr, px - HW, py);
  castleTileDressing(g, w, tx, ty, px, py, floorEntry);
};
const castleDress = castleDressWith(false), castleDressBake = castleDressWith(true);
let chunkBudgetFrame = -1, chunkBudget = 0;
function drawFloorTiles(ctx, world, x0, y0, x1, y1, force) {
  const map = world.map;
  if (map.hgt) return drawTerrain(ctx, world, x0, y0, x1, y1, floorEntry, map.castleMat ? (force ? castleDressBake : castleDress) : null); // height map: lifted columns and cliffs
  const tl = [(x0 / HW + y0 / HH) / 2, (y0 / HH - x0 / HW) / 2], br = [(x1 / HW + y1 / HH) / 2, (y1 / HH - x1 / HW) / 2];
  const tr = [(x1 / HW + y0 / HH) / 2, (y0 / HH - x1 / HW) / 2], bl = [(x0 / HW + y1 / HH) / 2, (y1 / HH - x0 / HW) / 2];
  const tx0 = clamp(Math.floor(tl[0]) - 1, 0, map.w - 1), tx1 = clamp(Math.ceil(br[0]) + 1, 0, map.w - 1);
  const ty0 = clamp(Math.floor(tr[1]) - 1, 0, map.h - 1), ty1 = clamp(Math.ceil(bl[1]) + 1, 0, map.h - 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * map.w + tx;
      if (map.t[i] !== 1) continue;
      const px = (tx - ty) * HW, py = (tx + ty) * HH;
      if (px < x0 - TW || px > x1 + TW || py < y0 - TH || py > y1 + TH) continue;
      const f = floorEntry(world, map.v[i]);
      ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, px - HW - 0.6, py - 0.6, TW + 1.2, TH + 1.2);
      const gr = gritAt(world, f, map.v[i], tx, ty, force);
      if (gr) ctx.drawImage(gr, px - HW, py);
      if (map.castleMat) castleTileDressing(ctx, world, tx, ty, px, py, floorEntry);
    }
  }
}
const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
/** Is a baked decal (vfx.js) already in every on-screen floor chunk it touches? Then the chunks draw it and drawDecals
 * skips it (chunks off screen don't count: they aren't drawn this frame). */
function decalStamped(fc, d, px, py) {
  const cx0 = Math.max(fc.cx0, Math.floor((px - d.r) / CW)), cx1 = Math.min(fc.cx1, Math.floor((px + d.r) / CW));
  const cy0 = Math.max(fc.cy0, Math.floor((py - d.r) / CW)), cy1 = Math.min(fc.cy1, Math.floor((py + d.r) / CW));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = fc.map.get(chunkKey(cx, cy));
    if (!c || c.dseq < d.seq) return false;
  }
  return true;
}
function drawFloors(ctx, world, vr, hq) {
  // The chunks are baked at the camera's zoom. While a cut scene glides it (game/cinema.js sets G.zoomFlux) they're
  // a second set, baked at the nearest of steps 12% apart (else every frame of a zoom bakes them all again) and at most
  // 2.4 device px a world px (a close-up's chunks would be 20-40 MB each on a phone, and the baked art holds 1.5), drawn
  // scaled; the game's own set waits for the scene to end.
  const zr = camera.zoom * G.dpr, flux = !!G.zoomFlux, z = flux ? Math.min(2.4, 2 ** (Math.round(Math.log2(zr) * 6) / 6)) : zr;
  const slot = flux ? 'floorChunksFlux' : 'floorChunks';
  const fc = world[slot] && world[slot].z === z ? world[slot] : (world[slot] = { z, map: new Map() });
  world.floorNow = fc;
  if (!flux && world.floorChunksFlux) world.floorChunksFlux = null;   // the scene is over: let its chunks go
  const tf = ctx.getTransform(), ox = tf.e, oy = tf.f;
  if (chunkBudgetFrame !== G.frame) { chunkBudgetFrame = G.frame; chunkBudget = G.touch ? 1 : 2; }
  const parts = buildTransitionParticles(world);
  const cx0 = Math.floor((vr.x0 - 8) / CW), cx1 = Math.floor((vr.x1 + 8) / CW);
  const cy0 = Math.floor((vr.y0 - 8) / CW), cy1 = Math.floor((vr.y1 + 8) / CW);
  // keep about two screens of baked chunks (each is (384 * zoom * dpr)^2 px of GPU memory; a fixed 24 was ~50 MB on
  // a high-DPI phone), enough to walk back and forth without rebaking
  const cap = Math.max(10, 2 * (cx1 - cx0 + 1) * (cy1 - cy0 + 1));
  fc.cx0 = cx0; fc.cx1 = cx1; fc.cy0 = cy0; fc.cy1 = cy1;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const key = chunkKey(cx, cy);
    let c = fc.map.get(key);
    const wx = cx * CW, wy = cy * CW;
    // device-px edges from the same rounding on both sides, so neighbouring chunks meet with no seam
    const dx0 = Math.round(ox + wx * zr), dy0 = Math.round(oy + wy * zr), dx1 = Math.round(ox + (wx + CW) * zr), dy1 = Math.round(oy + (wy + CW) * zr);
    if (!c && chunkBudget > 0) {
      chunkBudget--;
      const n = Math.ceil(CW * z);
      c = makeCanvas(n, n);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
      g.setTransform(n / CW, 0, 0, n / CW, -wx * n / CW, -wy * n / CW);
      drawFloorTiles(g, world, wx, wy, wx + CW, wy + CW, true);
      g.imageSmoothingEnabled = false;
      for (const pt of parts) {
        if (pt.x < wx - 4 || pt.x > wx + CW + 4 || pt.y < wy - 4 || pt.y > wy + CW + 4) continue;
        g.drawImage(transitionSprite(pt.color, pt.size), pt.x - pt.size / 2, pt.y - pt.size / 2);
      }
      if (world.map.castleMat) drawCastleParticles(g, world, wx, wy);
      c.dseq = 0;
      c.addEventListener('contextlost', () => { if (fc.map.get(key) === c) fc.map.delete(key); }); // (wiped by a GPU reset)
      fc.map.set(key, c);
      while (fc.map.size > cap) fc.map.delete(fc.map.keys().next().value);
    } else if (c) { fc.map.delete(key); fc.map.set(key, c); } // LRU touch
    // finished blood is stamped into the chunk once (vfx.js bakedDecals): no per-frame cost after that
    if (c && bakedDecals.length && bakedDecals[bakedDecals.length - 1].seq > c.dseq) {
      const g = c.getContext('2d'), n = c.width;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = hq;
      g.setTransform(n / CW, 0, 0, n / CW, -wx * n / CW, -wy * n / CW);
      c.dseq = stampDecals(g, c.dseq, wx, wy, wx + CW, wy + CW);
    }
    if (c) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(c, dx0, dy0, dx1 - dx0, dy1 - dy0);
      ctx.setTransform(tf);
    } else {
      ctx.save();
      ctx.beginPath(); ctx.rect(wx, wy, CW, CW); ctx.clip();
      drawFloorTiles(ctx, world, Math.max(wx, vr.x0), Math.max(wy, vr.y0), Math.min(wx + CW, vr.x1), Math.min(wy + CW, vr.y1), false);
      ctx.restore();
    }
  }
}

// The Castle's walls stand far taller than a tile: a static thing behind one (a prop, a tree, a building, a chest)
// has the columns in front of it drawn again over it, found once per thing (gfx/terrain.js occludersOfRect).
let occEnqueue = null;
function propRect(pr, px, py) {
  if (pr.spr && pr.k) {
    const s = pr.spr, k = pr.k, x0 = px + (pr.flip ? -s.ox - s.w : s.ox) * k, y0 = py + s.oy * k;
    return [x0, y0, x0 + s.w * k, y0 + s.h * k];
  }
  return [px - 40, py - 90, px + 40, py];
}
function occludeStatic(o, r, x = o.x, y = o.y, live = false) {
  const map = occEnqueue.map;
  let list = live ? null : o._occ;
  if (!r) { const px = isoX(x, y), py = isoY(x, y); r = [px - 40, py - 100, px + 40, py + 4]; }
  if (!list || o._occMap !== map) {
    list = occludersOfRect(map, r, standKey(x, y), map.hgt[map.tileIdx(x, y)]);
    if (!live) { o._occ = list; o._occMap = map; }
  }
  for (const i of list) {
    const c = occluderObj(map, i);
    if (c._f === G.frame) { clipAdd(c, r[0], r[1], r[2], r[3]); continue; }
    c._f = G.frame; c.clip = null; clipAdd(c, r[0], r[1], r[2], r[3]);
    occEnqueue.fn((i % map.w) + ((i / map.w) | 0) + 0.5, 14, c);
  }
}

/** Main world render. */
// the Castle's roofs: each building's whole roof eases out while the hero is inside it and back in once they leave
// (real time, so it reads the same at auto-play speed); a[bld] is that roof's opacity
const ROOF_FADE_S = 0.45;
function roofFade(world, heroBld) {
  const now = performance.now(), f = world._roofs || (world._roofs = { a: [], t: now });
  const step = Math.min(0.25, (now - f.t) / 1000) / ROOF_FADE_S;
  f.t = now;
  for (let k = 1; k < 8; k++) {
    const to = k === heroBld ? 0 : 1;
    f.a[k] = f.a[k] === undefined ? to : to > f.a[k] ? Math.min(to, f.a[k] + step) : Math.max(to, f.a[k] - step);
  }
  return f.a;
}

export function renderWorld(ctx, world) {
  const W = G.W * G.dpr, H = G.H * G.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (!world.map.voidFace || world.sky) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }   // (the Breach's void is opaque)
  if (world.tower) world.tower.draw(ctx); // the Serpentine Tower in three.js (gfx/tower3d.js), turning with the hero
  else if (world.cave) world.cave.draw(ctx); // the Depth's Edge Caverns in three.js (gfx/cave3d.js)
  else if (world.sky) skyBack(ctx, W, H, world); // the Sky Battle's sky and clouds (gfx/skyship.js)
  else if (world.map.voidFace) drawNebula(ctx, W, H, camera.x * camera.zoom * G.dpr, camera.y * camera.zoom * G.dpr); // the Breach's void
  else if (world.map.hgt && !world.map.castleMat && !world.map.noSky) drawSky(ctx, W, H, camera.x * camera.zoom * G.dpr, camera.y * camera.zoom * G.dpr, world.night);
  camera.apply(ctx);
  const camT = ctx.getTransform();
  ctx.imageSmoothingEnabled = true;
  // 'medium' (mipmapped) downscaling of the big floor/wall atlases costs several times 'low' per draw, and those are
  // most of the frame: tiles and walls always draw 'low'; sprites use 'low' on touch or when resolution is reduced.
  const hq = G.touch || (G.resScale || 1) < 0.95 ? 'low' : 'medium';
  ctx.imageSmoothingQuality = 'low';
  const vr = camera.viewRect(40);
  const map = world.map;

  // tile bounds of the view
  const corners = [[vr.x0, vr.y0 - 40], [vr.x1, vr.y0 - 40], [vr.x0, vr.y1 + 140], [vr.x1, vr.y1 + 140]].map(([wx, wy]) => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2]);
  const tx0 = clamp(Math.floor(Math.min(...corners.map((c) => c[0]))) - 1, 0, map.w - 1);
  const tx1 = clamp(Math.ceil(Math.max(...corners.map((c) => c[0]))) + 1, 0, map.w - 1);
  const ty0 = clamp(Math.floor(Math.min(...corners.map((c) => c[1]))) - 1, 0, map.h - 1);
  const ty1 = clamp(Math.ceil(Math.max(...corners.map((c) => c[1]))) + 1, 0, map.h - 1);

  if (world.sky) skyWorld(ctx, world); // the pirates' galleon and boats, behind the ship
  if (world.wyrm) drawWyrm(ctx, world.wyrm, 'void'); // the Breach's wyrm deep under the islands (gfx/breachdragon.js)
  if (!world.tower && !world.cave) drawFloors(ctx, world, vr, hq);
  if (map.castleMat) drawCastleWater(ctx, world, vr, G.time, G.touch);
  ctx.imageSmoothingQuality = hq;
  const fc = world.floorNow;
  drawDecals(ctx, vr, world.tower || world.cave ? () => false : (d, px, py) => decalStamped(fc, d, px, py)); // the tower turns: its blood can't bake
  const tall = map.hgt && map.tallOcclusion;
  for (const c of world.corpses) {
    if (tall && hiddenBehind(map, c.x, c.y)) continue; // behind the Castle's walls
    const px = isoX(c.x, c.y), py = isoY(c.x, c.y);
    if (px > vr.x0 - 40 && px < vr.x1 + 40 && py > vr.y0 - 40 && py < vr.y1 + 40) drawCorpse(ctx, c);
  }
  for (const f of world.fallen || []) drawPetCorpse(ctx, f, isoX(f.x, f.y), isoY(f.x, f.y));
  // ground layer hazards & effects
  // Reuse records by insertion index (sort rearranges the active array only).
  const frame = world.renderFrame || (world.renderFrame = { pool: [], sorted: [], top: [], walls: [] });
  const { pool, sorted, top, walls } = frame;
  sorted.length = 0; top.length = 0; walls.length = 0;
  const enqueue = (d, f, o, index = 0) => {
    const i = sorted.length, item = pool[i] || (pool[i] = {});
    item.d = d; item.f = f; item.o = o; item.index = index;
    sorted.push(item);
  };
  occEnqueue = { map, fn: enqueue };
  for (const h of world.hazards) {
    if (h.ground) h.draw(ctx);
    else if (h.shieldVariant && h.pos) {
      // Each rotating shield has its own world depth! The far-side shields
      // render BEFORE the Lancer; the near-side shields render AFTER him.
      // They also sort naturally between wall/door and creature slices.
      for (let i = 0; i < h.pos.length; i++) {
        const [x,y,a]=h.pos[i];
        enqueue(orbitShieldDepth(x,y,a),11,h,i);
      }
    }
    else if (typeof h.depth === 'number') enqueue(h.depth, 1, h);
    else top.push(h);
  }
  drawEffects(ctx, 'ground');

  // depth sorted pass
  const p = world.player;
  const pd = p ? p.x + p.y : 0;
  const heroBld = map.c3bld && p ? map.c3bld[map.tileIdx(p.x, p.y)] : 0;
  const roofA = map.c3bld ? roofFade(world, heroBld) : null;
  const ppx = p ? isoX(p.x, p.y) : 0, ppy = p ? isoY(p.x, p.y) : 0;
  // walls in front of the hero fade with screen distance and depth, so the narrow slices form a soft see-through hole
  // (a wide hole: the walls stand ~1.4 heroes tall, and fights next to the hero should stay in view)
  // every other creature (summons, monsters) and townsperson cuts its own smaller hole, sized by last frame's sprite
  // height, so nothing walking behind a wall, building or tree drops out of sight
  const views = frame.views || (frame.views = []);
  let nv = 0;
  let at = null;
  const look = (x, y, d, h, hero) => {
    if (x < vr.x0 - 60 || x > vr.x1 + 60 || y < vr.y0 - 20 || y > vr.y1 + 140) return;
    const v = views[nv] || (views[nv] = {}), k = Math.min(h, 110) / 46;
    nv++; v.x = x; v.y0 = y - h; v.y1 = y - 4; v.d = d; v.hero = hero; v.at = at;
    v.r = hero ? 24 : 10 * k; v.fall = hero ? 120 : 56 * k; v.hw = hero ? 16 : 8 * k;
  };
  if (p) { at = [p.x, p.y]; look(ppx, ppy, pd, 62, true); }
  for (const c of world.creatures) {
    if (c === p || c.dead || c.static || c.ghostDraw || c.hidden) continue;
    at = [c.x, c.y];
    look(isoX(c.x, c.y), isoY(c.x, c.y), c.x + c.y, c.viewH || 46 * (c.scale || 1), false);
  }
  for (const n of world.npcs) {
    if (n.stash || n.hidden || (n.alpha ?? 1) < 0.1) continue;
    at = [n.x, n.y];
    look(isoX(n.x, n.y), isoY(n.x, n.y), n.x + n.y, n.viewH || 56, false);
  }
  views.length = nv;
  // does rect r [x, y, w, h] at depth d hide someone?
  const hides = (r, d) => {
    for (const v of views) if (d > v.d && r[0] < v.x + v.hw && r[0] + r[2] > v.x - v.hw && r[1] < v.y1 && r[1] + r[3] > v.y0) return true;
    return false;
  };
  const cutaway = (r, d) => {
    if (!r) return 1;
    let a = 1;
    for (const v of views) {
      if (d <= v.d || r[1] > v.y1 - 8 || r[1] + r[3] < v.y0 - 30) continue;
      const t = clamp((Math.abs(r[0] + r[2] / 2 - v.x) - v.r) / v.fall, 0, 1);
      a = Math.min(a, 1 - (1 - (0.16 + 0.84 * t * t * (3 - 2 * t))) * Math.min(1, (d - v.d) * 1.5));
    }
    return a;
  };
  const wk = world.tileset && world.tileset.k;
  map.wallsIn(tx0 - 3, ty0 - 3, tx1 + 4, ty1 + 4, walls);
  for (const s of walls) {
    const r = wallSlice(s);
    if (!r) continue;
    const x = isoX(s.x, s.y) + r.ox * wk, y = isoY(s.x, s.y) + r.oy * wk;
    if (x - 1 > vr.x1 || x + r.w * wk + 1 < vr.x0 ||
        y - 1 > vr.y1 || y + r.h * wk + 1 < vr.y0) continue;
    enqueue(s.depth, 2, s);
  }
  // A wall-holder shares the same depth pass as its wall, so it fades with
  // an occluding front wall and doesn't float above the player or doors.
  for (const t of world.torches) {
    const px=isoX(t.mountX??t.x,t.mountY??t.y);
    const py=isoY(t.mountX??t.x,t.mountY??t.y);
    if(px<vr.x0-120||px>vr.x1+120||py<vr.y0-120||py>vr.y1+90)continue;
    enqueue(t.depth??(t.x+t.y),12,t);
  }
  for (const item of world.wallHangings) {
    const px=isoX(item.mountX,item.mountY), py=isoY(item.mountX,item.mountY);
    if(px<vr.x0-100||px>vr.x1+100||py<vr.y0-110||py>vr.y1+70)continue;
    enqueue(item.depth??(item.mountX+item.mountY),13,item);
  }
  for (const pr of world.props) {
    const px = isoX(pr.x, pr.y), py = isoY(pr.x, pr.y);
    // Tall outdoor trees are grounded well below their canopy; cull by the full
    // sprite bounds, not just its trunk's ground pivot, to prevent popping.
    if (pr.spr && pr.k) {
      const s = pr.spr, k = pr.k;
      const x0 = px + (pr.flip ? -s.ox - s.w : s.ox) * k;
      const y0 = py + s.oy * k;
      if (x0 > vr.x1 + 8 || x0 + s.w * k < vr.x0 - 8 ||
          y0 > vr.y1 + 8 || y0 + s.h * k < vr.y0 - 8) continue;
    } else if (pr.caveProp) {   // the caves' baked rock (game/caverns.js): columns stand tall, stalactites hang high
      const y1 = py - (pr.z || 0) + 12;
      if (px < vr.x0 - 100 || px > vr.x1 + 100 || y1 < vr.y0 || y1 - 340 > vr.y1) continue;
    } else if (px < vr.x0 - 100 || px > vr.x1 + 100 || py < vr.y0 - 40 || py > vr.y1 + 220) continue;
    enqueue(pr.x + pr.y, 4, pr);
    if (tall) occludeStatic(pr, propRect(pr, px, py));
  }
  // the Dark Forest's trees: only the buckets around the view (a tree's base may sit well below it)
  const tc = map.treeCells;
  if (tc) {
    const bx0 = Math.max(0, Math.floor((tx0 - 2) / tc.B)), bx1 = Math.min(tc.bw - 1, Math.floor((tx1 + 12) / tc.B));
    const by0 = Math.max(0, Math.floor((ty0 - 2) / tc.B)), by1 = Math.min(tc.bh - 1, Math.floor((ty1 + 12) / tc.B));
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) for (const pr of tc.cells[by * tc.bw + bx]) {
      const s = pr.spr, k = pr.k, px = isoX(pr.x, pr.y), x0 = px + (pr.flip ? -s.ox - s.w : s.ox) * k, y0 = isoY(pr.x, pr.y) + s.oy * k;
      if (x0 > vr.x1 + 8 || x0 + s.w * k < vr.x0 - 8 || y0 > vr.y1 + 8 || y0 + s.h * k < vr.y0 - 8) continue;
      enqueue(pr.x + pr.y, 4, pr);
      if (tall) occludeStatic(pr, [x0, y0, x0 + s.w * k, y0 + s.h * k]);
    }
  }
  for (const b of world.buildings) {
    const [x,y,w,h] = buildingRect(b);
    if (x > vr.x1+24 || x+w < vr.x0-24 || y > vr.y1+24 || y+h < vr.y0-24) continue;
    enqueue(b.depth, 5, b);
    if (tall) occludeStatic(b, [x, y, x + w, y + h], b.cx, b.cy);
  }
  for (const c of world.creatures) {
    if (c.dead) continue;
    const px = isoX(c.x, c.y), py = isoY(c.x, c.y);
    if (px < vr.x0 - 80 || px > vr.x1 + 80 || py < vr.y0 - 40 || py > vr.y1 + 160) { c.sbox = null; continue; }
    enqueue(c.x + c.y + (c.fly ? 0.2 : 0), 6, c);
  }
  const closeEnough = (x,y,marginX=90,marginY=130) => {
    const px=isoX(x,y),py=isoY(x,y);
    return px >= vr.x0-marginX && px <= vr.x1+marginX && py >= vr.y0-marginY && py <= vr.y1+marginY;
  };
  for (const n of world.npcs) {
    if (!closeEnough(n.x,n.y)) { n.sbox=null; continue; }
    enqueue(n.x + n.y, 7, n);
  }
  for (const l of world.loot) if (closeEnough(l.x,l.y,50,75)) { enqueue(l.x + l.y - 0.2, 8, l); if (tall) occludeStatic(l, null, l.x, l.y, true); }
  for (const c of world.chests) if (closeEnough(c.x,c.y,70,80)) { enqueue(c.x + c.y, 9, c); if (tall) occludeStatic(c, null); }
  for (const po of world.portals) if (closeEnough(po.x,po.y,95,150)) { enqueue(po.x + po.y, 10, po); if (tall) occludeStatic(po, null); }
  if (map.hgt) {
    // a height map sorts by the tile stood on (gfx/terrain.js standKey), so a column rising in front of someone can
    // be drawn again over them; offsets in the keys (fliers, loot) are kept
    for (const it of sorted) {
      const o = it.o;
      if (it.f === 2 || it.f === 11 || !o || typeof o.x !== 'number' || typeof o.y !== 'number') continue;
      it.d = standKey(o.x, o.y) + (it.d - o.x - o.y);
    }
    for (const v of views) v.d = standKey(...v.at);
    const occ = frame.occ || (frame.occ = []);
    occ.length = 0;
    if (!world.cave) occludersFor(map, vr, views, occ); // the caves' 3D terrain hides its own (game/caverns.js horizon)
    for (let i = 0; i < occ.length; i += 2) enqueue(occ[i], 14, occ[i + 1]);
  }
  sorted.sort((a, b) => a.d - b.d);
  let q = hq;
  xray.n = 0; xray.on = true; // creatures note their rims and bars for the see-through layer (drawSeeThrough)
  for (const it of sorted) {
    const o = it.o, lq = it.f === 2 ? 'low' : hq;
    if (lq !== q) ctx.imageSmoothingQuality = q = lq;
    switch (it.f) {
      case 1: o.draw(ctx); break;
      case 2: drawWall(ctx, o, wk, cutaway(wallRect(o, wk), o.depth)); break;
      case 4: {
        if (o.caveProp) { if (world.cave) world.cave.drawProp(ctx, o, it.d, views); break; }
        if (o.tree) { drawTree(ctx, o, treeHides(o, it.d, views)); break; }
        let a = 1;
        if (o.roofOf) {   // a Castle building's roof (gfx/castle3dart.js): fades off while the hero is inside, faded over anyone behind
          const ra = roofA[o.roofOf] ?? 1;
          if (ra <= 0.01) break;
          const s = o.spr, rx = isoX(o.x, o.y) + s.ox * o.k, ry = isoY(o.x, o.y) + (o.z ? -o.z : 0) + s.oy * o.k;
          drawProp(ctx, o, Math.min(ra, hides([rx, ry, s.w * o.k, s.h * o.k], it.d) ? 0.32 : 1));
          break;
        }
        if (o.spr || (o.sprite === 'tree' || o.sprite === 'pine')) {
          const px = isoX(o.x, o.y), py = isoY(o.x, o.y);
          for (const v of views) {
            const fy = v.y1 + 4;
            if (it.d > v.d + 0.5 && Math.abs(px - v.x) < (v.hero ? 40 : 24) && py > fy - 8 && py - 90 < fy) { a = 0.35; break; }
          }
        }
        drawProp(ctx, o, a);
        break;
      }
      case 5: {
        const [x, y, w, h] = buildingRect(o);
        const a = hides([x + w * 0.15, y, w * 0.7, h * 0.85], o.depth) ? 0.4 : 1;
        drawBuilding(ctx, o, a);
        break;
      }
      case 6: {
        const oldZ=o.z||0;
        const hz=map.hgt&&!map.smoothField?hopZ(o,map):0; // hopping up or dropping down a step of the terrain (a smooth field has none)
        if(hz)o.z=oldZ+hz;
        const hc=world.cave?world.cave.horizon(o):null; // behind higher ground in the caves: hidden below its edge
        if(hc===-Infinity){ // drawn under an empty clip all the same: its rim and bar still show on the see-through layer
          ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();o.draw(ctx);ctx.restore();
          if(hz)o.z=oldZ;o.sbox=null;break;
        }
        if(hc!==null){ctx.save();ctx.beginPath();ctx.rect(vr.x0-200,vr.y0-900,vr.x1-vr.x0+400,hc-(vr.y0-900));ctx.clip();}
        o.draw(ctx);
        if(hc!==null)ctx.restore();
        if(hz)o.z=oldZ;
        const img = o.spriteImage();
        const [w, h] = o.spriteDims(img);
        const [sx, sy] = camera.tileToScreen(o.x, o.y, oldZ + hz + (o.fly ? 16 : 0));
        const z = camera.zoom;
        o.sbox = [sx - (w / 2) * z, sy - h * z, sx + (w / 2) * z, sy];
        o.viewH = h + (o.fly ? 16 : 0); // next frame's see-through hole
        if (o === G.player && o.talkT > 0 && world.kind === 'town') drawTownSpeech(ctx, o, isoX(o.x, o.y), isoY(o.x, o.y) - Math.min(70, h)); // chatting at the forge
        break;
      }
      case 7: drawNpc(ctx, o); break;
      case 8: o.draw(ctx); break;
      case 9: drawChest(ctx, o); break;
      case 10: drawPortal(ctx, o); break;
      case 11: o.drawShield(ctx,it.index); break;
      case 12: drawWallTorch(ctx,o,world.biome,G.time,
        cutaway(wallTorchRect(o),it.d)); break;
      case 13: drawWallHanging(ctx,o,world.biome,
        cutaway(wallHangingRect(o,world.biome),it.d)); break;
      case 14: {
        // a column redrawn over what stands behind it (on the Castle clipped to those things: whole, its faces would
        // spill over neighbours in front that aren't redrawn)
        const c = o.clip;
        if (c) { ctx.save(); ctx.beginPath(); ctx.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]); ctx.clip(); }
        drawColumn(ctx, world, o.ti, floorEntry, map.castleMat ? castleDress : null, !!o.over);
        if (c) ctx.restore();
        break;
      }
    }
  }
  xray.on = false;
  if (q !== hq) ctx.imageSmoothingQuality = hq;
  if (tall && p && !p.dead && views[0]?.hero && views[0].hid === G.frame) {
    // the hero behind one of the Castle's walls: a faint silhouette over it, so he is never lost from sight
    const hz = hopZ(p, map), oldZ = p.z || 0, oldA = p.alpha;
    p.z = oldZ + hz; p.alpha = 0.42; p.draw(ctx); p.z = oldZ; p.alpha = oldA;
    ctx.globalAlpha = 1;
  }
  if (world.tower) world.tower.front(ctx); // the tower's railings and chandeliers over whoever stands behind them
  if (G.debugWalk) {
    // test shots only: blocked tiles red and the tiles a test points at (G.debugMarks) cyan, to check art against collision
    const tile = (tx, ty, c) => {
      const px = (tx - ty) * HW, py = (tx + ty) * HH;
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + HW, py + HH); ctx.lineTo(px, py + TH); ctx.lineTo(px - HW, py + HH); ctx.fill();
    };
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (map.block[ty * map.w + tx]) tile(tx, ty, 'rgba(255,0,0,0.22)');
    for (const [tx, ty] of G.debugMarks || []) tile(tx, ty, 'rgba(0,255,255,0.55)');
  }
  if (world.sky) skyFx(ctx, world); // furnaces, braziers, chains, cannon shot, lightning
  if (world.wyrm) drawWyrm(ctx, world.wyrm, 'top'); // the Breach's wyrm flying over everything
  drawParticles(ctx, vr);
  for (const h of top) h.draw(ctx);
  ctx.globalCompositeOperation = 'lighter';
  drawEffects(ctx, 'top');
  ctx.globalCompositeOperation = 'source-over';

  // ---------------------------------------------------------- screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawLighting(ctx, world);
  if (world.sky) skyFront(ctx, W, H, world, Math.min(0.05, G.dt || 0.016)); // rain, snow, ash, wind, fog, lightning
  drawSeeThrough(ctx, world, camT, hq, tx0, ty0, tx1, ty1);
  if (G.hurtFlash > 0) {
    ctx.fillStyle = `rgba(160,0,0,${Math.min(0.45, G.hurtFlash)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,250,230,${Math.min(0.8, G.flash)})`; ctx.fillRect(0, 0, W, H); }
  if (p && p.hp < p.maxHp * 0.3 && !p.dead) {
    ctx.fillStyle = `rgba(120,0,0,${0.15 + Math.sin(G.time * 6) * 0.08})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (!G.cine) {   // a cut scene's frame shows the actors, not the loot's names (game/cinema.js)
    drawOverheadNames(ctx, world);
    G.lootBoxes = drawLootLabels(ctx, world, G.input && G.input.lastPointerType === 'mouse' ? G.input.mouse : null);
  } else G.lootBoxes = [];
  drawTexts(ctx);
  if (!G.cine) drawPlayerChatBubbles(ctx, world);
  drawCine(ctx, W, H);
  // Keep capacity without retaining creatures/loot that have left the world.
  for (const item of pool) item.o = null;
  top.length = 0;
}

// The see-through layer, over the lit scene: the wall bases (Settings, off by default), then every creature's rim and
// life bar in depth order (creature.js drawXray), each body cutting out whatever it stands in front of. One canvas the
// size of the screen; only the box round what was drawn is cleared and blitted.
let seeCanvas = null;
const seeBox = [0, 0, 0, 0], seeLast = [0, 0, 0, 0];
function drawSeeThrough(ctx, world, camT, hq, tx0, ty0, tx1, ty1) {
  const st = G.settings, W = ctx.canvas.width, H = ctx.canvas.height;
  const walls = st.wallLines === true && world.kind === 'dungeon' && !world.biome.overworld;
  if (!xray.n && !walls) return;
  if (!seeCanvas || seeCanvas.width !== W || seeCanvas.height !== H) { seeCanvas = makeCanvas(W, H); seeLast.fill(0); }
  const oc = seeCanvas.getContext('2d'), box = seeBox;
  oc.setTransform(1, 0, 0, 1, 0, 0);
  if (seeLast[2] > seeLast[0]) oc.clearRect(seeLast[0], seeLast[1], seeLast[2] - seeLast[0], seeLast[3] - seeLast[1]);
  oc.imageSmoothingQuality = hq;
  box[0] = box[1] = Infinity; box[2] = box[3] = -Infinity;
  const under = walls && drawWallBases(oc, world.map, camT, tx0, ty0, tx1, ty1);
  if (under) { box[0] = box[1] = 0; box[2] = W; box[3] = H; }
  drawXray(oc, camT, st.outlines !== false, box, under);
  const x0 = Math.max(0, Math.floor(box[0]) - 2), y0 = Math.max(0, Math.floor(box[1]) - 2);
  const x1 = Math.min(W, Math.ceil(box[2]) + 2), y1 = Math.min(H, Math.ceil(box[3]) + 2);
  seeLast[0] = x0; seeLast[1] = y0; seeLast[2] = Math.max(x0, x1); seeLast[3] = Math.max(y0, y1);
  if (x1 > x0 && y1 > y0) ctx.drawImage(seeCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
}

// Settings › wall outlines: a line along every wall's foot (the floor's edge against the void), where the hero has seen
function drawWallBases(oc, map, camT, tx0, ty0, tx1, ty1) {
  const { t, w, seen } = map;
  oc.setTransform(camT);
  oc.beginPath();
  let n = 0;
  const seg = (ax, ay, bx, by) => { oc.moveTo((ax - ay) * HW, (ax + ay) * HH); oc.lineTo((bx - by) * HW, (bx + by) * HH); n++; };
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const i = y * w + x;
    if (t[i] !== 1 || !seen[i]) continue;
    if (!map.tile(x - 1, y)) seg(x, y, x, y + 1);
    if (!map.tile(x + 1, y)) seg(x + 1, y, x + 1, y + 1);
    if (!map.tile(x, y - 1)) seg(x, y, x + 1, y);
    if (!map.tile(x, y + 1)) seg(x, y + 1, x + 1, y + 1);
  }
  if (!n) return false;
  const z = camera.zoom;
  oc.lineCap = oc.lineJoin = 'round';
  oc.strokeStyle = 'rgba(0,0,0,0.75)'; oc.lineWidth = 3.5 / z; oc.stroke();
  oc.strokeStyle = 'rgba(240,226,192,0.95)'; oc.lineWidth = 1.5 / z; oc.stroke();
  return true;
}

/** The light falloff (alpha 1 at the centre to 0 at the rim), drawn with 'destination-out' to cut the darkness. */
let falloff = null;
function lightSprite() {
  if (falloff) return falloff;
  falloff = makeCanvas(64, 64);
  const x = falloff.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return falloff;
}

function drawLighting(ctx, world) {
  const W = G.W * G.dpr, H = G.H * G.dpr;
  const b = world.biome;
  // The quarter-resolution lighting framebuffer is still expensive at retina
  // resolutions. A sixth-resolution buffer keeps the same falloff and avoids
  // repeated full-screen GPU traffic on memory-limited phones.
  const divisor = G.touch ? 6 : 4;
  const lw = Math.ceil(W / divisor), lh = Math.ceil(H / divisor);
  if (!lightCanvas || lightCanvas.width !== lw || lightCanvas.height !== lh) lightCanvas = makeCanvas(lw, lh);
  const lc = lightCanvas.getContext('2d');
  lc.globalCompositeOperation = 'source-over';
  lc.globalAlpha = 1;
  lc.clearRect(0, 0, lw, lh);
  const [fr, fg, fb] = hexToRgb(b.fog || '#000000');
  lc.fillStyle = `rgba(${fr},${fg},${fb},${Math.max(b.dark, (world.darkK || 0) * 0.94)})`;
  lc.fillRect(0, 0, lw, lh);
  lc.globalCompositeOperation = 'destination-out';
  const scale = (HW * 1.25 * camera.zoom * G.dpr) / divisor;
  const p = world.player, spr = lightSprite();
  const add = (x, y, r, inten, z = 20) => {
    const [sx, sy] = camera.tileToScreen(x, y, z);
    const cx = (sx * G.dpr) / divisor, cy = (sy * G.dpr) / divisor, rr = r * scale;
    if (cx + rr < 0 || cy + rr < 0 || cx - rr > lw || cy - rr > lh) return false;
    lc.globalAlpha = Math.min(1, inten);
    lc.drawImage(spr, cx - rr, cy - rr, rr * 2, rr * 2);
    return true;
  };
  if (p) add(p.x,p.y,b.light*(1+(p.st.lightPct||0)),1,20);
  // the Castle: lights inside a building stay under its roof, showing as the roof fades off round the hero
  const bld = world.map.c3bld, W_ = world.map.w, ra = world._roofs?.a;
  const roofed = (l) => { if (!bld) return 0; const k = bld[Math.floor(l.y) * W_ + Math.floor(l.x)]; return k > 0 ? (ra?.[k] ?? 1) : 0; };
  let visibleLights=0;
  for (const l of lights) {
    const r = roofed(l);
    if (r >= 0.99) continue;
    if (add(l.x, l.y, l.radius, l.intensity * 0.85 * (1 - r), l.z ?? 20)) visibleLights++;
    if (G.touch && visibleLights >= 48) break;
  }
  // the vignette is baked into the same quarter-res layer, so the screen takes one full-size blit, not two
  const key = lw + 'x' + lh;
  if (vigKey !== key) {
    vigKey = key;
    vignette = makeCanvas(lw, lh);
    const v = vignette.getContext('2d');
    const g = v.createRadialGradient(lw / 2, lh / 2, Math.min(lw, lh) * 0.35, lw / 2, lh / 2, Math.max(lw, lh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    v.fillStyle = g; v.fillRect(0, 0, lw, lh);
  }
  lc.globalAlpha = 1;
  lc.globalCompositeOperation = 'source-over';
  lc.drawImage(vignette, 0, 0);
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(lightCanvas, 0, 0, W, H);
  // coloured glow: torches, portals and spells wash their colour over the scene (one more low-res blit)
  if (G.settings.glow !== false) {
    if (!glowCanvas || glowCanvas.width !== lw || glowCanvas.height !== lh) glowCanvas = makeCanvas(lw, lh);
    const gc = glowCanvas.getContext('2d');
    gc.globalCompositeOperation = 'source-over'; gc.globalAlpha = 1;
    gc.clearRect(0, 0, lw, lh);
    gc.globalCompositeOperation = 'lighter';
    let n = 0;
    for (const l of lights) {
      if (!l.color || roofed(l)) continue;
      const [sx, sy] = camera.tileToScreen(l.x, l.y, l.z ?? 20);
      const cx = (sx * G.dpr) / divisor, cy = (sy * G.dpr) / divisor, rr = l.radius * scale * 0.9;
      if (cx + rr < 0 || cy + rr < 0 || cx - rr > lw || cy - rr > lh) continue;
      gc.globalAlpha = Math.min(1, l.intensity) * 0.55;
      gc.drawImage(glowSprite(l.color), cx - rr, cy - rr, rr * 2, rr * 2);
      n++;
    }
    if (n) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32 + (b.dark || 0) * 0.25;
      ctx.drawImage(glowCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// Outlined name labels baked once per text/colour/size: strokeText + fillText shape the glyphs again on every call,
// and a pack of champions put a dozen of those in every frame. Drawn at whole device px, so they stay crisp.
const labels = new Map();
function nameLabel(text, font, fill, lw) {
  const key = font + '|' + fill + '|' + lw + '|' + text;
  let c = labels.get(key);
  if (c) { labels.delete(key); labels.set(key, c); return c; }
  const m = measureCtx(font).measureText(text), pad = Math.ceil(lw) + 2;
  const asc = Math.ceil(m.actualBoundingBoxAscent || parseFloat(font.match(/(\d+)px/)[1]) * 0.8), desc = Math.ceil(m.actualBoundingBoxDescent || 0);
  c = makeCanvas(Math.ceil(m.width) + pad * 2, asc + desc + pad * 2);
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center';
  if (lw > 0) { g.lineWidth = lw; g.strokeStyle = '#000'; g.strokeText(text, c.width / 2, pad + asc); }
  g.fillStyle = fill; g.fillText(text, c.width / 2, pad + asc);
  c._ox = c.width / 2; c._oy = pad + asc;
  // the fallback face draws until Cinzel loads: don't keep that one
  if (!document.fonts || document.fonts.check(font)) { labels.set(key, c); if (labels.size > 160) labels.delete(labels.keys().next().value); }
  return c;
}
function drawLabel(ctx, text, x, y, font, fill, lw) {
  const c = nameLabel(text, font, fill, lw);
  ctx.drawImage(c, Math.round(x - c._ox), Math.round(y - c._oy));
}

function drawOverheadNames(ctx, world) {
  ctx.textAlign = 'center';
  const d = G.dpr;
  const nameFont = `700 ${Math.round(11 * d)}px Cinzel, Georgia, serif`;
  for (const c of world.creatures) {
    if (c.dead || !c.sbox) continue;
    if (c.rank === 'champion' || c.rank === 'unique') {
      const x = (c.sbox[0] + c.sbox[2]) / 2, y = c.barTop != null ? camera.toScreen(0, c.barTop)[1] - 3 : c.sbox[1] - 8; // above its life bar
      drawLabel(ctx, c.name, x * d, y * d, nameFont, c.rank === 'unique' ? '#ffc040' : '#80b0ff', 3 * d);
    }
  }
  // townsfolk names: only the one nearest the hero (a crowd of labels hides the crowd)
  const hero = world.player;
  let nearest = null, nd = 2.6;
  if (hero) for (const n of world.npcs) if (!n.vendor && !n.stash && !n.altar && !n.hidden && n.sbox) { const q = Math.hypot(hero.x - n.x, hero.y - n.y); if (q < nd) { nd = q; nearest = n; } }
  for (const n of world.npcs) {
    if (!n.sbox || n.hidden) continue;
    if (!n.vendor && !n.stash && !n.altar && (n !== nearest || n.talkT > 0)) continue;
    const x = (n.sbox[0] + n.sbox[2]) / 2;
    const [sx, sy] = camera.toScreen(x, n.sbox[1] - 10);
    const label = n.vendor ? n.vendor.name : n.name;
    if (label) drawLabel(ctx, label, sx * d, sy * d, nameFont, n.altar ? '#ff8060' : n.vendor || n.stash ? '#ffe090' : '#c8c0b0', 3 * d);
    if (n.vendor && n.vendor.title) drawLabel(ctx, n.vendor.title, sx * d, (sy + 12) * d, `${Math.round(10 * d)}px "Alegreya Sans", sans-serif`, '#b0a080', 0);
  }
  // portal labels
  for (const po of world.portals) {
    if (!po.label) continue;
    const [sx, sy] = camera.tileToScreen(po.x, po.y, 100);
    if (sx < -200 || sy < -40 || sx > G.W + 200 || sy > G.H + 40) continue;
    drawLabel(ctx, po.label, sx * d, sy * d, nameFont, po.active ? '#ffd0a0' : '#909090', 3 * d);
  }
  // hovered monster info (desktop)
  const h = G.hover;
  if (h && !h.dead && h.team === 'enemy' && h.rank !== 'boss') {
    const W = G.W * d;
    const bw = Math.min(360, G.W * 0.5) * d;
    const y = 18 * d;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(W / 2 - bw / 2, y, bw, 22 * d);
    ctx.fillStyle = h.rank === 'unique' ? '#a06010' : h.rank === 'champion' ? '#2a4a90' : '#7a0a06';
    ctx.fillRect(W / 2 - bw / 2 + 2 * d, y + 2 * d, (bw - 4 * d) * clamp(h.hp / h.maxHp, 0, 1), 18 * d);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(12 * d)}px Cinzel, Georgia, serif`;
    ctx.fillText(h.name, W / 2, y + 15 * d);
    if (h.affixes && h.affixes.length) {
      ctx.font = `${Math.round(11 * d)}px "Alegreya Sans", sans-serif`;
      ctx.fillStyle = '#c8b0ff';
      ctx.fillText(h.affixes.map((a) => ({ strong: 'Extra Strong', fast: 'Extra Fast', tough: 'Stone Skin', fiery: 'Fire Enchanted', frozen: 'Cold Aura', shocking: 'Lightning Enchanted', vampiric: 'Vampiric', teleport: 'Teleporting', multishot: 'Multishot', thorns: 'Thorns', regen: 'Regenerating' }[a] || a)).join(' · '), W / 2, y + 36 * d);
    }
  }
}

// ------------------------------------------------------------------ minimap
let mmT = 0;
export function drawMinimap(world, dt, canvas, big = false) {
  if (!canvas) return;
  mmT -= dt;
  if (!big && mmT > 0) return;
  mmT = 0.2;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const p = world.player;
  if (!p) return;
  if (world.tower) { world.tower.minimap(c, W, H, big); return; }
  const map = world.map;
  const s = big ? Math.max(2, Math.min(W / (map.w + map.h), H / ((map.w + map.h) / 2)) * 0.95) : 2.4;
  const cx = W / 2, cy = H / 2;
  const ox = big ? cx : cx - (p.x - p.y) * s, oy = big ? cy - ((map.w + map.h) / 4) * s + (big ? 0 : 0) : cy - ((p.x + p.y) * s) / 2;
  const toS = (x, y) => big ? [cx + (x - y) * s - ((map.w - map.h) * s) / 2, cy - ((map.w + map.h) * s) / 4 + ((x + y) * s) / 2] : [ox + (x - y) * s, oy + ((x + y) * s) / 2];
  c.fillStyle = big ? 'rgba(200,180,140,0.35)' : 'rgba(170,150,120,0.55)';
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if ((map.t[i] !== 1 && !(map.wet && map.wet[i])) || !map.seen[i]) continue;
      const [sx, sy] = toS(x, y);
      if (!big && (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4)) continue;
      if (map.hgt) c.fillStyle = map.wet && map.wet[i] ? 'rgba(70,140,230,0.65)' : terrainShade(map, i); // paler up the mountain; the caves' water blue (and up the Castle's walls)
      c.fillRect(sx - s * 0.5, sy, s, s * 0.6);
    }
  }
  const dot = (x, y, col, r) => { const [sx, sy] = toS(x, y); c.fillStyle = col; c.beginPath(); c.arc(sx, sy + s * 0.3, r, 0, TAU); c.fill(); };
  for (const po of world.portals) if (map.seen[Math.floor(po.y) * map.w + Math.floor(po.x)] || world.kind === 'town') dot(po.x, po.y, po.active ? po.color || '#ff5020' : '#888', big ? 6 : 4);
  for (const ch of world.chests) if (!ch.opened && map.seen[Math.floor(ch.y) * map.w + Math.floor(ch.x)]) dot(ch.x, ch.y, ch.dot || '#ffd040', big ? 4 : 2.5);
  for (const n of world.npcs) dot(n.x, n.y, '#ffe090', big ? 4 : 2.5);
  for (const m of world.creatures) {
    if (m.dead || m === p) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (m.team === 'enemy' && d < 14) dot(m.x, m.y, m.rank === 'boss' ? '#ff8000' : m.rank !== 'normal' ? '#ffb040' : '#ff3030', m.rank === 'boss' ? 4 : 2);
    else if (m.isRemotePlayer) {
      dot(m.x, m.y, '#5a9aff', big ? 5.5 : 3.5);
      if (big) {
        const [sx, sy] = toS(m.x, m.y);
        c.font = 'bold 11px "Cinzel", Georgia, serif';
        c.fillStyle = '#000000';
        c.textAlign = 'center';
        c.fillText(m.name || 'Party', sx + 1, sy - 8);
        c.fillStyle = '#7ab8ff';
        c.fillText(m.name || 'Party', sx, sy - 9);
      }
    } else if (m.team === 'player') dot(m.x, m.y, '#40ff60', 1.8);
  }
  dot(p.x, p.y, '#ffffff', big ? 5 : 3.2);
  if (big) {
    const [sx, sy] = toS(p.x, p.y);
    c.font = 'bold 11px "Cinzel", Georgia, serif';
    c.fillStyle = '#000000';
    c.textAlign = 'center';
    c.fillText('You', sx + 1, sy - 8);
    c.fillStyle = '#ffd860';
    c.fillText('You', sx, sy - 9);
  }
}
