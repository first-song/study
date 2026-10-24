import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const artifacts = path.join(root, 'artifacts');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && existsSync(candidate));
if (!executablePath) throw new Error('Install Chrome or Edge, or set CHROME_PATH to a Chromium executable.');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath, headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(30000);
await page.addInitScript(() => {
  window.__ambientStarts = 0;
  const prototype = window.BaseAudioContext?.prototype;
  if (!prototype) return;
  const createSource = prototype.createBufferSource;
  prototype.createBufferSource = function (...args) {
    const source = createSource.apply(this, args);
    const start = source.start;
    source.start = function (...startArgs) {
      if (this.loop) window.__ambientStarts++;
      return start.apply(this, startArgs);
    };
    return source;
  };
});
const errors = [];
const failedRequests = [];
const checks = [];
const limitations = [];
const startedAt = Date.now();
let pointerLock = { supported: false, acquired: false };
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
// 页面关闭时的 /quit 信标必然被浏览器中断，这不是失败。
page.on('requestfailed', request => { if (request.url().includes('/quit')) return; failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`); });
const state = () => page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  const { player: p, mode, time, stage } = engine.state;
  return { mode, time, stage, level: p.level, x: p.x, y: p.y, z: p.z,
    branches: { ...p.branches }, firstPerson: ocean.firstPerson, yaw: ocean.yaw, pitch: ocean.pitch,
    cooldowns: { ...p.cooldowns }, energy: p.energy, nutrition: p.nutrition,
    mutationEnergy: p.mutationEnergy, mutations: { ...p.mutations },
    mutationEvents: p.mutationEvents, mutationHistory: p.mutationHistory,
    attachment: p.attachment, expedition: engine.state.expedition,
    rngState: engine.serialize().rngState,
    bodyPlan: ocean.bodyPlan };
});
// Dynamic imports make these predicates async. Poll the resolved evaluation;
// waitForFunction in the installed runner considers a Promise itself truthy.
const waitForEvaluation = (target, predicate, arg, options = {}) => expect.poll(
  () => target.evaluate(predicate, arg),
  { timeout: options.timeout ?? 30000, intervals: [50, 100, 200] },
).toBeTruthy();
const waitMode = mode => waitForEvaluation(page, async expected => {
  const { engine } = await import('/src/main.js');
  return engine.state.mode === expected;
}, mode);
// 截图自己写盘：Playwright 直接写文件在 Windows 上偶发 UNKNOWN(open)，
// 走内存缓冲 + 一次重试就稳定了。
const screenshot = async name => {
  const target = path.join(artifacts, `${name}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const buffer = await page.screenshot();
      await writeFile(target, buffer);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
};
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const assertReactorCameraClear = async target => {
  await waitForEvaluation(target, async () => {
    const { engine, ocean } = await import('/src/main.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const p = engine.state.player;
    if (ocean.firstPerson || p.attachment?.kind !== 'reactor') return false;
    const yawError = Math.atan2(Math.sin(ocean.yaw - ocean.cameraYaw), Math.cos(ocean.yaw - ocean.cameraYaw));
    if (Math.abs(yawError) > 0.03) return false;
    const reactor = ocean.objects.get(p.attachment.entityId);
    if (!reactor) return false;
    const targetPoint = new THREE.Vector3(p.x, p.y + 0.5, p.z);
    const direction = targetPoint.clone().sub(ocean.camera.position);
    const distance = direction.length();
    const ray = new THREE.Raycaster(ocean.camera.position, direction.normalize(), 0.05, Math.max(0.05, distance - 0.15));
    const meshes = [];
    reactor.updateWorldMatrix(true, true);
    reactor.traverse(child => { if (child.isMesh && !child.material?.transparent) meshes.push(child); });
    return distance > 7 && ray.intersectObjects(meshes, false).length === 0;
  }, undefined, { timeout: 15000 });
};

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('aberrant-tide-onboarding-v1'));
  await page.locator('#start-btn').waitFor({ state: 'visible' });
  assert.equal(await page.locator('canvas').count() >= 1, true);
  await screenshot('01-menu');
  check('3D menu loads');
  await page.locator('#help-btn').click();
  await page.locator('#help-screen').waitFor({ state: 'visible' });
  await page.locator('#help-close-btn').click();
  await page.locator('#help-screen').waitFor({ state: 'hidden' });
  await page.locator('#quality-select').selectOption('low');
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).ocean.motes.visible), false);
  await page.locator('#quality-select').selectOption('medium');
  check('survival guide and quality setting');

  const selectedSeedText = '异潮·灯笼深海';
  await page.locator('#world-seed').fill(selectedSeedText);
  await page.locator('#start-btn').click();
  await page.locator('#onboarding-screen').waitFor({ state: 'visible' });
  await waitMode('paused');
  assert.ok((await page.locator('#onboarding-detail').innerText()).includes('海洋雪'));
  // 教学页数会变：按页面上写的总数走完，最后一页才有寄生路线与海洋之息。
  const onboardingTotal = Number((await page.locator('#onboarding-step-value').innerText()).split('/')[1]);
  assert.ok(onboardingTotal >= 5, 'the survival briefing must have several steps');
  for (let step = 1; step < onboardingTotal; step++) await page.locator('#onboarding-next').click();
  assert.ok((await page.locator('#onboarding-detail').innerText()).includes('寄生路线'));
  assert.ok((await page.locator('#onboarding-detail').innerText()).includes('海洋之息'));
  await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-screen').waitFor({ state: 'hidden' });
  await waitMode('playing');
  await page.waitForTimeout(100);
  await screenshot('02-third-person');
  assert.equal((await state()).bodyPlan, 1);
  assert.ok((await state()).nutrition > 0);
  assert.ok((await page.locator('#body-plan-name').innerText()).trim().length > 0);
  assert.ok((await page.locator('#zone-name').innerText()).trim().length > 0);
  const seededWorld = await page.evaluate(async text => {
    const { engine } = await import('/src/main.js');
    const { seedFromText } = await import('/src/frame-step.js');
    return { actual: engine.state.world.seed, expected: seedFromText(text) };
  }, selectedSeedText);
  assert.equal(seededWorld.actual, seededWorld.expected, 'Text seeds must deterministically select the ocean');
  await page.keyboard.press('j');
  await page.locator('#chart-screen').waitFor({ state: 'visible' });
  await waitMode('paused');
  assert.ok((await page.locator('#chart-seed').innerText()).includes(String(seededWorld.actual)));
  await page.keyboard.press('b');
  await page.locator('#chart-screen').waitFor({ state: 'hidden' });
  await page.locator('#biology-screen').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#biology-screen').isVisible(), true, 'Opening the codex from the chart must close the chart');
  await page.keyboard.press('b');
  await page.locator('#biology-screen').waitFor({ state: 'hidden' });
  await waitMode('playing');
  await page.keyboard.press('b');
  await page.locator('#biology-screen').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#biology-content').innerText()).length > 100);
  const codexTime = (await state()).time;
  await page.waitForTimeout(100);
  assert.equal((await state()).time, codexTime, 'Ecology codex must pause the simulation');
  await page.locator('[data-codex-tab="species"]').click();
  assert.ok(await page.locator('#biology-content .species-card').count() >= 10);
  assert.equal(await page.locator('#biology-content .abnormal-card').count(), 3, 'The codex must describe all three abnormal phenotypes');
  await screenshot('10-ecology-species');
  await page.locator('[data-codex-tab="ocean"]').click();
  assert.equal(await page.locator('#biology-content .zone-card').count(), 3);
  assert.ok(await page.locator('#biology-content .biology-sources a').count() >= 3);
  await page.locator('[data-codex-tab="forms"]').click();
  await page.locator('#biology-close-btn').click();
  await page.locator('#biology-screen').waitFor({ state: 'hidden' });
  await waitMode('playing');
  await page.locator('#biology-btn').click();
  await page.locator('#biology-screen').waitFor({ state: 'visible' });
  await page.keyboard.press('b');
  await page.locator('#biology-screen').waitFor({ state: 'hidden' });
  await waitMode('playing');
  check('one-time survival tutorial, text seed, ocean chart, ecology codex, nutrition HUD, and initial body plan');
  const ecologicalRules = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const saved = engine.serialize();
    const source = saved.state.entities;
    const p = engine.state.player;
    const sample = type => {
      const original = source.find(entity => entity.type === type);
      if (!original) throw new Error(`Missing ecology entity: ${type}`);
      return { ...original, x: p.x, y: p.y, z: p.z };
    };
    const result = {};
    const facilities = () => source.filter(entity => ['reactor', 'biofilm'].includes(entity.type)).map(entity => ({ ...entity }));
    try {
      for (const type of ['food', 'marineSnow', 'isotope']) {
        p.nutrition = 40;
        p.xp = 0;
        p.vx = p.vy = p.vz = 0;
        engine.state.entities = [...facilities(), sample(type)];
        engine.spawnTimer = 1;
        engine.update(0.016, {});
        result[type] = p.nutrition;
        result[`${type}Xp`] = p.xp;
      }
      p.energy = p.maxEnergy;
      p.cooldowns.pulse = p.cooldowns.feed = 0;
      const fish = sample('fish');
      const whale = sample('whale');
      fish.z += 3;
      whale.z += 18;
      const fishHp = fish.hp;
      const whaleHp = whale.hp;
      engine.state.entities = [...facilities(), fish, whale];
      engine.update(0.016, { pulse: true, feed: true });
      result.fishProtected = engine.state.entities.includes(fish) && fish.hp === fishHp;
      result.whaleProtected = engine.state.entities.includes(whale) && whale.hp === whaleHp;
    } finally {
      if (!engine.restore(saved)) throw new Error('Ecology fixture save could not be restored');
    }
    return result;
  });
  assert.ok(ecologicalRules.food > 40 && ecologicalRules.marineSnow > 40, 'Organic food must refill nutrition');
  assert.ok(ecologicalRules.isotope <= 40, 'Isotopes must not replace organic nutrition');
  assert.equal(ecologicalRules.foodXp + ecologicalRules.marineSnowXp + ecologicalRules.isotopeXp, 0, 'Collecting food and isotope particles must not grant development experience');
  assert.ok(ecologicalRules.fishProtected && ecologicalRules.whaleProtected, 'A cell must not consume or harm large animals');
  check('organic nutrition, isotope separation, and body-stage feeding limits');

  const expeditionFixture = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    return { save: engine.serialize(), storedSave: localStorage.getItem('aberrant-tide-save-v1'), firstPerson: ocean.firstPerson, yaw: ocean.yaw, pitch: ocean.pitch };
  });
  try {
    await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const film = engine.state.entities.find(e => e.type === 'biofilm' && e.siteId === 'nursery');
      Object.assign(engine.state.player, { x: film.x, y: film.y, z: film.z + 1, vx: 0, vy: 0, vz: 0 });
    });
    await page.locator('#expedition-interact').waitFor({ state: 'visible' });
    await page.keyboard.press('g');
    await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.attachment?.kind === 'biofilm');
    await page.waitForFunction(() => document.querySelector('#expedition-context').dataset.attached === 'true');
    assert.ok((await page.locator('#expedition-target').innerText()).includes('菌膜'));
    await screenshot('15-biofilm-attachment');
    const biofilmResult = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { GameEngine } = await import('/src/engine.js');
      engine.update = () => {};
      for (let i = 0; i < 130; i++) GameEngine.prototype.update.call(engine, 0.1, {});
      return { level: engine.state.player.level, log: engine.state.expedition, attachment: engine.state.player.attachment, mode: engine.state.mode };
    });
    assert.equal(biofilmResult.mode, 'playing');
    assert.equal(biofilmResult.level, 3);
    assert.deepEqual(biofilmResult.log.biofilms, ['nursery']);
    assert.equal(biofilmResult.attachment, null);
    await page.waitForFunction(() => document.querySelector('#expedition-count').textContent === '1 / 13');
    assert.equal(await page.locator('#xp-fill').isVisible(), false, 'Particle XP must not remain the main HUD goal');
    check('G attaches to a biofilm and real nutrition exchange grants one development milestone');

    const hostId = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { interactionPosition } = await import('/src/ecosystem.js');
      const host = engine.state.entities.find(e => e.type === 'whale');
      engine.state.entities = [host, ...engine.state.entities.filter(e => e.id !== host.id)];
      Object.assign(engine.state.player, interactionPosition(host), { vx: 0, vy: 0, vz: 0 });
      delete engine.update;
      return host.id;
    });
    await page.keyboard.press('g');
    await waitForEvaluation(page, async id => (await import('/src/main.js')).engine.state.player.attachment?.entityId === id, hostId);
    await page.waitForFunction(() => document.querySelector('#expedition-kind').textContent === '宿主迁移' && document.querySelector('#expedition-context').dataset.attached === 'true');
    await screenshot('15-host-migration');
    const hostResult = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { GameEngine } = await import('/src/engine.js');
      engine.update = () => {};
      for (let i = 0; i < 240 && !engine.state.expedition.hostAdaptations.includes('whale'); i++) GameEngine.prototype.update.call(engine, 0.1, {});
      return { level: engine.state.player.level, attachment: engine.state.player.attachment, log: engine.state.expedition };
    });
    assert.equal(hostResult.level, 5);
    assert.deepEqual(hostResult.log.hostAdaptations, ['whale']);
    assert.ok(hostResult.attachment.elapsed >= 12 && hostResult.attachment.travelled >= 12);
    await page.evaluate(async () => { delete (await import('/src/main.js')).engine.update; });
    await page.keyboard.press('Space');
    await waitForEvaluation(page, async () => !(await import('/src/main.js')).engine.state.player.attachment);
    assert.equal((await state()).cooldowns.dash, 0, 'Space while attached must detach without also spending dash energy');
    check('host migration uses real travel and Space safely detaches');

    await page.evaluate(async () => {
      const { engine, ocean } = await import('/src/main.js');
      const { interactionPosition } = await import('/src/ecosystem.js');
      const reactor = engine.state.entities.find(e => e.type === 'reactor' && e.siteId === 'wreck');
      engine.state.entities = [reactor, ...engine.state.entities.filter(e => e.id !== reactor.id)];
      // 反应堆由异变回声体供能：先让它脱离反应堆，管道才允许附着。
      const echo = engine.state.entities.find(e => e.type === 'echo' && e.reactorSiteId === 'wreck');
      if (echo && !echo.pacified) engine._pacifyEcho(echo, '回归测试');
      engine.state.time = Math.ceil(engine.state.time / 21) * 21 + 1;
      engine._updateReactors(0);
      Object.assign(engine.state.player, interactionPosition(reactor), { vx: 0, vy: 0, vz: 0, radiation: 0, nutrition: 100, hp: engine.state.player.maxHp });
      ocean.yaw = 0; ocean.pitch = 0.1;
    });
    await page.waitForFunction(() => document.querySelector('#reactor-phase').textContent === '冷却窗口');
    await page.keyboard.press('g');
    await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.attachment?.kind === 'reactor');
    const partial = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { GameEngine } = await import('/src/engine.js');
      engine.update = () => {};
      for (let i = 0; i < 20; i++) GameEngine.prototype.update.call(engine, 0.1, {});
      return engine.serialize();
    });
    assert.equal(partial.version, 10);
    assert.ok(partial.state.player.attachment.progress > 0 && partial.state.player.attachment.progress < 1);
    await page.waitForFunction(expected => document.querySelector('#expedition-progress-value').textContent === `${Math.floor(expected * 100)}%`, partial.state.player.attachment.progress);
    await assertReactorCameraClear(page);
    await screenshot('15-reactor-cooldown');
    await page.locator('#pause-btn').click();
    await page.locator('#save-btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#continue-btn').waitFor({ state: 'visible' });
    await page.evaluate(async () => { (await import('/src/main.js')).engine.update = () => {}; });
    await page.locator('#continue-btn').click();
    await waitMode('playing');
    const partialRestored = await state();
    assert.deepEqual(partialRestored.expedition, partial.state.expedition);
    assert.deepEqual(partialRestored.attachment, partial.state.player.attachment);
    assert.equal(await page.evaluate(async () => (await import('/src/main.js')).engine.state.entities.filter(e => ['biofilm', 'reactor'].includes(e.type)).length), 6);
    await assertReactorCameraClear(page);
    check('v9 reload preserves milestones, all facilities, and an in-progress reactor attachment');

    await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      engine.state.time = Math.floor(engine.state.time / 21) * 21 + 12.2;
      engine._updateReactors(0);
    });
    await page.waitForFunction(() => document.querySelector('#reactor-phase').textContent === '排放预警');
    await screenshot('15-reactor-warning');
    await page.evaluate(async () => { delete (await import('/src/main.js')).engine.update; });
    await page.keyboard.press('Space');
    await waitForEvaluation(page, async () => !(await import('/src/main.js')).engine.state.player.attachment);
    const warningProgress = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      engine.update = () => {};
      engine.state.time = Math.floor(engine.state.time / 21) * 21 + 16.2;
      engine._updateReactors(0);
      return engine.state.entities.find(e => e.type === 'reactor' && e.siteId === 'wreck').progress;
    });
    await page.waitForFunction(() => document.querySelector('#reactor-phase').textContent === '正在排放');
    assert.equal(await page.locator('#expedition-interact').isDisabled(), true, 'A discharged reactor must reject a new attachment');
    await screenshot('15-reactor-discharge');
    await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      engine.state.time = Math.ceil(engine.state.time / 21) * 21 + 0.1;
      engine._updateReactors(0);
      delete engine.update;
    });
    await page.waitForFunction(() => document.querySelector('#reactor-phase').textContent === '冷却窗口');
    await page.keyboard.press('g');
    await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.attachment?.kind === 'reactor');
    const shutdown = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { GameEngine } = await import('/src/engine.js');
      engine.update = () => {};
      for (let i = 0; i < 100 && !engine.state.expedition.shutdowns.includes('wreck'); i++) GameEngine.prototype.update.call(engine, 0.1, {});
      return { reactor: engine.state.entities.find(e => e.type === 'reactor' && e.siteId === 'wreck'), log: engine.state.expedition, level: engine.state.player.level, mode: engine.state.mode };
    });
    assert.ok(warningProgress >= partial.state.player.attachment.progress, 'Leaving during warning must retain previous infiltration progress');
    assert.equal(shutdown.mode, 'playing');
    assert.equal(shutdown.reactor.status, 'shutdown');
    assert.equal(shutdown.reactor.pollution, 0);
    assert.deepEqual(shutdown.log.shutdowns, ['wreck']);
    assert.equal(shutdown.level, 8);
    await page.waitForFunction(() => document.querySelector('#expedition-count').textContent === '4 / 13');
    await screenshot('15-reactor-shutdown');
    check('reactor warning, discharge lockout, retained progress, and real shutdown update the HUD');
  } finally {
    await page.evaluate(async fixture => {
      const { engine, ocean } = await import('/src/main.js');
      delete engine.update;
      if (!engine.restore(fixture.save)) throw new Error('Expedition fixture save could not be restored');
      ocean.firstPerson=fixture.firstPerson; ocean.yaw=fixture.yaw; ocean.pitch=fixture.pitch;
      if(fixture.storedSave===null)localStorage.removeItem('aberrant-tide-save-v1');
      else localStorage.setItem('aberrant-tide-save-v1',fixture.storedSave);
    }, expeditionFixture);
  }
  // The previous fixture reached deep-water level 7. Wait for its restored
  // shallow-water body and light to render before capturing mutation baselines.
  await waitForEvaluation(page, async () => {
    const { engine, ocean } = await import('/src/main.js');
    return ocean.bodyPlan === Math.min(4, Math.floor((engine.state.player.level + 1) / 2));
  });

  // Keep automatic organ mutations and their replayable random state isolated
  // from body-growth and combat checks. The records panel never grants organs.
  const mutationFixture = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const fixture = {
      save: engine.serialize(), storedSave: localStorage.getItem('aberrant-tide-save-v1'),
      firstPerson: ocean.firstPerson, yaw: ocean.yaw, pitch: ocean.pitch,
      lightIntensity: ocean.playerLight.intensity, lightDistance: ocean.playerLight.distance,
    };
    engine.state.player.mutationEnergy = 0;
    return fixture;
  });
  try {
    await page.locator('#mutation-btn').click();
    await page.locator('#mutation-screen').waitFor({ state: 'visible' });
    await waitMode('paused');
    assert.equal(await page.locator('#mutation-content .mutation-card').count(), 7);
    assert.equal(await page.locator('#mutation-content button, #mutation-content [data-mutation]').count(), 0, 'Mutation records must have no purchase or selection controls');
    const mutationTime = (await state()).time;
    await page.waitForTimeout(100);
    assert.equal((await state()).time, mutationTime, 'The mutation panel must pause simulation time');
    await page.keyboard.press('m');
    await page.locator('#mutation-screen').waitFor({ state: 'hidden' });
    await waitMode('playing');
    const automaticMutation = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      // Freeze unrelated swimming and spawning while exercising actual mutation
      // methods and the live renderer, without choosing a particular outcome.
      engine.update = () => {};
      engine.state.player.mutationEnergy = 0;
      const before = engine.serialize();
      engine._gainMutationEnergy(300);
      return { before, after: engine.serialize() };
    });
    const mutationPlayer = automaticMutation.after.state.player;
    assert.equal(automaticMutation.after.state.mode, 'playing', 'Radiation mutations must occur without pausing gameplay');
    assert.equal(mutationPlayer.mutationEvents - automaticMutation.before.state.player.mutationEvents, 9);
    assert.equal(mutationPlayer.mutationEnergy, 12);
    assert.equal(mutationPlayer.level, automaticMutation.before.state.player.level);
    assert.deepEqual(mutationPlayer.branches, automaticMutation.before.state.player.branches);
    assert.ok(mutationPlayer.mutationHistory.length > 0);
    assert.ok(mutationPlayer.mutationHistory.every(event => ['mutation', 'adaptation', 'saturated'].includes(event.outcome)));
    assert.notEqual(automaticMutation.after.rngState, automaticMutation.before.rngState, 'Automatic outcomes must advance saved random state');
    await page.keyboard.press('m');
    await page.locator('#mutation-screen').waitFor({ state: 'visible' });
    await waitMode('paused');
    assert.equal(await page.locator('#mutation-history .mutation-history-entry').count(), mutationPlayer.mutationHistory.length);
    assert.equal(await page.locator('#mutation-content button').count(), 0);
    const historyBeforeReading = await state();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'mutation-close-btn', 'The read-only panel must keep keyboard focus on its close control');
    assert.deepEqual((await state()).mutations, historyBeforeReading.mutations, 'Reading history must not alter organs');
    await screenshot('14-mutations-history');
    await page.locator('#mutation-close-btn').click();
    await waitMode('playing');
    const photophoreRank = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      for (let i = 0; i < 12 && !engine.state.player.mutations.photophore; i++) engine._gainMutationEnergy(300);
      return engine.state.player.mutations.photophore;
    });
    assert.ok(photophoreRank > 0, 'Repeated radiation exposure must eventually reveal a randomly acquired photophore');
    await waitForEvaluation(page, async ({ expectedRank, baseline }) => {
      const { ocean } = await import('/src/main.js');
      const organ = ocean.player.getObjectByName('mutation-photophore');
      const lightMesh = ocean.mutationVisuals?.photophore;
      return organ?.visible && organ.userData.rank === expectedRank && lightMesh?.isMesh &&
        lightMesh.visible && lightMesh.geometry.attributes.position.count > 0 &&
        lightMesh.material.emissiveIntensity > 0 && ocean.playerLight.intensity > baseline.lightIntensity &&
        ocean.playerLight.distance > baseline.lightDistance;
    }, { expectedRank: photophoreRank, baseline: mutationFixture });
    await screenshot('14-photophore-body');
    check('automatic radiation outcomes, read-only records, and visible photophores');

    await page.locator('#pause-btn').click();
    await waitMode('paused');
    const alreadyPausedTime = (await state()).time;
    await page.keyboard.press('m');
    await page.locator('#mutation-screen').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#mutation-screen').waitFor({ state: 'hidden' });
    await page.locator('#pause-screen').waitFor({ state: 'visible' });
    await page.waitForTimeout(100);
    assert.equal((await state()).mode, 'paused', 'Closing organ mutations must preserve an existing pause');
    assert.equal((await state()).time, alreadyPausedTime);
    await page.locator('#save-btn').click();
    const savedMutations = await state();
    const nextOutcome = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const saved = engine.serialize();
      engine._gainMutationEnergy(64);
      const next = engine.serialize();
      if (!engine.restore(saved)) throw new Error('Random replay fixture could not be restored');
      return { rngState: next.rngState, player: next.state.player };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#continue-btn').waitFor({ state: 'visible' });
    await page.evaluate(async () => { (await import('/src/main.js')).engine.update = () => {}; });
    await page.locator('#continue-btn').click();
    await waitMode('playing');
    await page.keyboard.press('m');
    await page.locator('#mutation-screen').waitFor({ state: 'visible' });
    const restoredMutations = await state();
    assert.deepEqual(restoredMutations.mutations, savedMutations.mutations, 'Randomly acquired organs must survive a full reload');
    assert.equal(restoredMutations.mutationEnergy, savedMutations.mutationEnergy, 'Remaining exposure progress must survive a full reload');
    assert.equal(restoredMutations.level, savedMutations.level);
    assert.equal(restoredMutations.rngState, savedMutations.rngState, 'Reload must not reroll random state');
    assert.equal(restoredMutations.mutationEvents, savedMutations.mutationEvents);
    assert.deepEqual(restoredMutations.mutationHistory, savedMutations.mutationHistory);
    const replayedOutcome = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      engine._gainMutationEnergy(64);
      const next = engine.serialize();
      return { rngState: next.rngState, player: next.state.player };
    });
    assert.deepEqual(replayedOutcome, nextOutcome, 'The next automatic mutation after reload must match the saved random sequence');
    check('read-only records preserve pause, history and random sequence survive reload');
  } catch (error) {
    await screenshot('14-mutations-failure').catch(() => {});
    throw error;
  } finally {
    if (await page.locator('#mutation-screen').isVisible()) await page.locator('#mutation-close-btn').click();
    await page.evaluate(async fixture => {
      const { engine, ocean } = await import('/src/main.js');
      delete engine.update;
      if (!engine.restore(fixture.save)) throw new Error('Mutation fixture save could not be restored');
      ocean.firstPerson = fixture.firstPerson;
      ocean.yaw = fixture.yaw;
      ocean.pitch = fixture.pitch;
      if (fixture.storedSave === null) localStorage.removeItem('aberrant-tide-save-v1');
      else localStorage.setItem('aberrant-tide-save-v1', fixture.storedSave);
    }, mutationFixture);
    await waitMode('playing');
  }
  const beforeMove = await state();
  await page.keyboard.down('w');
  await waitForEvaluation(page, async before => {
    const { player: p } = (await import('/src/main.js')).engine.state;
    return Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z) > 0.5;
  }, beforeMove, { timeout: 5000 });
  await page.keyboard.up('w');
  const afterMove = await state();
  assert.ok(Math.hypot(afterMove.x - beforeMove.x, afterMove.y - beforeMove.y, afterMove.z - beforeMove.z) > 0.5, `W must move the cell along the viewing direction: ${JSON.stringify({ beforeMove, afterMove })}`);
  await page.keyboard.down('r');
  await waitForEvaluation(page, async before => (await import('/src/main.js')).engine.state.player.y > before.y + 0.2, afterMove, { timeout: 5000 });
  await page.keyboard.up('r');
  assert.ok((await state()).y > afterMove.y + 0.2, 'R must move upward');
  check('swimming and vertical movement');

  await page.keyboard.press('v');
  assert.equal((await state()).firstPerson, true);
  await screenshot('03-first-person');
  await page.locator('#camera-btn').click();
  assert.equal((await state()).firstPerson, false);
  await page.mouse.move(720, 440);
  await page.evaluate(async () => { (await import('/src/main.js')).ocean.pitch = 0; });
  const beforeLook = await state();
  await page.mouse.move(850, 480, { steps: 3 });
  const afterLook = await state();
  assert.notEqual(afterLook.yaw, beforeLook.yaw, 'Desktop mouse motion must rotate the camera without holding a button');
  assert.notEqual(afterLook.pitch, beforeLook.pitch);
  pointerLock.supported = await page.evaluate(() => {
    const canvas = document.querySelector('#scene-container canvas');
    window.__smokePointerLockRequests = 0;
    window.__smokePointerLockError = null;
    if (typeof canvas?.requestPointerLock !== 'function') return false;
    const request = canvas.requestPointerLock.bind(canvas);
    canvas.requestPointerLock = (...args) => {
      window.__smokePointerLockRequests++;
      try {
        const result = request(...args);
        return result?.catch ? result.catch(error => {
          window.__smokePointerLockError = String(error);
          throw error;
        }) : result;
      } catch (error) {
        window.__smokePointerLockError = String(error);
        throw error;
      }
    };
    return true;
  });
  await page.mouse.click(720, 440);
  if (pointerLock.supported) assert.ok(await page.evaluate(() => window.__smokePointerLockRequests > 0), 'Clicking the canvas must request pointer lock');
  try {
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS', null, { timeout: 1200 });
    pointerLock.acquired = true;
  } catch {
    limitations.push('Headless Chromium did not acquire pointer lock; free mouse-look and touch dragging were tested.');
    pointerLock.error = await page.evaluate(() => window.__smokePointerLockError);
  }
  if (pointerLock.acquired) {
    await page.keyboard.press('b');
    await page.locator('#biology-screen').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, 'Opening the codex must release pointer lock');
    await page.keyboard.press('b');
    await waitMode('playing');
    await page.mouse.click(720, 440);
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
    await page.keyboard.press('Escape');
    await waitMode('paused');
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, 'Escape must release pointer lock and pause');
    await page.locator('#resume-btn').click();
    await waitMode('playing');
  }
  check('first/third-person switching, button-free mouse look, and pointer-lock handling');

  await page.locator('#pause-btn').click();
  await waitMode('paused');
  const paused = await state();
  await page.keyboard.press('b');
  await page.locator('#biology-screen').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#biology-screen').waitFor({ state: 'hidden' });
  assert.equal((await state()).mode, 'paused', 'Closing the codex must preserve an existing pause');
  await page.keyboard.down('w');
  await page.waitForTimeout(100);
  await page.keyboard.up('w');
  assert.equal((await state()).time, paused.time, 'Pause must freeze simulation time');
  await page.locator('#mouse-sensitivity').evaluate(element => {
    element.value = '1.6';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#invert-y').check();
  await page.locator('#reduced-motion').check();
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).ocean.reducedMotion), true);
  await screenshot('04-paused');
  await page.locator('#resume-btn').click();
  await waitMode('playing');
  await page.mouse.move(720, 440);
  await page.evaluate(async () => { (await import('/src/main.js')).ocean.pitch = 0; });
  const invertedBefore = (await state()).pitch;
  await page.mouse.move(720, 460);
  const invertedDelta = (await state()).pitch - invertedBefore;
  assert.ok(invertedDelta * (afterLook.pitch - beforeLook.pitch) < 0, 'Invert Y must reverse vertical mouse-look direction');
  await page.keyboard.press('Escape');
  await waitMode('paused');
  await page.locator('#reduced-motion').uncheck();
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).ocean.reducedMotion), false);
  await page.keyboard.press('Escape');
  await waitMode('playing');
  check('pause/resume, mouse sensitivity, invert Y, and reduced-motion settings');

  await page.keyboard.press('Space');
  await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.cooldowns.dash > 0);
  await page.keyboard.press('e');
  await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.cooldowns.feed > 0);
  await page.keyboard.press('q');
  await waitForEvaluation(page, async () => (await import('/src/main.js')).engine.state.player.cooldowns.pulse > 0);
  check('dash, devour, and radiation pulse controls');

  // The real XP transition applies a random branch immediately; it must never
  // expose a selection modal or interrupt the swimming state.
  for (let level = 2; level <= 7; level++) {
    const growth = await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const previousLevel = engine.state.player.level;
      engine.state.player.xp = engine.state.player.xpNext;
      engine._checkLevel();
      return { mode: engine.state.mode, previousLevel, level: engine.state.player.level,
        ranks: Object.values(engine.state.player.branches), evolutions: engine.state.stats.evolutions };
    });
    assert.equal(growth.mode, 'playing');
    assert.equal(growth.previousLevel, level - 1);
    assert.equal(growth.level, level);
    assert.equal(growth.ranks.reduce((sum, rank) => sum + rank, 0), level - 1);
    assert.ok(growth.ranks.every(rank => Number.isInteger(rank) && rank >= 0 && rank <= 4));
    assert.equal(growth.evolutions, level - 1);
    assert.equal(await page.locator('#evolution-screen:visible, #evolution-choices:visible').count(), 0);
    if ([3, 5, 7].includes(level)) {
      await waitForEvaluation(page, async expected => (await import('/src/main.js')).ocean.bodyPlan === expected, Math.floor((level + 1) / 2));
      await screenshot(`11-bodyplan-level${level}`);
    }
  }
  const evolved = await state();
  assert.equal(evolved.level, 7);
  assert.equal(evolved.stage, 3);
  assert.equal(Object.values(evolved.branches).reduce((sum, rank) => sum + rank, 0), 6);
  check('automatic random growth stays playable across four body stages');
  const currentHeight = evolved.y;
  for (const [height, zone] of [[44, '透光层'], [30, '微光层'], [10, '无光层']]) {
    await page.evaluate(async y => {
      const { engine } = await import('/src/main.js');
      engine.state.player.y = y;
      engine.state.player.vy = 0;
    }, height);
    await page.waitForFunction(name => document.querySelector('#zone-name').textContent.includes(name), zone);
    if (height === 10) await screenshot('13-deep-ocean');
  }
  await page.evaluate(async y => {
    const { engine } = await import('/src/main.js');
    engine.state.player.y = y;
    engine.state.player.vy = 0;
  }, currentHeight);
  await waitForEvaluation(page, async expected => {
    const { engine } = await import('/src/main.js');
    const { depthFor } = await import('/src/biology.js');
    const player = engine.state.player;
    return Math.abs(player.y - expected) < .5 && player.depth === depthFor(player.y);
  }, currentHeight);
  check('depth-zone HUD follows vertical exploration');

  const surfaceFixture = await page.evaluate(async () => (await import('/src/main.js')).engine.serialize());
  try {
    await page.evaluate(async () => {
      const { engine, ocean } = await import('/src/main.js');
      Object.assign(engine.state.player, { x: 0, y: 55, z: -38, vx: 0, vy: 0, vz: 0 });
      ocean.yaw = 0; ocean.pitch = -.03; ocean.firstPerson = false;
    });
    await page.waitForFunction(() => document.querySelector('#zone-name').textContent.includes('海平面'));
    const surfaceScene = await page.evaluate(async () => {
      const { engine, ocean } = await import('/src/main.js');
      const THREE = await import('/node_modules/three/build/three.module.js');
      const box = new THREE.Box3().setFromObject(ocean.island);
      const diver = engine.state.entities.find(entity => entity.type === 'diver');
      const nodes = engine.state.entities.filter(entity => entity.type === 'islandNode');
      return {
        islandTop: box.max.y,
        islandBottom: box.min.y,
        humans: ocean.island.userData.humanSettlement?.userData.animatables?.humans.length || 0,
        boat: ocean.island.userData.humanSettlement?.userData.animatables?.boats.length || 0,
        patrolBoats: ocean.patrolFleet?.userData.boats.length || 0,
        sunkenBoat: Boolean(ocean.researchWreck?.getObjectByName('ship-bridge')),
        diverRendered: ocean.objects.get(diver?.id)?.userData.type === 'diver',
        nodeModels: nodes.every(node => ocean.objects.get(node.id)?.userData.type === 'islandNode'),
      };
    });
    assert.ok(surfaceScene.islandTop > 60, 'Gray Island must rise above the sea surface');
    assert.ok(surfaceScene.humans >= 8 && surfaceScene.boat === 1, 'The settlement must include articulated humans and a boat');
    assert.equal(surfaceScene.patrolBoats, 3, 'Three human patrol boats must surround Gray Island');
    assert.equal(surfaceScene.sunkenBoat, true, 'The near-spawn human wreck must render');
    assert.equal(surfaceScene.diverRendered, true, 'The human parasite host must render');
    assert.equal(surfaceScene.nodeModels, true, 'All parasite relays must render');
    await screenshot('19-surface-island');
    await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { humanBoatStates } = await import('/src/human-navigation.js');
      const boat = humanBoatStates(engine.state.world, 10.5)[0];
      Object.assign(engine.state.player, { x: boat.x, y: 53.4, z: boat.z + 8, vx: 0, vy: 0, vz: 0 });
      engine.state.time = 10.45;
    });
    await page.locator('#human-patrol-status').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#human-patrol-status').innerText()).includes('巡逻船'));
    await page.waitForTimeout(350);
    await screenshot('19b-sonar-warning');
  } finally {
    await page.evaluate(async save => {
      const { engine } = await import('/src/main.js');
      if (!engine.restore(save)) throw new Error('Surface fixture could not be restored');
    }, surfaceFixture);
  }
  check('reachable continuous sea surface, visible island, and human settlement');

  await page.locator('#sound-btn').click();
  assert.equal(await page.locator('#sound-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.__ambientStarts), 1, 'Enabling audio must start ambient water');
  await page.locator('#pause-btn').click();
  await waitMode('paused');
  const savedGrowth = await state();
  await page.locator('#save-btn').click();
  assert.ok(await page.evaluate(() => localStorage.length > 0));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#continue-btn').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#continue-btn').isEnabled(), true);
  await page.locator('#continue-btn').click();
  await waitMode('playing');
  assert.equal(await page.evaluate(() => window.__ambientStarts), 1, 'Continuing with saved sound enabled must start ambient water');
  const restored = await state();
  assert.equal(restored.level, 7);
  assert.deepEqual(restored.branches, evolved.branches);
  assert.equal(restored.mutationEvents, savedGrowth.mutationEvents);
  assert.deepEqual(restored.mutations, savedGrowth.mutations);
  await page.locator('#pause-btn').click();
  await waitMode('paused');
  assert.equal(await page.locator('#mouse-sensitivity').inputValue(), '1.6');
  assert.equal(await page.locator('#invert-y').isChecked(), true);
  assert.equal(await page.locator('#reduced-motion').isChecked(), false);
  await page.locator('#resume-btn').click();
  await waitMode('playing');
  check('manual save survives reload and continues correctly');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    // This combat-only fixture starts after the independent real reactor tests.
    // Preserve every facility and its matching completion record.
    const reactors = engine.state.entities.filter(entity => entity.type === 'reactor');
    engine.state.expedition.shutdowns = reactors.map(entity => entity.siteId);
    engine.state.expedition.milestones = [...engine.state.expedition.milestones.filter(id => !id.startsWith('reactor:')), ...reactors.map(entity => `reactor:${entity.siteId}`)];
    for (const reactor of reactors) Object.assign(reactor, { status: 'shutdown', phase: 'shutdown', phaseRemaining: 0, progress: 1, pollution: 0 });
    const boss = engine.state.entities.find(entity => entity.type === 'boss');
    if (!boss) throw new Error('Final core did not spawn');
    while (engine.state.player.level < 11) {
      engine.state.player.xp = engine.state.player.xpNext;
      engine._checkLevel();
    }
    Object.assign(engine.state.player, { x: boss.x, y: boss.y, z: boss.z + 14, vx: 0, vy: 0, vz: 0 });
    ocean.yaw = 0;
    ocean.pitch = 0.1;
  });
  await page.waitForTimeout(100);
  await screenshot('06-final-core');
  await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const boss = engine.state.entities.find(entity => entity.type === 'boss');
    // 排放母体的核心只有在张开时才会被伤到：先断掉外甲上的触须并进入核心阶段。
    for (const tendril of engine.state.entities.filter(entity => entity.type === 'tendril')) tendril.dead = true;
    engine.state.entities = engine.state.entities.filter(entity => !entity.dead);
    boss.motherPhase = 'core';
    boss.coreWindowOpen = true;
    boss.hp = 1;
    engine.state.player.energy = engine.state.player.maxEnergy;
    engine.state.player.cooldowns.pulse = 0;
  });
  await page.keyboard.press('q');
  await waitForEvaluation(page, async () => {
    const { engine } = await import('/src/main.js');
    return engine.state.entities.find(entity => entity.type === 'boss')?.weakened === true;
  });
  await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    engine.state.player.cooldowns.feed = 0;
    engine.state.player.energy = engine.state.player.maxEnergy;
  });
  await page.keyboard.press('e');
  await waitMode('won');
  await page.waitForFunction(() => document.body.classList.contains('finale-active'));
  await page.waitForTimeout(2800);
  await screenshot('07-devouring-island');
  await page.locator('#end-screen').waitFor({ state: 'visible' });
  await screenshot('07-victory');
  check('apex devouring transition removes the island core and reaches victory');

  await page.locator('#end-menu-btn').click();
  await page.locator('#menu-screen').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    return ocean.finale === null && Math.abs(ocean.island.position.y - ocean.island.userData.restY) < 0.001;
  }), true, 'Returning to the menu must restore the island after the finale');
  await page.locator('#start-btn').click();
  await waitMode('playing');
  assert.equal((await state()).level, 1);
  await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    engine._damage(10000, 'Browser test damage');
  });
  await waitMode('dead');
  await page.locator('#retry-btn').click();
  await waitMode('playing');
  assert.equal((await state()).level, 1);
  check('return to menu and restart after death');

  const wildlifeFixture = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    return { save: engine.serialize(), firstPerson: ocean.firstPerson, yaw: ocean.yaw, pitch: ocean.pitch };
  });
  try {
    const animalCounts = wildlifeFixture.save.state.entities.reduce((counts, entity) => {
      counts[entity.type] = (counts[entity.type] || 0) + 1;
      return counts;
    }, {});
    const wildlifeTypes = ['fish', 'jelly', 'shark', 'squid', 'whale', 'ray', 'turtle', 'angler', 'crab', 'lanternfish', 'cuttlefish', 'oarfish'];
    for (const type of wildlifeTypes) assert.ok(animalCounts[type] > 0, `${type} must inhabit a new ocean`);
    assert.ok(wildlifeTypes.reduce((sum, type) => sum + animalCounts[type], 0) >= 50, 'The ocean must contain a substantial mixed animal population');
    for (const [type, distance] of [['fish', 7], ['jelly', 12], ['shark', 22], ['squid', 24], ['whale', 40], ['ray', 17], ['turtle', 12], ['angler', 12], ['crab', 8], ['lanternfish', 7], ['cuttlefish', 15], ['oarfish', 30]]) {
      const expected = await page.evaluate(async ({ type, distance, saved }) => {
        const { engine, ocean } = await import('/src/main.js');
        const { SPECIES, depthFor, zoneFor } = await import('/src/biology.js');
        const original = saved.state.entities.find(entity => entity.type === type);
        if (!original) throw new Error(`Missing wildlife type: ${type}`);
        // Freeze simulation for deterministic visual inspection without pausing the renderer.
        engine.update = () => {};
        const sampleX = type === 'crab' ? original.x : 0;
        const sampleZ = type === 'crab' ? original.z : 10 - distance;
        const cameraY = type === 'crab' ? Math.max(3, original.y + 3) : original.y;
        Object.assign(engine.state.player, { x: sampleX, y: cameraY, z: sampleZ + distance, vx: 0, vy: 0, vz: 0 });
        engine.state.player.depth = depthFor(cameraY);
        engine.state.player.zone = zoneFor(cameraY).id;
        engine.state.player.lightBonus = false;
        engine.state.entities = [{ ...original, x: sampleX, y: original.y, z: sampleZ, vx: 1, vy: 0, vz: 0, heading: -Math.PI / 2 }];
        ocean.firstPerson = true;
        ocean.yaw = 0;
        ocean.pitch = Math.atan2(cameraY - original.y, distance);
        return { id: original.id, type, name: SPECIES[type].name };
      }, { type, distance, saved: wildlifeFixture.save });
      await waitForEvaluation(page, async ({ id, type }) => {
        const { ocean } = await import('/src/main.js');
        const object = ocean.objects.get(id);
        return object?.userData.type === type && object.userData.animal && object.children.length > 0;
      }, expected);
      const geometry = await page.evaluate(async ({ id }) => {
        const { ocean } = await import('/src/main.js');
        const object = ocean.objects.get(id);
        const data = object.userData;
        const body = data.bodyMesh;
        return { continuous: data.continuousBody, modelVersion: data.proceduralModelVersion,
          mesh: !!body?.isMesh, vertices: body?.geometry?.attributes?.position?.count || 0,
          pbr: !!body?.material?.isMeshStandardMaterial, animationTime: data.swimUniforms?.time?.value };
      }, expected);
      assert.equal(geometry.continuous, true, `${type} must use a continuous animal body`);
      assert.equal(geometry.modelVersion, 3);
      assert.equal(geometry.mesh, true);
      assert.ok(geometry.vertices > 100, `${type} must contain actual detailed surface geometry`);
      assert.equal(geometry.pbr, true, `${type} must use a physically based body material`);
      assert.ok(Number.isFinite(geometry.animationTime), `${type} must expose its swimming animation uniform`);
      if (type === 'fish') {
        await page.waitForFunction(name => document.querySelector('#observation-name').textContent.includes(name), expected.name);
        assert.ok((await page.locator('#observation-detail').innerText()).length > 5);
      }
      await screenshot(`12-wildlife-${type}`);
      await waitForEvaluation(page, async ({ id, before }) => {
        const { ocean } = await import('/src/main.js');
        return ocean.objects.get(id)?.userData.swimUniforms.time.value > before;
      }, { id: expected.id, before: geometry.animationTime });
    }
    for (const type of ['fish', 'shark']) {
      let normalFingerprint = null;
      for (const variant of ['normal', 'crooked', 'armored', 'lure']) {
        const expected = await page.evaluate(async ({ type, variant, saved }) => {
          const { engine, ocean } = await import('/src/main.js');
          const { depthFor, zoneFor } = await import('/src/biology.js');
          const original = saved.state.entities.find(entity => entity.type === type);
          const distance = type === 'shark' ? 21 : 6;
          engine.update = () => {};
          Object.assign(engine.state.player, { x: 0, y: 24, z: 10, vx: 0, vy: 0, vz: 0, depth: depthFor(24), zone: zoneFor(24).id, lightBonus: false });
          // Isolated only for frozen rendering. The complete saved world is
          // restored in finally before simulation or save checks continue.
          engine.state.entities = [{ ...original, x: 0, y: 24, z: 10 - distance, vx: 1, vy: 0, vz: 0, heading: -Math.PI / 2, variant, exposure: variant === 'normal' ? 0 : 20 }];
          ocean.firstPerson = true; ocean.yaw = 0; ocean.pitch = 0;
          return { id: original.id, type, variant };
        }, { type, variant, saved: wildlifeFixture.save });
        await waitForEvaluation(page, async ({ id, variant }) => {
          const { ocean } = await import('/src/main.js');
          return ocean.objects.get(id)?.userData.variant === variant;
        }, expected);
        const geometry = await page.evaluate(async ({ id }) => {
          const { ocean } = await import('/src/main.js');
          const model = ocean.objects.get(id), data = model.userData;
          const position = data.bodyMesh.geometry.attributes.position;
          let checksum = 0;
          for (let index = 0; index < position.count; index += 17) checksum += position.getX(index) * (index % 13 + 1) + position.getY(index) * (index % 7 + 2) + position.getZ(index) * (index % 5 + 1);
          return { version: data.proceduralModelVersion, continuous: data.continuousBody, variant: data.variant, vertices: position.count, fingerprint: `${position.count}:${checksum.toFixed(6)}`, extraOrgans: !!data.aberrantOrgans?.isMesh };
        }, expected);
        assert.equal(geometry.version, 3);
        assert.equal(geometry.continuous, true);
        assert.equal(geometry.variant, variant);
        assert.ok(geometry.vertices > 100);
        if (variant === 'normal') normalFingerprint = geometry.fingerprint;
        else assert.notEqual(geometry.fingerprint, normalFingerprint, `${type}/${variant} must change surface geometry rather than only recolor the normal animal`);
        if (variant === 'lure') assert.equal(geometry.extraOrgans, true);
        await screenshot(`16-phenotype-${type}-${variant}`);
      }
    }
    check('normal and three abnormal fish/shark phenotypes have distinct continuous geometry and visible organs');
  } finally {
    await page.evaluate(async fixture => {
      const { engine, ocean } = await import('/src/main.js');
      delete engine.update;
      if (!engine.restore(fixture.save)) throw new Error('Wildlife fixture save could not be restored');
      ocean.firstPerson = fixture.firstPerson;
      ocean.yaw = fixture.yaw;
      ocean.pitch = fixture.pitch;
    }, wildlifeFixture);
  }
  check('twelve populated wildlife species, continuous PBR geometry, live swimming animation, and observation');

  await waitForEvaluation(page, async () => {
    const { engine, ocean } = await import('/src/main.js');
    const animals = engine.state.entities.filter(entity => !entity.dead && ['fish','jelly','shark','squid','whale','ray','turtle','angler','crab'].includes(entity.type));
    return animals.length > 50 && animals.every(entity => ocean.objects.has(entity.id));
  });
  const rendering = await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    return { calls: ocean.renderer.info.render.calls, triangles: ocean.renderer.info.render.triangles };
  });
  assert.ok(rendering.calls > 0 && rendering.triangles > 0, '3D geometry must be rendered');
  console.log(`Renderer: ${rendering.calls} draw calls, ${rendering.triangles} triangles`);

  const diverId = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const { interactionPosition } = await import('/src/ecosystem.js');
    const diver = engine.state.entities.find(entity => entity.type === 'diver');
    if (!diver) throw new Error('Human diver host did not spawn');
    engine.state.player.innateParasitism = true;
    engine._refreshAdaptations();
    Object.assign(engine.state.player, interactionPosition(diver), { vx: 0, vy: 0, vz: 0 });
    return diver.id;
  });
  await page.keyboard.press('g');
  await waitForEvaluation(page, async id => (await import('/src/main.js')).engine.state.player.attachment?.entityId === id, diverId);
  await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const { GameEngine } = await import('/src/engine.js');
    engine.update = () => {};
    engine.state.player.attachment.elapsed = 12.1;
    engine.state.player.attachment.travelled = 12.1;
    for (let i = 0; i < 5; i++) GameEngine.prototype.update.call(engine, 0.1, {});
    delete engine.update;
  });
  await waitForEvaluation(page, async () => {
    const { engine } = await import('/src/main.js');
    return engine.state.expedition.hostAdaptations.includes('diver');
  });
  const parasiteNodeIds = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    return engine.state.entities.filter(entity => entity.type === 'islandNode').map(entity => entity.id);
  });
  assert.equal(parasiteNodeIds.length, 3);
  for (const nodeId of parasiteNodeIds) {
    await page.evaluate(async nodeId => {
      const { engine } = await import('/src/main.js');
      const { interactionPosition } = await import('/src/ecosystem.js');
      const node = engine.state.entities.find(entity => entity.id === nodeId);
      Object.assign(engine.state.player, interactionPosition(node), { vx: 0, vy: 0, vz: 0 });
    }, nodeId);
    await page.keyboard.press('g');
    await waitForEvaluation(page, async id => (await import('/src/main.js')).engine.state.player.attachment?.entityId === id, nodeId);
    await page.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const { GameEngine } = await import('/src/engine.js');
      engine.update = () => {};
      const node = engine.state.entities.find(entity => entity.id === engine.state.player.attachment.entityId);
      node.progress = .99; engine.state.player.attachment.progress = .99;
      // 电网反击在接入中段就发生过了：这个夹具直接落在反击之后。
      node.surged = true;
      for (let i = 0; i < 3; i++) GameEngine.prototype.update.call(engine, 0.1, {});
      delete engine.update;
    });
    await page.waitForTimeout(100);
  }
  await waitMode('won');
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).engine.state.ending), 'parasite');
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).engine.state.expedition.shutdowns.length), 0);
  await page.waitForFunction(() => document.body.classList.contains('finale-active'));
  await page.waitForTimeout(2200);
  await screenshot('21-parasite-ending');
  await page.locator('#end-screen').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#end-title').innerText()).includes('呼吸'));
  check('human-host parasite route reaches the alternate island ending without reactor shutdowns');
  await page.close();

  for (const [label, viewport] of [
    ['portrait', { width: 390, height: 844 }],
    ['landscape', { width: 844, height: 390 }],
  ]) {
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    mobile.setDefaultTimeout(30000);
    mobile.on('pageerror', error => errors.push(`mobile ${label}: ${error.message}`));
    mobile.on('console', message => { if (message.type() === 'error') errors.push(`mobile ${label}: ${message.text()}`); });
    mobile.on('requestfailed', request => { if (request.url().includes('/quit')) return; failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`); });
    await mobile.goto(baseURL, { waitUntil: 'networkidle' });
    const assertReachable = async selector => {
      const button = mobile.locator(selector);
      // 不用 scrollIntoViewIfNeeded：软件渲染只有 2fps，它会一直等"元素静止"而误判。
      // HUD 是固定定位，真正的检查是"能不能被点到"。
      // 软件渲染下手机页面要 6–8 秒才初始化完，8 秒的窗口会偶发误判。
      try { await button.waitFor({ state: 'visible', timeout: 25000 }); }
      catch (error) {
        await mobile.screenshot({ path: path.join(artifacts, `failure-mobile-${label}.png`) }).catch(() => {});
        throw new Error(`${label} ${selector}: ${error.message}; url=${mobile.url()}; title=${await mobile.title().catch(() => '')}`);
      }
      assert.ok(await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(centerX, centerY);
        return centerX >= 0 && centerX < innerWidth && centerY >= 0 && centerY < innerHeight && (hit === element || element.contains(hit));
      }), `${label} control ${selector} must be reachable and uncovered`);
    };
    await assertReachable('#start-btn');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} menu overflows horizontally`);
    await mobile.locator('#start-btn').tap();
    await mobile.locator('#onboarding-screen').waitFor({ state: 'visible' });
    await assertReachable('#onboarding-next');
    assert.equal(await mobile.evaluate(() => {
      const rect = document.querySelector('.onboarding-card').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    }), true, `${label} onboarding must stay inside the viewport`);
    await mobile.screenshot({ path: path.join(artifacts, `18-onboarding-${label}.png`) });
    for (let step = 0; step < 12; step++) {
      if (await mobile.locator('#onboarding-screen').isHidden()) break;
      await mobile.locator('#onboarding-next').tap();
    }
    await mobile.locator('#onboarding-screen').waitFor({ state: 'hidden' });
    await mobile.locator('#hud').waitFor({ state: 'visible' });
    for (const selector of ['#camera-btn', '#biology-btn', '#mutation-btn', '#pause-btn', '[data-ability="feed"]', '[data-move="forward"]', '[data-move="up"]']) await assertReachable(selector);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} HUD overflows horizontally`);
    await mobile.screenshot({ path: path.join(artifacts, `08-mobile-${label}.png`) });
    const mobileExpeditionFixture = await mobile.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const saved = engine.serialize();
      const film = engine.state.entities.find(entity => entity.type === 'biofilm' && entity.siteId === 'nursery');
      Object.assign(engine.state.player, { x: film.x, y: film.y, z: film.z + 1, vx: 0, vy: 0, vz: 0 });
      return saved;
    });
    try {
      await mobile.locator('#expedition-interact').waitFor({ state: 'visible' });
      await assertReachable('#expedition-interact');
      await mobile.locator('#expedition-interact').tap();
      await waitForEvaluation(mobile, async () => (await import('/src/main.js')).engine.state.player.attachment?.kind === 'biofilm');
      await mobile.waitForFunction(() => document.querySelector('#expedition-context').dataset.attached === 'true');
      await assertReachable('#expedition-interact');
      await mobile.screenshot({ path: path.join(artifacts, `17-expedition-${label}-biofilm.png`) });
      await mobile.evaluate(async () => {
        const { engine } = await import('/src/main.js');
        const { GameEngine } = await import('/src/engine.js');
        const { interactionPosition } = await import('/src/ecosystem.js');
        for (let i = 0; i < 130; i++) GameEngine.prototype.update.call(engine, 0.1, {});
        const reactor = engine.state.entities.find(entity => entity.type === 'reactor' && entity.siteId === 'wreck');
        engine.state.entities = [reactor, ...engine.state.entities.filter(entity => entity.id !== reactor.id)];
        const echo = engine.state.entities.find(entity => entity.type === 'echo' && entity.reactorSiteId === 'wreck');
        if (echo && !echo.pacified) engine._pacifyEcho(echo, '回归测试');
        engine.state.time = Math.ceil(engine.state.time / 21) * 21 + 1;
        engine._updateReactors(0);
        Object.assign(engine.state.player, interactionPosition(reactor), { vx: 0, vy: 0, vz: 0, radiation: 0, nutrition: 100 });
      });
      await mobile.waitForFunction(() => document.querySelector('#reactor-phase').textContent === '冷却窗口');
      await assertReachable('#expedition-interact');
      assert.equal(await mobile.locator('#expedition-interact').isEnabled(), true);
      await mobile.locator('#expedition-interact').tap();
      await waitForEvaluation(mobile, async () => (await import('/src/main.js')).engine.state.player.attachment?.kind === 'reactor');
      await mobile.waitForFunction(() => document.querySelector('#expedition-context').dataset.attached === 'true');
      await assertReachable('#expedition-interact');
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} expedition HUD overflows horizontally`);
      await assertReactorCameraClear(mobile);
      await mobile.screenshot({ path: path.join(artifacts, `17-expedition-${label}-reactor.png`) });
      await mobile.locator('#expedition-interact').tap();
      await waitForEvaluation(mobile, async () => !(await import('/src/main.js')).engine.state.player.attachment);
    } finally {
      await mobile.evaluate(async saved => {
        const { engine } = await import('/src/main.js');
        if (!engine.restore(saved)) throw new Error('Mobile expedition fixture could not be restored');
      }, mobileExpeditionFixture);
    }
    check(`${label} touch biofilm/reactor interactions and detach button remain reachable`);
    await mobile.locator('#biology-btn').tap();
    await mobile.locator('#biology-screen').waitFor({ state: 'visible' });
    await assertReachable('#biology-close-btn');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} codex overflows horizontally`);
    await mobile.locator('#biology-close-btn').tap();
    const mobileMutationFixture = await mobile.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      const fixture = { save: engine.serialize(), storedSave: localStorage.getItem('aberrant-tide-save-v1') };
      engine._gainMutationEnergy(96);
      return fixture;
    });
    try {
      await mobile.locator('#mutation-btn').tap();
      await mobile.locator('#mutation-screen').waitFor({ state: 'visible' });
      assert.equal(await mobile.evaluate(async () => (await import('/src/main.js')).engine.state.mode), 'paused');
      await assertReachable('#mutation-close-btn');
      assert.equal(await mobile.locator('#mutation-content .mutation-card').count(), 7);
      assert.equal(await mobile.locator('#mutation-content button, #mutation-content [data-mutation]').count(), 0);
      assert.ok(await mobile.locator('#mutation-history .mutation-history-entry').count() >= 3);
      await mobile.locator('#mutation-content .mutation-card').last().scrollIntoViewIfNeeded();
      assert.equal(await mobile.evaluate(() => {
        const dialog = document.querySelector('.mutation-dialog');
        const content = document.querySelector('#mutation-content');
        const rect = dialog.getBoundingClientRect();
        return document.documentElement.scrollWidth <= innerWidth && rect.left >= 0 &&
          rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight &&
          content.scrollWidth <= content.clientWidth + 1;
      }), true, `${label} mutation dialog must fit the viewport without horizontal overflow`);
      assert.equal(await mobile.evaluate(async () => (await import('/src/main.js')).engine.state.player.level), 1);
      await mobile.screenshot({ path: path.join(artifacts, `14-mutations-${label}.png`) });
      await assertReachable('#mutation-close-btn');
      await mobile.locator('#mutation-close-btn').tap();
      await mobile.locator('#mutation-screen').waitFor({ state: 'hidden' });
      assert.equal(await mobile.evaluate(async () => (await import('/src/main.js')).engine.state.mode), 'playing');
    } finally {
      if (await mobile.locator('#mutation-screen').isVisible()) await mobile.locator('#mutation-close-btn').tap();
      await mobile.evaluate(async fixture => {
        const { engine } = await import('/src/main.js');
        if (!engine.restore(fixture.save)) throw new Error('Mobile mutation fixture save could not be restored');
        if (fixture.storedSave === null) localStorage.removeItem('aberrant-tide-save-v1');
        else localStorage.setItem('aberrant-tide-save-v1', fixture.storedSave);
      }, mobileMutationFixture);
    }
    check(`${label} automatic radiation events, read-only records, and modal bounds`);
    const cdp = await mobile.context().newCDPSession(mobile);
    const touchLook = await mobile.evaluate(async () => {
      const { ocean } = await import('/src/main.js');
      for (const [x, y] of [[innerWidth * .5, innerHeight * .5], [innerWidth * .6, innerHeight * .48], [innerWidth * .5, innerHeight * .62]]) {
        if (document.elementFromPoint(x, y) === ocean.renderer.domElement) return { x, y, yaw: ocean.yaw };
      }
      throw new Error('No unobstructed canvas point is available for mobile camera input');
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchLook.x, y: touchLook.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchLook.x + 55, y: touchLook.y + 15 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.notEqual(await mobile.evaluate(async () => (await import('/src/main.js')).ocean.yaw), touchLook.yaw, `${label} touch drag must turn the camera`);
    assert.equal(await mobile.evaluate(() => document.pointerLockElement), null, 'Touch camera input must not lock the pointer');
    const initial = await mobile.evaluate(async () => {
      const { player } = (await import('/src/main.js')).engine.state;
      return { x: player.x, y: player.y, z: player.z };
    });
    const forward = await mobile.locator('[data-move="forward"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: forward.x + forward.width / 2, y: forward.y + forward.height / 2 }] });
    await waitForEvaluation(mobile, async before => {
      const { player: p } = (await import('/src/main.js')).engine.state;
      return Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z) > 0.3;
    }, initial, { timeout: 5000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = await mobile.evaluate(async () => {
      const { player } = (await import('/src/main.js')).engine.state;
      return { x: player.x, y: player.y, z: player.z };
    });
    assert.ok(Math.hypot(moved.x - initial.x, moved.y - initial.y, moved.z - initial.z) > 0.3, `${label} touch movement must work`);
    await mobile.locator('#pause-btn').tap();
    await mobile.locator('#pause-screen').waitFor({ state: 'visible' });
    await assertReachable('#resume-btn');
    await mobile.locator('#resume-btn').tap();
    const mobileGrowth = await mobile.evaluate(async () => {
      const { engine } = await import('/src/main.js');
      engine.state.player.xp = engine.state.player.xpNext;
      engine._checkLevel();
      return { mode: engine.state.mode, level: engine.state.player.level, ranks: Object.values(engine.state.player.branches) };
    });
    assert.equal(mobileGrowth.mode, 'playing');
    assert.equal(mobileGrowth.level, 2);
    assert.equal(mobileGrowth.ranks.reduce((sum, rank) => sum + rank, 0), 1);
    assert.equal(await mobile.locator('#evolution-screen:visible, #evolution-choices:visible').count(), 0);
    await mobile.close();
    check(`${label} mobile layout, touch movement/look, pause, and automatic growth`);
  }

  assert.deepEqual(errors, [], 'Browser runtime errors must be empty');
  assert.deepEqual(failedRequests, [], 'Failed requests must be empty');
  check('no browser runtime errors or failed requests');
  const report = { ok: true, baseURL, executablePath, checks, rendering, pointerLock, limitations,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), errors, failedRequests };
  await writeFile(path.join(artifacts, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(`Screenshots and report: ${artifacts}`);
} catch (error) {
  await screenshot('failure').catch(() => {});
  await writeFile(path.join(artifacts, 'smoke-report.json'), JSON.stringify({ ok: false, checks, error: error.stack, errors, failedRequests }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
