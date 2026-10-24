// 验证单文件 exe：在一个干净目录里双击它，确认它能自己解包、起服务器、
// 把游戏打开，并且游戏真的能跑起来。
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'dist', '异潮.exe');
assert.ok(fs.existsSync(source), `找不到 ${source}，先跑 npm run pack:single`);

const appDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AberrantTide');
fs.rmSync(appDir, { recursive: true, force: true });

// 复制到一个跟项目无关的位置，确认它不依赖项目目录。
// 每次用独立目录：上一次跑测残留的 exe 会锁住文件。
const isolated = path.join(os.tmpdir(), 'single-exe-test-' + process.pid);
fs.rmSync(isolated, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
fs.mkdirSync(isolated, { recursive: true });
const exe = path.join(isolated, '异潮.exe');
fs.copyFileSync(source, exe);

const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
child.unref();

let address = null;
for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 500));
  const file = path.join(appDir, 'address.txt');
  if (fs.existsSync(file)) {
    address = fs.readFileSync(file, 'utf8').trim();
    if (address) break;
  }
}
assert.ok(address, '单文件 exe 没有启动起来（没有写出访问地址）');
console.log('工作目录（只有 address.txt）:', appDir);
console.log('地址:', address);
try {
  const probe = await fetch(address);
  console.log('直连状态:', probe.status, probe.headers.get('content-type'));
} catch (error) {
  console.log('直连失败:', String(error));
}
// 磁盘上不该有明文源码。
const leaked = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs|css|html)$/i.test(entry.name)) leaked.push(full);
  }
};
if (fs.existsSync(appDir)) walk(appDir);
assert.deepEqual(leaked, [], `磁盘上留下了明文源码：${leaked.join(', ')}`);

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && fs.existsSync(candidate));
assert.ok(executablePath, '需要 Chrome 或 Edge 才能验证');
const browser = await chromium.launch({
  executablePath, headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(address, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled, { timeout: 60000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    return hud && !hud.hidden;
  }, { timeout: 60000 });
  const state = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    return {
      mode: engine.state.mode,
      entities: engine.state.entities.length,
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
    };
  });
  assert.ok(state.calls > 0, '一帧都没画出来');
  assert.ok(state.triangles > 0, '场景里没有三角形');
  assert.ok(state.entities > 100, `场景实体太少：${state.entities}`);
  assert.deepEqual(errors, [], `单文件版运行时报错：${errors.join(' | ')}`);
  console.log('single executable verified:', JSON.stringify({ address, ...state }));
} finally {
  await browser.close().catch(() => {});
  try { execFileSync('taskkill', ['/IM', '异潮.exe', '/F'], { stdio: 'ignore' }); } catch {}
  try { execFileSync('taskkill', ['/IM', path.basename(exe), '/F'], { stdio: 'ignore' }); } catch {}
  fs.rmSync(isolated, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
