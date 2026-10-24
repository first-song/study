import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('aberrant-tide-onboarding-v1', 'seen');
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(450);

const diagnostics = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { engine, ocean } = await import('/src/main.js');
  const { humanBoatStates } = await import('/src/human-navigation.js');
  const states = humanBoatStates(engine.state.world, engine.state.time);
  const capital = ocean.patrolFleet.userData.boats[0];
  const box = new THREE.Box3().setFromObject(capital);
  const size = box.getSize(new THREE.Vector3());
  const childSizes = capital.children.map(child => {
    const childBox = new THREE.Box3().setFromObject(child);
    const childSize = childBox.getSize(new THREE.Vector3());
    return { name: child.name || child.type, size: childSize.toArray().map(value => Math.round(value * 10) / 10) };
  });
  Object.assign(engine.state.player, {
    x: states[0].x,
    y: 52.85,
    z: states[0].z + 48,
    vx: 0,
    vy: 0,
    vz: 0,
  });
  ocean.yaw = 0;
  ocean.pitch = 0.03;
  ocean.firstPerson = false;
  document.querySelector('#hud')?.setAttribute('data-review-hidden', 'true');
  return {
    shipSize: size.toArray().map(value => Math.round(value * 10) / 10),
    childSizes,
    crews: capital.userData.crews.length,
    population: ocean.island.userData.streetPopulation.userData.animatables.humans.length,
    calls: ocean.renderer.info.render.calls,
    triangles: ocean.renderer.info.render.triangles,
  };
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/27-capital-ship.png' });
console.log(JSON.stringify(diagnostics, null, 2));
console.log(errors.length ? errors.join('\n') : 'NO_BROWSER_ERRORS');
await browser.close();
