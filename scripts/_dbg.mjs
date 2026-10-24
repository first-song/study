import { chromium } from '@playwright/test';
import fs from 'node:fs';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await chromium.launch({ executablePath, headless: true, args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:4173', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled, { timeout: 60000 });
await page.click('#start-btn');
await page.waitForTimeout(1500);
const info = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const { islandCenter, islandSurfaceAt } = await import('/src/island.js');
  const w = engine.state.world;
  const c = islandCenter(w);
  return { core: { x: w.core.x, z: w.core.z }, centre: c, seed: w.seed,
    surfaceAtCentre: islandSurfaceAt(w, c.x, c.z), surfaceAtCore: islandSurfaceAt(w, w.core.x, w.core.z) };
});
console.log(JSON.stringify(info));
await browser.close();
