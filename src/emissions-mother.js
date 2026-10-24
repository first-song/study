// 排放母体：盘踞在北方排放口的污染母巢，取代原先"被屏障保护的靶子"。
//
// 三个阶段，每一阶段逼玩家用一种不同的本能：
//   外甲 —— 三条触须必须被撕咬切断
//   喷发 —— 污染云团必须被脉冲打散，或用拟态硬扛
//   核心 —— 只有张开窗口时才能被撕咬或冲刺撞击伤到
//
// 规则全部是纯模拟，不依赖 WebGL。

export const MOTHER_PHASE = Object.freeze({
  ARMOR: 'armor',
  SPOUT: 'spout',
  CORE: 'core',
  DEAD: 'dead',
});

export const MOTHER_RULES = Object.freeze({
  tendrilCount: 3,
  tendrilHp: 110,
  tendrilOrbit: 7.2,
  tendrilReach: 8.5,
  tendrilWindup: 0.75,
  tendrilSwing: 0.35,
  tendrilCycle: 2.6,
  spoutClouds: 3,
  spoutInterval: 5.2,
  spoutDuration: 17,
  cloudRadius: 12,
  cloudGrowth: 6.5,
  cloudDamage: 11,
  coreWindow: 7,
  coreGap: 5.5,
  coreHp: 780,
  rageInterval: 4.4,
  rageDamage: 16,
  vulnerability: 0.45,
});

export function isMother(entity) {
  return Boolean(entity) && entity.type === 'boss' && typeof entity.motherPhase === 'string';
}

export function motherPhaseOf(entity) {
  return isMother(entity) ? entity.motherPhase : MOTHER_PHASE.ARMOR;
}

// 母体的总血量由三个阶段拼成：外甲由触须承担，核心有自己的血条。
export function motherMaxHp(entity) {
  return MOTHER_RULES.coreHp;
}

// 触须是独立实体，这样撕咬、脉冲、击退这些既有判定都能直接作用上去。
export function createTendrils(engine, boss) {
  const created = [];
  for (let index = 0; index < MOTHER_RULES.tendrilCount; index++) {
    const angle = (index / MOTHER_RULES.tendrilCount) * Math.PI * 2 + (boss.seed || 0);
    const tendril = engine._entity('tendril', boss.x, boss.y, boss.z, 2.1, MOTHER_RULES.tendrilHp, {
      bossId: boss.id,
      index,
      angle,
      state: 'idle',
      swingTime: 1.2 + index * 0.6,
      homeAngle: angle,
      variant: 'normal',
    });
    if (tendril) created.push(tendril);
  }
  return created;
}

function tendrilsOf(engine, boss) {
  return engine.state.entities.filter(entity => entity.type === 'tendril' && entity.bossId === boss.id && !entity.dead);
}

// 触须围绕母体缓慢转动；横扫前会有明确的前摇，让玩家来得及躲。
export function updateTendrils(engine, boss, dt) {
  const p = engine.state.player;
  const rules = MOTHER_RULES;
  for (const tendril of tendrilsOf(engine, boss)) {
    tendril.angle += dt * 0.28;
    const orbit = rules.tendrilOrbit;
    tendril.x = boss.x + Math.cos(tendril.angle) * orbit;
    tendril.y = boss.y + Math.sin(tendril.angle * 1.7) * 2.4;
    tendril.z = boss.z + Math.sin(tendril.angle) * orbit;
    tendril.swingTime = Math.max(0, (tendril.swingTime || 0) - dt);
    if (tendril.state === 'idle' && tendril.swingTime <= 0) {
      tendril.state = 'windup';
      tendril.swingTime = rules.tendrilWindup;
      engine._emit('tendrilWindup', '触须正在横扫：拉开距离或用冲刺甩开', {
        entityId: tendril.id, x: tendril.x, y: tendril.y, z: tendril.z,
      });
    } else if (tendril.state === 'windup' && tendril.swingTime <= 0) {
      tendril.state = 'swing';
      tendril.swingTime = rules.tendrilSwing;
      const distance = Math.hypot(tendril.x - p.x, tendril.y - p.y, tendril.z - p.z);
      if (distance < rules.tendrilReach) {
        engine._damage(rules.cloudDamage * 0.9, '触须横扫');
      }
    } else if (tendril.state === 'swing' && tendril.swingTime <= 0) {
      tendril.state = 'idle';
      tendril.swingTime = rules.tendrilCycle;
    }
  }
}

// 喷发阶段：母体不断吐出污染云。云团会扩张并灼烧进入其中的生命。
export function updateClouds(engine, boss, dt) {
  const p = engine.state.player;
  const rules = MOTHER_RULES;
  const clouds = boss.clouds || (boss.clouds = []);
  boss.spoutTimer = (boss.spoutTimer ?? 0) - dt;
  if (boss.spoutTimer <= 0 && clouds.length < rules.spoutClouds) {
    boss.spoutTimer = rules.spoutInterval;
    const angle = (boss.seed || 0) + clouds.length * 2.1;
    clouds.push({
      x: boss.x + Math.cos(angle) * 6,
      y: boss.y,
      z: boss.z + Math.sin(angle) * 6,
      radius: 1.5,
      life: 0,
      active: true,
      seed: angle,
    });
    engine._emit('motherSpout', '排放母体喷出污染云团：脉冲可以打散它', {
      x: boss.x, y: boss.y, z: boss.z, count: clouds.length,
    });
  }
  for (const cloud of clouds) {
    if (!cloud.active) continue;
    cloud.life += dt;
    cloud.radius = Math.min(rules.cloudRadius, cloud.radius + rules.cloudGrowth * dt);
    const distance = Math.hypot(p.x - cloud.x, p.y - cloud.y, p.z - cloud.z);
    if (distance < cloud.radius) {
      // 拟态能把灼烧降到最低 —— 这是第三幕里拟态唯一真正救你一次的地方。
      const mitigated = p.mimicActive ? 0.35 : 1;
      engine._damage(rules.cloudDamage * mitigated * dt, '污染云灼烧', false);
    }
  }
}

// 核心阶段：核心只在窗口期张开，其余时间是闭合的护甲。
export function updateCore(engine, boss, dt) {
  const rules = MOTHER_RULES;
  boss.coreTimer = (boss.coreTimer ?? 0) - dt;
  if (boss.coreTimer <= 0) {
    const opening = !boss.coreWindowOpen;
    boss.coreWindowOpen = opening;
    boss.coreTimer = opening ? rules.coreWindow : rules.coreGap;
    engine._emit(opening ? 'coreOpen' : 'coreSealed', opening
      ? '排放母体的核心张开：现在可以撕咬它，或用冲刺撞击'
      : '核心重新闭合，等下一次窗口', { x: boss.x, y: boss.y, z: boss.z });
  }
}

// 母体的周期性污染冲击：推开并灼烧靠近的玩家。
export function updateRage(engine, boss, dt) {
  const p = engine.state.player;
  const rules = MOTHER_RULES;
  boss.rageTimer = (boss.rageTimer ?? rules.rageInterval) - dt;
  if (boss.rageTimer > 0) return;
  boss.rageTimer = rules.rageInterval;
  const distance = Math.hypot(p.x - boss.x, p.y - boss.y, p.z - boss.z);
  if (distance > 30) return;
  engine._damage(rules.rageDamage, '排放母体的污染冲击');
  engine._emit('bossPulse', '母体释放污染冲击', { x: boss.x, y: boss.y, z: boss.z, radius: 30 });
}

// 主更新：推进母体的阶段状态机。
export function updateMother(engine, boss, dt) {
  if (!isMother(boss) || boss.motherPhase === MOTHER_PHASE.DEAD) return;
  const rules = MOTHER_RULES;
  const p = engine.state.player;
  updateRage(engine, boss, dt);

  // 母体本身就是污染源：靠近它就会持续累积辐射。
  const distance = Math.hypot(p.x - boss.x, p.y - boss.y, p.z - boss.z);
  if (distance < 26) {
    p.radiation = Math.min(100, p.radiation + dt * 5 / (1 + (p.branches.radiation || 0) * 0.3));
    engine._gainMutationEnergy(dt * 2.4);
  }

  if (boss.motherPhase === MOTHER_PHASE.ARMOR) {
    updateTendrils(engine, boss, dt);
    if (!tendrilsOf(engine, boss).length) {
      boss.motherPhase = MOTHER_PHASE.SPOUT;
      boss.spoutTimer = 1.2;
      boss.clouds = [];
      engine._emit('motherPhase', '外甲崩解：排放母体开始喷发污染云', {
        x: boss.x, y: boss.y, z: boss.z, phase: MOTHER_PHASE.SPOUT,
      });
    }
    return;
  }

  if (boss.motherPhase === MOTHER_PHASE.SPOUT) {
    updateClouds(engine, boss, dt);
    const all = boss.clouds || [];
    const live = all.filter(cloud => cloud.active);
    const settled = live.length === 0 || live.every(cloud => cloud.life > rules.spoutDuration * 0.5);
    if (all.length >= rules.spoutClouds && settled) {
      boss.motherPhase = MOTHER_PHASE.CORE;
      boss.coreWindowOpen = false;
      boss.coreTimer = 1.4;
      engine._emit('motherPhase', '喷发结束：母体收缩，核心即将张开', {
        x: boss.x, y: boss.y, z: boss.z, phase: MOTHER_PHASE.CORE,
      });
    }
    return;
  }

  updateCore(engine, boss, dt);
}

// 玩家造成的伤害分流：先打在触须上，其次是云团，最后才是核心。
export function damageMother(engine, boss, damage, source, point) {
  const rules = MOTHER_RULES;
  if (!isMother(boss)) return false;
  if (boss.motherPhase === MOTHER_PHASE.DEAD) return false;
  if (boss.motherPhase === MOTHER_PHASE.ARMOR) {
    // 外甲期间核心免疫，但打在外甲上的冲击会撕到离得最近的那条触须。
    const tendrils = tendrilsOf(engine, boss);
    let hit = null;
    let bestDistance = Infinity;
    for (const tendril of tendrils) {
      if (!point) continue;
      const distance = Math.hypot(tendril.x - point.x, tendril.y - point.y, tendril.z - point.z);
      if (distance < 18 && distance < bestDistance) {
        bestDistance = distance;
        hit = tendril;
      }
    }
    if (!hit) {
      engine._emit('motherArmor', '外甲还在：先撕断那些触须', { x: boss.x, y: boss.y, z: boss.z });
      return false;
    }
    hit.hp = Math.max(0, hit.hp - damage * 0.5);
    engine._emit('tendrilDamage', `触须被撕开（剩余 ${Math.ceil((hit.hp / hit.maxHp) * 100)}%）`, {
      entityId: hit.id, x: hit.x, y: hit.y, z: hit.z, hp: hit.hp,
    });
    if (hit.hp <= 0) {
      hit.dead = true;
      engine.state.entities = engine.state.entities.filter(entity => !entity.dead);
      engine._emit('tendrilSevered', '一条触须被切断', { entityId: hit.id, x: hit.x, y: hit.y, z: hit.z });
    }
    return true;
  }

  if (boss.motherPhase === MOTHER_PHASE.SPOUT) {
    // 喷发期间核心仍被云层包裹：打散云团才能推进。
    const clouds = (boss.clouds || []).filter(cloud => cloud.active);
    let dispersed = 0;
    for (const cloud of clouds) {
      if (!point) continue;
      const distance = Math.hypot(cloud.x - point.x, cloud.y - point.y, cloud.z - point.z);
      if (distance < cloud.radius + 7) {
        cloud.active = false;
        dispersed++;
      }
    }
    if (dispersed) {
      engine._emit('cloudDispersed', '污染云被脉冲打散', { x: boss.x, y: boss.y, z: boss.z, count: dispersed });
      return true;
    }
    engine._emit('motherArmor', '污染云还在包裹核心：用脉冲打散它', { x: boss.x, y: boss.y, z: boss.z });
    return false;
  }

  if (!boss.coreWindowOpen) {
    engine._emit('motherArmor', '核心闭合：等它张开再打', { x: boss.x, y: boss.y, z: boss.z });
    return false;
  }
  boss.hp = Math.max(0, boss.hp - damage);
  engine._emit('motherDamage', `核心受损（剩余 ${Math.ceil((boss.hp / boss.maxHp) * 100)}%）`, {
    x: boss.x, y: boss.y, z: boss.z, hp: boss.hp,
  });
  if (boss.hp <= 0) {
    boss.motherPhase = MOTHER_PHASE.DEAD;
    boss.weakened = true;
    boss.hp = 1;
    // 母体死了，触须和云团也一起散掉。
    for (const entity of engine.state.entities) {
      if (entity.type === 'tendril' && entity.bossId === boss.id) entity.dead = true;
    }
    engine.state.entities = engine.state.entities.filter(entity => !entity.dead);
    for (const cloud of boss.clouds || []) cloud.active = false;
    engine._emit('motherDefeated', '排放母体失去了核心：灰屿的排放结构暴露了', {
      x: boss.x, y: boss.y, z: boss.z, phase: MOTHER_PHASE.DEAD,
    });
    engine._emit('coreWeakened', engine.state.player.apex
      ? '母体核心崩解：靠近后按 E，以巨兽之口吞没灰屿'
      : '母体核心崩解：继续完成生态适应，发育为巨兽后才能吞没灰屿', { x: boss.x, y: boss.y, z: boss.z });
  }
  return true;
}
