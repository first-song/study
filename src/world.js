// A world seed describes the actual geography, independently of the simulation RNG.
// Keeping this module free of renderer dependencies also makes save migration deterministic.
export const WORLD_RADIUS = 320;

export function worldRandom(seed = 1) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const coordinate = value => Math.round(value * 100) / 100;

export function createWorld(seed = 1) {
  const normalizedSeed = Number(seed) >>> 0, random = worldRandom(normalizedSeed ^ 0x3e29c17b);
  const between = (min, max) => min + random() * (max - min);
  const jitter = (value, amount) => coordinate(value + between(-amount, amount));
  const biomes = [
    {id:'nursery', name:'初生漂木海', x:0, z:0, radius:40, color:0x227e8c, shelfY:38},
    {id:'kelp', name:'翡翠海草林', x:jitter(-65, 15), z:jitter(28, 20), radius:48, color:0x307e69, shelfY:37},
    {id:'coral', name:'琥珀珊瑚台地', x:jitter(66, 20), z:jitter(-40, 22), radius:53, color:0x318999, shelfY:29},
    {id:'abyss', name:'蓝辉无光裂谷', x:jitter(130, 28), z:jitter(115, 24), radius:75, color:0x102d59, shelfY:0},
    {id:'vents', name:'黑烟热泉群', x:jitter(-152, 30), z:jitter(-122, 24), radius:65, color:0x253f48, shelfY:0},
    {id:'ruins', name:'沉没断层', x:jitter(-140, 25), z:jitter(130, 25), radius:68, color:0x254852, shelfY:0},
  ];
  const polar = (angle, distance) => ({x:coordinate(Math.cos(angle) * distance), z:coordinate(Math.sin(angle) * distance)});
  const reactorSites = [
    {id:'wreck', name:'沉船反应堆', ...polar(between(2.3, 2.9), between(105, 145)), y:7, offset:0},
    {id:'trench', name:'断层反应堆', ...polar(between(.5, 1.05), between(170, 220)), y:7, offset:7},
    {id:'outfall', name:'排放站反应堆', ...polar(between(-1.8, -1.35), between(190, 230)), y:7, offset:14},
  ];
  const biofilmSites = [
    {id:'nursery', name:'漂木菌膜', x:7, y:43, z:-8},
    {id:'shelf', name:'礁壁菌膜', x:coordinate(biomes[2].x - 15), y:34, z:coordinate(biomes[2].z + 9)},
    {id:'deep', name:'沉积菌膜', x:coordinate(biomes[3].x - 12), y:8, z:coordinate(biomes[3].z - 22)},
  ];
  const core = {x:jitter(0, 22), y:28, z:jitter(-273, 10)};
  const landmarks = [
    {id:'kelp-shelf', kind:'shelf', name:'海草冠层', x:biomes[1].x, z:biomes[1].z, y:37, radius:34, biome:'kelp'},
    {id:'coral-shelf', kind:'shelf', name:'千层珊瑚礁', x:biomes[2].x, z:biomes[2].z, y:29, radius:37, biome:'coral'},
    {id:'nursery-reef', kind:'reef', name:'漂木礁壁', x:-18, z:-23, y:31, radius:13, biome:'nursery'},
    {id:'bridge-west', kind:'bridge', name:'鲸骨岩桥', x:jitter(-90, 16), z:jitter(-66, 18), y:8, radius:20, angle:.43, biome:'vents'},
    {id:'bridge-east', kind:'bridge', name:'双生石门', x:jitter(120, 16), z:jitter(45, 12), y:7, radius:23, angle:-.62, biome:'abyss'},
    {id:'abyss-ridge', kind:'ridge', name:'蓝辉裂谷', x:biomes[3].x, z:biomes[3].z, y:0, radius:49, biome:'abyss'},
  ];
  for (let index = 0; index < 6; index++) {
    const angle = random() * Math.PI * 2, distance = between(8, 40), base = biomes[4];
    landmarks.push({id:`vent-${index}`, kind:'vent', name:'黑烟囱', x:coordinate(base.x + Math.cos(angle)*distance), z:coordinate(base.z + Math.sin(angle)*distance), y:0, radius:between(2, 4.5), biome:'vents'});
  }
  return {seed:normalizedSeed, radius:WORLD_RADIUS, biomes, reactorSites, biofilmSites, core, landmarks};
}

export function biomeAt(world, point) {
  if (!world?.biomes?.length) return null;
  let selected = null, nearest = Infinity;
  for (const biome of world.biomes) {
    const distance = Math.hypot(point.x - biome.x, point.z - biome.z) / biome.radius;
    if (distance < nearest) { nearest = distance; selected = biome; }
  }
  return nearest <= 1.55 ? selected : null;
}

export function createLegacyWorld(seed = 1) {
  const world = createWorld(seed);
  return {
    ...world, radius:110, legacy:true,
    reactorSites:[
      {id:'wreck', name:'沉船反应堆', x:-25, y:7, z:-22, offset:0},
      {id:'trench', name:'断层反应堆', x:42, y:7, z:30, offset:7},
      {id:'outfall', name:'排放站反应堆', x:7, y:7, z:-62, offset:14},
    ],
    biofilmSites:[
      {id:'nursery', name:'漂木菌膜', x:7, y:43, z:-8},
      {id:'shelf', name:'礁壁菌膜', x:-18, y:21, z:-18},
      {id:'deep', name:'沉积菌膜', x:36, y:8, z:22},
    ],
    core:{x:0, y:27, z:-84},
    biomes:world.biomes.map(biome => biome.id === 'nursery' ? biome : ({...biome, x:coordinate(biome.x*.4), z:coordinate(biome.z*.4), radius:biome.radius*.55})),
    landmarks:world.landmarks.map(landmark => ({...landmark, x:coordinate(landmark.x*.4), z:coordinate(landmark.z*.4), radius:landmark.radius*.55})),
  };
}

export function biomeNameAt(world, point) {
  return biomeAt(world, point)?.name || (point.y < 20 ? '开放深海' : '远洋水域');
}
