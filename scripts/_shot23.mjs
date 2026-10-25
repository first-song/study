import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await chromium.launch({ executablePath, headless: true, args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
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
  p.level = 7; p.lifeStage = 3;
  Object.assign(p, { x: 0, y: 44, z: 0, vx: 0, vy: 0, vz: 0 });
  ocean.yaw = Math.PI; ocean.pitch = -.08; ocean.firstPerson = false;
  window.__at = (t) => { engine.state.time = t; engine.state.tideId = null; };
});

// 拂晓
await page.evaluate(() => window.__at(10));
await wait(10);
await page.screenshot({ path: path.join(root,'artifacts','v23-tide-dawn.png') });

// 正午
await page.evaluate(() => window.__at(80));
await wait(12);
await page.screenshot({ path: path.join(root,'artifacts','v23-tide-noon.png') });

// 深夜
await page.evaluate(() => window.__at(230));
await wait(12);
await page.screenshot({ path: path.join(root,'artifacts','v23-tide-night.png') });

// 野外笔记页签
await page.evaluate(() => {
  const { engine } = window.__main || {};
  const btn = document.querySelector('[data-open-biology]');
  btn?.click();
});
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('[data-codex-tab="notes"]')?.click());
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(root,'artifacts','v23-field-notes.png') });

// 解锁两条笔记后重看
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  engine.state.fieldNotes.push('fishBlind','crabMolt');
  document.querySelector('[data-codex-tab="forms"]')?.click();
  document.querySelector('[data-codex-tab="notes"]')?.click();
});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(root,'artifacts','v23-field-notes-unlocked.png') });

await browser.close();
console.log('shots ok');
