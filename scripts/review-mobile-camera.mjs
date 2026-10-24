import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,
  args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});

try{
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    const page=await browser.newPage({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('aberrant-tide-onboarding-v1','seen');
    });
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    await page.locator('#start-btn').tap();
    await page.waitForTimeout(650);
    await page.evaluate(async()=>{
      const {engine}=await import('/src/main.js');
      const film=engine.state.entities.find(entity=>entity.type==='biofilm'&&entity.siteId==='nursery');
      Object.assign(engine.state.player,{x:film.x,y:film.y,z:film.z+1,vx:0,vy:0,vz:0});
    });
    await page.locator('#expedition-interact').waitFor({state:'visible'});
    await page.locator('#expedition-interact').tap();
    await page.waitForFunction(async()=>{
      const {engine}=await import('/src/main.js');
      return engine.state.player.attachment?.kind==='biofilm';
    });
    await page.evaluate(async()=>{
      const {engine}=await import('/src/main.js');
      const {GameEngine}=await import('/src/engine.js');
      const {interactionPosition}=await import('/src/ecosystem.js');
      for(let i=0;i<90;i++)GameEngine.prototype.update.call(engine,.1,{});
      const reactor=engine.state.entities.find(entity=>entity.type==='reactor'&&entity.siteId==='wreck');
      engine.state.entities=[reactor,...engine.state.entities.filter(entity=>entity.id!==reactor.id)];
      engine.state.time=Math.ceil(engine.state.time/21)*21+1;
      engine._updateReactors(0);
      while(engine.state.player.level<3){
        engine.state.player.xp=engine.state.player.xpNext;
        engine._checkLevel();
      }
      Object.assign(engine.state.player,interactionPosition(reactor),{vx:0,vy:0,vz:0,radiation:0,nutrition:100});
    });
    await page.waitForFunction(()=>document.querySelector('#reactor-phase').textContent==='冷却窗口');
    await page.evaluate(async()=>{
      const {engine,ocean}=await import('/src/main.js');
      const p=engine.state.player;
      const reactor=engine.state.entities.find(entity=>entity.type==='reactor'&&entity.siteId==='wreck');
      p.attachment={
        entityId:reactor.id,kind:'reactor',progress:0,elapsed:0,travelled:0,
        startZone:p.zone,lastX:p.x,lastY:p.y,lastZ:p.z,
      };
      reactor.progress=0;
      ocean.yaw=Math.PI-.4;ocean.pitch=.22;ocean.cameraMode='interaction';
    });
    await page.waitForTimeout(900);
    const result=await page.evaluate(async()=>{
      const {engine,ocean}=await import('/src/main.js');
      const THREE=await import('/node_modules/three/build/three.module.js');
      const p=engine.state.player;
      const reactor=ocean.objects.get(p.attachment.entityId);
      const target=new THREE.Vector3(p.x,p.y+.5,p.z);
      const direction=target.clone().sub(ocean.camera.position);
      const distance=direction.length();
      const ray=new THREE.Raycaster(ocean.camera.position,direction.normalize(),.05,Math.max(.05,distance-.15));
      const meshes=[];
      reactor.updateWorldMatrix(true,true);
      reactor.traverse(child=>{if(child.isMesh&&!child.material?.transparent)meshes.push(child);});
      return {
        viewport:[innerWidth,innerHeight],
        distance,
        hits:ray.intersectObjects(meshes,false).length,
        yawError:Math.atan2(Math.sin(ocean.yaw-ocean.cameraYaw),Math.cos(ocean.yaw-ocean.cameraYaw)),
        firstPerson:ocean.firstPerson,
      };
    });
    console.log('MOBILE_REACTOR_CAMERA',JSON.stringify(result));
    assert.ok(result.distance>7);
    assert.equal(result.hits,0);
    await page.close();
  }
}finally{
  await browser.close();
}
