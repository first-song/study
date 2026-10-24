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
    quality: 84,
  });
}

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('#start-btn').click();
  await page.waitForTimeout(700);
  await page.addStyleTag({
    content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}',
  });

  const spawn = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const p = engine.state.player;
    Object.assign(p, { x: 0, y: 44, z: 0, vx: 0, vy: 0, vz: 0 });
    const fish = engine.state.entities.find(entity => entity.type === 'fish');
    Object.assign(fish, { x: -3.2, y: 43.8, z: -7.5, vx: 0, vy: 0, vz: -2.2, heading: 0 });
    engine.state.mode = 'playing';
    ocean.firstPerson = false;
    ocean.yaw = 0;
    ocean.pitch = .08;
    return { fishId: fish.id };
  });
  await capture('v14-micro-cell-spawn', 1100);

  const motion = await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    const object = [...ocean.objects.values()].find(candidate =>
      candidate.userData.species === 'fish' && candidate.visible);
    if (!object) return { missing: true };
    const samples = [];
    await new Promise(resolve => {
      let frames = 0, last = 0;
      const sample = now => {
        if (last) samples.push({ x: object.position.x, y: object.position.y, z: object.position.z, dt: now - last });
        last = now;
        frames++;
        if (frames < 100) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    const steps = [];
    for (let index = 1; index < samples.length; index++) {
      steps.push(Math.hypot(
        samples[index].x - samples[index - 1].x,
        samples[index].y - samples[index - 1].y,
        samples[index].z - samples[index - 1].z,
      ));
    }
    return {
      samples: steps.length,
      movingRatio: steps.filter(step => step > .0002).length / Math.max(1, steps.length),
      maxStep: Math.max(0, ...steps),
      averageStep: steps.reduce((sum, step) => sum + step, 0) / Math.max(1, steps.length),
    };
  });

  const metrics = await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { outfallLayout } = await import('/src/outfall-layout.js');
    const fish = [...ocean.objects.values()].find(candidate =>
      candidate.userData.species === 'fish' && candidate.visible);
    const cellSize = new THREE.Box3().setFromObject(ocean.player).getSize(new THREE.Vector3());
    const fishSize = fish ? new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3()) : null;
    const layout = outfallLayout(engine.state.world);
    const triangleEntries = [];
    ocean.scene.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const geometry = object.geometry;
      if (!geometry) return;
      const triangles = geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position?.count / 3 || 0;
      const instances = object.isInstancedMesh ? object.count : 1;
      triangleEntries.push({ name: object.name || object.type, triangles: Math.round(triangles * instances) });
    });
    triangleEntries.sort((a, b) => b.triangles - a.triangles);
    return {
      cellSize: [cellSize.x, cellSize.y, cellSize.z],
      fishSize: fishSize ? [fishSize.x, fishSize.y, fishSize.z] : null,
      microfauna: Object.fromEntries(
        Object.entries(ocean.microfauna.userData.meshes).map(([key, mesh]) => [key, mesh.count]),
      ),
      seagrass: ocean.habitat.userData.nurseryGrass?.count || 0,
      ribbonSeagrass: ocean.habitat.userData.nurseryRibbonGrass?.count || 0,
      kelp: ocean.habitat.userData.nurseryKelp?.count || 0,
      urchins: ocean.habitat.userData.urchins?.count || 0,
      brittleStars: ocean.habitat.userData.brittleStars?.count || 0,
      outfallMouthRadius: layout.mouths[1].radius,
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
      topTriangles: triangleEntries.slice(0, 10),
      playerWorldSize: engine.state.player.size,
      visualScale: ocean.player.scale.x,
    };
  });

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const shelf = engine.state.world.landmarks.find(landmark =>
      landmark.biome === 'nursery' && (landmark.kind === 'shelf' || landmark.kind === 'reef'));
    const x = shelf.x + 6, z = shelf.z + 15;
    Object.assign(engine.state.player, { x, y: shelf.y + 7, z, vx: 0, vy: 0, vz: 0 });
    ocean.firstPerson = true;
    ocean.yaw = Math.atan2(-(shelf.x - x), -(shelf.z - z));
    ocean.pitch = .08;
    engine.state.mode = 'paused';
  });
  await capture('v14-seagrass-microecology');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { outfallLayout } = await import('/src/outfall-layout.js');
    const layout = outfallLayout(engine.state.world);
    const mouth = layout.mouths[1];
    const x = mouth.x + 16, z = mouth.z + 13;
    Object.assign(engine.state.player, { x, y: 13, z, vx: 0, vy: 0, vz: 0 });
    ocean.firstPerson = true;
    ocean.yaw = Math.atan2(-(mouth.x - x), -(mouth.z - z));
    ocean.pitch = .44;
    engine.state.mode = 'paused';
  });
  await capture('v14-industrial-outfall');

  console.log('V14_METRICS', JSON.stringify({ metrics, motion }));
  assert.ok(metrics.microfauna.bacteria >= 180);
  assert.ok(metrics.microfauna.colony >= 40);
  assert.ok(metrics.seagrass >= 600 && metrics.ribbonSeagrass >= 380 && metrics.kelp >= 50);
  assert.ok(metrics.urchins >= 50 && metrics.brittleStars >= 40);
  assert.ok(metrics.visualScale <= .04, `starting visual scale ${metrics.visualScale}`);
  assert.ok(metrics.fishSize &&
    Math.max(...metrics.cellSize) < Math.max(...metrics.fishSize) * .2,
    `cell/fish length ratio ${metrics.cellSize[2]} / ${metrics.fishSize?.[2]}`);
  assert.ok(metrics.outfallMouthRadius > metrics.cellSize[0] * 15);
  assert.ok(motion.movingRatio > .88, `rendered fish motion ratio ${motion.movingRatio}`);
  assert.ok(motion.maxStep < .4, `rendered fish maximum step ${motion.maxStep}`);
  assert.ok(metrics.calls <= 300, `draw calls ${metrics.calls}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, metrics, motion, errors }, null, 2));
} finally {
  await browser.close();
}
