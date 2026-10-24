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
const capture=async name=>{
  await page.waitForTimeout(650);
  await page.screenshot({path:`artifacts/previews/${name}.jpg`,type:'jpeg',quality:84});
};

try{
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#start-btn').click();
  await page.waitForTimeout(600);
  await page.addStyleTag({content:'#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}'});

  const spawn=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const p=engine.state.player;
    Object.assign(p,{x:0,y:44,z:0,vx:0,vy:0,vz:0});
    const fish=engine.state.entities.find(entity=>entity.type==='fish');
    Object.assign(fish,{x:-4,y:44,z:-9,vx:0,vy:0,vz:-2,heading:0});
    engine.state.mode='playing';document.querySelector('#pause-screen').hidden=true;
    ocean.firstPerson=false;ocean.yaw=0;ocean.pitch=.08;
    return {fishId:fish.id};
  });
  await page.waitForTimeout(250);
  const motion=await page.evaluate(async fishId=>{
    const {ocean}=await import('/src/main.js');
    const object=ocean.objects.get(fishId);
    if(!object)return {missing:true};
    const samples=[];
    await new Promise(resolve=>{
      let frames=0,last=0;
      const capture=now=>{
        if(last)samples.push({x:object.position.x,y:object.position.y,z:object.position.z,dt:now-last});
        last=now;frames++;
        if(frames<100)requestAnimationFrame(capture);else resolve();
      };
      requestAnimationFrame(capture);
    });
    const steps=[];
    for(let index=1;index<samples.length;index++)steps.push(Math.hypot(
      samples[index].x-samples[index-1].x,
      samples[index].y-samples[index-1].y,
      samples[index].z-samples[index-1].z,
    ));
    const moving=steps.filter(step=>step>.0002).length;
    return {
      samples:steps.length,
      movingRatio:moving/Math.max(1,steps.length),
      maxStep:Math.max(0,...steps),
      averageStep:steps.reduce((sum,step)=>sum+step,0)/Math.max(1,steps.length),
    };
  },spawn.fishId);
  await page.evaluate(async spawnState=>{
    const {engine,ocean}=await import('/src/main.js');
    const fish=engine.state.entities.find(entity=>entity.id===spawnState.fishId);
    Object.assign(engine.state.player,{x:0,y:44,z:0,vx:0,vy:0,vz:0});
    Object.assign(fish,{x:-4,y:44,z:-9,vx:0,vy:0,vz:-2,heading:0});
    engine.state.mode='paused';document.querySelector('#pause-screen').hidden=true;
  },spawn);
  await capture('art-v13-spawn-neighbors');

  const metrics=await page.evaluate(async fishId=>{
    const {engine,ocean}=await import('/src/main.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const fish=ocean.objects.get(fishId);
    const cellSize=new THREE.Box3().setFromObject(ocean.player).getSize(new THREE.Vector3());
    const fishSize=fish?new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3()):null;
    return {
      cellSize:[cellSize.x,cellSize.y,cellSize.z],
      fishSize:fishSize?[fishSize.x,fishSize.y,fishSize.z]:null,
      microfauna:Object.fromEntries(Object.entries(ocean.microfauna.userData.meshes).map(([key,mesh])=>[key,mesh.count])),
      seagrass:ocean.habitat.userData.nurseryGrass?.count||0,
      kelp:ocean.habitat.userData.nurseryKelp?.count||0,
      calls:ocean.renderer.info.render.calls,
      triangles:ocean.renderer.info.render.triangles,
      psize:engine.state.player.size,
      visualScale:ocean.player.scale.x,
    };
  },spawn.fishId);
  console.log('ECOLOGY_METRICS',JSON.stringify(metrics));
  assert.ok(metrics.microfauna.bacteria>=180&&metrics.microfauna.colony>=40&&metrics.microfauna.rotifer>=30);
  assert.ok(metrics.seagrass>=600&&metrics.kelp>=50);
  assert.ok(metrics.visualScale<=.18);
  assert.ok(2.05*metrics.visualScale<.91,'cell cilia must remain smaller than the reactor inlet radius');
  assert.ok(motion.movingRatio>.88,`rendered fish motion must continue on display frames (${motion.movingRatio})`);
  assert.ok(motion.maxStep<.4,`rendered fish must not teleport (${motion.maxStep})`);

  await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const shelf=engine.state.world.landmarks.find(landmark=>landmark.biome==='nursery'&&(landmark.kind==='shelf'||landmark.kind==='reef'));
    const x=shelf.x+6,z=shelf.z+15;
    Object.assign(engine.state.player,{x,y:shelf.y+7,z,vx:0,vy:0,vz:0});
    ocean.firstPerson=true;
    ocean.yaw=Math.atan2(-(shelf.x-x),-(shelf.z-z));
    ocean.pitch=.08;
    engine.state.mode='paused';
  });
  await capture('art-v13-seagrass-nursery');

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,metrics,motion,errors},null,2));
}finally{
  await browser.close();
}
