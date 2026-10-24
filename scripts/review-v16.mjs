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

async function capture(name,delay=700){
  await page.waitForTimeout(delay);
  await page.screenshot({path:`artifacts/previews/${name}.jpg`,type:'jpeg',quality:82});
}

try {
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#start-btn').click();
  await page.waitForTimeout(1000);
  const opening=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const p=engine.state.player;
    const specimens=ocean.microfauna.userData.specimens;
    const nearbyMutants=engine.state.entities.filter(entity=>
      ['fish','shark'].includes(entity.type)&&
      entity.variant&&entity.variant!=='normal'&&
      Math.hypot(entity.x-p.x,entity.y-p.y,entity.z-p.z)<38
    );
    return {
      microfauna:ocean.microfauna.userData.specimens.length,
      visibleMicrofauna:Object.values(ocean.microfauna.userData.meshes).reduce((sum,mesh)=>sum+mesh.count,0),
      maximumDrift:Math.max(...specimens.map(specimen=>Math.hypot(specimen.vx,specimen.vy,specimen.vz))),
      nearbyMutants:nearbyMutants.map(entity=>({type:entity.type,variant:entity.variant})),
      motes:ocean.motes.geometry.attributes.position.count,
    };
  });
  assert.equal(opening.microfauna,422);
  assert.ok(opening.visibleMicrofauna<=422);
  assert.ok(opening.maximumDrift<.35);
  assert.ok(opening.nearbyMutants.length>=2);
  assert.equal(opening.motes,1200);
  await capture('v16-opening-ecology');

  const scaleAndDiver=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    engine.state.player.lifeStage=2;
    engine.state.mode='paused';
    ocean.update(.016,engine.state,false);
    const hiddenAtMultiCell=ocean.microfauna.visible===false;
    const diver=engine.state.entities.find(entity=>entity.type==='diver');
    const point={x:diver.x,y:diver.y,z:diver.z+5};
    Object.assign(engine.state.player,point,{vx:0,vy:0,vz:0});
    ocean.firstPerson=false;ocean.yaw=0;ocean.pitch=-.05;
    ocean.update(.016,engine.state,false);
    const model=ocean.objects.get(diver.id);
    return {
      hiddenAtMultiCell,
      diverRotationX:model?.userData?.diver?.rotation?.x??null,
      diverVisible:model?.visible??false,
    };
  });
  assert.equal(scaleAndDiver.hiddenAtMultiCell,true);
  assert.ok(Math.abs(scaleAndDiver.diverRotationX+Math.PI*.5)<.16);
  assert.equal(scaleAndDiver.diverVisible,true);
  await capture('v16-diver-swim');

  await page.evaluate(async()=>{
    const {engine}=await import('/src/main.js');
    engine.state.player.lifeStage=0;
    engine.state.mode='playing';
  });
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(350);
  const chart=await page.evaluate(()=>({
    route:document.getElementById('chart-route')?.textContent||'',
    seed:document.getElementById('chart-seed')?.textContent||'',
  }));
  assert.match(chart.route,/当前航向/);
  assert.match(chart.route,/m/);
  assert.match(chart.seed,/SEED/);
  await capture('v16-route-chart',250);
  await page.keyboard.press('KeyJ');

  const humans=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const before=engine.state.expedition.humansDevoured??0;
    engine.state.player.level=7;
    engine.state.player.branches={devour:4,radiation:1,symbiosis:1};
    engine.playerOnLand=true;
    const accepted=engine._devourIslandHuman();
    const consumed=accepted?ocean.consumeNearestHuman(engine.state.player):false;
    return {
      accepted,
      consumed,
      before,
      after:engine.state.expedition.humansDevoured,
      panic:ocean.humanPanic,
    };
  });
  assert.equal(humans.accepted,true);
  assert.equal(humans.consumed,true);
  assert.equal(humans.after,humans.before+1);
  assert.ok(humans.panic>0);

  const renderer=await page.evaluate(async()=>{
    const {ocean}=await import('/src/main.js');
    return {
      calls:ocean.renderer.info.render.calls,
      triangles:ocean.renderer.info.render.triangles,
      geometries:ocean.renderer.info.memory.geometries,
      textures:ocean.renderer.info.memory.textures,
    };
  });
  assert.deepEqual(errors,[]);
  const report={ok:true,opening,scaleAndDiver,chart,humans,renderer,errors};
  console.log(JSON.stringify(report,null,2));
  if(renderer.calls>300)console.warn(`Renderer reports ${renderer.calls} calls across composer and shadow passes; see artifacts/v17-evidence.md for the measured scene diagnostics.`);
} finally {
  await browser.close();
}
