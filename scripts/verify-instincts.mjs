// 阶段 1 回归：确认本能技能系统在本机浏览器里真的可用。
// 它不替代 npm.cmd test，只验证"接线"是否正确：输入 → 引擎 → HUD → 画面。
// 注意：软件渲染（swiftshader）下帧率极低，所以等待必须按帧计数，而不是按毫秒。
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

// 等到渲染循环真正跑过若干帧再继续。
// polling 必须用定时器而不是 rAF：waitForFunction 默认用 rAF 轮询，
// 而页面里的 rAF 也被计了帧数，会把等待数提前满足。
const waitFrames = async (count = 4) => {
  const start = await page.evaluate(() => window.__frames);
  await page.waitForFunction(([target, base]) => window.__frames >= base + target, [count, start], { polling: 250 });
};

await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled);
await page.click('#start-btn');
await waitFrames(4);

// 软件渲染下先降到低画质，保证回归脚本本身跑得动。
await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  ocean.quality('low');
});

// 教学遮罩会暂停世界。关掉它，测试才能真正推进模拟。
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const skip = document.getElementById('onboarding-skip');
  if (skip) skip.click();
  engine.state.mode = 'playing';
});

// 技能条必须已经挂载：4 个新槽位，其中未整合的是暗色剪影。
const bar = await page.evaluate(() => {
  const nav = document.querySelector('.instinct-bar');
  if (!nav) return null;
  return [...nav.querySelectorAll('.instinct-button')].map(button => ({
    id: button.dataset.instinct,
    locked: button.classList.contains('locked'),
    name: button.querySelector('.instinct-name')?.textContent,
  }));
});
assert.ok(bar, '本能技能条没有挂载');
assert.deepEqual(bar.map(entry => entry.id), ['bite', 'jet', 'mimic', 'sense']);
assert.ok(bar.every(entry => entry.locked), '开局时新技能都应处于未整合状态');

// 直接把一个技能塞进玩家体内，验证 HUD 与引擎两条链路都接上了。
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  engine._unlockInstinct('bite', '测试');
});
await waitFrames(4);
const unlocked = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const button = document.querySelector('.instinct-button[data-instinct="bite"]');
  return {
    rank: engine.state.player.instincts.bite,
    locked: button?.classList.contains('locked'),
    owned: button?.classList.contains('owned'),
    dataRank: button?.dataset.rank,
  };
});
assert.equal(unlocked.rank, 1, '技能没有被记入玩家状态');
assert.equal(unlocked.locked, false, '技能条没有从剪影切换为已拥有');
assert.equal(unlocked.owned, true, '技能条缺少已拥有状态');
assert.equal(unlocked.dataRank, '1', '技能条没有显示阶数');

// 战斗与状态判定用独立的引擎实例做：正在跑的那个每帧都会被渲染循环推进，
// 混在一起会让前摇计时、实体数量和命中数都不可控。
const mechanics = await page.evaluate(async () => {
  const { GameEngine } = await import('/src/engine.js');
  const build = () => {
    const engine = new GameEngine({ seed: 7 });
    engine.start();
    const p = engine.state.player;
    p.level = 5;
    p.branches = { devour: 0, radiation: 0, symbiosis: 0 };
    p.instincts.bite = 1;
    p.instincts.mimic = 1;
    const fish = engine.state.entities.find(entity => entity.type === 'fish');
    engine.state.entities = [fish];
    p.energy = p.maxEnergy;
    p.cooldowns.bite = 0;
    p.biteWindup = 0;
    p.biteDirection = null;
    fish.speed = 0;
    return { engine, p, fish };
  };

  // 正前方撕咬：必须命中
  const front = build();
  front.p.facing = { x: 1, y: 0, z: 0 };
  front.fish.x = front.p.x + 3; front.fish.y = front.p.y; front.fish.z = front.p.z;
  front.fish.hp = front.fish.maxHp; front.fish.dead = false;
  const frontBefore = front.fish.hp;
  front.engine.update(0.05, { bite: true, dir: { x: 1, y: 0, z: 0 } });
  // 撕咬有前摇：update() 会把 dt 钳到 0.1 秒，所以要多推几帧。
  for (let step = 0; step < 8; step++) front.engine.update(0.1, {});
  const frontHits = front.engine.drainEvents().filter(event => event.type === 'bite').map(event => event.hits);

  // 背对目标撕咬：必须打不中
  const back = build();
  back.p.facing = { x: -1, y: 0, z: 0 };
  back.fish.x = back.p.x + 3; back.fish.y = back.p.y; back.fish.z = back.p.z;
  back.fish.hp = back.fish.maxHp; back.fish.dead = false;
  const backBefore = back.fish.hp;
  back.engine.update(0.05, { bite: true, dir: { x: -1, y: 0, z: 0 } });
  for (let step = 0; step < 8; step++) back.engine.update(0.1, {});
  const backHits = back.engine.drainEvents().filter(event => event.type === 'bite').map(event => event.hits);

  // 拟态：必须缩短被发现的距离
  const mimic = build();
  const plainFactor = mimic.engine._mimicFactor();
  mimic.p.mimicActive = true;
  const hiddenFactor = mimic.engine._mimicFactor();
  mimic.p.mimicActive = false;

  // 扫描：按住时进入扫描状态并消耗体能。
  // 体能本来就会自然回复，所以要和不扫描的那一份对比，才看得出消耗。
  const scanIdle = build();
  scanIdle.p.instincts.sense = 1;
  scanIdle.p.energy = 50;
  scanIdle.p.nutrition = 0;
  scanIdle.engine.update(0.1, {});
  const scanHeld = build();
  scanHeld.p.instincts.sense = 1;
  scanHeld.p.energy = 50;
  scanHeld.p.nutrition = 0;
  scanHeld.engine.update(0.1, { scan: true });
  const scan = { active: scanHeld.p.scanActive, idleEnergy: scanIdle.p.energy, heldEnergy: scanHeld.p.energy };

  return {
    front: { before: frontBefore, after: front.fish.hp, hits: frontHits },
    back: { before: backBefore, after: back.fish.hp, hits: backHits },
    mimic: { plainFactor, hiddenFactor },
    scan,
  };
});

assert.ok(mechanics.front.after < mechanics.front.before, `撕咬没有造成伤害：${mechanics.front.before} → ${mechanics.front.after}`);
assert.deepEqual(mechanics.front.hits, [1], '正前方撕咬的命中数不是 1');
assert.deepEqual(mechanics.back.hits, [0], '背对目标时撕咬不该命中');
assert.equal(mechanics.back.after, mechanics.back.before, '背对目标时目标不该掉血');
assert.ok(mechanics.mimic.hiddenFactor < mechanics.mimic.plainFactor, '拟态没有降低被发现的概率');
assert.equal(mechanics.scan.active, true, '按住扫描没有进入扫描状态');
assert.ok(mechanics.scan.heldEnergy < mechanics.scan.idleEnergy, '扫描没有消耗体能');

// 扫描的轮廓标记必须在真实场景里出现 —— 这条要走真实的按键链路。
await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  engine.state.player.instincts.sense = 1;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', bubbles: true }));
});
await waitFrames(8);
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', bubbles: true })));
const markers = await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  return ocean.scanMarkers.count;
});
assert.ok(markers > 0, '扫描没有标记任何生命');

await page.screenshot({ path: path.join(root, 'artifacts', 'v18-instinct-hud.png') });

assert.deepEqual(errors, [], `页面出现运行时错误：${errors.join(' | ')}`);
console.log('instinct system verified:', JSON.stringify({ bar, unlocked, mechanics, markers }));
await browser.close();
