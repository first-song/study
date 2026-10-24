// 验证打包出来的桌面版真的能跑：启动 exe，用 CDP 连上去，
// 确认窗口加载了游戏、3D 场景起来了、没有报错。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, 'dist', '异潮-win32-x64');
const exe = path.join(appDir, '异潮.exe');
if (!existsSync(exe)) throw new Error(`找不到 ${exe}，先跑 npm run pack:win`);

const child = spawn(exe, ['--remote-debugging-port=9333'], { detached: false, stdio: 'ignore' });
let browser = null;
try {
  // 冷启动要几秒，等 CDP 端口起来。
  let connected = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    connected = await chromium.connectOverCDP('http://127.0.0.1:9333').catch(() => null);
    if (connected) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(connected, '桌面版没有启动起来（CDP 端口无响应）');
  browser = connected;
  const context = browser.contexts()[0];
  const pages = context.pages();
  assert.ok(pages.length, '桌面版没有打开任何页面');
  const page = pages[0];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.getElementById('start-btn') !== null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.getElementById('start-btn');
    return button && !button.disabled;
  }, { timeout: 60000 });

  // 真的把游戏跑起来：进菜单 → 开新局 → 确认 HUD 与 3D 都活着。
  await page.click('#start-btn');
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    return hud && !hud.hidden;
  }, { timeout: 60000 });
  await page.waitForFunction(async () => {
    const { engine } = await import('/src/main.js');
    return engine.state.mode === 'playing' || engine.state.mode === 'paused';
  }, { timeout: 30000 });
  const state = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    return {
      mode: engine.state.mode,
      entities: engine.state.entities.length,
      drawCalls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
      canvas: Boolean(ocean.renderer.domElement),
    };
  });
  assert.ok(state.canvas, '没有渲染画布');
  assert.ok(state.drawCalls > 0, '一帧都没画出来');
  assert.ok(state.triangles > 0, '场景里没有三角形');
  assert.ok(state.entities > 100, `场景实体太少：${state.entities}`);
  assert.ok(['playing', 'paused'].includes(state.mode), `游戏没有进入可玩状态：${state.mode}`);
  assert.deepEqual(errors, [], `桌面版运行时报错：${errors.join(' | ')}`);
  console.log('desktop build verified:', JSON.stringify(state));
} finally {
  if (browser) await browser.close().catch(() => {});
  child.kill();
}
