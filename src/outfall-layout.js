import { WATER_SURFACE_Y } from './biology.js';
import { islandShorePoint } from './island.js';

// A single deterministic, large industrial outfall shared by simulation and
// rendering. Keeping this geometry independent of Three.js lets both the player
// controller and wildlife collision use the same physical volumes.
// 布局只跟 world 有关，而 world 永不改变。
// 碰撞检查每帧调用它上千次，之前每次都重算三次岸线与三角函数。
const layoutCache = new WeakMap();

export function outfallLayout(world) {
  const cached = layoutCache.get(world);
  if (cached) return cached;
  const layout = buildOutfallLayout(world);
  layoutCache.set(world, layout);
  return layout;
}

function buildOutfallLayout(world) {
  const angle = Math.PI * 0.5 + 0.035;
  const shore = islandShorePoint(world, angle, -2.5);
  const bend = islandShorePoint(world, angle, 28);
  const diffuser = islandShorePoint(world, angle, 57);
  const lateralX = Math.cos(angle + Math.PI * 0.5);
  const lateralZ = Math.sin(angle + Math.PI * 0.5);
  const mouthY = 2.05;
  const segments = [
    {
      id: 'shore-descent',
      a: { x: shore.x, y: WATER_SURFACE_Y - .35, z: shore.z },
      b: { x: bend.x, y: 5.2, z: bend.z },
      radius: 2.7,
    },
    {
      id: 'seabed-header',
      a: { x: bend.x, y: mouthY + .2, z: bend.z },
      b: { x: diffuser.x, y: mouthY + .2, z: diffuser.z },
      radius: 2.35,
    },
  ];
  const mouths = [-9, 0, 9].map((offset, index) => ({
    id: `diffuser-${index + 1}`,
    x: diffuser.x + lateralX * offset,
    y: mouthY,
    z: diffuser.z + lateralZ * offset,
    radius: 2.25 + (index === 1 ? .35 : 0),
  }));
  return {
    angle,
    shore,
    bend: { x: bend.x, y: 5.2, z: bend.z },
    diffuser: { x: diffuser.x, y: mouthY, z: diffuser.z },
    lateral: { x: lateralX, z: lateralZ },
    segments,
    mouths,
    collisionPadding: .32,
  };
}

function pointSegmentDistanceSquared(point, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = point.x - a.x, apy = point.y - a.y, apz = point.z - a.z;
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  const t = lengthSquared > 1e-9
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / lengthSquared))
    : 0;
  const dx = point.x - (a.x + abx * t);
  const dy = point.y - (a.y + aby * t);
  const dz = point.z - (a.z + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

export function outfallBlocks(world, x, y, z, clearance = 0) {
  const layout = outfallLayout(world);
  const point = { x, y, z };
  for (const segment of layout.segments) {
    const radius = segment.radius + layout.collisionPadding + clearance;
    if (pointSegmentDistanceSquared(point, segment.a, segment.b) < radius * radius) return true;
  }
  for (const mouth of layout.mouths) {
    const radius = mouth.radius + .55 + clearance;
    if ((x - mouth.x) ** 2 + (y - mouth.y) ** 2 + (z - mouth.z) ** 2 < radius * radius) return true;
  }
  return false;
}
