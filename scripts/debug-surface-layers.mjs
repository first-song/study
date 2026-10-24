import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1', 'seen');
  localStorage.setItem('aberrant-tide-settings-v1', JSON.stringify({ quality: 'high', firstPerson: true }));
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(700);
await page.addStyleTag({ content: '#hud,.toast-container,#touch-controls,#pause-screen,#end-screen,#loading-label{display:none!important}' });
await page.evaluate(async () => {
  const { engine, ocean } = await import('/src/main.js');
  const { islandCenter } = await import('/src/island.js');
  const { PLAYER_MAX_Y } = await import('/src/biology.js');
  const center = islandCenter(engine.state.world);
  Object.assign(engine.state.player, { x: center.x, y: PLAYER_MAX_Y, z: center.z + 154, vx: 0, vy: 0, vz: 0 });
  engine.state.mode = 'paused';
  ocean.firstPerson = true;
  ocean.yaw = 0;
  ocean.pitch = -.025;
});
await page.waitForTimeout(850);
await page.screenshot({ path: 'artifacts/debug-surface-all.png' });

const inventory = await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  const transparent = [];
  ocean.scene.traverse(node => {
    if (!node.isMesh || !node.material?.transparent) return;
    node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox;
    transparent.push({
      name: node.name,
      parent: node.parent?.name,
      renderOrder: node.renderOrder,
      bounds: box ? [box.min.toArray(), box.max.toArray()] : null,
    });
  });
  return transparent;
});

await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  const surf = ocean.island.getObjectByName('shoreline-surf');
  const breaking = ocean.island.getObjectByName('shoreline-breaking-foam');
  if (surf) surf.material.visible = false;
  if (breaking) breaking.material.visible = false;
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'artifacts/debug-surface-no-foam.png' });

await page.evaluate(async () => {
  const { ocean } = await import('/src/main.js');
  ocean.surface.material.visible = false;
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'artifacts/debug-surface-no-water.png' });
console.log(JSON.stringify({ transparent: inventory }, null, 2));
await browser.close();
