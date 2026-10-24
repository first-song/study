import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1', 'seen');
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(800);
await page.addStyleTag({ content: '#hud,.toast-container,#pause-screen,#loading-label{display:none!important}' });
const setup = async () => page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  const { islandCenter } = await import('/src/island.js');
  const { WATER_SURFACE_Y } = await import('/src/biology.js');
  const center = islandCenter(engine.state.world);
  Object.assign(engine.state.player, { x:center.x, y:WATER_SURFACE_Y-.25, z:center.z+154, vx:0, vy:0, vz:0 });
  ocean.firstPerson = true;
  ocean.yaw = 0;
  ocean.pitch = -.025;
  engine.state.mode = 'paused';
});
await setup();
await page.waitForTimeout(700);
await page.screenshot({ path:'artifacts/debug-surface-all.png' });
const inventory = await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  const THREE = await import('/node_modules/three/build/three.module.js');
  const rows=[];
  ocean.scene.traverse(node=>{
    if(!node.isMesh||!node.material?.transparent)return;
    const box=new THREE.Box3().setFromObject(node);
    rows.push({
      name:node.name,material:node.material.type,side:node.material.side,
      opacity:node.material.opacity,visible:node.visible,
      y:[Number(box.min.y.toFixed(1)),Number(box.max.y.toFixed(1))],
      x:[Number(box.min.x.toFixed(1)),Number(box.max.x.toFixed(1))],
      z:[Number(box.min.z.toFixed(1)),Number(box.max.z.toFixed(1))],
    });
  });
  return rows.filter(row=>row.y[1]>50&&row.y[0]<58);
});
await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  ocean.rays.visible=false;
  for(const boat of ocean.patrolFleet.userData.boats){
    boat.userData.beam.visible=false;
    boat.userData.searchlight.visible=false;
  }
  ocean.island.traverse(node=>{
    if(node.name.includes('shoreline')||node.name.includes('beacon'))node.visible=false;
  });
});
await page.waitForTimeout(500);
await page.screenshot({ path:'artifacts/debug-surface-no-beams.png' });
await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  ocean.surface.visible=false;
});
await page.waitForTimeout(500);
await page.screenshot({ path:'artifacts/debug-surface-no-water.png' });
console.log(JSON.stringify(inventory,null,2));
await browser.close();
