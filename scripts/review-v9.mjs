import { chromium } from '@playwright/test';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.addInitScript(()=>{localStorage.clear();localStorage.setItem('aberrant-tide-onboarding-v1','seen');});
await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
await page.locator('#start-btn').click();await page.waitForTimeout(500);
await page.evaluate(async()=>{const {engine,ocean}=await import('/src/main.js');const {islandCenter}=await import('/src/island.js');const center=islandCenter(engine.state.world);Object.assign(engine.state.player,{x:center.x,y:53,z:center.z+112,vx:0,vy:0,vz:0});ocean.yaw=0;ocean.pitch=.05;ocean.firstPerson=true;});
await page.waitForTimeout(600);await page.screenshot({path:'artifacts/25-large-island.png'});
await page.evaluate(async()=>{const {engine}=await import('/src/main.js');const {islandShorePoint}=await import('/src/island.js');const shore=islandShorePoint(engine.state.world,Math.PI/2);Object.assign(engine.state.player,{x:shore.x,y:53,z:shore.z+2,vx:0,vy:0,vz:0});for(let i=0;i<90;i++)engine.update(1/60,{z:-1});});
await page.waitForTimeout(500);await page.screenshot({path:'artifacts/26-landed-island.png'});
console.log(await page.evaluate(async()=>{const {engine,ocean}=await import('/src/main.js');const {islandSurfaceAt}=await import('/src/island.js');return {player:{x:engine.state.player.x,y:engine.state.player.y,z:engine.state.player.z},ground:islandSurfaceAt(engine.state.world,engine.state.player.x,engine.state.player.z),calls:ocean.renderer.info.render.calls,triangles:ocean.renderer.info.render.triangles};}));
console.log(errors.length?errors.join('\n'):'NO_BROWSER_ERRORS');await browser.close();
