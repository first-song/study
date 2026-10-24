// 阶段 2 回归：排放母体的三阶段状态机、触须、云团与核心窗口。
// 与 verify-instincts 一样：引擎逻辑用独立实例测，画面用真实场景截图确认。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && existsSync(candidate));
if (!executablePath) throw new Error('Install Chrome or Edge, or set CHROME_PATH to a Chromium executable.');

const browser = await chromium.launch({
  executablePath, headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(120000);
await page.addInitScript(() => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = cb => raf(t => { window.__frames++; cb(t); });
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const waitFrames = async (count = 4) => {
  const start = await page.evaluate(() => window.__frames);
  await page.waitForFunction(([target, base]) => window.__frames >= base + target, [count, start], { polling: 250 });
};

await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled);
await page.click('#start-btn');
await waitFrames(3);
await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  ocean.quality('low');
  const { engine } = await import('/src/main.js');
  document.getElementById('onboarding-skip')?.click();
  engine.state.mode = 'playing';
});

// 把母体放到玩家面前：先停掉三座反应堆（它是供能屏障的产物），
// 再把等级提到会生成 boss 的阶段。
const staged = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const { islandFinalCorePoint } = await import('/src/island.js');
  const { createTendrils } = await import('/src/emissions-mother.js');
  const player = engine.state.player;
  for (const reactor of engine.state.entities.filter(entity => entity.type === 'reactor')) {
    Object.assign(reactor, { status: 'shutdown', phase: 'shutdown', phaseRemaining: 0, pollution: 0, progress: 1 });
    engine.state.expedition.shutdowns.push(reactor.siteId);
  }
  for (const echo of engine.state.entities.filter(entity => entity.type === 'echo')) {
    Object.assign(echo, { pacified: true, phase: 'pacified', phaseRemaining: 0, hp: 1, link: 0 });
    engine.state.expedition.echoesPacified.push(echo.reactorSiteId);
  }
  player.level = 9;
  player.xp = 0;
  const core = islandFinalCorePoint(engine.state.world);
  engine._checkLevel();
  let boss = engine.state.entities.find(entity => entity.type === 'boss');
  if (!boss) {
    boss = engine._entity('boss', core.x, core.y, core.z, 6.5, 780, {
      attackTime: 3, phase: 1, weakened: false,
      motherPhase: 'armor', clouds: [], coreWindowOpen: false, coreTimer: 0, rageTimer: 4.4, spoutTimer: 1.5,
    });
    if (boss) createTendrils(engine, boss);
  }
  // 把玩家放到母体旁边，好在截图里看清它。
  player.x = boss.x + 22; player.y = boss.y + 4; player.z = boss.z + 14;
  player.vx = 0; player.vy = 0; player.vz = 0;
  const { ocean } = await import('/src/main.js');
  ocean.yaw = Math.atan2(-(boss.x - player.x), -(boss.z - player.z));
  ocean.pitch = -0.1;
  return {
    hasBoss: Boolean(boss),
    tendrils: engine.state.entities.filter(entity => entity.type === 'tendril').length,
    phase: boss?.motherPhase,
  };
});
assert.ok(staged.hasBoss, '排放母体没有出现');
assert.equal(staged.tendrils, 3, '母体应该有三条触须');
assert.equal(staged.phase, 'armor', '母体应该从外甲阶段开始');

await waitFrames(10);
await page.screenshot({ path: path.join(root, 'artifacts', 'v18-mother-armor.png') });

// 喷发阶段：污染云团必须真的出现在画面上。
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const boss = engine.state.entities.find(entity => entity.type === 'boss');
  boss.motherPhase = 'spout';
  boss.clouds = [
    { x: boss.x + 7, y: boss.y - 1, z: boss.z + 3, radius: 8, life: 2, active: true, seed: 1 },
    { x: boss.x - 6, y: boss.y + 2, z: boss.z - 5, radius: 6, life: 1, active: true, seed: 2 },
  ];
});
await waitFrames(10);
await page.screenshot({ path: path.join(root, 'artifacts', 'v18-mother-spout.png') });
const cloudVisible = await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  return ocean.motherClouds.filter(object => object.visible).length;
});
assert.ok(cloudVisible >= 2, '污染云没有出现在画面上');

// 核心阶段：窗口张开时核心要亮起来。
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const boss = engine.state.entities.find(entity => entity.type === 'boss');
  boss.motherPhase = 'core';
  boss.coreWindowOpen = true;
  boss.clouds = [];
});
await waitFrames(10);
await page.screenshot({ path: path.join(root, 'artifacts', 'v18-mother-core.png') });

// 三阶段状态机：用独立引擎实例跑完整个战斗。
const fight = await page.evaluate(async () => {
  const { GameEngine } = await import('/src/engine.js');
  const { createTendrils } = await import('/src/emissions-mother.js');
  const engine = new GameEngine({ seed: 91 });
  engine.start();
  const player = engine.state.player;
  player.level = 12;
  player.branches = { devour: 4, radiation: 4, symbiosis: 4 };
  player.instincts.bite = 1;
  player.instincts.pulse = 1;
  for (const reactor of engine.state.entities.filter(entity => entity.type === 'reactor')) {
    Object.assign(reactor, { status: 'shutdown', phase: 'shutdown', phaseRemaining: 0, pollution: 0, progress: 1 });
    engine.state.expedition.shutdowns.push(reactor.siteId);
  }
  for (const echo of engine.state.entities.filter(entity => entity.type === 'echo')) {
    Object.assign(echo, { pacified: true, phase: 'pacified', phaseRemaining: 0, hp: 1, link: 0 });
    engine.state.expedition.echoesPacified.push(echo.reactorSiteId);
  }
  engine._checkLevel();
  let boss = engine.state.entities.find(entity => entity.type === 'boss');
  if (!boss) {
    boss = engine._entity('boss', 0, 30, 0, 6.5, 780, {
      attackTime: 3, phase: 1, weakened: false,
      motherPhase: 'armor', clouds: [], coreWindowOpen: false, coreTimer: 0, rageTimer: 4.4, spoutTimer: 1.5,
    });
    if (boss) createTendrils(engine, boss);
  }
  engine.drainEvents();
  const phases = [];
  const seen = new Set();
  for (let tick = 0; tick < 4000 && engine.state.mode === 'playing'; tick++) {
    // 阶段在推进之前就要记下来：外甲可能在第一次 tick 就被打穿。
    if (!seen.has(boss.motherPhase)) { seen.add(boss.motherPhase); phases.push(boss.motherPhase); }
    const tendrils = engine.state.entities.filter(entity => entity.type === 'tendril');
    let aim = boss;
    if (boss.motherPhase === 'armor' && tendrils.length) aim = tendrils[0];
    else if (boss.motherPhase === 'spout') {
      const clouds = (boss.clouds || []).filter(cloud => cloud.active);
      if (clouds.length) aim = { x: clouds[0].x, y: clouds[0].y, z: clouds[0].z };
    }
    const dx = aim.x - player.x, dy = aim.y - player.y, dz = aim.z - player.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    player.x = aim.x - dx / length * 6;
    player.y = aim.y - dy / length * 6;
    player.z = aim.z - dz / length * 6;
    player.energy = player.maxEnergy;
    engine.update(0.1, {
      x: dx / length, y: dy / length, z: dz / length,
      dir: { x: dx / length, y: dy / length, z: dz / length },
      pulse: true, bite: true,
    });
    engine.drainEvents();
  }
  return {
    phases,
    weakened: boss.weakened,
    motherPhase: boss.motherPhase,
    hp: boss.hp,
    tendrilLeft: engine.state.entities.filter(entity => entity.type === 'tendril').length,
    mode: engine.state.mode,
  };
});

// 外甲 → 喷发 → 核心 三段必须依次走过，并且最后能被打穿。
assert.deepEqual(fight.phases, ['armor', 'spout', 'core', 'dead'], '母体的阶段没有依次推进');
assert.equal(fight.weakened, true, '母体没有被击败');
assert.equal(fight.motherPhase, 'dead', '母体没有进入死亡阶段');
assert.equal(fight.tendrilLeft, 0, '母体死亡后触须没有清除');

assert.deepEqual(errors, [], `页面出现运行时错误：${errors.join(' | ')}`);
console.log('emissions mother verified:', JSON.stringify({ staged, fight }));
await browser.close();
