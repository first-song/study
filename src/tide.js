// 潮汐日：一个五分钟的循环，把"什么时候行动"变成玩家的决定。
//
// 之前的海洋没有时间。什么时候下水、什么时候去深处、什么时候猎食，
// 结果都一样，于是探索没有节奏，也没有"等一等"的理由。
// 这里用一个纯粹的时间函数给出光照、捕食压力、猎物垂直迁移和异变收益，
// 渲染层只负责把它画出来。
//
// 设计上刻意贴近真实海洋：黄昏和拂晓是鱼群上浮觅食的窗口；夜里深水生物
// 垂直上迁，捕食者更活跃；正午光照最强，猎物下沉、捕食者退让。

export const TIDE_PERIOD = 300;
export const TIDE_PHASE_SECONDS = TIDE_PERIOD / 4;

export const TIDE_PHASES = Object.freeze([
  Object.freeze({
    id: 'dawn', name: '拂晓', start: 0,
    line: '鱼群上浮觅食，捕食者还没醒透',
    light: .8, aggression: 1, mutationGain: 1, preyRise: 3, bloomWeight: 1.2,
    visibility: .92, surface: 0x3f8ea0, ambient: 0xbcd9d2,
  }),
  Object.freeze({
    id: 'noon', name: '正午', start: TIDE_PHASE_SECONDS,
    line: '阳光压到深处，猎物下沉、捕食者退让',
    light: 1.18, aggression: .82, mutationGain: .92, preyRise: -2, bloomWeight: .7,
    visibility: 1.15, surface: 0x3aa3b0, ambient: 0xd6ece6,
  }),
  Object.freeze({
    id: 'dusk', name: '黄昏', start: TIDE_PHASE_SECONDS * 2,
    line: '鱼群再次上浮，捕食者开始巡游',
    light: .84, aggression: 1.15, mutationGain: 1.05, preyRise: 2, bloomWeight: 1.7,
    visibility: .95, surface: 0x2f7186, ambient: 0xc0b7a6,
  }),
  Object.freeze({
    id: 'night', name: '深夜', start: TIDE_PHASE_SECONDS * 3,
    line: '深水生物垂直上迁，异变在黑暗里更快',
    light: .3, aggression: 1.45, mutationGain: 1.3, preyRise: 5, bloomWeight: 1.1,
    visibility: .62, surface: 0x0e2c3d, ambient: 0x6d8fb5,
  }),
]);

const PHASE_BY_ID = Object.freeze(Object.fromEntries(TIDE_PHASES.map(phase => [phase.id, phase])));

export function tideAt(time = 0) {
  const seconds = Number.isFinite(time) ? time : 0;
  const wrapped = ((seconds % TIDE_PERIOD) + TIDE_PERIOD) % TIDE_PERIOD;
  const index = Math.floor(wrapped / TIDE_PHASE_SECONDS) % TIDE_PHASES.length;
  const phase = TIDE_PHASES[index];
  return {
    ...phase,
    index,
    cycle: Math.floor(seconds / TIDE_PERIOD),
    progress: (wrapped - phase.start) / TIDE_PHASE_SECONDS,
    remaining: TIDE_PHASE_SECONDS - (wrapped - phase.start),
  };
}

export function tidePhase(id) {
  return PHASE_BY_ID[id] || TIDE_PHASES[0];
}

// 夜晚水体会发光：微型生物和海洋雪的亮度提高，深水才看得见路。
export function nightGlow(time = 0) {
  const tide = tideAt(time);
  if (tide.id === 'night') return .85;
  if (tide.id === 'dusk') return .45;
  if (tide.id === 'dawn') return .35;
  return .12;
}

// 潮汐日的进度条文本。HUD 只显示"现在是什么时段、还有多久"。
export function tideLabel(time = 0) {
  const tide = tideAt(time);
  return `${tide.name} · ${Math.ceil(tide.remaining)}s`;
}
