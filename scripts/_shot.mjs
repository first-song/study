import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await chromium.launch({ executablePath, headless: true, args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { window.__frames=0; const raf=window.requestAnimationFrame; window.requestAnimationFrame=cb=>raf(t=>{window.__frames++;cb(t);}); });
const wait = async n => { const s=await page.evaluate(()=>window.__frames); await page.waitForFunction(([t,b])=>window.__frames>=b+t,[n,s],{polling:250}); };
await page.goto('http://127.0.0.1:4173', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled, { timeout: 60000 });
await page.click('#start-btn');
await wait(3);
await page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  ocean.quality('low');
  document.getElementById('onboarding-skip')?.click();
  engine.state.mode = 'playing';
  // 站在岛前的海面上，镜头对准岸上的排放站
  const p = engine.state.player;
  // 用 Lv7 的身体，相机才会退到能看全岛的距离
  p.level = 7; p.lifeStage = 3; p.branches = { devour: 3, radiation: 2, symbiosis: 2 };
  Object.assign(p, { x: 0, y: 55, z: -38, vx: 0, vy: 0, vz: 0 });
  ocean.yaw = 0; ocean.pitch = -.03; ocean.firstPerson = false;
  engine.state.player.onLand = false;
});
await wait(12);
await page.screenshot({ path: path.join(root,'artifacts','v21-island-japan.png') });
// 再来一张：岛的另一侧，能看到水田和大棚
await page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  const p = engine.state.player;
  const { islandShorePoint } = await import('/src/island.js');
  const shore = islandShorePoint(engine.state.world, Math.PI/2);
  Object.assign(p, { x: shore.x - 4, y: 54.1, z: shore.z + 26, vx: 0, vy: 0, vz: 0 });
  ocean.yaw = 0.06; ocean.pitch = -.05; ocean.firstPerson = true;
});
await wait(10);
await page.screenshot({ path: path.join(root,'artifacts','v21-island-fields.png') });
await browser.close();
console.log('shots ok');
