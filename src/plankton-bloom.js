import { PLAYER_MAX_Y } from './biology.js';

// A moving, living feeding opportunity. These values shape a readable risk
// loop rather than another collectible: filter near the luminous shell for safe
// nutrition, or stay in the unstable core for faster mutation at a cost.
export const PLANKTON_BLOOM_RULES = Object.freeze({
  radius: 5.8,
  feedRadius: 9.4,
  lifetime: 54,
  unstableAt: 0.72,
  nutritionPerSecond: 23,
  biomassPerSecond: 0.7,
  mutationEnergyPerSecond: 2.6,
  radiationPerSecond: 1.8,
  burstDamage: 18,
  burstRadius: 11,
  respawnDelay: 24,
});

export function bloomPhase(age, lifetime = PLANKTON_BLOOM_RULES.lifetime) {
  const ratio = Math.max(0, Math.min(1, age / Math.max(0.001, lifetime)));
  if (ratio >= 1) return 'burst';
  if (ratio >= PLANKTON_BLOOM_RULES.unstableAt) return 'unstable';
  return 'calm';
}

export function bloomNutrient(age, lifetime = PLANKTON_BLOOM_RULES.lifetime) {
  return Math.max(0, 1 - Math.max(0, age) / Math.max(0.001, lifetime));
}

// Uses a local counter instead of the gameplay PRNG so recurring weather never
// rerolls player mutations or wildlife outcomes.
export function bloomSpawnPosition(world, player, serial = 0) {
  // The first bloom is deliberately placed in the starting camera's forward
  // field so the new feeding loop is visible before the player learns the map.
  if (serial === 0) {
    return {
      x: Math.max(-world.radius + 12, Math.min(world.radius - 12, player.x + 9)),
      y: Math.max(5, Math.min(PLAYER_MAX_Y - 1.5, player.y + 3)),
      z: Math.max(-world.radius + 12, Math.min(world.radius - 12, player.z - 22)),
    };
  }
  const mixed = (Math.imul((world.seed ^ Math.imul(serial + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0);
  const angle = mixed / 4294967296 * Math.PI * 2;
  const distance = 28 + ((mixed >>> 11) % 15);
  const lift = (((mixed >>> 19) % 13) - 6);
  const maxY = Math.max(4, Math.min(PLAYER_MAX_Y - 1.5, player.y + 11));
  return {
    x: Math.max(-world.radius + 12, Math.min(world.radius - 12, player.x + Math.cos(angle) * distance)),
    y: Math.max(5, Math.min(maxY, player.y + lift)),
    z: Math.max(-world.radius + 12, Math.min(world.radius - 12, player.z + Math.sin(angle) * distance)),
  };
}
