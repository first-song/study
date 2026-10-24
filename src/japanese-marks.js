// 岛上的日文标识。
//
// 为什么要日文而不是国旗：国旗是一个国家的符号，画上去就是在喊话；
// 而日文告示牌、渔船名、神社匾额、渔港名，是"这个地方就是这样"的日常感。
// 玩家看到「ALPS処理水 排出設備」会自己反应过来这在哪，比一面旗更有冲击力，
// 也不会让整个作品变成一张传单。
//
// 文字用 canvas 画成贴图，不依赖任何外部字体文件。

import * as THREE from '../node_modules/three/build/three.module.js';

const SIGN_FONT = '"Yu Gothic","YuGothic","Hiragino Kaku Gothic ProN","Meiryo","MS Gothic",sans-serif';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 做一块招牌的贴图。
// lines: 文本行（第一行最大），opts: 底色、字色、边框、字距。
export function signTexture(lines, opts = {}) {
  // 单元测试在 Node 里跑，没有 DOM。没有画布就退化成一块纯色板。
  if (typeof document === 'undefined' || !document.createElement) return null;
  const {
    width = 512, height = 256, background = '#e8e4d8', ink = '#1d2429',
    border = '#b03a2e', align = 'center', lineGap = 1.32, letterSpacing = 0,
  } = opts;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, height * 0.035);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, width - ctx.lineWidth * 2, height - ctx.lineWidth * 2);
  }
  const rows = lines.length;
  const base = height * (rows === 1 ? 0.62 : 0.42);
  const size = height / (rows * lineGap + 0.5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  for (let index = 0; index < rows; index++) {
    const text = lines[index];
    const scale = index === 0 ? 1 : 0.62;
    ctx.font = `${index === 0 ? '700' : '500'} ${Math.round(size * scale)}px ${SIGN_FONT}`;
    ctx.fillStyle = index === 0 ? ink : '#3a444a';
    const x = align === 'center' ? width / 2 : width * 0.06;
    const y = base + index * size * lineGap;
    if (letterSpacing && ctx.letterSpacing !== undefined) ctx.letterSpacing = `${letterSpacing}px`;
    ctx.fillText(text, x, y);
  }
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  // 一点旧化：招牌不是新的
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * width, y = Math.random() * height;
    ctx.fillStyle = Math.random() > 0.5 ? '#3a2a18' : '#ffffff';
    ctx.fillRect(x, y, Math.random() * 9 + 1, Math.random() * 4 + 1);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 日之丸旗。挂在渔船桅杆和港湾旗杆上——
// 这是全作唯一一处明确的"这是日本"的符号，其余都靠日常感。
export function hinomaruTexture() {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = makeCanvas(300, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 300, 200);
  ctx.fillStyle = '#bc002d';
  ctx.beginPath();
  ctx.arc(150, 100, 60, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createHinomaruFlag(texture, opts = {}) {
  const { width = 1.7, height = 1.13, poleHeight = 2.6, poleColor = 0xd8d4c8 } = opts;
  const group = new THREE.Group();
  group.name = 'hinomaru-flag';
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, poleHeight, 6),
    new THREE.MeshStandardMaterial({ color: poleColor, roughness: 0.72, metalness: 0.1 }),
  );
  pole.position.y = poleHeight / 2;
  group.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: texture || null, color: texture ? 0xffffff : 0xf2f2ee,
      roughness: 0.86, metalness: 0, side: THREE.DoubleSide,
    }),
  );
  cloth.position.set(width / 2 + 0.04, poleHeight - height / 2 - 0.16, 0);
  group.add(cloth);
  return group;
}

// 立式招牌：两根柱子 + 一块面板。返回的组可以直接摆到世界里。
export function createSignBoard(texture, opts = {}) {
  const { width = 4.2, height = 2.1, postHeight = 1.6, postColor = 0x54504a } = opts;
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: texture || null, color: texture ? 0xffffff : 0xb8b2a0,
      roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide,
    }),
  );
  panel.position.y = postHeight + height / 2;
  group.add(panel);
  const postMaterial = new THREE.MeshStandardMaterial({ color: postColor, roughness: 0.9, metalness: 0.06 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, postHeight + height * 0.6, 7), postMaterial);
    post.position.set(side * width * 0.38, (postHeight + height * 0.6) / 2, 0.05);
    group.add(post);
  }
  return group;
}

// 墙上贴的告示牌：只有面板，没有柱子。
export function createWallNotice(texture, opts = {}) {
  const { width = 2.4, height = 1.5 } = opts;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: texture || null, color: texture ? 0xffffff : 0xb8b2a0,
      roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide,
    }),
  );
  return mesh;
}

// 岛上的标识内容。刻意用"设备与告示"而不是"国旗"——
// 前者是那个国家的日常，后者是符号。
export const ISLAND_MARKS = Object.freeze({
  plant: Object.freeze({
    lines: ['ALPS処理水 排出設備', '海域モニタリング実施中'],
    options: Object.freeze({ background: '#e6e2d4', ink: '#1b2328', border: '#b5382c' }),
  }),
  plantNotice: Object.freeze({
    lines: ['危険', '放射線監視中', '立入制限'],
    options: Object.freeze({ background: '#f0c33a', ink: '#241a08', border: '#8d2b20' }),
  }),
  port: Object.freeze({
    lines: ['松浜漁港', '漁業協同組合'],
    options: Object.freeze({ background: '#e9e5d6', ink: '#203038', border: '#2f5d6b' }),
  }),
  shrine: Object.freeze({
    lines: ['奉納'],
    options: Object.freeze({ background: '#7d2a22', ink: '#f0dfa8', border: '#d8b45c' }),
  }),
  barrier: Object.freeze({
    lines: ['立入禁止', '海域排出施設周辺'],
    options: Object.freeze({ background: '#f2efe2', ink: '#9c2b20', border: '#9c2b20' }),
  }),
  // 商店街的招牌。这些字比任何一面国旗都更快地让人反应过来"这是日本"。
  shop: Object.freeze({
    lines: ['お食事処', '定食・丼物'],
    options: Object.freeze({ background: '#efe6cf', ink: '#2a2118', border: '#8c3b28' }),
  }),
  konbini: Object.freeze({
    lines: ['コンビニ', 'たばこ・お酒'],
    options: Object.freeze({ background: '#f4f4ef', ink: '#1d2b3a', border: '#c0392b' }),
  }),
  soba: Object.freeze({
    lines: ['そば', '十割'],
    options: Object.freeze({ background: '#e4e7dd', ink: '#26333a', border: '#3f6b58' }),
  }),
  parking: Object.freeze({
    lines: ['駐車場', 'P'],
    options: Object.freeze({ background: '#2f4f63', ink: '#f0efe4', border: '#f0efe4' }),
  }),
  school: Object.freeze({
    lines: ['灰屿小学校', '学区'],
    options: Object.freeze({ background: '#eef0ea', ink: '#22303a', border: '#4a6b52' }),
  }),
});
