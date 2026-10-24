// 排放母体与它的触须：程序化模型。风格与 echo-models.js 保持一致，
// 用的都是连续曲面 + 加法混合的辉光，没有外部贴图。
import * as THREE from '../node_modules/three/build/three.module.js';

const TAU = Math.PI * 2;
const phong = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 65, ...extra });
const glow = (color, opacity = .22) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

// 母体：外甲 → 喷发 → 核心。三种状态用同一具身体的不同部件表达。
export function createEmissionsMother(entity = {}) {
  const group = new THREE.Group();
  group.name = 'emissions-mother';

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 3), phong(0x6d7d51, { emissive: 0x2a381b, shininess: 42 }));
  body.scale.set(1, .84, 1.12);
  group.add(body);

  // 交叠的外甲板：三阶段的第一阶段里，它们挡在核心前面。
  const plates = [];
  for (let i = 0; i < 5; i++) {
    const plate = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 18, 10, 0, TAU, 0, Math.PI * .44),
      phong(0x8a7a4e, { emissive: 0x2a2312, shininess: 34, side: THREE.DoubleSide }),
    );
    plate.position.y = 1.5;
    group.add(plate);
    plates.push(plate);
    // 甲板边缘的硬质棱线：没有它，母体只是一个光滑的球。
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.48, .16, 6, 32), phong(0xd8b878, { emissive: 0x4a3410, shininess: 90 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.5 + 3.5 * Math.cos(Math.PI * .44);
    plate.add(rim);
  }

  // 核心：只有母体第三阶段（核心张开）时才会真正亮起来。
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.05, 2), glow(0xff9a5c, .18));
  group.add(core);
  const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 1), glow(0xffd08a, .1));
  group.add(coreShell);

  // 触须接口：外甲阶段结束时，这些地方会伸出触须。
  const sockets = [];
  for (let i = 0; i < 3; i++) {
    const socket = new THREE.Mesh(new THREE.TorusGeometry(1.15, .32, 8, 18), phong(0x596748, { emissive: 0x1a2212 }));
    const angle = i / 3 * TAU;
    socket.position.set(Math.cos(angle) * 4.5, .2, Math.sin(angle) * 4.5);
    socket.rotation.y = -angle;
    group.add(socket);
    sockets.push(socket);
  }

  // 排气口：喷发阶段会从这里冒出污染云。
  const vents = [];
  for (let i = 0; i < 6; i++) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(.46, .82, 1.7, 10), phong(0x47523d, { emissive: 0x131910 }));
    const angle = i / 6 * TAU + .32;
    vent.position.set(Math.cos(angle) * 3.5, 2.5, Math.sin(angle) * 3.5);
    vent.rotation.z = -Math.cos(angle) * .55;
    vent.rotation.x = Math.sin(angle) * .55;
    group.add(vent);
    vents.push(vent);
  }

  const halo = new THREE.Mesh(new THREE.SphereGeometry(7.4, 20, 14), glow(0x9cc46a, .07));
  group.add(halo);

  group.userData = { plates, core, coreShell, sockets, vents, halo, type: 'mother' };
  return group;
}

export function animateEmissionsMother(group, entity = {}, time = 0, dt = .016) {
  const data = group.userData;
  if (!data) return;
  const phase = entity.motherPhase || 'armor';
  for (let i = 0; i < data.plates.length; i++) {
    const plate = data.plates[i];
    plate.rotation.set(i * .55 + Math.sin(time * .3 + i) * .05, time * .12 + i * 1.1, i * .3 + Math.cos(time * .24 + i) * .04);
  }
  const breathe = 1 + Math.sin(time * 1.1) * .022;
  data.core.scale.setScalar(breathe);
  data.coreShell.scale.setScalar(breathe * 1.02);
  const coreOpen = phase === 'core' && entity.coreWindowOpen;
  const target = coreOpen ? .68 : phase === 'core' ? .12 : .06;
  data.core.material.opacity += (target - data.core.material.opacity) * Math.min(1, dt * 6);
  data.coreShell.material.opacity += (target * .45 - data.coreShell.material.opacity) * Math.min(1, dt * 6);
  data.coreShell.rotation.y += dt * (coreOpen ? 1.6 : .3);
  data.coreShell.rotation.x += dt * (coreOpen ? .9 : .12);
  const haloTarget = phase === 'spout' ? .14 : .07;
  data.halo.material.opacity += (haloTarget - data.halo.material.opacity) * Math.min(1, dt * 3);
  data.halo.scale.setScalar(1 + Math.sin(time * .8) * .04);
}

// 触须：母体的弱点。血量越低越红，末端吸盘的辉光越强。
export function createTendrilModel(entity = {}) {
  const group = new THREE.Group();
  group.name = 'mother-tendril';
  const base = new THREE.Mesh(new THREE.SphereGeometry(1.55, 18, 12), phong(0x7c8a5a, { emissive: 0x222a15, shininess: 60 }));
  base.scale.set(1, .82, 1.2);
  group.add(base);
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.32, 1.6, 7), phong(0xb59c62, { emissive: 0x473714 }));
    const angle = i / 6 * TAU;
    spike.position.set(Math.cos(angle) * 1.25, .35, Math.sin(angle) * 1.45);
    spike.rotation.set(Math.cos(angle) * .75, 0, -Math.sin(angle) * .75);
    group.add(spike);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.48, 12, 8), glow(0xffb26a, .34));
  tip.position.set(0, .1, 1.85);
  group.add(tip);
  const sucker = new THREE.Mesh(new THREE.TorusGeometry(.52, .15, 6, 14), phong(0x99a878, { emissive: 0x2b321f }));
  sucker.position.copy(tip.position);
  sucker.rotation.x = Math.PI / 2;
  group.add(sucker);
  group.userData = { tip, base, type: 'tendril' };
  return group;
}

export function animateTendril(group, entity = {}, time = 0, dt = .016) {
  const data = group.userData;
  if (!data) return;
  const ratio = entity.maxHp ? Math.max(0, entity.hp / entity.maxHp) : 1;
  const wound = 1 - ratio;
  data.tip.material.opacity = .22 + wound * .55 + (entity.state === 'windup' ? .3 : 0);
  data.base.material.emissive.setHex(wound > .6 ? 0x5c1a0e : 0x222a15);
  const pulse = entity.state === 'windup' ? 1 + Math.sin(time * 22) * .12 : 1;
  data.tip.scale.setScalar(pulse);
  group.rotation.z = Math.sin(time * 1.4 + (entity.index || 0)) * .12;
}

// 污染云：喷发阶段的场景危害。半透明的球壳加一圈翻滚的絮状物。
export function createPollutionCloud() {
  const group = new THREE.Group();
  group.name = 'pollution-cloud';
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), glow(0x9fb56a, .075));
  group.add(shell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 10), glow(0xd8e39a, .16));
  group.add(core);
  const wisps = [];
  for (let i = 0; i < 9; i++) {
    const wisp = new THREE.Mesh(new THREE.TorusGeometry(.9, .18, 5, 14), glow(0xb9cf7c, .1));
    wisp.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    group.add(wisp);
    wisps.push(wisp);
  }
  group.userData = { shell, core, wisps };
  return group;
}

export function animatePollutionCloud(group, time = 0, radius = 1) {
  const data = group.userData;
  if (!data) return;
  group.scale.setScalar(Math.max(.2, radius));
  data.core.scale.setScalar(1 + Math.sin(time * 3) * .12);
  for (let i = 0; i < data.wisps.length; i++) {
    const wisp = data.wisps[i];
    wisp.rotation.x += .004 * (i + 1);
    wisp.rotation.y += .006 * (i + 1);
  }
}
