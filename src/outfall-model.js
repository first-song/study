import * as THREE from '../node_modules/three/build/three.module.js';
import { worldRandom } from './world.js';
import { WATER_SURFACE_Y } from './biology.js';
import { outfallLayout } from './outfall-layout.js';

const UP = new THREE.Vector3(0, 1, 0);

function pipeBetween(a, b, radius, material, sides = 18) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.025, 1, sides, 1, false), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.scale.y = length;
  return mesh;
}

function ringBetween(a, b, radius, material, offset = .5) {
  const direction = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .16, 7, 20), material);
  ring.position.set(
    a.x + (b.x - a.x) * offset,
    a.y + (b.y - a.y) * offset,
    a.z + (b.z - a.z) * offset,
  );
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  return ring;
}

function buildEffluent(radius, height, random, colors) {
  const count = 230;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const spread = .2 + Math.sqrt(random()) * radius;
    positions[index * 3] = Math.cos(angle) * spread;
    positions[index * 3 + 1] = random() * height;
    positions[index * 3 + 2] = Math.sin(angle) * spread;
    seeds[index] = random() * Math.PI * 2;
    color.setHSL(.11 + random() * .12, .16 + random() * .22, .22 + random() * .16);
    tints[index * 3] = color.r;
    tints[index * 3 + 1] = color.g;
    tints[index * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      time: { value: 0 },
      opacity: { value: .48 },
      colors,
    },
    vertexShader: `
      attribute float seed;
      attribute vec3 tint;
      uniform float time;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        float age = fract(seed * .137 + time * (.018 + fract(seed) * .014));
        vec3 drift = position;
        drift.y = position.y + age * ${height.toFixed(1)};
        drift.x += sin(time * .21 + seed + age * 8.) * age * 2.7 + age * age * 6.;
        drift.z += cos(time * .18 + seed * 1.3 + age * 7.) * age * 2.3;
        vTint = tint;
        vFade = smoothstep(0., .08, age) * (1. - smoothstep(.55, 1., age));
        vec4 mv = modelViewMatrix * vec4(drift, 1.);
        gl_PointSize = clamp(mix(6., 22., age) * (26. / max(1., -mv.z)), 1., 13.);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        float d = distance(gl_PointCoord, vec2(.5));
        if (d > .5) discard;
        float soft = smoothstep(.5, .03, d);
        gl_FragColor = vec4(vTint * (1.2 + vFade * .5), soft * vFade * opacity);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'outfall-pollution-plume';
  points.frustumCulled = false;
  return points;
}

function buildBubbles(radius, random) {
  const count = 150;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const spread = Math.sqrt(random()) * radius;
    positions[index * 3] = Math.cos(angle) * spread;
    positions[index * 3 + 1] = random() * 7;
    positions[index * 3 + 2] = Math.sin(angle) * spread;
    seeds[index] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float seed;
      uniform float time;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float rise = fract(seed * .084 + time * (.035 + fract(seed) * .022));
        p.y += rise * 24.;
        p.x += sin(time * .55 + seed) * rise * 1.2;
        p.z += cos(time * .42 + seed) * rise * .8;
        vAlpha = (1. - rise) * .7;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = clamp((3.5 + fract(seed) * 4.) * (24. / max(1., -mv.z)), 1., 5.);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = distance(gl_PointCoord, vec2(.5));
        float ring = smoothstep(.48, .36, d) * smoothstep(.18, .31, d);
        gl_FragColor = vec4(.57, .76, .73, ring * vAlpha * .34);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'outfall-diffuser-bubbles';
  points.frustumCulled = false;
  return points;
}

export function createSubseaOutfall(world) {
  const layout = outfallLayout(world);
  const random = worldRandom((world.seed ^ 0x7f4a3d21) >>> 0);
  const root = new THREE.Group();
  root.name = 'gray-island-industrial-outfall';
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0x59635d,
    roughness: .56,
    metalness: .48,
    clearcoat: .16,
    clearcoatRoughness: .42,
  });
  const wetSteel = new THREE.MeshPhysicalMaterial({
    color: 0x3d4b49,
    roughness: .36,
    metalness: .58,
    clearcoat: .42,
    clearcoatRoughness: .25,
  });
  const hazard = new THREE.MeshStandardMaterial({
    color: 0xc06d30,
    emissive: 0x3e1607,
    emissiveIntensity: .28,
    roughness: .54,
    metalness: .2,
  });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x77766d, roughness: .92, metalness: .02 });
  const growth = new THREE.MeshStandardMaterial({ color: 0x607563, roughness: .9 });
  const warning = new THREE.MeshStandardMaterial({
    color: 0xffa448,
    emissive: 0xff661b,
    emissiveIntensity: 2.1,
    roughness: .32,
  });
  const pipeParts = [];
  for (const [index, segment] of layout.segments.entries()) {
    pipeParts.push(pipeBetween(segment.a, segment.b, segment.radius, index ? wetSteel : steel, 22));
    pipeParts.push(ringBetween(segment.a, segment.b, segment.radius * 1.06, hazard, .2));
    pipeParts.push(ringBetween(segment.a, segment.b, segment.radius * 1.06, hazard, .82));
  }
  for (const part of pipeParts) root.add(part);

  const mouthParts = [];
  for (const [index, mouth] of layout.mouths.entries()) {
    const branch = {
      x: mouth.x - layout.lateral.x * (10 + index * 1.5),
      y: mouth.y + .15,
      z: mouth.z - layout.lateral.z * (10 + index * 1.5),
    };
    mouthParts.push(pipeBetween(branch, { x: mouth.x - layout.lateral.x * 1.1, y: mouth.y, z: mouth.z - layout.lateral.z * 1.1 }, 1.02, wetSteel, 16));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(mouth.radius, mouth.radius * .62, 2.4, 24, 1, true), concrete);
    bell.position.set(mouth.x, mouth.y, mouth.z);
    bell.quaternion.setFromUnitVectors(UP, new THREE.Vector3(layout.lateral.x, .08, layout.lateral.z).normalize());
    mouthParts.push(bell);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(mouth.radius * .93, .18, 7, 24), hazard);
    lip.position.set(mouth.x + layout.lateral.x * 1.05, mouth.y + .02, mouth.z + layout.lateral.z * 1.05);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(layout.lateral.x, .08, layout.lateral.z));
    mouthParts.push(lip);
  }
  for (const part of mouthParts) root.add(part);

  const supports = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, 9);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < supports.count; index++) {
    const t = .22 + index / (supports.count - 1) * .72;
    dummy.position.set(
      layout.bend.x + (layout.diffuser.x - layout.bend.x) * t,
      1.18 + (index % 2) * .15,
      layout.bend.z + (layout.diffuser.z - layout.bend.z) * t,
    );
    dummy.rotation.set(0, layout.angle, (index % 2 ? -.08 : .08));
    dummy.scale.set(1.45 + random() * .25, 1.35 + random() * .35, 2.45);
    dummy.updateMatrix();
    supports.setMatrixAt(index, dummy.matrix);
  }
  supports.instanceMatrix.needsUpdate = true;
  root.add(supports);

  const guideMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a4d, toneMapped: false });
  const guideLights = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), guideMaterial, 12);
  guideLights.name = 'outfall-guide-lights';
  for (let index = 0; index < guideLights.count; index++) {
    const segment = layout.segments[index < 5 ? 0 : 1];
    const t = index < 5 ? .25 + index * .14 : .08 + (index - 5) * .14;
    const x = segment.a.x + (segment.b.x - segment.a.x) * t;
    const y = segment.a.y + (segment.b.y - segment.a.y) * t + segment.radius + .08;
    const z = segment.a.z + (segment.b.z - segment.a.z) * t;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(.7 + (index % 3) * .18);
    dummy.updateMatrix();
    guideLights.setMatrixAt(index, dummy.matrix);
  }
  guideLights.instanceMatrix.needsUpdate = true;
  root.add(guideLights);

  const barnacles = new THREE.InstancedMesh(new THREE.ConeGeometry(.18, .42, 7, 1, true), growth, 110);
  for (let index = 0; index < barnacles.count; index++) {
    const segment = layout.segments[index % layout.segments.length];
    const t = random();
    const x = segment.a.x + (segment.b.x - segment.a.x) * t;
    const y = segment.a.y + (segment.b.y - segment.a.y) * t;
    const z = segment.a.z + (segment.b.z - segment.a.z) * t;
    const angle = random() * Math.PI * 2, radius = segment.radius + .13;
    dummy.position.set(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z + (random() - .5) * radius);
    dummy.rotation.set((random() - .5) * 1.4, random() * Math.PI * 2, (random() - .5) * 1.4);
    dummy.scale.setScalar(.55 + random() * 1.2);
    dummy.updateMatrix();
    barnacles.setMatrixAt(index, dummy.matrix);
  }
  barnacles.instanceMatrix.needsUpdate = true;
  root.add(barnacles);

  const surfaceBreak = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, .42, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0xb8753f, roughness: .68, metalness: .22 }),
  );
  surfaceBreak.name = 'outfall-surface-collar';
  surfaceBreak.position.set(layout.shore.x, WATER_SURFACE_Y - .42, layout.shore.z);
  surfaceBreak.rotation.x = Math.PI / 2;
  root.add(surfaceBreak);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.52, 16, 10), warning);
  beacon.name = 'outfall-warning-beacon';
  beacon.position.set(layout.shore.x + 3.8, WATER_SURFACE_Y + 2.8, layout.shore.z);
  root.add(beacon);
  const beaconPole = pipeBetween(
    { x: layout.shore.x + 3.8, y: WATER_SURFACE_Y - .3, z: layout.shore.z },
    { x: layout.shore.x + 3.8, y: WATER_SURFACE_Y + 2.5, z: layout.shore.z },
    .11,
    wetSteel,
    8,
  );
  root.add(beaconPole);

  const plume = buildEffluent(6.5, 31, random, {
    a: new THREE.Color(.16, .23, .15),
    b: new THREE.Color(.36, .31, .21),
  });
  plume.position.set(layout.diffuser.x, 2.1, layout.diffuser.z);
  root.add(plume);
  const bubbles = buildBubbles(8.5, random);
  bubbles.position.set(layout.diffuser.x, 2.2, layout.diffuser.z);
  root.add(bubbles);
  const warningLight = new THREE.PointLight(0xff7b3f, 17, 28, 1.7);
  warningLight.name = 'outfall-warning-light';
  warningLight.position.set(layout.diffuser.x + layout.lateral.x * 2.5, 4.8, layout.diffuser.z + layout.lateral.z * 2.5);
  root.add(warningLight);

  root.userData = {
    layout,
    plume,
    bubbles,
    beacon,
    warningLight,
    guideMaterial,
    warningMaterial: warning,
    collisionSegments: layout.segments,
    collisionMouths: layout.mouths,
  };
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return root;
}

export function animateSubseaOutfall(outfall, time) {
  if (!outfall) return;
  const data = outfall.userData;
  if (data.plume) data.plume.material.uniforms.time.value = time;
  if (data.bubbles) data.bubbles.material.uniforms.time.value = time;
  if (data.beacon) {
    const pulse = Math.sin(time * 2.7) * .5 + .5;
    data.beacon.scale.setScalar(.82 + pulse * .48);
    data.warningMaterial.emissiveIntensity = 1.25 + pulse * 2.8;
    if (data.warningLight) data.warningLight.intensity = 10 + pulse * 12;
    if (data.guideMaterial) data.guideMaterial.color.setRGB(1, .38 + pulse * .26, .14 + pulse * .12);
  }
}
