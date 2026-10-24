import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(Boolean);

const browser = await chromium.launch({
  executablePath,
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

const evaluate = async source => page.evaluate(source);
const settle = () => page.waitForTimeout(650);

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('#start-btn').click();
  await page.waitForTimeout(700);
  await page.keyboard.press('h');
  await page.addStyleTag({
    content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}',
  });

  const ceiling = await evaluate(async () => {
    const { GameEngine } = await import('/src/engine.js');
    const { PLAYER_MAX_Y, WATER_SURFACE_Y } = await import('/src/biology.js');
    const engine = new GameEngine({ seed: 603 });
    engine.start();
    Object.assign(engine.state.player, { x: 0, y: 58, z: 0, vx: 0, vy: 0, vz: 0 });
    engine.update(0.1, { y: 1 });
    return { y: engine.state.player.y, max: PLAYER_MAX_Y, surface: WATER_SURFACE_Y };
  });
  assert.ok(ceiling.y <= ceiling.max && ceiling.y < ceiling.surface, 'cell must not occupy air above open water');

  await evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter, islandShorePoint } = await import('/src/island.js');
    const { WATER_SURFACE_Y } = await import('/src/biology.js');
    const center = islandCenter(engine.state.world);
    const shore = islandShorePoint(engine.state.world, Math.PI / 2, 34);
    Object.assign(engine.state.player, {
      x: center.x, y: WATER_SURFACE_Y - 0.24, z: shore.z,
      vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = 0;
    ocean.pitch = -0.08;
    engine.state.mode = 'paused';
    document.querySelector('#pause-screen').hidden = true;
  });
  await settle();
  await page.screenshot({ path: 'artifacts/27-archipelago-scale.png' });

  const ship = await evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter } = await import('/src/island.js');
    const { humanBoatStates } = await import('/src/human-navigation.js');
    const { WATER_SURFACE_Y } = await import('/src/biology.js');
    const center = islandCenter(engine.state.world);
    const boat = humanBoatStates(engine.state.world, engine.state.time)[0];
    const rx = boat.x - center.x, rz = boat.z - center.z, length = Math.hypot(rx, rz) || 1;
    const x = boat.x + rx / length * 31, z = boat.z + rz / length * 31;
    const dx = boat.x - x, dz = boat.z - z;
    Object.assign(engine.state.player, {
      x, y: WATER_SURFACE_Y - 0.24, z, vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = Math.atan2(-dx, -dz);
    ocean.pitch = -0.035;
    engine.state.mode = 'paused';
    document.querySelector('#pause-screen').hidden = true;
    return {
      length: ocean.patrolFleet.userData.boats[0].userData.length,
      crew: ocean.patrolFleet.userData.boats[0].userData.crews.length,
      detailVisible: ocean.patrolFleet.userData.boats[0].userData.detail.visible,
    };
  });
  assert.ok(ship.length >= 24);
  assert.ok(ship.crew >= 3);
  await settle();
  const shipView = await evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { humanBoatStates } = await import('/src/human-navigation.js');
    const boat = humanBoatStates(engine.state.world, engine.state.time)[0];
    const towardBoat = ocean.camera.getWorldDirection(ocean.camera.position.clone()).set(boat.x - ocean.camera.position.x, boat.y - ocean.camera.position.y, boat.z - ocean.camera.position.z).normalize();
    const facing = ocean.camera.getWorldDirection(new (await import('/node_modules/three/build/three.module.js')).Vector3()).dot(towardBoat);
    return {
      facing,
      distance: ocean.camera.position.distanceTo(boat),
      detailVisible: ocean.patrolFleet.userData.boats[0].userData.detail.visible,
      playerGround: (await import('/src/island.js')).islandSurfaceAt(engine.state.world, engine.state.player.x, engine.state.player.z),
    };
  });
  assert.ok(shipView.facing > 0.92, 'review camera must face the patrol ship');
  assert.equal(shipView.playerGround, null, 'ship review viewpoint must stay over open water');
  await page.screenshot({ path: 'artifacts/28-naval-patrol-ship.png' });

  const population = await evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter, islandSurfaceAt } = await import('/src/island.js');
    const center = islandCenter(engine.state.world);
    const x = center.x + 6, z = center.z + 77;
    const ground = islandSurfaceAt(engine.state.world, x, z);
    Object.assign(engine.state.player, {
      x, y: ground + 0.65, z, vx: 0, vy: 0, vz: 0,
    });
    ocean.firstPerson = true;
    ocean.yaw = Math.PI;
    ocean.pitch = 0.025;
    engine.state.mode = 'paused';
    document.querySelector('#pause-screen').hidden = true;
    return {
      people: ocean.island.userData.streetPopulation?.userData.animatables.humans.length || 0,
      ground,
      loaded: Boolean(ocean.island.userData.humanSettlement),
    };
  });
  assert.ok(population.people >= 20);
  assert.ok(Number.isFinite(population.ground));
  await settle();
  await page.screenshot({ path: 'artifacts/29-island-crowd.png' });

  const camera = await evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    const { islandCenter, islandSurfaceAt } = await import('/src/island.js');
    const center = islandCenter(engine.state.world);
    const x = center.x - 8, z = center.z - 24;
    const ground = islandSurfaceAt(engine.state.world, x, z);
    Object.assign(engine.state.player, {
      x, y: ground + 0.65, z, vx: 0, vy: 0, vz: 0,
    });
    engine.state.mode = 'playing';
    ocean.firstPerson = false;
    ocean.yaw = Math.PI * 0.5;
    ocean.pitch = 0.32;
    engine.update(1 / 60, {});
    for (let i = 0; i < 25; i++) ocean.update(1 / 60, engine.state, false);
    const cameraGround = islandSurfaceAt(engine.state.world, ocean.camera.position.x, ocean.camera.position.z);
    return {
      playerGround: islandSurfaceAt(engine.state.world, engine.state.player.x, engine.state.player.z),
      cameraGround,
      cameraY: ocean.camera.position.y,
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
    };
  });
  assert.ok(camera.playerGround !== null);
  if (camera.cameraGround !== null) assert.ok(camera.cameraY >= camera.cameraGround + 1.1);
  await page.screenshot({ path: 'artifacts/30-camera-terrain-clearance.png' });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, ceiling, ship, population, camera, errors }, null, 2));
} finally {
  await browser.close();
}
