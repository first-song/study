import * as THREE from '../node_modules/three/build/three.module.js';

const TAU = Math.PI * 2;

function seeded(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function createCloud() {
  const count = 920;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const shell = new THREE.Color(0x5aa99a);
  const cold = new THREE.Color(0x8ed8c4);
  const hot = new THREE.Color(0xf0a566);
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const radius = Math.pow(seeded(index, 1), 1.7) * 6.8;
    const theta = seeded(index, 2) * TAU;
    const y = (seeded(index, 3) - 0.5) * 2;
    const planar = Math.sqrt(Math.max(0, 1 - y * y));
    positions[index * 3] = Math.cos(theta) * planar * radius;
    positions[index * 3 + 1] = y * radius * 0.62;
    positions[index * 3 + 2] = Math.sin(theta) * planar * radius;
    seeds[index] = seeded(index, 4);
    sizes[index] = 0.08 + seeded(index, 5) * 0.22;
    const heat = Math.max(0, 1 - radius / 3.2);
    color.copy(shell).lerp(cold, seeded(index, 6) * 0.52).lerp(hot, heat * 0.76);
    color.toArray(colors, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      time: { value: 0 },
      nutrient: { value: 1 },
      pixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float time;
      uniform float nutrient;
      uniform float pixelRatio;
      void main(){
        vec3 p=position;
        float angle=time*(0.08+aSeed*0.16)+aSeed*6.2831;
        float c=cos(angle),s=sin(angle);
        p.xz=mat2(c,-s,s,c)*p.xz;
        p.y+=sin(time*(0.42+aSeed*0.48)+aSeed*8.0)*0.18;
        p*=0.94+0.09*sin(time*0.7+aSeed*10.0);
        vColor=color;
        vAlpha=(0.45+0.55*aSeed)*(0.62+nutrient*0.38);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=clamp(aSize*pixelRatio*(110.0/max(1.0,-mv.z)),1.0,15.0);
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        float d=distance(gl_PointCoord,vec2(0.5));
        if(d>0.5)discard;
        float core=smoothstep(0.5,0.04,d);
        gl_FragColor=vec4(vColor*(0.82+vAlpha*0.55),core*vAlpha*0.64);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'bloom-luminous-plankton';
  points.frustumCulled = false;
  return points;
}

function createLobes() {
  const count = 13;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 1), material, count);
  mesh.name = 'bloom-organic-lobes';
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const yellow = new THREE.Color(0xc8c281);
  const turquoise = new THREE.Color(0x64b7ad);
  const amber = new THREE.Color(0xdf8a58);
  for (let index = 0; index < count; index++) {
    const radius = 1.6 + seeded(index, 11) * 4.2;
    const angle = seeded(index, 12) * TAU;
    dummy.position.set(
      Math.cos(angle) * radius,
      (seeded(index, 13) - 0.5) * radius * 0.9,
      Math.sin(angle) * radius,
    );
    dummy.rotation.set(seeded(index, 14) * TAU, seeded(index, 15) * TAU, seeded(index, 16) * TAU);
    dummy.scale.set(
      0.45 + seeded(index, 17) * 1.15,
      0.3 + seeded(index, 18) * 0.9,
      0.45 + seeded(index, 19) * 1.15,
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    tint.copy(turquoise).lerp(yellow, seeded(index, 20) * 0.62);
    if (radius < 2.8) tint.lerp(amber, 0.64);
    mesh.setColorAt(index, tint);
  }
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function createTendrils() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.9, 0),
    new THREE.Vector3(0.4, 0.3, 0.2),
    new THREE.Vector3(-0.22, -0.42, -0.35),
    new THREE.Vector3(0.12, -1.18, 0.16),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 7, 0.018, 4, false);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9bd9c1,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 36);
  mesh.name = 'bloom-suspended-tendrils';
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < mesh.count; index++) {
    const angle = seeded(index, 31) * TAU;
    const radius = 1.1 + seeded(index, 32) * 5.2;
    dummy.position.set(Math.cos(angle) * radius, (seeded(index, 33) - 0.5) * 3.8, Math.sin(angle) * radius);
    dummy.rotation.set(seeded(index, 34) * 0.7, seeded(index, 35) * TAU, seeded(index, 36) * 0.7);
    dummy.scale.setScalar(0.6 + seeded(index, 37) * 1.05);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  return mesh;
}

let auraTexture;
function radialAuraTexture() {
  if (auraTexture) return auraTexture;
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1;
    const dy = (y + 0.5) / size * 2 - 1;
    const radius = Math.min(1, Math.hypot(dx, dy));
    const alpha = Math.pow(Math.max(0, 1 - radius), 2.4) * 255;
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = alpha;
  }
  auraTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  auraTexture.needsUpdate = true;
  return auraTexture;
}

function createAura(radius, color, opacity, name) {
  const material = new THREE.SpriteMaterial({
    map: radialAuraTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Sprite(material);
  mesh.name = name;
  mesh.geometry = mesh.geometry.clone();
  mesh.scale.set(radius * 1.8, radius * 1.5, 1);
  return mesh;
}

export function createPlanktonBloom(entity = {}) {
  const group = new THREE.Group();
  group.name = `plankton-bloom-${entity.id ?? 'preview'}`;
  const cloud = createCloud();
  const lobes = createLobes();
  const tendrils = createTendrils();
  const halo = createAura(6.7, 0x5abda9, .045, 'bloom-water-displacement-halo');
  const core = createAura(2.5, 0xe0a064, .075, 'bloom-warm-core');
  group.add(halo, core, cloud, lobes, tendrils);
  group.userData = {
    type: 'bloom',
    radius: Number(entity.radius) || 5.8,
    cloud,
    lobes,
    tendrils,
    halo,
    core,
    seed: Number(entity.seed) || 0,
    baseScale: 0.9 + (Number(entity.radius) || 5.8) / 34,
  };
  animatePlanktonBloom(group, { ...entity, nutrient: entity.nutrient ?? 1, phase: entity.phase ?? 'calm' }, 0);
  return group;
}

export function animatePlanktonBloom(group, entity = {}, time = 0) {
  if (!group) return;
  const data = group.userData;
  const nutrient = Math.max(0.08, Math.min(1, Number(entity.nutrient ?? 1)));
  const unstable = entity.phase === 'unstable' ? 1 : 0;
  const pulse = 1 + Math.sin(time * (1.1 + unstable * 1.8) + data.seed) * (0.025 + unstable * 0.035);
  group.scale.setScalar(data.baseScale * pulse * (0.78 + nutrient * 0.22));
  group.rotation.y = time * 0.045 + data.seed;
  group.rotation.z = Math.sin(time * 0.23 + data.seed) * 0.035;
  data.cloud.material.uniforms.time.value = time;
  data.cloud.material.uniforms.nutrient.value = nutrient;
  data.lobes.material.opacity = 0.16 + nutrient * 0.17 + unstable * 0.035;
  data.lobes.material.emissive?.setHex(unstable ? 0xa54828 : 0x28594b);
  data.lobes.material.emissiveIntensity = unstable ? 0.58 : 0.28;
  data.tendrils.material.opacity = 0.12 + nutrient * 0.16;
  data.halo.material.opacity = (0.035 + nutrient * 0.04) * (0.85 + Math.sin(time * 0.7) * 0.15);
  data.core.material.opacity = 0.055 + nutrient * 0.055 + unstable * 0.035;
  data.core.material.color.setHex(unstable ? 0xf07548 : 0xe0a064);
}
