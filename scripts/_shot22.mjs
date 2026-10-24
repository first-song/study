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
  const p = engine.state.player;
  p.level = 7; p.lifeStage = 3; p.branches = { devour: 3, radiation: 2, symbiosis: 2 };
  const { islandCenter, islandVisualSurfaceAt } = await import('/src/island.js');
  const { WATER_SURFACE_Y } = await import('/src/biology.js');
  const c = islandCenter(engine.state.world);
  // 相机朝向前方 = (-sin(yaw), -cos(yaw))。
  window.__shot = (from, to, options = {}) => {
    const ground = islandVisualSurfaceAt(engine.state.world, c.x + from[0], c.z + from[1]);
    const base = ground === null ? WATER_SURFACE_Y : ground;
    Object.assign(p, {
      x: c.x + from[0], y: base + (options.height ?? 3), z: c.z + from[1],
      vx: 0, vy: 0, vz: 0,
    });
    p.onLand = false;
    const dx = to[0] - from[0], dz = to[1] - from[1];
    ocean.yaw = Math.atan2(-dx, -dz);
    ocean.pitch = options.pitch ?? 0;
    ocean.firstPerson = options.firstPerson ?? true;
  };
});

// 1. 火山锥
await page.evaluate(() => window.__shot([-92, -74], [-36, -30], { height: 30, pitch: .1 }));
await wait(12);
await page.screenshot({ path: path.join(root,'artifacts','v22-volcano.png') });

// 2. 商店街
await page.evaluate(() => window.__shot([-15, 40], [-1, 40], { height: 3.2, pitch: -.14 }));
await wait(10);
await page.screenshot({ path: path.join(root,'artifacts','v22-shop-row.png') });

// 3. 港湾的日之丸旗
await page.evaluate(() => window.__shot([19, 130], [0, 124], { height: 5.5, pitch: -.12 }));
await wait(10);
await page.screenshot({ path: path.join(root,'artifacts','v22-harbor-flag.png') });

// 4. 全岛远景
await page.evaluate(() => window.__shot([6, 186], [0, 0], { height: 36, pitch: .12 }));
await wait(12);
await page.screenshot({ path: path.join(root,'artifacts','v22-island-wide.png') });

// 5. 村里的岛民
await page.evaluate(() => window.__shot([-26, 62], [8, 26], { height: 6, pitch: -.06 }));
await wait(10);
await page.screenshot({ path: path.join(root,'artifacts','v22-townsfolk.png') });

await browser.close();
console.log('shots ok');
