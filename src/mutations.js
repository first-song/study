// Fictional mutations are automatic random events; the player cannot select a trait.
export const MUTATION_RULES = Object.freeze({ energyThreshold: 32, successChance: 0.7, maxHistory: 12 });
export const MUTATIONS = [
  {
    id: 'membrane', name: '耐辐膜层', color: '#b9df9b',
    description: '膜层隔离辐射伤害，厚重的外层也增加运动阻力。它是被动的防护结构。',
    instinct: null,
    upgrades: [
      { name: '致密膜层', description: '辐射过载阈值 +8，游速 −0.35。' },
      { name: '复合屏障', description: '累计过载阈值 +16（最高 98），游速 −0.70。' },
    ],
  },
  {
    id: 'flagella', name: '增生推进器', color: '#74e4d3',
    description: '单细胞增生鞭毛，成熟身体形成推进膜褶；主动游动更耗有机营养。定向水压可化作喷射突进。',
    instinct: 'jet',
    upgrades: [
      { name: '推进增生', description: '游速 +1.4；游动时每秒额外消耗 0.05 营养。' },
      { name: '协同推进', description: '累计游速 +2.8；游动时每秒额外消耗 0.10 营养。' },
    ],
  },
  {
    id: 'photophore', name: '发光感知', color: '#8ad7ff',
    description: '发光结构照亮附近食物与生物，但也让捕食者更容易发现自己。学会收敛它，你就能拟态。',
    instinct: 'mimic',
    upgrades: [
      { name: '微光斑', description: '观察范围 +14，摄食牵引范围 +2；敌人发现范围 +8。' },
      { name: '感知光环', description: '累计观察范围 +28，摄食牵引范围 +4；敌人发现范围 +16。' },
    ],
  },
  {
    id: 'radiotrophy', name: '辐射转化', color: '#c6f584',
    description: '虚构的色素结构将体内辐射负荷转为行动体能，仍需要有机营养维持。同化的辐射会强化你的脉冲。',
    instinct: 'pulse',
    upgrades: [
      { name: '转能色素', description: '体能不足时每秒转化最多 1 辐射为 4 体能；每秒额外代谢 0.025 营养。' },
      { name: '同位素网络', description: '累计每秒转化最多 2 辐射为 8 体能；每秒额外代谢 0.05 营养。' },
    ],
  },
  {
    id: 'spines', name: '异化膜棘', color: '#ffa58d',
    description: '外层形成防御突起；后期分化为硬棘。更强的防护会阻碍游动。突起的尖端可以撕咬。',
    instinct: 'bite',
    upgrades: [
      { name: '膜棘增生', description: '接触伤害每秒 +5，护甲 +4%；游速 −0.45。' },
      { name: '棘冠结构', description: '累计接触伤害每秒 +10，护甲 +8%；游速 −0.90。' },
    ],
  },
  {
    id: 'repair', name: '共生修复', color: '#cfb7ff',
    description: '修复结构加快恢复受损组织，修复过程需要更多有机物。它是被动的修复结构。',
    instinct: null,
    upgrades: [
      { name: '修复微群', description: '生命恢复每秒 +0.7；恢复期间每秒额外消耗 0.07 营养。' },
      { name: '组织再生', description: '累计生命恢复每秒 +1.4；恢复期间每秒额外消耗 0.14 营养。' },
    ],
  },
  {
    id: 'parasitism', name: '神经拟态原基', color: '#d9b38c',
    description: '随机形成的跨膜神经拟态结构。它不是可购买或可选路线，而是人类宿主寄生能力晚到的概率性突变。',
    instinct: null,
    upgrades: [
      { name: '侵入膜器', description: '神经拟态原基表达：可附着人类潜水员并接管岛屿神经中继。' },
      { name: '协同神经网', description: '原基网络成熟：寄生适应所需能量降低，神经中继接入更稳定。' },
    ],
  },
];

export function initialMutations() {
  return Object.fromEntries(MUTATIONS.map(mutation => [mutation.id, 0]));
}

// About one third of runs express the latent organ from birth. The hash is
// independent of gameplay RNG so it never rerolls food, wildlife or mutations.
export function innateParasitismForSeed(seed) {
  let value = (Number(seed) ^ 0xa53c9e71) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d) >>> 0;
  value = Math.imul(value ^ value >>> 15, 0x846ca68b) >>> 0;
  value = (value ^ value >>> 16) >>> 0;
  return value / 4294967296 < 0.32;
}
