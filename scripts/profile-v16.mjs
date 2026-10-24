import { chromium } from '@playwright/test';

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
try {
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#start-btn').click();
  await page.waitForTimeout(900);
  const result=await page.evaluate(async()=>{
    const {engine,ocean}=await import('/src/main.js');
    const measure=label=>{
      ocean.renderer.info.reset();
      ocean.post.render(ocean.clock);
      const countVisible=(root,type)=>root?(()=>{let count=0;root.traverse(node=>{if((!type||node.isMesh)&&node.visible)count++;});return count;})():0;
      const countTop=root=>{
        const groups={};
        root?.traverse(node=>{
          if(!node.isMesh||!node.visible)return;
          let top=node;
          while(top.parent&&top.parent!==root)top=top.parent;
          const key=top.name||top.type;
          groups[key]=(groups[key]||0)+1;
        });
        return Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,16);
      };
      const countShadowTop=root=>{
        const groups={};
        root?.traverse(node=>{
          if(!node.isMesh||!node.visible||!node.castShadow)return;
          let top=node;
          while(top.parent&&top.parent!==root)top=top.parent;
          const key=top.name||top.type;
          groups[key]=(groups[key]||0)+1;
        });
        return Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,16);
      };
      return {
        label,
        calls:ocean.renderer.info.render.calls,
        triangles:ocean.renderer.info.render.triangles,
        points:ocean.renderer.info.render.points,
        lines:ocean.renderer.info.render.lines,
        geometries:ocean.renderer.info.memory.geometries,
        textures:ocean.renderer.info.memory.textures,
        visibleMeshes:countVisible(ocean.scene,true),
        visibleObjects:countVisible(ocean.scene,false),
        islandMeshes:countVisible(ocean.island,true),
        habitatMeshes:countVisible(ocean.habitat,true),
        seabedMeshes:countVisible(ocean.seabed,true),
        topIsland:countTop(ocean.island),
        topHabitat:countTop(ocean.habitat),
        islandShadowCasters:countShadowTop(ocean.island),
        shadowCasterTotal:(()=>{let count=0;ocean.scene.traverse(node=>{if(node.isMesh&&node.visible&&node.castShadow)count++;});return count;})(),
        postCalls:ocean.post.composer.passes.length,
      };
    };
    engine.state.mode='paused';
    Object.assign(engine.state.player,{x:0,y:38,z:0,vx:0,vy:0,vz:0,lifeStage:0});
    ocean.firstPerson=false;ocean.yaw=0;ocean.pitch=.1;
    ocean.update(.016,engine.state,false);
    const openWater=measure('open-water');
    const diver=engine.state.entities.find(entity=>entity.type==='diver');
    Object.assign(engine.state.player,{x:diver.x,y:diver.y,z:diver.z+5,lifeStage:2});
    ocean.update(.016,engine.state,false);
    const island=measure('island-diver');
    const underwaterShore=engine.state.entities.find(entity=>entity.type==='fish');
    Object.assign(engine.state.player,{x:underwaterShore.x,y:underwaterShore.y,z:underwaterShore.z+8,lifeStage:2});
    ocean.update(.016,engine.state,false);
    const reef=measure('reef-wildlife');
    return {openWater,island,reef};
  });
  console.log(JSON.stringify({...result,errors},null,2));
} finally {
  await browser.close();
}
