import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));

const browser = await chromium.launch({
  executablePath,
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
  localStorage.setItem('aberrant-tide-settings-v1', JSON.stringify({ quality: 'high', firstPerson: true }));
});

async function settle(delay = 850) {
  await page.waitForTimeout(delay);
}

async function capture(name) {
  await settle();
  await page.screenshot({ path: `artifacts/${name}.png` });
}

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('#start-btn').click();
  await page.waitForTimeout(900);
  await page.keyboard.press('h');
  await page.addStyleTag({
    content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}',
  });

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter } = await import('/src/island.js');
    const { WATER_SURFACE_Y } = await import('/src/biology.js');
    const center = islandCenter(engine.state.world);
    Object.assign(engine.state.player, {
      x: center.x, y: WATER_SURFACE_Y - 0.25, z: center.z + 154,
      vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = 0;
    ocean.pitch = -0.025;
    engine.state.mode = 'paused';
  });
  await capture('art-v11-surface-arrival');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter } = await import('/src/island.js');
    const { humanBoatStates } = await import('/src/human-navigation.js');
    const { WATER_SURFACE_Y } = await import('/src/biology.js');
    const center = islandCenter(engine.state.world);
    const boat = humanBoatStates(engine.state.world, engine.state.time)[0];
    const dx = boat.x - center.x, dz = boat.z - center.z;
    const length = Math.hypot(dx, dz) || 1;
    const x = boat.x + dx / length * 42, z = boat.z + dz / length * 42;
    Object.assign(engine.state.player, {
      x, y: WATER_SURFACE_Y - 0.25, z, vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = Math.atan2(-(boat.x - x), -(boat.z - z));
    ocean.pitch = -0.025;
    engine.state.mode = 'paused';
  });
  await capture('art-v11-naval-scale');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter, islandSurfaceAt } = await import('/src/island.js');
    const center = islandCenter(engine.state.world);
    const x = center.x + 5, z = center.z + 77;
    const ground = islandSurfaceAt(engine.state.world, x, z);
    Object.assign(engine.state.player, {
      x, y: ground + 0.65, z, vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = Math.PI;
    ocean.pitch = 0.02;
    engine.state.mode = 'paused';
  });
  await capture('art-v11-island-street');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const world = engine.state.world;
    const reef = world.biomes.find(biome => biome.id === 'coral');
    Object.assign(engine.state.player, {
      x: reef.x - 8, y: 34, z: reef.z + 37, vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = 0;
    ocean.pitch = -0.08;
    engine.state.mode = 'paused';
  });
  await capture('art-v11-coral-reef');

  await page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const world = engine.state.world;
    const abyss = world.biomes.find(biome => biome.id === 'abyss');
    Object.assign(engine.state.player, {
      x: abyss.x - 30, y: 12, z: abyss.z + 48, vx: 0, vy: 0, vz: 0,
      mutations: { ...engine.state.player.mutations, photophore: 1 },
    });
    ocean.firstPerson = true;
    ocean.yaw = 0;
    ocean.pitch = -0.06;
    engine.state.mode = 'paused';
  });
  await capture('art-v11-abyss');

  const metrics = await page.evaluate(async () => {
    const { ocean } = await import('/src/main.js');
    return {
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
      geometries: ocean.renderer.info.memory.geometries,
      textures: ocean.renderer.info.memory.textures,
    };
  });
  console.log(JSON.stringify({ ok: errors.length === 0, metrics, errors }, null, 2));
} finally {
  await browser.close();
}
