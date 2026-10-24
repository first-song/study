import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

await mkdir('artifacts/previews', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1', 'seen');
});

async function capture(name, delay = 900) {
  await page.waitForTimeout(delay);
  await page.screenshot({
    path: `artifacts/previews/${name}.jpg`,
    type: 'jpeg',
    quality: 82,
  });
}

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('#start-btn').click();
  await page.waitForTimeout(900);
  await page.addStyleTag({
    content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}',
  });

  const calmMetrics = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
    if (!bloom) return { missing: true };
    const initialProjection = ocean.project(bloom);
    Object.assign(engine.state.player, {
      x: bloom.x,
      y: bloom.y,
      z: bloom.z + 19,
      vx: 0,
      vy: 0,
      vz: 0,
    });
    engine.state.mode = 'paused';
    ocean.firstPerson = true;
    ocean.yaw = 0;
    ocean.pitch = 0;
    ocean.cameraYaw = 0;
    ocean.cameraPitch = 0;
    ocean.update(0, engine.state, false);
    const object = ocean.objects.get(bloom.id);
    const projected = ocean.project(bloom);
    return {
      id: bloom.id,
      phase: bloom.phase,
      nutrient: bloom.nutrient,
      projected,
      initialProjection,
      objectPresent: Boolean(object),
      objectChildren: object?.children.length || 0,
      microfaunaAtOrigin: ocean.microfauna.position.lengthSq() === 0,
      microfaunaDirections: {
        positiveX: ocean.microfauna.userData.specimens.filter(specimen => specimen.vx > 0).length,
        negativeX: ocean.microfauna.userData.specimens.filter(specimen => specimen.vx < 0).length,
        positiveZ: ocean.microfauna.userData.specimens.filter(specimen => specimen.vz > 0).length,
        negativeZ: ocean.microfauna.userData.specimens.filter(specimen => specimen.vz < 0).length,
      },
    };
  });
  assert.equal(calmMetrics.missing, undefined);
  assert.equal(calmMetrics.objectPresent, true);
  assert.ok(calmMetrics.objectChildren >= 5);
  assert.equal(calmMetrics.projected.visible, true);
  assert.equal(calmMetrics.microfaunaAtOrigin, true);
  assert.ok(calmMetrics.microfaunaDirections.positiveX > 20);
  assert.ok(calmMetrics.microfaunaDirections.negativeX > 20);
  await capture('v15-active-bloom-calm');

  const unstableMetrics = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
    engine.state.entities = [bloom];
    engine.spawnTimer = 2;
    bloom.age = 42;
    bloom.phase = 'unstable';
    bloom.nutrient = 0.22;
    return { age: bloom.age, phase: bloom.phase };
  });
  assert.equal(unstableMetrics.phase, 'unstable');
  await capture('v15-active-bloom-unstable');

  const feedMetrics = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
    Object.assign(engine.state.player, {
      x: bloom.x,
      y: bloom.y,
      z: bloom.z,
      nutrition: 34,
      radiation: 0,
      mutationEnergy: 0,
      energy: engine.state.player.maxEnergy,
      feedTime: 1,
    });
    engine.state.mode = 'playing';
    for (let step = 0; step < 5; step++) engine.update(0.08, {});
    return {
      feeding: bloom.feeding,
      nutrition: engine.state.player.nutrition,
      radiation: engine.state.player.radiation,
      mutationEnergy: engine.state.player.mutationEnergy,
      biomass: engine.state.player.biomass,
    };
  });
  assert.equal(feedMetrics.feeding, true);
  assert.ok(feedMetrics.nutrition > 34);
  assert.ok(feedMetrics.radiation > 0);
  assert.ok(feedMetrics.mutationEnergy > 0);
  assert.ok(feedMetrics.biomass > 0);

  const renderMetrics = await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    return {
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
    };
  });
  assert.ok(renderMetrics.calls <= 310, `draw calls ${renderMetrics.calls}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, calmMetrics, unstableMetrics, feedMetrics, renderMetrics, errors }, null, 2));
} finally {
  await browser.close();
}
