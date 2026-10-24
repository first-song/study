// 阶段 3 回归：确认"每只回声体都有一把钥匙"在真实场景里成立并被玩家看见。
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
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('start-btn') && !document.getElementById('start-btn').disabled);
await page.click('#start-btn');
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  ocean.quality('low');
  document.getElementById('onboarding-skip')?.click();
  engine.state.mode = 'playing';
});

// 三只回声体的钥匙必须各不相同，而且真的在数值上生效。
const keys = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const { ECHO_RESIST } = await import('/src/echo-system.js');
  const results = [];
  for (const echo of engine.state.entities.filter(entity => entity.type === 'echo')) {
    echo.phase = 'exposed';
    const hp0 = echo.hp;
    engine._damageEcho(echo, 60, '辐射脉冲', 'pulse');
    const pulse = hp0 - echo.hp;
    echo.hp = hp0;
    engine._damageEcho(echo, 60, '撕咬', 'melee');
    const melee = hp0 - echo.hp;
    // 揭示真身之后，抗性不再成立。
    echo.hp = hp0;
    echo.revealedUntil = engine.state.time + 8;
    engine._damageEcho(echo, 60, '撕咬', 'melee');
    const revealed = hp0 - echo.hp;
    results.push({ kind: echo.echoKind, needs: ECHO_RESIST[echo.echoKind]?.needs, pulse: +pulse.toFixed(1), melee: +melee.toFixed(1), revealed: +revealed.toFixed(1) });
  }
  return results;
});
assert.equal(keys.length, 3, '应当有三只回声体');
assert.deepEqual(keys.map(entry => entry.needs).sort(), ['melee', 'pulse', 'reveal'], '三只回声体的钥匙必须各不相同');
for (const entry of keys) {
  if (entry.needs === 'melee') {
    assert.ok(entry.melee > entry.pulse * 1.8, `${entry.kind} 的钥匙（近战）应该明显更有效：${JSON.stringify(entry)}`);
  } else if (entry.needs === 'pulse') {
    assert.ok(entry.pulse > entry.melee * 1.8, `${entry.kind} 的钥匙（脉冲）应该明显更有效：${JSON.stringify(entry)}`);
  } else {
    assert.ok(entry.revealed > entry.melee * 1.8, `${entry.kind} 的钥匙（感知）应该明显更有效：${JSON.stringify(entry)}`);
  }
}

// 用错工具时，玩家必须看到解释。
const feedback = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const echo = engine.state.entities.find(entity => entity.type === 'echo' && entity.echoKind === 'shardHunter');
  echo.pacified = false;
  echo.hp = echo.maxHp;
  echo.phase = 'exposed';
  echo.resistHinted = false;
  echo.revealedUntil = 0;
  engine.drainEvents();
  // toast 容器只保留最后三条，所以要一路记录，不能只看当前 DOM。
  const seen = [];
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.textContent) seen.push(node.textContent);
    }
  });
  observer.observe(document.getElementById('toast-container'), { childList: true });
  engine._damageEcho(echo, 60, '辐射脉冲', 'pulse');
  // 软件渲染只有 2fps，要多等几帧 toast 才会被主循环消费掉。
  await new Promise(resolve => setTimeout(resolve, 3000));
  observer.disconnect();
  return { text: seen.join(' | '), type: echo.echoKind };
});
assert.ok(feedback.text.includes('挡下') || feedback.text.includes('闪开') || feedback.text.includes('弹开'),
  `用错工具时应当给出解释，实际提示是："${feedback.text}"`);

// 追猎面板必须把钥匙写出来。
const panel = await page.evaluate(async () => {
  const { engine } = await import('/src/main.js');
  const echo = engine.state.entities.find(entity => entity.type === 'echo');
  const { huntPresentation } = await import('/src/hunt-ui.js');
  const presentation = huntPresentation(echo);
  return { role: presentation.role, hint: presentation.hint, strategy: presentation.strategy };
});
assert.ok(panel.strategy, '追猎面板必须标出这只回声体的钥匙');
assert.ok(panel.hint.length > 20, '追猎提示必须说清楚怎么打');

assert.deepEqual(errors, [], `页面出现运行时错误：${errors.join(' | ')}`);
console.log('echo keys verified:', JSON.stringify({ keys, feedback: feedback.text, panel }));
await browser.close();
