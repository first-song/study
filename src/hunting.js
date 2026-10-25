// 猎杀窗口：每种生物都有一个"此刻可以下手"的时机。
//
// 之前所有猎物的打法都一样 —— 贴上去按住输出，谁血厚谁难打。
// 这让"猎什么"变成了纯数值选择。现在每种生物都有自己的破绽：
// 鱼群靠侧线感知，身后是盲区；鲨鱼扑空后转身很慢；蟹蜕壳时甲壳是软的；
// 水母伞体闭合的两秒里触手收在伞内。打中窗口的伤害是普通命中的两倍多，
// 而看到窗口的方式，是观察它。
//
// 这些规则不依赖 Three.js，可以在 Node 里直接单测。

const DEG = Math.PI / 180;

export const HUNT_WINDOWS = Object.freeze({
  fish: Object.freeze({ kind: 'blind', arc: 120, multiplier: 2.2, label: '鱼群盲区' }),
  lanternfish: Object.freeze({ kind: 'blind', arc: 120, multiplier: 2.2, label: '鱼群盲区' }),
  crab: Object.freeze({ kind: 'cycle', period: 13, open: 2.8, multiplier: 3, label: '蜕壳' }),
  jelly: Object.freeze({ kind: 'cycle', period: 7.5, open: 2, multiplier: 2.3, label: '伞体闭合' }),
  angler: Object.freeze({ kind: 'cycle', period: 10, open: 2.4, multiplier: 2.4, label: '诱饵熄灭' }),
  ray: Object.freeze({ kind: 'cycle', period: 11, open: 2.2, multiplier: 2.3, label: '贴底换气' }),
  turtle: Object.freeze({ kind: 'cycle', period: 15, open: 3, multiplier: 2.3, label: '浮出换气' }),
  cuttlefish: Object.freeze({ kind: 'cycle', period: 10, open: 2.2, multiplier: 2.4, label: '色素退去' }),
  oarfish: Object.freeze({ kind: 'cycle', period: 14, open: 2.6, multiplier: 2.2, label: '背鳍停顿' }),
  squid: Object.freeze({ kind: 'cycle', period: 9, open: 2.2, multiplier: 2.4, label: '喷水回填' }),
  shark: Object.freeze({ kind: 'recovery', seconds: 1.9, multiplier: 2.5, label: '扑空回身' }),
  whale: Object.freeze({ kind: 'none', multiplier: 1, label: '' }),
  diver: Object.freeze({ kind: 'none', multiplier: 1, label: '' }),
  predator: Object.freeze({ kind: 'recovery', seconds: 1.4, multiplier: 2, label: '扑击落空' }),
});

const CLOSED = Object.freeze({ open: false, label: '', multiplier: 1 });

function facingVector(entity) {
  const vx = Number(entity.vx) || 0, vz = Number(entity.vz) || 0;
  const speed = Math.sqrt(vx * vx + vz * vz);
  if (speed > 0.05) return { x: vx / speed, z: vz / speed };
  const heading = Number.isFinite(entity.heading) ? entity.heading : 0;
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

// 玩家是否站在生物的视野锥之外。鱼群侧线对身后几乎无感。
export function outsideVision(entity, player, arcDegrees) {
  if (!entity || !player) return false;
  const facing = facingVector(entity);
  const dx = player.x - entity.x, dz = player.z - entity.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-4) return false;
  const dot = (facing.x * dx + facing.z * dz) / length;
  return dot < Math.cos(arcDegrees * DEG / 2);
}

export function huntWindowAt(entity, time, player = null) {
  const definition = entity && HUNT_WINDOWS[entity.type];
  if (!definition || definition.kind === 'none') return CLOSED;
  if (definition.kind === 'blind') {
    if (!player) return CLOSED;
    return outsideVision(entity, player, definition.arc)
      ? { open: true, label: definition.label, multiplier: definition.multiplier }
      : CLOSED;
  }
  if (definition.kind === 'recovery') {
    return (Number(entity.recoveryUntil) || 0) > time
      ? { open: true, label: definition.label, multiplier: definition.multiplier }
      : CLOSED;
  }
  if (definition.kind === 'cycle') {
    const seedOffset = ((Number(entity.seed) || 0) / (Math.PI * 2)) * definition.period;
    const phase = ((time + seedOffset) % definition.period + definition.period) % definition.period;
    return phase < definition.open
      ? { open: true, label: definition.label, multiplier: definition.multiplier }
      : CLOSED;
  }
  return CLOSED;
}

// 每种生物只有一条笔记。第一次在窗口里命中时解锁。
export const FIELD_NOTES = Object.freeze([
  Object.freeze({
    id: 'fishBlind', species: Object.freeze(['fish', 'lanternfish']),
    title: '鱼群的侧线盲区',
    text: '鱼群用侧线感受水流振动，但身后的盲区很大。从它们背后接近，整群都不会散。',
    bonus: Object.freeze({ kind: 'damage', value: .5 }),
  }),
  Object.freeze({
    id: 'sharkRecovery', species: Object.freeze(['shark']),
    title: '鲨鱼扑空之后',
    text: '鲨鱼的冲锋是一次性的：扑中或扑空都要重新摆正身体。躲开第一下，它有一秒多完全背对你。',
    bonus: Object.freeze({ kind: 'dashRefund', value: 0 }),
  }),
  Object.freeze({
    id: 'crabMolt', species: Object.freeze(['crab']),
    title: '蟹的蜕壳',
    text: '甲壳类要长大就必须蜕壳。刚蜕完的几分钟里，新壳还是软的，那是它唯一没有防备的时候。',
    bonus: Object.freeze({ kind: 'resource', value: 6 }),
  }),
  Object.freeze({
    id: 'jellyBell', species: Object.freeze(['jelly']),
    title: '水母的收缩节律',
    text: '伞体收缩推进的间隙，触手收在伞内。贴着那个节律靠近，就不会被蜇。',
    bonus: Object.freeze({ kind: 'safety', value: 0 }),
  }),
  Object.freeze({
    id: 'anglerLure', species: Object.freeze(['angler']),
    title: '诱饵熄灭的瞬间',
    text: '鮟鱇的诱饵需要重新蓄光。光一暗，它就失去了对猎物的判断，也暴露了自己的位置。',
    bonus: Object.freeze({ kind: 'damage', value: .4 }),
  }),
  Object.freeze({
    id: 'squidJet', species: Object.freeze(['squid', 'cuttlefish']),
    title: '喷射之后的回填',
    text: '头足类靠外套膜喷水推进。一次喷射之后要重新吸水，那半秒里它既不能攻击也不能逃。',
    bonus: Object.freeze({ kind: 'damage', value: .4 }),
  }),
]);

const NOTE_BY_ID = Object.freeze(Object.fromEntries(FIELD_NOTES.map(note => [note.id, note])));

export function noteForSpecies(type) {
  return FIELD_NOTES.find(note => note.species.includes(type)) || null;
}

export function noteById(id) {
  return NOTE_BY_ID[id] || null;
}

// 窗口伤害：基础倍率，加上已解锁笔记给的加成。
export function windowDamage(window, notes = []) {
  if (!window?.open) return 1;
  let multiplier = window.multiplier;
  for (const id of notes) {
    const note = NOTE_BY_ID[id];
    if (note?.bonus.kind === 'damage') multiplier += note.bonus.value;
  }
  return multiplier;
}

export function hasNote(notes, id) {
  return Array.isArray(notes) && notes.includes(id);
}
