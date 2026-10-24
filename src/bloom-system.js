import { PLAYER_MAX_Y, seabedHeight } from './biology.js';
import { islandSurfaceAt } from './island.js';
import {
  PLANKTON_BLOOM_RULES,
  bloomNutrient,
  bloomPhase,
  bloomSpawnPosition,
} from './plankton-bloom.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function hydratePosition(engine, serial) {
  const { world, player } = engine.state;
  let candidate = bloomSpawnPosition(world, player, serial);
  for (let attempt = 0; attempt < 7 && islandSurfaceAt(world, candidate.x, candidate.z) !== null; attempt++) {
    candidate = bloomSpawnPosition(world, player, serial + (attempt + 1) * 17);
  }
  const floor = seabedHeight(candidate.x, candidate.z) + PLANKTON_BLOOM_RULES.radius + 1.8;
  candidate.y = clamp(candidate.y, Math.min(PLAYER_MAX_Y - 1, floor), PLAYER_MAX_Y - 1);
  return candidate;
}

export function spawnPlanktonBloom(engine) {
  const serial = Number.isInteger(engine.bloomSerial) ? engine.bloomSerial : 0;
  const point = hydratePosition(engine, serial);
  const seed = ((engine.state.world.seed ^ Math.imul(serial + 7, 0x45d9f3b)) >>> 0) / 4294967296 * Math.PI * 2;
  const bloom = engine._entity(
    'bloom',
    point.x,
    point.y,
    point.z,
    PLANKTON_BLOOM_RULES.radius,
    1,
    {
      age: 0,
      nutrient: 1,
      phase: 'calm',
      originX: point.x,
      originY: point.y,
      originZ: point.z,
      seed,
      feeding: false,
      contactAnnounced: false,
    },
  );
  if (!bloom) return null;
  updatePlanktonBloom(engine, bloom, 0);
  engine.bloomSerial = serial + 1;
  engine.bloomRespawnAt = 0;
  engine._emit(
    'bloomSpawn',
    '活性营养羽流正在迁徙。按 E 连续滤食；青绿色外壳较安全，橙色核心会加速异变并累积辐射。',
    { entityId: bloom.id, x: bloom.x, y: bloom.y, z: bloom.z },
  );
  return bloom;
}

export function updatePlanktonBloom(engine, bloom, dt) {
  if (!bloom || bloom.dead) return;
  const state = engine.state;
  const player = state.player;
  const previousPhase = bloom.phase;
  bloom.age = Math.max(0, (bloom.age || 0) + dt * (bloom.feeding ? 1.18 : 1));
  bloom.nutrient = bloomNutrient(bloom.age);
  bloom.phase = bloomPhase(bloom.age);
  if (previousPhase === 'calm' && bloom.phase === 'unstable') {
    engine._emit('bloomWarning', '活性羽流进入失稳阶段：营养核心转为橙色，约十余秒后爆裂。', {
      entityId: bloom.id,
      x: bloom.x,
      y: bloom.y,
      z: bloom.z,
    });
  }
  const phase = bloom.seed + bloom.age * 0.12;
  bloom.x = bloom.originX + Math.sin(phase) * 3.6;
  bloom.z = bloom.originZ + Math.cos(phase * 0.83) * 3.1;
  bloom.y = bloom.originY + Math.sin(phase * 1.37) * 0.8;

  const distance = Math.hypot(player.x - bloom.x, player.y - bloom.y, player.z - bloom.z);
  const feeding = player.feedTime > 0 && distance <= PLANKTON_BLOOM_RULES.feedRadius;
  bloom.feeding = feeding;
  if (feeding) {
    const shell = clamp(distance / PLANKTON_BLOOM_RULES.radius, 0, 1.6);
    const core = clamp(1 - distance / PLANKTON_BLOOM_RULES.radius, 0, 1);
    const safety = 0.42 + Math.min(1, shell) * 0.58;
    player.nutrition = clamp(
      player.nutrition + PLANKTON_BLOOM_RULES.nutritionPerSecond * safety * dt,
      0,
      100,
    );
    player.biomass += PLANKTON_BLOOM_RULES.biomassPerSecond * (0.65 + safety * 0.35) * dt;
    player.radiation = clamp(
      player.radiation + PLANKTON_BLOOM_RULES.radiationPerSecond * core * dt,
      0,
      100,
    );
    engine._gainMutationEnergy(
      PLANKTON_BLOOM_RULES.mutationEnergyPerSecond * (0.72 + core * 0.7) * dt,
    );
    if (!bloom.contactAnnounced) {
      bloom.contactAnnounced = true;
      engine._emit(
        'bloomFeed',
        core > 0.44
          ? '进入羽流核心：异变能快速累积，辐射与捕食者也同时增加。'
          : '滤食活性羽流外壳：营养稳定增长；靠近橙色核心可加速异变。',
        { entityId: bloom.id, x: bloom.x, y: bloom.y, z: bloom.z },
      );
    }
  }

  if (bloom.phase !== 'burst') return;
  bloom.dead = true;
  engine.bloomRespawnAt = state.time + PLANKTON_BLOOM_RULES.respawnDelay;
  const burstDistance = Math.hypot(player.x - bloom.x, player.y - bloom.y, player.z - bloom.z);
  if (burstDistance < PLANKTON_BLOOM_RULES.burstRadius) {
    const exposure = 1 - burstDistance / PLANKTON_BLOOM_RULES.burstRadius;
    engine._damage(
      PLANKTON_BLOOM_RULES.burstDamage * (0.38 + exposure * 0.62),
      '活性营养羽流失稳爆裂',
    );
  }
  const portions = state.mode === 'playing' ? 10 : 4;
  for (let index = 0; index < portions && state.entities.length < 500; index++) {
    const angle = index / portions * Math.PI * 2 + bloom.seed;
    const radius = 1.2 + (index % 3) * 0.75;
    const x = bloom.x + Math.cos(angle) * radius;
    const z = bloom.z + Math.sin(angle) * radius;
    engine._entity(
      'marineSnow',
      x,
      clamp(bloom.y + (index % 2 ? 0.35 : -0.35), seabedHeight(x, z) + 0.35, PLAYER_MAX_Y),
      z,
      0.4,
      1,
      { seed: bloom.seed + index * 0.37 },
    );
  }
  engine._emit(
    'bloomBurst',
    '羽流失去稳定：附近的活性组织已经爆裂。稍后会有一股新的营养云从别处升起。',
    { entityId: bloom.id, x: bloom.x, y: bloom.y, z: bloom.z, radius: PLANKTON_BLOOM_RULES.burstRadius },
  );
}
