// Visual QA for the Castle overworld and its variants (src/data/castles.js): curtain walls, towers, gatehouse, postern,
// moat, courtyard and keep, the village, the siege lines, the graveyard. Views are placed from each castle's own layout.
// Start server at repo root: python3 -m http.server 8123
// Run: node tools/tests/castle_visual.js [--mobile] [--grid] [--castle=id,id|all] [view,view,...]
// Screenshots: tools/tests/out/castle_[<id>_]<view>.png (the first castle keeps the old names). Look at them: wall gaps
// and bad layering don't throw.
const {openGame,report}=require('./harness');
const mobile=process.argv.includes('--mobile'),grid=process.argv.includes('--grid');
const castleArg=(process.argv.find(a=>a.startsWith('--castle='))||'').slice(9);
const only=(process.argv.slice(2).find(a=>!a.startsWith('--'))||'').split(',').filter(Boolean);
(async()=>{
  const {browser,page,errors,shot}=await openGame(mobile
    ?{width:844,height:390,mobile:true}:{width:1440,height:900});
  try{
    const ids=await page.evaluate(async(arg)=>{
      const {CASTLE_VARIANTS}=await import('/src/data/castles.js');
      return arg==='all'?CASTLE_VARIANTS.map(v=>v.id):arg?arg.split(','):[CASTLE_VARIANTS[0].id];
    },castleArg);
    await page.evaluate(async()=>{const {game}=window.VELSCOUR;try{await game.newChar('paladin','Castle Visual QA');}catch(e){console.warn('town setup: '+e.message);}});  // only the castle matters here
    for(const id of ids){
      const views=await page.evaluate(async(id)=>{
        const {G,game}=window.VELSCOUR;
        await (await import('/src/gfx/castle.js')).loadCastlePack(); await (await import('/src/gfx/castle3dart.js')).loadCastle3D(id);
        G.char.depth=19;G.godMode=true;G.castleVariant=id;
        const {BIOME_BY_ID}=await import('/src/data/biomes.js');
        game.buildDungeon(19,BIOME_BY_ID.castle);
        G.castleVariant=undefined;
        G.world.creatures=G.world.creatures.filter(c=>c===G.player);G.world.npcs.length=0;G.world.rebuildGrid();
        const m=G.world.map;
        if(m.w!==336||m.h!==304)throw Error('Castle must be the 336 x 304 board');
        if(m.castleVariant!==id)throw Error('built '+m.castleVariant+', wanted '+id);
        const L=(await import('/src/world/castle3d.js')).castle3d(id),R0=L.rings[0],RI=L.rings[L.rings.length-1],D=m.drawbridge;
        const room=(rid)=>{const r=m.castleRooms.find(q=>q.id===rid).rect;return [(r[0]+r[2])/2+.5,(r[1]+r[3])/2+.5];};
        const gx=(D.x0+D.x1)/2,post=m.castleBridges.find(b=>b.kind==='postern'),river=m.castleBridges.find(b=>b.kind==='river');
        // [name, map x, map y, zoom] (tiles)
        return [
          ['overview',(R0.X0+R0.X1)/2,(R0.Y0+R0.Y1)/2,.16],...(id==='ironcrown'?[['door_th',156,118,1.4],['door_th2',144,134,1.4],['door_ch',182,118,1.4],['door_gh',156,154,1.4],['door_gh2',144,140,1.4]]:[]),['approach',gx,D.y1+24,.6],['gatehouse',gx,D.hinge+6,1.0],['bridge',gx,D.hinge+1,1.5],['gate_inside',gx,R0.Y1-12,.9],
          ['keep',m.castleKeep.x,m.castleKeep.y+7,.6],['throne_hall',...room('throne_hall'),.8],['cathedral',...room('cathedral'),.8],['great_hall',...room('great_hall'),.8],
          ['corner_nw',R0.X0,R0.Y0,.7],['corner_se',R0.X1,R0.Y1,.7],['inner_corner',RI.X0,RI.Y0,.8],
          ...(post?[['postern',post.x,post.far+2,.9]]:[]),...(river?[['river_bridge',river.x,river.y,.8]]:[]),
          ['village',...m.castleVillage,.7],['siege',...m.castleSiege,.6],['forest',169,284,.7],['moat_west',R0.X0-6,(R0.Y0+R0.Y1)/2,1.0],
        ];
      },id);
      await page.waitForTimeout(2500);
      const first=id==='ironcrown';
      for(const [name,x,y,zoom] of views.filter(v=>!only.length||only.includes(v[0]))){
        try{
          await page.evaluate(async([x,y,zoom,grid])=>{
            const {G}=window.VELSCOUR;
            const {camera}=await import('/src/core/view.js');
            const [px,py]=G.world.map.walkable(x,y)?[x,y]:G.world.map.randomNear(x,y,4);
            G.player.x=px;G.player.y=py;
            G.settings.zoom=1;camera.computeZoom();G.settings.zoom=zoom/camera.zoom;camera.computeZoom();
            G.world.darkK=0;G.world.night=false;G.world.raining=false;camera.follow(x,y,0,true);G.debugWalk=grid;
          },[x,y,zoom,grid]);
          await page.waitForTimeout(name==='overview'?2500:500);
          await shot('castle_'+(mobile?'mobile_':'')+(first?'':id+'_')+name);
        }catch(e){errors.push(id+' '+name+': '+(e.stack||e));}
      }
    }
  }catch(e){errors.push('CASTLE VISUAL: '+(e.stack||e));}
  report(errors);
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
