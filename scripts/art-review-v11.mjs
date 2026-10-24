import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1', 'seen');
});

const settle = () => page.waitForTimeout(850);
const capture = name => page.screenshot({ path: `artifacts/${name}.png` });
const setPose = pose => page.evaluate(async pose => {
  const { engine, ocean } = await import('/src/main.js');
  const { islandCenter, islandShorePoint, islandSurfaceAt } = await import('/src/island.js');
  const { WATER_SURFACE_Y } = await import('/src/biology.js');
  const { humanBoatStates } = await import('/src/human-navigation.js');
  let x = pose.x, y = pose.y, z = pose.z;
  if (pose.islandLocal) {
    const center = islandCenter(engine.state.world);
    x = center.x + pose.x;
    z = center.z + pose.z;
    const ground = islandSurfaceAt(engine.state.world, x, z);
    y = Number.isFinite(ground) ? ground + pose.y : pose.y;
  } else if (pose.surfaceOffset !== undefined) {
    const shore = islandShorePoint(engine.state.world, pose.surfaceOffset, pose.outset || 0);
    x = shore.x; y = WATER_SURFACE_Y - .24; z = shore.z;
  } else if (pose.shipView) {
    const center = islandCenter(engine.state.world);
    const boat = humanBoatStates(engine.state.world, engine.state.time)[pose.shipIndex || 0];
    const rx = boat.x - center.x, rz = boat.z - center.z, length = Math.hypot(rx, rz) || 1;
    x = boat.x + rx / length * pose.shipDistance;
    z = boat.z + rz / length * pose.shipDistance;
    y = WATER_SURFACE_Y - .24;
    const dx = boat.x - x, dz = boat.z - z;
    pose.yaw = Math.atan2(-dx, -dz);
  }
  Object.assign(engine.state.player, { x, y, z, vx: 0, vy: 0, vz: 0 });
  engine.state.mode = 'playing';
  ocean.firstPerson = pose.firstPerson ?? false;
  ocean.yaw = pose.yaw ?? 0;
  ocean.pitch = pose.pitch ?? .04;
  document.querySelector('#pause-screen').hidden = true;
}, pose);

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('#start-btn').waitFor({ state: 'visible' });
  await settle();
  await capture('31-title-art');

  await page.locator('#start-btn').click();
  await page.locator('#hud').waitFor({ state: 'visible' });
  await settle();
  await capture('32-gameplay-hud');

  await page.addStyleTag({ content: '#hud,.toast-container,#pause-screen{display:none!important}' });

  const world = await page.evaluate(async () => {
    const { engine } = await import('/src/main.js');
    return engine.state.world.biomes.map(({ id, x, z }) => ({ id, x, z }));
  });

  const coral = world.find(biome => biome.id === 'coral');
  await setPose({ x: coral.x + 10, y: 28, z: coral.z + 18, yaw: .65, pitch: -.08 });
  await settle();
  await capture('33-shallow-reef-art');

  await setPose({ surfaceOffset: Math.PI / 2, outset: 48, firstPerson: true, yaw: 0, pitch: -.09 });
  await settle();
  await capture('34-island-atmosphere-art');

  await setPose({ shipView: true, shipDistance: 34, firstPerson: true, pitch: -.03 });
  await settle();
  await capture('35-patrol-ship-art');

  const abyss = world.find(biome => biome.id === 'abyss');
  await setPose({ x: abyss.x - 18, y: 12, z: abyss.z + 22, yaw: -.7, pitch: -.02 });
  await settle();
  await capture('36-abyss-art');

  const metrics = await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    return {
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
      geometries: ocean.renderer.info.memory.geometries,
      textures: ocean.renderer.info.memory.textures,
      pixelRatio: ocean.renderer.getPixelRatio(),
    };
  });
  assert.ok(metrics.calls > 0 && metrics.triangles > 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, metrics, errors }, null, 2));
} finally {
  await browser.close();
}
