import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from '../node_modules/three/build/three.module.js';
import { GameEngine } from '../src/engine.js';
import { REACTOR_SITES, interactionPosition, reactorEntranceYaw } from '../src/ecosystem.js';
import { createMarineAnimal, animateMarineAnimal } from '../src/marine-models.js';
import { createReactor, animateReactor, createBiofilm, animateBiofilm } from '../src/reactor-models.js';
import { createHabitatDetails } from '../src/ocean-habitat.js';
import { createWorld } from '../src/world.js';

function dispose(model) {
  model.traverse(object => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) material.dispose();
  });
}

function assertUsableGeometry(model) {
  let meshes = 0;
  model.traverse(object => {
    if (!object.geometry) return;
    meshes++;
    for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
      assert.ok(attribute.count > 0, `${object.name} has ${name} vertices`);
      assert.ok(attribute.array.every(Number.isFinite), `${object.name} has finite ${name}`);
    }
  });
  const bounds = new Box3().setFromObject(model);
  assert.ok(meshes > 0 && !bounds.isEmpty());
  assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
}

for (const type of ['fish', 'shark']) {
  test(`${type} variants change the continuous body geometry and retain working animation`, () => {
    const baseline = createMarineAnimal({ type, variant: 'normal', seed: 19, radius: 2 });
    const normal = baseline.userData.bodyMesh.geometry.attributes.position.array;
    const models = [baseline];
    try {
      assertUsableGeometry(baseline);
      for (const variant of ['crooked', 'armored', 'lure']) {
        const model = createMarineAnimal({ type, variant, seed: 19, radius: 2 });
        models.push(model);
        assert.equal(model.userData.variant, variant);
        assert.ok(model.userData.bodyMesh.geometry.userData.continuousSections > 20);
        const positions = model.userData.bodyMesh.geometry.attributes.position.array;
        // Compare position data directly: a palette swap cannot satisfy this.
        assert.notDeepEqual(positions, normal, `${variant} changes the actual silhouette`);
        const sharedCoordinates = Math.min(normal.length, positions.length);
        let changed = 0;
        for (let index = 0; index < sharedCoordinates; index++) if (Math.abs(normal[index] - positions[index]) > .001) changed++;
        assert.ok(changed > 100, `${variant} deforms the mesh, not only an accessory`);
        animateMarineAnimal(model, 1, 3, .1, .25);
        const first = { roll: model.rotation.z, wave: model.userData.swimUniforms.amplitude.value, time: model.userData.swimUniforms.time.value };
        animateMarineAnimal(model, 2, 3, .1, -.25);
        assert.notEqual(model.userData.swimUniforms.time.value, first.time);
        assert.notEqual(model.rotation.z, first.roll);
        assert.ok(Number.isFinite(model.userData.swimUniforms.amplitude.value));
        if (variant === 'crooked') assert.notEqual(model.userData.swimUniforms.amplitude.value, first.wave);
        if (variant === 'armored') assert.ok(model.userData.swimUniforms.amplitude.value < baseline.userData.baseAmplitude);
        if (variant === 'lure') assert.ok(model.getObjectByName('ectopic-sensory-tissue'));
        assertUsableGeometry(model);
      }
      const fallback = createMarineAnimal({ type, variant: 'unknown', seed: 19, radius: 2 });
      models.push(fallback);
      assert.equal(fallback.userData.variant, 'normal');
      assert.deepEqual(fallback.userData.bodyMesh.geometry.attributes.position.array, normal);
    } finally { models.forEach(dispose); }
  });
}

test('all three simulated reactor entrances agree with their actual open collar geometry', () => {
  const engine = new GameEngine({ seed: 73 }); engine.start();
  const reactors = engine.state.entities.filter(entity => entity.type === 'reactor');
  assert.equal(reactors.length, REACTOR_SITES.length);
  assert.equal(reactors.length, 3);
  for (const entity of reactors) {
    const model = createReactor(entity);
    try {
      model.position.set(entity.x, entity.y, entity.z); model.updateMatrixWorld(true);
      const target = interactionPosition(entity),expected = new Vector3(target.x, target.y, target.z);
      const declared = model.localToWorld(model.userData.ingressOffset.clone());
      assert.ok(declared.distanceTo(expected) < 1e-8, `${entity.siteId} attachment position`);
      const hardware = model.getObjectByName('coolant-hardware-and-ingress'),scale = model.scale.x;
      assert.ok(hardware, 'reactor exposes a physical access throat');
      const angle=Number.isFinite(entity.approachAngle)?entity.approachAngle:-Math.PI/2;
      const outward=new Vector3(Math.cos(angle),0,Math.sin(angle));
      const side=new Vector3(-Math.sin(angle),0,Math.cos(angle));
      assert.ok(Math.abs(model.rotation.y-reactorEntranceYaw(entity))<1e-8);
      // Rays sample the rendered collar itself, not only the metadata marker.
      // Four rim points must hit metal while the centered ray enters the hole.
      for (const [x, y] of [[.91, 0], [-.91, 0], [0, .91], [0, -.91]]) {
        const origin = expected.clone()
          .addScaledVector(side,x*scale)
          .addScaledVector(outward,.6*scale);
        origin.y+=y*scale;
        const ray = new Raycaster(origin, outward.clone().negate(), 0, .95 * scale);
        assert.ok(ray.intersectObject(hardware, false).length > 0, `${entity.siteId} visible collar at ${x},${y}`);
      }
      const centered = new Raycaster(expected.clone().addScaledVector(outward,.6*scale),outward.clone().negate(),0,.95*scale);
      assert.equal(centered.intersectObject(hardware, false).length, 0, `${entity.siteId} throat stays open`);
      assertUsableGeometry(model);
    } finally { dispose(model); }
  }
});

test('reactor discharge changes suspended coolant, colonization is visible, and shutdown removes leakage', () => {
  const engine = new GameEngine({ seed: 73 }); engine.start();
  const entity = { ...engine.state.entities.find(candidate => candidate.type === 'reactor'), phase: 'cooldown', progress: 0 };
  const model = createReactor(entity);
  try {
    animateReactor(model, entity, 4, .016);
    const particles = model.userData.coolant;
    const restingOpacity = particles.material.opacity;
    const restingPositions = particles.geometry.attributes.position.array.slice();
    const restingLamp = model.userData.statusMaterial.emissiveIntensity;
    entity.phase = 'discharge'; entity.progress = .5;
    animateReactor(model, entity, 4, .016);
    assert.ok(particles.visible);
    assert.ok(particles.material.opacity > restingOpacity);
    assert.notDeepEqual(particles.geometry.attributes.position.array, restingPositions);
    assert.ok(model.userData.statusMaterial.emissiveIntensity > restingLamp);
    assert.ok(model.userData.colony.material.opacity > 0);
    assertUsableGeometry(model);
    entity.status = 'shutdown'; entity.progress = 1;
    for (const phase of ['cooldown', 'warning', 'discharge']) {
      entity.phase = phase; animateReactor(model, entity, 8, .016);
      assert.equal(particles.visible, false, `shutdown suppresses ${phase} leakage`);
      assert.equal(model.userData.shutdown, true);
    }
  } finally { dispose(model); }
});

test('biofilms retain substantial substrates and respond visually to consumption', () => {
  const engine = new GameEngine({ seed: 73 }); engine.start();
  const entities = engine.state.entities.filter(entity => entity.type === 'biofilm');
  assert.equal(entities.length, 3);
  for (const entity of entities) {
    const model = createBiofilm(entity);
    try {
      const substrate = model.getObjectByName(entity.siteId === 'nursery' ? 'waterlogged-driftwood' : 'rooted-benthic-substrate');
      assert.ok(substrate, `${entity.siteId} film attaches to a physical carrier`);
      assertUsableGeometry(model);
      animateBiofilm(model, entity, 1, .016);
      const livingHeight = model.userData.cilia.scale.y;
      animateBiofilm(model, { ...entity, depleted: true }, 2, .016);
      assert.ok(model.userData.cilia.scale.y < livingHeight);
      assertUsableGeometry(model);
    } finally { dispose(model); }
  }
});

test('host attachment stays next to the rendered shoulder through heading, pitch and surfacing', () => {
  const engine = new GameEngine({ seed: 73 }); engine.start();
  const poses = [
    { heading: .7, pitch: 0, speed: 0 },
    { heading: 1.2, pitch: .3, speed: 3 },
    { heading: -2.1, pitch: -.55, speed: 3 },
  ];
  for (const type of ['fish', 'whale', 'turtle']) {
    const source = engine.state.entities.find(entity => entity.type === type);
    assert.ok(source, `${type} exists in the ecology`);
    for (const y of [22, 52]) for (const pose of poses) {
      const entity = {
        ...source, variant: 'normal', x: 12, y, z: -8, heading: pose.heading,
        vx: -Math.sin(pose.heading) * Math.cos(pose.pitch) * pose.speed,
        vy: Math.sin(pose.pitch) * pose.speed,
        vz: -Math.cos(pose.heading) * Math.cos(pose.pitch) * pose.speed,
      };
      const model = createMarineAnimal(entity);
      try {
        // The renderer uses YXZ orientation: apply the known fixture pose,
        // independently of the helper's attachment-point calculation.
        model.position.set(entity.x, entity.y, entity.z);
        model.rotation.set(pose.pitch, pose.heading, 0, 'YXZ');
        model.updateMatrixWorld(true);
        const point = interactionPosition(entity);
        assert.ok(point.y >= 3 && point.y <= 56, `${type} contact remains in world bounds`);
        const origin = new Vector3(point.x, point.y, point.z);
        const inward = new Vector3(-1, 0, 0).applyQuaternion(model.quaternion).normalize();
        const ray = new Raycaster(origin, inward, 0, 1.3);
        const hits = ray.intersectObject(model.userData.bodyMesh, false);
        assert.ok(hits.length > 0, `${type} shoulder contact is within 1.3 units at y=${y}, pitch=${pose.pitch}`);
        assert.ok(hits[0].distance <= 1.3);
      } finally { dispose(model); }
    }
  }
});

test('the local reef layers authored grazers, echinoderms, anemones, sponges, filter fans, corals and seagrass', () => {
  const habitat=createHabitatDetails(createWorld(74));
  for(const name of ['pulsing-anemones','tube-sponges','filter-feeding-fans','branching-corals','terraced-plate-corals','flowing-seagrass','nursery-seagrass-meadow','nursery-ribbon-seagrass','nursery-kelp-young-growth','grazing-sea-urchins','brittle-stars-on-sediment']) {
    const object=habitat.getObjectByName(name);
    assert.ok(object?.isInstancedMesh,name);
    assert.ok(object.count>0,name);
    assert.ok(object.geometry.attributes.position.count>10,name);
  }
  assert.ok(habitat.userData.nurseryRibbonGrass.count>=400);
  assert.ok(habitat.userData.urchins.count>=50);
  assert.ok(habitat.userData.brittleStars.count>=40);
});
