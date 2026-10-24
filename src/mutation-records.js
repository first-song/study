import { MUTATIONS, MUTATION_RULES } from './mutations.js';

const icons={membrane:'◉',flagella:'≋',photophore:'✧',radiotrophy:'☢',spines:'✹',repair:'❋'};
const setText=(id,value)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(value))el.textContent=value;};

export function updateMutationHUD(state) {
  const p=state.player,energy=p.mutationEnergy||0,threshold=MUTATION_RULES.energyThreshold;
  setText('mutation-energy',`${Math.floor(energy)} / ${threshold}`);
  setText('mutation-status',`${p.mutationEvents||0} 次响应 · M 记录`);
  const button=document.getElementById('mutation-btn');
  if(button){
    button.classList.toggle('ready',energy>=threshold*.8);
    button.disabled=!['playing','paused'].includes(state.mode);
    button.setAttribute('aria-label',`异变记录，辐射进度 ${Math.floor(energy)} / ${threshold}，已发生 ${p.mutationEvents||0} 次随机响应，快捷键 M`);
  }
  const overloaded=p.radiation>p.radiationTolerance;
  setText('radiation-status',overloaded?'辐射过载 · 正在损伤':`耐受阈值 ${Math.round(p.radiationTolerance)}%`);
  document.getElementById('radiation-status')?.classList.toggle('overloaded',overloaded);
}

export function renderMutations(container,state) {
  const p=state.player,threshold=MUTATION_RULES.energyThreshold;
  setText('mutation-balance',`${Math.floor(p.mutationEnergy||0)} / ${threshold}`);
  setText('mutation-installed',`${p.mutationEvents||0} 次辐射响应 · ${Object.values(p.mutations||{}).reduce((a,b)=>a+b,0)} 次结构变化`);
  const available=MUTATIONS.filter(m=>(p.mutations?.[m.id]||0)<2).length;
  setText('mutation-rule',available?`每积累 ${threshold} 异变能自动触发一次：${Math.round(MUTATION_RULES.successChance*100)}% 产生结构变化，${Math.round((1-MUTATION_RULES.successChance)*100)}% 仅适应。成功后从尚未完成的结构中等概率抽取。`:'现有结构已全部稳定。后续辐射响应仍会记录，但不再形成新器官；辐射过载依然会造成损伤。');
  container.replaceChildren();
  for(const m of MUTATIONS) {
    const rank=p.mutations?.[m.id]||0;
    const card=document.createElement('article');card.className=`mutation-card${rank?' installed':''}`;
    card.style.setProperty('--mutation-color',m.color||'#baf773');card.dataset.trait=m.id;
    const top=document.createElement('div');top.className='mutation-card-top';
    const icon=document.createElement('span');icon.className='mutation-symbol';icon.textContent=icons[m.id];icon.setAttribute('aria-hidden','true');
    const tier=document.createElement('span');tier.textContent=`${'●'.repeat(rank)}${'○'.repeat(2-rank)} · ${rank} / 2`;
    top.append(icon,tier);
    const name=document.createElement('h3');name.textContent=m.name;
    const status=document.createElement('span');status.className='mutation-next';status.textContent=rank?`已显现 · ${m.upgrades[rank-1].name}`:'尚未发生';
    const summary=document.createElement('p');summary.className='mutation-summary';summary.textContent=m.description;
    const effect=document.createElement('p');effect.className='mutation-effect';effect.textContent=rank?m.upgrades[rank-1].description:`初次变化：${m.upgrades[0].description}`;
    const probability=document.createElement('div');probability.className='mutation-probability';
    probability.textContent=rank>=2?'此结构已稳定，不再进入随机池':`下一次响应的出现概率 ${(MUTATION_RULES.successChance/available*100).toFixed(1)}%`;
    card.append(top,name,status,summary,effect,probability);container.append(card);
  }
  const history=document.getElementById('mutation-history');history.replaceChildren();
  const entries=[...(p.mutationHistory||[])].reverse();
  if(!entries.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='尚未出现辐射响应。身体的下一次变化无法预先选择。';history.append(empty);}
  for(const entry of entries) {
    const item=document.createElement('div');item.className=`mutation-history-entry outcome-${entry.outcome}`;
    const time=document.createElement('span');time.textContent=`#${String(entry.sequence).padStart(2,'0')} · ${Math.floor(entry.time/60)}:${String(Math.floor(entry.time%60)).padStart(2,'0')}`;
    const result=document.createElement('strong');
    const mutation=MUTATIONS.find(m=>m.id===entry.mutation);
    result.textContent=entry.outcome==='mutation'&&mutation?mutation.upgrades[Math.max(0,entry.rank-1)].name:entry.outcome==='saturated'?'现有结构已稳定':'本次仅适应 · 未形成新结构';
    item.append(time,result);history.append(item);
  }
}
