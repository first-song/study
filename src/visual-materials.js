import * as THREE from '../node_modules/three/build/three.module.js';
import { worldRandom } from './world.js';

const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;

// Periodic trigonometric noise avoids visible seams while keeping texture
// generation cheap enough to run during scene setup.
function periodicNoise(u, v, scale, seed) {
  const phase = seed * 0.173;
  return (
    Math.sin((u * scale + v * (scale * 0.37) + phase) * TAU) * 0.42 +
    Math.cos((v * (scale * 0.71) - u * (scale * 0.19) + phase * 1.7) * TAU) * 0.28 +
    Math.sin((u * (scale * 1.83) + v * (scale * 1.31) - phase * 0.8) * TAU) * 0.18 +
    Math.cos((u * (scale * 3.17) - v * (scale * 2.23) + phase * 2.1) * TAU) * 0.12
  );
}

function fbm(u, v, seed, octaves = 5) {
  let value = 0, amplitude = 0.55, frequency = 2;
  for (let octave = 0; octave < octaves; octave++) {
    value += periodicNoise(u, v, frequency, seed + octave * 13.7) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.49;
  }
  return value * 0.5 + 0.5;
}

function kindHeight(kind, u, v, seed) {
  const broad = fbm(u, v, seed, 5);
  const fine = fbm(u, v, seed + 51.3, 7);
  switch (kind) {
    case 'sand':
      return broad * 0.55 + fine * 0.18 + Math.pow(Math.abs(Math.sin((v * 19 + broad * 1.8) * Math.PI)), 8) * 0.2;
    case 'seabed':
      return broad * 0.6 + fine * 0.2 + Math.sin((v * 11 + broad * 2.4) * TAU) * 0.08;
    case 'meadow':
      return broad * 0.52 + fine * 0.31 + Math.sin((u * 47 + v * 37) * TAU) * 0.025;
    case 'island':
      return broad * 0.66 + fine * 0.24 +
        Math.sin((u * 13 + v * 9 + broad * 3) * TAU) * 0.018;
    case 'foliage':
      return .36 + fine * .28 + broad * .12 +
        Math.pow(.5+.5*Math.sin((u*31-v*23+broad*4)*TAU),3)*.08;
    case 'rock':
      return broad * 0.72 + fine * 0.18 +
        Math.pow(0.5 + 0.5 * Math.sin((v * 8 + broad * 1.9) * TAU), 3) * 0.16;
    case 'asphalt':
      return broad * 0.32 + fine * 0.32 + (fine > 0.72 ? 0.16 : 0);
    case 'concrete':
      return broad * 0.5 + fine * 0.2 + (fine > 0.8 ? -0.08 : 0);
    case 'roof':
      return fine * 0.16 + Math.pow(0.5 + 0.5 * Math.sin((v * 22 + u * 2) * TAU), 4) * 0.55;
    case 'paint':
      return broad * 0.22 + fine * 0.12 + (fine > 0.76 ? 0.1 : 0);
    case 'wood':
      return broad * 0.25 + Math.pow(0.5 + 0.5 * Math.sin((u * 12 + broad * 3.8) * TAU), 3) * 0.5 + fine * 0.08;
    default:
      return broad * 0.7 + fine * 0.22;
  }
}

function kindColor(kind, u, v, height, detail, random) {
  const mottling = (detail - 0.5) * 0.16;
  const mineral = Math.sin((u * 23 + v * 19 + detail * 4.1) * TAU) * 0.035;
  const speck = random() > 0.988 ? 0.09 : random() < 0.012 ? -0.055 : 0;
  switch (kind) {
    case 'sand':
      return [
        (0.55 + height * 0.19 + mottling * 0.8 + mineral),
        (0.58 + height * 0.17 + mottling * 0.55 + mineral * 0.4),
        (0.49 + height * 0.14 + mottling * 0.35),
      ];
    case 'seabed':
      return [
        (0.37 + height * 0.25 + mottling * 0.72 + mineral + speck),
        (0.43 + height * 0.22 + mottling * 0.58 + mineral * 0.35 + speck),
        (0.35 + height * 0.18 + mottling * 0.44 + speck * 0.7),
      ];
    case 'meadow':
      return [
        (0.34 + height * 0.22 + mottling * 0.55 + mineral),
        (0.42 + height * 0.2 + mottling * 0.62 + mineral * 0.3),
        (0.24 + height * 0.16 + mottling * 0.34),
      ];
    case 'island': {
      const soil = clamp01((detail - 0.56) * 2.1);
      return [
        mix(0.45, 0.57, soil) + height * 0.14 + mottling * 0.35,
        mix(0.55, 0.51, soil) + height * 0.13 + mottling * 0.45,
        mix(0.36, 0.31, soil) + height * 0.11 + mottling * 0.25,
      ];
    }
    case 'foliage': {
      const needle=clamp01((height-.34)*1.12);
      return [
        mix(.27,.43,needle)+mottling*.22,
        mix(.42,.64,needle)+mottling*.3,
        mix(.24,.39,needle)+mottling*.18,
      ];
    }
    case 'rock':
      return [
        (0.43 + height * 0.31 + mottling * 0.78 + mineral + speck),
        (0.47 + height * 0.29 + mottling * 0.7 + mineral * 0.35 + speck),
        (0.44 + height * 0.27 + mottling * 0.58 + speck * 0.7),
      ];
    case 'asphalt': {
      const aggregate = random() > 0.93 ? 0.18 : 0;
      return [0.42 + height * 0.14 + aggregate, 0.45 + height * 0.13 + aggregate, 0.46 + height * 0.12 + aggregate];
    }
    case 'concrete':
      return [
        (0.68 + height * 0.2 + mottling * 0.4),
        (0.71 + height * 0.18 + mottling * 0.4),
        (0.69 + height * 0.17 + mottling * 0.35),
      ];
    case 'roof': {
      const tile = Math.pow(0.5 + 0.5 * Math.sin((v * 22 + u * 2) * TAU), 5);
      return [0.48 + tile * 0.2, 0.56 + tile * 0.18, 0.57 + tile * 0.16];
    }
    case 'paint':
      return [
        (0.7 + height * 0.17 + mottling * 0.2),
        (0.74 + height * 0.15 + mottling * 0.2),
        (0.75 + height * 0.14 + mottling * 0.2),
      ];
    case 'wood':
      return [
        (0.58 + height * 0.24 + mottling * 0.3),
        (0.46 + height * 0.19 + mottling * 0.2),
        (0.34 + height * 0.12 + mottling * 0.1),
      ];
    default:
      return [0.35 + height * 0.2, 0.4 + height * 0.2, 0.38 + height * 0.18];
  }
}

function textureFromBytes(bytes, size, repeat, colorSpace = null) {
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a compact set of color, normal and roughness maps. The maps are
 * shared by material role rather than allocated for each individual prop.
 */
export function createSurfaceMaps(kind, { size = 128, repeat = 1, seed = 1, normalStrength = 1 } = {}) {
  const random = worldRandom((seed ^ 0x4bd01f31) >>> 0);
  const heights = new Float32Array(size * size);
  const minHeight = kind === 'paint' ? 0 : 0.18;
  const maxHeight = kind === 'paint' ? 1 : 0.92;
  const colors = new Uint8Array(size * size * 4);
  const normals = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const raw = kindHeight(kind, u, v, seed * 0.071);
      const height = clamp01(mix(minHeight, maxHeight, raw));
      heights[y * size + x] = height;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x, offset = index * 4;
      const u = x / size, v = y / size;
      const height = heights[index];
      const detail = fbm(u, v, seed * 1.31 + 90, 6);
      const color = kindColor(kind, u, v, height, detail, random);
      colors[offset] = clamp01(color[0]) * 255;
      colors[offset + 1] = clamp01(color[1]) * 255;
      colors[offset + 2] = clamp01(color[2]) * 255;
      colors[offset + 3] = 255;

      const dx = heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size];
      const dy = heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x];
      const slope = kind === 'rock' ? 5.4 : kind === 'roof' ? 4.8 : kind === 'asphalt' ? 2.6 : 3.8;
      const nx = -dx * slope * normalStrength;
      const ny = -dy * slope * normalStrength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[offset] = (nx / length * 0.5 + 0.5) * 255;
      normals[offset + 1] = (ny / length * 0.5 + 0.5) * 255;
      normals[offset + 2] = (nz / length * 0.5 + 0.5) * 255;
      normals[offset + 3] = 255;

      const baseRoughness = {
        sand: 0.86, seabed: 0.9, meadow: 0.84, island: 0.88, foliage: 0.93, rock: 0.76,
        asphalt: 0.92, concrete: 0.78, roof: 0.64, paint: 0.48, wood: 0.72,
      }[kind] ?? 0.8;
      const roughnessValue = clamp01(baseRoughness + (height - 0.5) * 0.2 + (detail - 0.5) * 0.08);
      roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = roughnessValue * 255;
      roughness[offset + 3] = 255;
    }
  }

  return {
    map: textureFromBytes(colors, size, repeat, THREE.SRGBColorSpace),
    normalMap: textureFromBytes(normals, size, repeat),
    roughnessMap: textureFromBytes(roughness, size, repeat),
  };
}

export function applyWetness(material, amount = 0.5) {
  if (!material || !('roughness' in material)) return material;
  const baseRoughness = material.roughness;
  const baseMetalness = material.metalness ?? 0;
  material.roughness = Math.min(material.roughness, 1 - amount * 0.47);
  material.metalness = Math.max(baseMetalness, amount * 0.08);
  material.userData.wetnessBase = { roughness: baseRoughness, metalness: baseMetalness };
  return material;
}

export const ART_PALETTE = Object.freeze({
  oceanDeep: 0x061521,
  oceanMid: 0x103a45,
  oceanShallow: 0x337d82,
  seaFoam: 0xc7eee5,
  sunWarm: 0xffd3a1,
  islandMoss: 0x3c5138,
  islandSoil: 0x685a43,
  concreteCool: 0x6d7672,
  industrialWarm: 0xf0a25f,
  signalCyan: 0x78d6c7,
  hazardOrange: 0xd96a48,
});
