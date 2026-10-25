// V23 回归：潮汐日、猎杀窗口、野外笔记是否真的接进了浏览器运行时。
// 纯规则部分由 tests/tide.test.mjs 与 tests/hunting.test.mjs 覆盖；
// 这里只验证"接线"：引擎 → 输入 → 伤害 → HUD / 事件。
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
].find(candidate => candidate && existsSync(candidate));
if (!executablePath) throw new Error('Install Chrome or Edge, or set CHROME_PATH.');

const browser = await chromium.launch({
  executablePath, headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled, { timeout: 90000 });
await page.click('#start-btn');
await page.waitForTimeout(1200);

const result = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const { instinctRank } = await import('/src/instincts.js');
  const { tideAt } = await import('/src/tide.js');
  document.getElementById('onboarding-skip')?.click();
  const state = engine.state;
  state.mode = 'playing';
  const p = state.player;
  p.level = 7; p.lifeStage = 3;
  // 直接给到撕咬一阶，绕开随机解锁 —— 这里测的是窗口，不是抽卡。
  p.instincts = { ...(p.instincts || {}), bite: 1 };

  const place = (entity, at) => {
    entity.x = at.x; entity.y = at.y; entity.z = at.z;
    entity.hp = entity.maxHp; entity.dead = false;
  };
  // 清场：只留测试用的两只生物，避免别的伤害干扰读数。
  state.entities = state.entities.filter(entity => !['predator', 'drone', 'shark', 'squid'].includes(entity.type));

  const spawn = (type, at, extra = {}) => {
    const entity = engine._entity(type, at.x, at.y, at.z, type === 'crab' ? 1.3 : 0.9, 9999, { speed: 0, ...extra });
    entity.homeY = at.y;
    return entity;
  };

  const biteOnce = (target) => {
    p.facing = { x: 0, y: 0, z: -1 };
    p.biteDirection = { x: 0, y: 0, z: -1 };
    p.x = target.x; p.y = target.y; p.z = target.z + Math.min(3, target.radius + 2.2);
    p.biteWindup = 0;
    engine._resolveBite();
  };

  // --- 1. 鱼群盲区：从背后咬一口，伤害必须是普通命中的两倍以上 ---
  const fishFront = spawn('fish', { x: 0, y: 44, z: 0 }, { vx: 0, vz: -1, heading: 0 });
  fishFront.hp = fishFront.maxHp = 100000;
  biteOnce(fishFront);
  const blindDamage = 100000 - fishFront.hp;

  const fishAhead = spawn('fish', { x: 40, y: 44, z: 0 }, { vx: 0, vz: -1, heading: 0 });
  fishAhead.hp = fishAhead.maxHp = 100000;
  p.x = fishAhead.x; p.y = fishAhead.y; p.z = fishAhead.z - 3; // 站到它正前方
  p.facing = { x: 0, y: 0, z: 1 };
  p.biteDirection = { x: 0, y: 0, z: 1 };
  p.biteWindup = 0;
  engine._resolveBite();
  const frontDamage = 100000 - fishAhead.hp;

  const notesAfterFish = [...(state.fieldNotes || [])];

  // --- 2. 蟹的周期窗口：窗口内 vs 窗口外 ---
  const crab = spawn('crab', { x: 80, y: 8, z: 0 }, { seed: 0 });
  crab.hp = crab.maxHp = 100000;
  state.time = 0; // (0 + 0) % 13 < 2.8 → 蜕壳窗口开着
  const crabWindow = (await import('/src/hunting.js')).huntWindowAt(crab, state.time, p);
  biteOnce(crab);
  const openCrabDamage = 100000 - crab.hp;

  crab.hp = crab.maxHp = 100000;
  state.time = 5; // 窗口关闭
  const crabClosed = (await import('/src/hunting.js')).huntWindowAt(crab, state.time, p);
  biteOnce(crab);
  const closedCrabDamage = 100000 - crab.hp;

  // --- 3. 潮汐日真的改变引擎侧参数 ---
  const dawn = tideAt(10), night = tideAt(230);

  return {
    blindDamage, frontDamage,
    blindRatio: blindDamage / frontDamage,
    notesAfterFish,
    crabWindowOpen: crabWindow.open, crabWindowClosed: crabClosed.open,
    crabRatio: openCrabDamage / closedCrabDamage,
    notes: [...(state.fieldNotes || [])],
    tide: {
      dawnName: dawn.name, nightName: night.name,
      dawnLight: dawn.light, nightLight: night.light,
      nightAggression: night.aggression,
    },
    biteRank: instinctRank(p, 'bite'),
  };
});

assert.ok(result.blindRatio > 1.9, `背后咬的伤害应是正面的两倍以上，实测 ${result.blindRatio.toFixed(2)}×`);
assert.ok(result.notesAfterFish.includes('fishBlind'), '第一次盲区命中应写下鱼群笔记');
assert.equal(result.crabWindowOpen, true, '蟹在周期开头应处于蜕壳窗口');
assert.equal(result.crabWindowClosed, false, '蟹在周期中段应关闭窗口');
assert.ok(result.crabRatio > 2.4, `蜕壳期伤害应显著更高，实测 ${result.crabRatio.toFixed(2)}×`);
assert.ok(result.notes.includes('crabMolt'), '蜕壳期命中应写下蟹的笔记');
assert.ok(result.tide.nightLight < result.tide.dawnLight, '深夜应比拂晓更暗');
assert.ok(result.tide.nightAggression > 1, '深夜捕食压力应更高');
assert.deepEqual(errors, [], '浏览器不应有运行时错误');

console.log('v23 verified:', JSON.stringify(result));
await browser.close();
