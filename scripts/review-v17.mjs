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
async function capture(name,delay=650){
  await page.waitForTimeout(delay);
  await page.screenshot({path:`artifacts/previews/${name}.jpg`,type:'jpeg',quality:82});
}
try {
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#start-btn').click();
  await page.waitForTimeout(800);
  const ecology=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    return {
      echoes:engine.state.entities.filter(entity=>entity.type==='echo').map(entity=>({
        id:entity.id,kind:entity.echoKind,reactorSiteId:entity.reactorSiteId,name:entity.name,
      })),
      echoCount:ocean.echoTethers.size,
    };
  });
  assert.equal(ecology.echoes.length,3);
  assert.equal(ecology.echoCount,3);

  for(const [index,kind] of ['shardHunter','lureColony','pressureWorm'].entries()){
    const metrics=await page.evaluate(async({index,kind})=>{
      const {engine,ocean}=await import('/src/main.js');
      const echo=engine.state.entities.find(entity=>entity.type==='echo'&&entity.echoKind===kind);
      Object.assign(engine.state.player,{x:echo.x,y:echo.y,z:echo.z+10,vx:0,vy:0,vz:0,lifeStage:2,level:5});
      echo.phase=kind==='pressureWorm'?'exposed':kind==='lureColony'?'charge':'stalk';
      echo.phaseRemaining=1.4;
      engine.state.expedition.echoEncounters=[echo.reactorSiteId];
      engine.state.mode='playing';
      document.getElementById('pause-screen').hidden=true;
      ocean.firstPerson=false;ocean.yaw=0;ocean.pitch=-.04;ocean.cameraMode='third';
      ocean.update(.016,engine.state,false);
      engine.update=()=>{};
      const huntUi=await import('/src/hunt-ui.js');
      huntUi.updateHuntUI(engine.state,echo);
      const object=ocean.objects.get(echo.id);
      const tether=ocean.echoTethers.get(echo.id);
      document.body.classList.remove('hud-hidden');
      return {
        model:Boolean(object),modelKind:object?.userData?.echoKind,tether:Boolean(tether),tetherVisible:Boolean(tether?.visible),
        tetherMapSize:ocean.echoTethers?.size,objectCount:ocean.objects?.size,
        tetherFactory:typeof ocean.makeEchoTether,
        panelHidden:document.getElementById('echo-hunt-panel')?.hidden,
        phaseText:document.getElementById('echo-hunt-phase')?.textContent,
      };
    },{index,kind});
    await page.waitForTimeout(800);
    console.log(JSON.stringify({kind,metrics}));
    assert.equal(metrics.model,true);
    assert.equal(metrics.modelKind,kind);
    assert.equal(metrics.tetherVisible,true);
    assert.equal(metrics.panelHidden,false);
    await capture(`v17-echo-${index+1}-${kind}`,120);
  }

  const hunt=await page.evaluate(async()=>{
    const {engine}=await import('/src/main.js');
    delete engine.update;
    const echo=engine.state.entities.find(entity=>entity.type==='echo'&&entity.echoKind==='pressureWorm');
    Object.assign(engine.state.player,{x:echo.x,y:echo.y,z:echo.z,energy:100,cooldowns:{...engine.state.player.cooldowns,feed:0}});
    echo.phase='exposed';
    echo.hp=28;
    echo.link=.28;
    engine.state.mode='playing';
    engine.update(.1,{feed:true});
    return {
      pacified:echo.pacified,
      phase:echo.phase,
      discoveries:engine.state.expedition.echoesPacified.length,
    };
  });
  assert.equal(hunt.pacified,true);
  assert.equal(hunt.discoveries,1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,ecology,hunt,errors},null,2));
} finally {
  await browser.close();
}
