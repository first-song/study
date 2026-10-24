// 模拟步耗时的基准。碰撞检查是整个模拟最大的开销，
// 每次改动地形或生物 AI 之后都应该跑一遍，确认没有退化。
import { GameEngine } from '../src/engine.js';

function run(label, prepare) {
  const engine = new GameEngine({ seed: 11 });
  engine.start();
  engine.drainEvents();
  if (prepare) prepare(engine);
  const t0 = performance.now();
  const STEPS = 300;
  for (let i = 0; i < STEPS; i++) engine.update(1 / 60, {});
  const dt = performance.now() - t0;
  console.log(label.padEnd(28), '每步', (dt / STEPS).toFixed(3), 'ms');
  return dt / STEPS;
}

const spread = run('鱼群散开', engine => {
  const fish = engine.state.entities.filter(e => e.type === 'fish');
  for (let i = 0; i < fish.length; i++) {
    fish[i].x = 40 + (i % 10) * 30;
    fish[i].y = 30 + Math.floor(i / 10) * 8;
    fish[i].z = 40;
  }
});

const clustered = run('鱼群挤成一团', engine => {
  const fish = engine.state.entities.filter(e => e.type === 'fish');
  for (let i = 0; i < fish.length; i++) {
    fish[i].x = 20 + (i % 10) * 0.6;
    fish[i].y = 30 + Math.floor(i / 10) * 0.6;
    fish[i].z = 20;
  }
});

const noWildlife = run('没有野生动物', engine => {
  engine.state.entities = engine.state.entities.filter(e => ['reactor','biofilm','diver','islandNode','echo'].includes(e.type));
});

console.log('\n聚集 / 散开 =', (clustered / spread).toFixed(2), '倍');
console.log('有鱼 / 无动物 =', (spread / noWildlife).toFixed(1), '倍');
