// A fictional organ-assimilation system: eating compatible tissue gives a
// seeded chance, never a player-selected skill or a claim about real evolution.
// Each organ is bound to one active instinct; the player integrates whatever the
// donor's tissue offers, never a chosen one.
export const ASSIMILATIONS = Object.freeze([
  { id: 'lureLamp', name: '诱光灯器', description: '发光诱饵照亮深层水域，扩大感知范围；并让你学会收敛自身发光（拟态）。', sources: ['lanternfish', 'angler'], chance: 0.62, instinct: 'mimic' },
  { id: 'pressure', name: '耐压组织', description: '柔韧组织降低深潜的代谢负担。它是纯粹的被动结构，不带来主动操作。', sources: ['oarfish', 'squid'], chance: 0.58, instinct: null },
  { id: 'jet', name: '喷射腔', description: '缩短喷射冷却并提高冲刺效率；可定向喷水突进（喷射突进）。', sources: ['squid', 'cuttlefish'], chance: 0.6, instinct: 'jet' },
  { id: 'carapace', name: '复合甲壳', description: '降低受伤程度，提供部分耐压能力；并整合出咬合结构（撕咬）。', sources: ['crab', 'turtle'], chance: 0.55, instinct: 'bite' },
  { id: 'electroreception', name: '感电器官', description: '无需光线也能感知深处的生物，并主动扫描周围轮廓（感电扫描）。', sources: ['ray'], chance: 0.65, instinct: 'sense' },
]);
export const MAX_ASSIMILATION_RECORDS = 4096;
export function initialAssimilations() { return Object.fromEntries(ASSIMILATIONS.map(trait => [trait.id, 0])); }
export function assimilationChance(sourceType, traitId) {
  const trait = ASSIMILATIONS.find(candidate => candidate.id === traitId);
  return trait?.sources.includes(sourceType) ? trait.chance : 0;
}
export function assimilationCandidates(sourceType, ranks, sourceY = 52) {
  return ASSIMILATIONS.filter(trait => trait.sources.includes(sourceType) && ranks[trait.id] < 2 && (trait.id !== 'pressure' || sourceType !== 'squid' || sourceY < 20));
}
export function diveAdaptation(player, attachedHostType = null) {
  const a = player.assimilations || initialAssimilations();
  const depthLoad = Math.max(0, Math.min(1, (16 - player.y) / 13));
  const hostGuide = attachedHostType === 'whale';
  const protection = Math.min(0.95, a.pressure * 0.38 + a.carapace * 0.16 + player.mutations.membrane * 0.15 + (player.level >= 11 ? 0.35 : 0) + (hostGuide ? 0.8 : 0));
  const perception = a.lureLamp > 0 || a.electroreception > 0 || player.mutations.photophore > 0 || hostGuide;
  const senseRadius = (32 + player.mutations.photophore * 14 + a.lureLamp * 20 + a.electroreception * 18) * (perception ? 1 : 1 - depthLoad * 0.45);
  return {
    depthStress: depthLoad * (1 - protection),
    diveSupport: hostGuide ? '宿主引导' : a.pressure > 0 ? '耐压组织' : a.carapace > 0 ? '甲壳支撑' : player.mutations.membrane > 0 ? '强化细胞膜' : player.level >= 11 ? '巨兽组织' : '基础耐受',
    senseRadius,
  };
}
