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

const captureState = async (name, setup) => {
  await page.evaluate(setup);
  await page.waitForTimeout(850);
  await page.addStyleTag({ content: '#hud,.toast-container,#touch-controls,#modal-screen{display:none!important}' });
  await page.screenshot({ path: `artifacts/${name}.png` });
  return page.evaluate(async () => {
    const { engine, ocean } = await import('/src/main.js');
    return {
      calls: ocean.renderer.info.render.calls,
      triangles: ocean.renderer.info.render.triangles,
      geometries: ocean.renderer.info.memory.geometries,
      textures: ocean.renderer.info.memory.textures,
      programs: ocean.renderer.info.programs?.length || 0,
      player: {
        x: engine.state.player.x,
        y: engine.state.player.y,
        z: engine.state.player.z,
      },
    };
  });
};

try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/art-pass-00-menu.png' });
  await page.locator('#start-btn').click();
  await page.waitForTimeout(700);
  await page.keyboard.press('h');
  await page.addStyleTag({
    content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}',
  });

  const shots = {};
  shots.shallow = await captureState('art-pass-01-shallow', async () => {
    const { engine, ocean } = await import('/src/main.js');
    Object.assign(engine.state.player, { x: 2, y: 31, z: 4, vx: 0, vy: 0, vz: 0 });
    ocean.firstPerson = false;
    ocean.yaw = .7;
    ocean.pitch = .12;
    engine.state.mode = 'paused';
  });

  shots.kelp = await captureState('art-pass-02-kelp', async () => {
    const { engine, ocean } = await import('/src/main.js');
    const biome = engine.state.world.biomes.find(item => item.id === 'kelp');
    Object.assign(engine.state.player, { x: biome.x, y: 22, z: biome.z, vx: 0, vy: 0, vz: 0 });
    ocean.firstPerson = true;
    ocean.yaw = -.5;
    ocean.pitch = .04;
    engine.state.mode = 'paused';
  });

  shots.abyss = await captureState('art-pass-03-abyss', async () => {
    const { engine, ocean } = await import('/src/main.js');
    const biome = engine.state.world.biomes.find(item => item.id === 'abyss');
    Object.assign(engine.state.player, { x: biome.x, y: 16, z: biome.z, vx: 0, vy: 0, vz: 0 });
    ocean.firstPerson = false;
    ocean.yaw = .15;
    ocean.pitch = .08;
    engine.state.mode = 'paused';
  });

  console.log(JSON.stringify({ ok: errors.length === 0, shots, errors }, null, 2));
} finally {
  await browser.close();
}
