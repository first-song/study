// 本能技能条：显示随机的主动操作。未整合的槽位以暗色剪影保留在条上，
// 让玩家知道"还有东西在等着发生"，但不能指定它。
import { INSTINCTS, instinctAvailable, instinctRank, instinctTier } from './instincts.js';

const ICONS = {
  bite: '<path d="M4 8c3.4 0 5.6-1.6 8-1.6S16.6 8 20 8c-1.2 4.4-3.7 8-8 8S5.2 12.4 4 8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 9.4 9.6 12l1.6-2.6L12.8 12l1.6-2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  jet: '<path d="M3 12h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 12c2.6-3.4 5-3.4 8-2.2-1.6 3.4-3 5.2-5.4 6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 8.4c1-2 2.6-3 4.4-3.4M13 15.6c1 2 2.6 3 4.4 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>',
  mimic: '<path d="M3.6 12S6.8 6.6 12 6.6 20.4 12 20.4 12 17.2 17.4 12 17.4 3.6 12 3.6 12Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M3 21 21 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  sense: '<circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.5"/><path d="M6.6 6.6a7.6 7.6 0 0 0 0 10.8M17.4 6.6a7.6 7.6 0 0 1 0 10.8M3.6 3.6a11.9 11.9 0 0 0 0 16.8M20.4 3.6a11.9 11.9 0 0 1 0 16.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
};

export function mountInstinctUI(root, { onActivate } = {}) {
  const bar = document.createElement('nav');
  bar.className = 'instinct-bar';
  bar.setAttribute('aria-label', '本能');
  const buttons = new Map();
  for (const instinct of INSTINCTS) {
    if (instinct.base) continue; // 脉冲在原有技能条里，不重复出现
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'instinct-button locked';
    button.dataset.instinct = instinct.id;
    button.title = `${instinct.name} · ${instinct.keyLabel}`;
    button.innerHTML =
      `<span class="instinct-sigil" style="--instinct-color:${instinct.color}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONS[instinct.id] || ''}</svg></span>` +
      `<span class="instinct-name">${instinct.name}</span>` +
      `<kbd>${instinct.keyLabel}</kbd>` +
      `<span class="instinct-rank"></span>` +
      `<span class="instinct-cooldown"></span>`;
    button.addEventListener('click', () => onActivate?.(instinct.id));
    bar.appendChild(button);
    buttons.set(instinct.id, button);
  }
  root.appendChild(bar);

  let flashTimer = 0;
  return {
    bar,
    update(state) {
      const player = state.player;
      for (const [id, button] of buttons) {
        const instinct = INSTINCTS.find(entry => entry.id === id);
        const rank = instinctRank(player, id);
        const available = instinctAvailable(player, id);
        const tier = instinctTier(player, id);
        button.classList.toggle('locked', !available);
        button.classList.toggle('owned', available);
        button.dataset.rank = String(rank);
        const cooldown = player.cooldowns?.[id] || 0;
        const label = button.querySelector('.instinct-cooldown');
        if (label) label.textContent = cooldown > 0.05 ? `${cooldown.toFixed(1)}s` : '';
        button.classList.toggle('cooling', cooldown > 0.05);
        button.classList.toggle('active', Boolean(player.mimicActive && id === 'mimic'));
        const rankLabel = button.querySelector('.instinct-rank');
        if (rankLabel) rankLabel.textContent = available ? (rank === 0 ? '基础' : rank === 1 ? 'I' : 'II') : '';
        const cost = tier?.cost || 0;
        button.classList.toggle('unaffordable', available && cost > 0 && player.energy < cost);
        button.setAttribute('aria-label', available
          ? `${instinct.name}${rank > 0 ? ` ${rank} 阶` : ''}${cooldown > 0.05 ? ' 冷却中' : ' 就绪'}`
          : `${instinct.name} 尚未整合`);
      }
    },
    flash(id) {
      const button = buttons.get(id);
      if (!button) return;
      button.classList.remove('just-unlocked');
      // 强制回流以重启动画
      void button.offsetWidth;
      button.classList.add('just-unlocked');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => button.classList.remove('just-unlocked'), 1400);
    },
  };
}
