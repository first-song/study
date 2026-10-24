import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

await mkdir('artifacts/previews',{recursive:true});
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,
  args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.addInitScript(()=>{
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1','seen');
});
const capture=async(name)=>{
  await page.waitForTimeout(500);
  await page.screenshot({path:`artifacts/previews/${name}.jpg`,type:'jpeg',quality:82});
};

try{
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#start-btn').click();
  await page.waitForTimeout(600);
  await page.addStyleTag({content:'#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}'});

  await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const {islandCenter}=await import('/src/island.js');
    const {WATER_SURFACE_Y}=await import('/src/biology.js');
    const center=islandCenter(engine.state.world);
    Object.assign(engine.state.player,{x:center.x,y:WATER_SURFACE_Y-.25,z:center.z+205,vx:0,vy:0,vz:0});
    engine.state.mode='paused';document.querySelector('#pause-screen').hidden=true;
    ocean.firstPerson=true;ocean.yaw=0;ocean.pitch=-.075;
  });
  await capture('art-v12-archipelago-wide');

  const closeTree=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const {islandCenter,islandTreeLayout,islandVisualSurfaceAt}=await import('/src/island.js');
    const center=islandCenter(engine.state.world);
    const allTrees=islandTreeLayout(engine.state.world);
    const candidates=allTrees.filter(tree=>{
      const lx=tree.x-center.x,lz=tree.z-center.z;
      return tree.species==='pine'&&lx>-30&&lx<30&&lz>20&&lz<76;
    });
    if(!candidates.length)throw new Error('No coastal pine found for art review');
    const isolation=tree=>allTrees.filter(other=>other!==tree&&Math.hypot(other.x-tree.x,other.z-tree.z)<14).length;
    candidates.sort((a,b)=>isolation(a)-isolation(b));
    const tree=candidates[0];
    const cameraX=tree.x+2.5,cameraZ=tree.z+17,ground=islandVisualSurfaceAt(engine.state.world,cameraX,cameraZ);
    Object.assign(engine.state.player,{x:cameraX,y:ground+.65,z:cameraZ,vx:0,vy:0,vz:0});
    ocean.firstPerson=true;ocean.yaw=Math.atan2(-(tree.x-cameraX),-(tree.z-cameraZ));
    ocean.pitch=-.09;
    engine.state.mode='paused';document.querySelector('#pause-screen').hidden=true;
    return {x:tree.x,z:tree.z,species:tree.species,ground};
  });
  await capture('art-v12-coastal-pines');

  const scaleReview=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const allFish=engine.state.entities.filter(entity=>entity.type==='fish');
    const schools=[...new Set(allFish.map(entity=>entity.schoolId))].map(schoolId=>({
      schoolId,
      fish:allFish.filter(entity=>entity.schoolId===schoolId),
    })).sort((a,b)=>{
      const average=group=>group.fish.reduce((sum,entity)=>sum+entity.y,0)/group.fish.length;
      return average(b)-average(a);
    });
    const fish=schools[0].fish;
    const center=fish.reduce((result,entity)=>({x:result.x+entity.x/fish.length,y:result.y+entity.y/fish.length,z:result.z+entity.z/fish.length}),{x:0,y:0,z:0});
    Object.assign(engine.state.player,{x:center.x,y:center.y,z:center.z+8,vx:0,vy:0,vz:0});
    ocean.firstPerson=false;ocean.yaw=0;ocean.pitch=.1;
    engine.state.mode='paused';document.querySelector('#pause-screen').hidden=true;
    return {
      playerSize:engine.state.player.size,
      fishRadius:Math.max(...fish.map(entity=>entity.radius)),
      fishCount:fish.length,
    };
  });
  assert.ok(scaleReview.playerSize<scaleReview.fishRadius);
  await capture('art-v13-player-and-shoal');

  await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const reef=engine.state.world.landmarks.find(landmark=>landmark.biome==='coral'&&(landmark.kind==='shelf'||landmark.kind==='reef'));
    const x=reef.x+8,z=reef.z+24;
    Object.assign(engine.state.player,{x,y:reef.y+7,z,vx:0,vy:0,vz:0});
    ocean.firstPerson=true;ocean.yaw=Math.atan2(-(reef.x-x),-(reef.z-z));ocean.pitch=.06;
    engine.state.mode='paused';document.querySelector('#pause-screen').hidden=true;
  });
  await capture('art-v12-shallow-reef');

  const metrics=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    return {
      calls:ocean.renderer.info.render.calls,
      triangles:ocean.renderer.info.render.triangles,
      cedars:ocean.island.getObjectByName('japanese-cedar-crowns')?.count||0,
      pines:ocean.island.getObjectByName('coastal-black-pine-crowns')?.count||0,
      broadleaf:ocean.island.getObjectByName('broadleaf-tree-crowns')?.count||0,
      microfauna:ocean.microfauna?.userData.specimens.length||0,
      nurseryGrass:ocean.habitat.userData.nurseryGrass?.count||0,
      mode:engine.state.mode,
    };
  });
  assert.ok(metrics.cedars>20&&metrics.pines>20&&metrics.broadleaf>20);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,closeTree,metrics,errors},null,2));
}finally{
  await browser.close();
}
