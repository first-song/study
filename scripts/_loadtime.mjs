import { chromium } from '@playwright/test';
import fs from 'node:fs';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await chromium.launch({ executablePath, headless: true, args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const t0 = Date.now();
await page.goto('http://127.0.0.1:4173', { waitUntil: 'load' });
await page.waitForFunction(() => { const b=document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 120000 });
console.log('ready in', Date.now()-t0, 'ms');
const info = await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  let total = 0, meshes = 0, instanced = 0;
  ocean.scene?.traverse?.(n => { if (n.isMesh) { meshes++; total += n.geometry?.index ? n.geometry.index.count/3 : (n.geometry?.attributes?.position?.count||0)/3; } });
  return { meshes, triangles: Math.round(total), calls: ocean.renderer?.info?.render?.calls };
});
console.log(JSON.stringify(info));
await browser.close();
