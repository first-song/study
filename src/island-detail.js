// 灰屿的日式细节。
//
// 岛的地形已经有了杉木林、鸟居、神社、渔港，但"这是个日本小岛"的辨识度
// 往往不在大建筑上，而在这些日常物件里：屋顶的储水罐、屋外的空调外机、
// 沿路的电线杆、田里的塑料大棚、神社参道两侧的石灯笼。
// 它们让岛看起来是有人住的地方，而不是布景。

import * as THREE from '../node_modules/three/build/three.module.js';
import { createWallNotice, signTexture } from './japanese-marks.js';

const TAU = Math.PI * 2;

function mesh(geometry, material, position) {
  const node = new THREE.Mesh(geometry, material);
  if (position) node.position.set(...position);
  return node;
}

// 电线杆 + 垂下来的电线。沿岛上的两条路排布。
export function createUtilityPoles(groundAt, routes, seed = 1) {
  const group = new THREE.Group();
  group.name = 'japanese-utility-poles';
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.92, metalness: 0.04 });
  const crossMaterial = new THREE.MeshStandardMaterial({ color: 0x6f7b74, roughness: 0.86, metalness: 0.18 });
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0x2c3330, transparent: true, opacity: 0.55 });
  const dummy = new THREE.Object3D();
  const poles = [];

  for (const route of routes) {
    const { from, to, count, flip = 1 } = route;
    const chain = [];
    for (let index = 0; index < count; index++) {
      const t = count === 1 ? 0.5 : index / (count - 1);
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[1] + (to[1] - from[1]) * t + flip * 2.6;
      const ground = groundAt(x, z);
      if (ground === null || !Number.isFinite(ground)) continue;
      poles.push({ x, z, y: ground });
    }
    for (const pole of poles.slice(-1)) void pole;
    // 电线：把相邻两杆连起来，垂度用三个点近似。
    for (let index = 1; index < poles.length; index++) {
      const a = poles[index - 1], b = poles[index];
      for (const offset of [-0.42, 0.42]) {
        const points = [];
        for (let step = 0; step <= 4; step++) {
          const t = step / 4;
          const sag = Math.sin(t * Math.PI) * 0.5;
          points.push(new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            a.y + 5.4 - sag + offset * 0.1,
            a.z + (b.z - a.z) * t + offset,
          ));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wireMaterial));
      }
    }
  }

  for (const pole of poles) {
    dummy.position.set(pole.x, pole.y + 2.7, pole.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 7), poleMaterial);
    shaft.position.copy(dummy.position);
    group.add(shaft);
    for (const offset of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.5), crossMaterial);
      arm.position.set(pole.x, pole.y + 5.1, pole.z + offset);
      group.add(arm);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 7), crossMaterial);
    cap.position.set(pole.x, pole.y + 5.5, pole.z);
    group.add(cap);
  }
  return group;
}

// 屋顶上的储水罐与空调外机 —— 一眼就知道是日本的街区。
export function createRooftopAppliances(groundAt, buildings, seed = 1) {
  const group = new THREE.Group();
  group.name = 'japanese-rooftop-appliances';
  const tankMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.72, metalness: 0.08 });
  const steelMaterial = new THREE.MeshStandardMaterial({ color: 0x8d9189, roughness: 0.6, metalness: 0.34 });
  const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x6b6f68, roughness: 0.78, metalness: 0.22 });
  let index = 0;
  for (const building of buildings) {
    const { x, z, width = 3, depth = 2.6, height = 2.6 } = building;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) continue;
    const roofY = ground + height;
    // 储水罐：圆柱 + 支腿
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 12), tankMaterial);
    tank.position.set(x + (index % 2 ? 0.7 : -0.6), roofY + 0.75, z + 0.3);
    group.add(tank);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), steelMaterial);
    lid.position.set(tank.position.x, roofY + 1.25, tank.position.z);
    group.add(lid);
    for (const offset of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.07), steelMaterial);
      leg.position.set(tank.position.x + offset, roofY + 0.16, tank.position.z);
      group.add(leg);
    }
    // 空调外机
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.34), ventMaterial);
    unit.position.set(x - 0.9, roofY + 0.28, z - 0.5);
    group.add(unit);
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), steelMaterial);
    grille.position.set(unit.position.x, unit.position.y, unit.position.z + 0.18);
    group.add(grille);
    index++;
  }
  return group;
}

// 塑料大棚：半圆形的白色隧道，种着菜。非常日本。
export function createGreenhouses(groundAt, plots, seed = 1) {
  const group = new THREE.Group();
  group.name = 'japanese-greenhouse-tunnels';
  const film = new THREE.MeshPhysicalMaterial({
    color: 0xe8f0e4, roughness: 0.42, metalness: 0, transparent: true, opacity: 0.55,
    side: THREE.DoubleSide, clearcoat: 0.5, clearcoatRoughness: 0.4, depthWrite: false,
  });
  const frame = new THREE.MeshStandardMaterial({ color: 0x8d9188, roughness: 0.72, metalness: 0.24 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.96 });
  for (const plot of plots) {
    const { x, z, length = 9, width = 3.2, rows = 2 } = plot;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) continue;
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(width / 2, width / 2, length, 14, 1, true, 0, Math.PI),
      film,
    );
    tunnel.rotation.z = Math.PI / 2;
    tunnel.rotation.y = Math.PI / 2;
    tunnel.position.set(x, ground + width / 2, z);
    group.add(tunnel);
    for (let rib = 0; rib <= rows; rib++) {
      const t = rib / rows;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(width / 2, 0.045, 4, 14, Math.PI), frame);
      hoop.position.set(x - length / 2 + t * length, ground + width / 2, z);
      hoop.rotation.y = Math.PI / 2;
      group.add(hoop);
    }
    const bed = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, width * 0.82), soil);
    bed.position.set(x, ground + 0.08, z);
    group.add(bed);
  }
  return group;
}

// 神社参道两侧的石灯笼。
export function createStoneLanterns(groundAt, path) {
  const group = new THREE.Group();
  group.name = 'shrine-stone-lanterns';
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8b80, roughness: 0.94, metalness: 0.02 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xff9d3c, emissiveIntensity: 1.5, roughness: 0.6 });
  for (let index = 0; index < path.length; index++) {
    const { x, z } = path[index];
    for (const side of [-1, 1]) {
      const ground = groundAt(x + side * 3.1, z);
      if (ground === null || !Number.isFinite(ground)) continue;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.28, 8), stone);
      base.position.set(x + side * 3.1, ground + 0.14, z);
      group.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.92, 8), stone);
      shaft.position.set(x + side * 3.1, ground + 0.74, z);
      group.add(shaft);
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.5), stone);
      chamber.position.set(x + side * 3.1, ground + 1.43, z);
      group.add(chamber);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), glow);
      light.position.set(x + side * 3.1, ground + 1.43, z);
      group.add(light);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.34, 4), stone);
      roof.position.set(x + side * 3.1, ground + 1.83, z);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), stone);
      tip.position.set(x + side * 3.1, ground + 2.06, z);
      group.add(tip);
    }
  }
  return group;
}

// 水田：一片片镜面似的方格，把山坡的绿压下去。
export function createRicePaddies(groundAt, patches) {  const group = new THREE.Group();
  group.name = 'japanese-rice-paddies';
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x9fb4ae, roughness: 0.14, metalness: 0.06, clearcoat: 0.9, clearcoatRoughness: 0.1,
    transparent: true, opacity: 0.86,
  });
  const bund = new THREE.MeshStandardMaterial({ color: 0x6d6a54, roughness: 0.96 });
  for (const patch of patches) {
    const { x, z, width = 14, depth = 10, columns = 3, rows = 2 } = patch;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) continue;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const cellWidth = width / columns, cellDepth = depth / rows;
        const cx = x - width / 2 + cellWidth * (column + 0.5);
        const cz = z - depth / 2 + cellDepth * (row + 0.5);
        const cellGround = groundAt(cx, cz);
        if (cellGround === null || !Number.isFinite(cellGround)) continue;
        const field = new THREE.Mesh(new THREE.BoxGeometry(cellWidth * 0.9, 0.12, cellDepth * 0.9), water);
        field.position.set(cx, cellGround + 0.1, cz);
        group.add(field);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(cellWidth, 0.16, 0.18), bund);
        ridge.position.set(cx, cellGround + 0.12, cz - cellDepth * 0.45);
        group.add(ridge);
      }
    }
  }
  return group;
}

// 商店街：一排带雨棚、暖帘和日文招牌的小店。
// 这是整座岛最"日常"的部分——先看见吃饭的地方，才相信这是一个有人住的小岛。
export function createShopRow(groundAt, shops) {
  const group = new THREE.Group();
  group.name = 'japanese-shop-row';
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d1c0, roughness: 0.92, metalness: 0.02 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x414c53, roughness: 0.68, metalness: 0.2 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6d9a0, roughness: 0.34, metalness: 0.05,
    emissive: 0xffbf63, emissiveIntensity: 0.9,
  });
  const awningColors = [0xb03a2e, 0x2f6d5c, 0xc9862a, 0x3b4f74];

  shops.forEach((shop, shopIndex) => {
    const {
      x, z, width = 5.4, depth = 4.4, height = 3.2, angle = 0,
      sign = null, awning = 0, lit = true,
    } = shop;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) return;

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterial);
    body.position.set(x, ground + height / 2, z);
    body.rotation.y = angle;
    group.add(body);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.55, 0.24, depth + 0.55), roofMaterial);
    cap.position.set(x, ground + height + 0.12, z);
    cap.rotation.y = angle;
    group.add(cap);

    // 店面朝向：局部 +z 就是临街的那一面。
    const facade = new THREE.Group();
    facade.position.set(x, ground, z);
    facade.rotation.y = angle;
    group.add(facade);

    if (sign) {
      const board = createWallNotice(signTexture(sign.lines, sign.options), {
        width: width * 0.66, height: height * 0.28,
      });
      board.position.set(0, height * 0.68, depth / 2 + 0.08);
      facade.add(board);
    }

    // 雨棚：往外挑出来的一截，微微下垂。
    const awningColor = awningColors[(awning + shopIndex) % awningColors.length];
    const awningMaterial = new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.78 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.08, 1.6), awningMaterial);
    canopy.position.set(0, height * 0.47, depth / 2 + 0.62);
    canopy.rotation.x = 0.13;
    facade.add(canopy);
    const canopyEdge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.22, 0.08), awningMaterial);
    canopyEdge.position.set(0, height * 0.47 - 0.1, depth / 2 + 1.36);
    facade.add(canopyEdge);

    // 暖帘：挂在檐下的布帘。
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.46, height * 0.26),
      new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.9, side: THREE.DoubleSide }),
    );
    curtain.position.set(0, height * 0.28, depth / 2 + 0.05);
    facade.add(curtain);

    if (lit) {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, height * 0.2, 0.06), glassMaterial);
      glow.position.set(0, height * 0.56, depth / 2 + 0.04);
      facade.add(glow);
    }
  });
  return group;
}

// 自动贩卖机：全日本最有辨识度的街边物件之一。
export function createVendingMachines(groundAt, positions) {
  const group = new THREE.Group();
  group.name = 'japanese-vending-machines';
  const shell = new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.42, metalness: 0.24 });
  const panelColors = [0xc0392b, 0x1f4e79, 0xd6a12a];
  const slotMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d2b, roughness: 0.6 });
  for (const [index, spot] of positions.entries()) {
    const { x, z, angle = 0 } = spot;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) continue;
    const machine = new THREE.Group();
    machine.position.set(x, ground, z);
    machine.rotation.y = angle;
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.92, 0.72), shell);
    cabinet.position.y = 0.96;
    machine.add(cabinet);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 1.16),
      new THREE.MeshStandardMaterial({
        color: panelColors[index % panelColors.length], roughness: 0.3, metalness: 0.1,
        emissive: panelColors[index % panelColors.length], emissiveIntensity: 0.28,
      }),
    );
    panel.position.set(0, 1.16, 0.37);
    machine.add(panel);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.08), slotMaterial);
    slot.position.set(0, 0.32, 0.38);
    machine.add(slot);
    group.add(machine);
  }
  return group;
}

// 红色圆柱邮筒。
export function createPostBoxes(groundAt, positions) {
  const group = new THREE.Group();
  group.name = 'japanese-post-boxes';
  const body = new THREE.MeshStandardMaterial({ color: 0xb8352c, roughness: 0.46, metalness: 0.12 });
  const slot = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.8 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.7 });
  for (const spot of positions) {
    const { x, z } = spot;
    const ground = groundAt(x, z);
    if (ground === null || !Number.isFinite(ground)) continue;
    const box = new THREE.Group();
    box.position.set(x, ground, z);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.12, 12), body);
    cylinder.position.y = 0.96;
    box.add(cylinder);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.12, 12), cap);
    lid.position.y = 1.58;
    box.add(lid);
    const mailSlot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), slot);
    mailSlot.position.set(0, 1.36, 0.32);
    box.add(mailSlot);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8), body);
    stand.position.y = 0.21;
    box.add(stand);
    group.add(box);
  }
  return group;
}

// 沿海公路的白色护栏。日本海岸公路的标配。
export function createGuardrails(groundAt, path) {
  const group = new THREE.Group();
  group.name = 'japanese-coastal-guardrails';
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xdcdcd0, roughness: 0.62, metalness: 0.2 });
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a2, roughness: 0.6, metalness: 0.34 });
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 1.2) continue;
    const ground = groundAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    if (ground === null || !Number.isFinite(ground)) continue;
    const angle = Math.atan2(dx, dz);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, length), railMaterial);
    rail.position.set((a.x + b.x) / 2, ground + 0.62, (a.z + b.z) / 2);
    rail.rotation.y = angle;
    group.add(rail);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, length), railMaterial);
    lower.position.set((a.x + b.x) / 2, ground + 0.28, (a.z + b.z) / 2);
    lower.rotation.y = angle;
    group.add(lower);
    const postCount = Math.max(1, Math.round(length / 3.4));
    for (let step = 0; step <= postCount; step++) {
      const t = step / postCount;
      const groundHere = groundAt(a.x + dx * t, a.z + dz * t);
      if (groundHere === null || !Number.isFinite(groundHere)) continue;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.86, 0.11), postMaterial);
      post.position.set(a.x + dx * t, groundHere + 0.43, a.z + dz * t);
      post.rotation.y = angle;
      group.add(post);
    }
  }
  return group;
}
