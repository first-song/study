import { LIFE_STAGES, SPECIES, ZONES, BIOLOGY_SOURCES, lifeStageFor, zoneFor, depthFor } from './biology.js';
import { FIELD_NOTES } from './hunting.js';
import { VARIANTS } from './ecosystem.js';

const abnormalForms = {
  crooked: { name:'弯脊个体', color:'#bbaa91', symbol:'∿', shape:'身体中轴偏曲，尾部推进不再对称。', consequence:'游速降低，接触防护略有增加，攻击能力减弱。' },
  armored: { name:'骨甲增生个体', color:'#b7c3ad', symbol:'◇', shape:'背部与体侧出现不规则骨质覆片。', consequence:'防护明显增加，但游速下降，追逐与逃脱更困难。' },
  lure: { name:'异位诱饵个体', color:'#d1b991', symbol:'◌', shape:'身体侧面出现额外感知突起与诱饵器官。', consequence:'近距离攻击更危险，游速仍然低于正常个体。' },
};
function abnormalCodex() {
  return `<section class="abnormal-codex"><div class="codex-intro"><p class="codex-kicker">异常生命</p><p>正常个体与异常个体共享海洋。污染海域中的个体可能出现不同的身体变化，获得新的能力，也付出运动或生存代价。</p></div><div class="species-grid">${Object.entries(abnormalForms).map(([id,form])=>{const rules=VARIANTS[id];return `<article class="species-card abnormal-card" style="--species-color:${form.color}"><div class="species-top"><span class="species-symbol" aria-hidden="true">${form.symbol}</span><small>异常表型 · 科幻设定</small></div><h3>${form.name}</h3><span class="species-role">${rules.name}</span><p>${form.shape}${form.consequence}</p><dl><dt>相对游速</dt><dd>正常个体的 ${Math.round(rules.speed*100)}%</dd><dt>接触防护</dt><dd>${rules.resistance.toFixed(2)} 倍</dd><dt>辨识方式</dt><dd>观察身体轮廓与游动方式，而非只看颜色。</dd></dl></article>`;}).join('')}</div><div class="codex-scale-note"><strong>异常不等于强大</strong><p>这里的弯脊、骨甲增生与异位器官是虚构污染事件下的游戏表型，不能用来预测现实辐射的后果。个体之间存在不同的速度、防护与攻击代价；发光也不等于遭受污染。</p></div></section>`;
}

export const WILDLIFE = ['fish','jelly','shark','squid','whale','ray','turtle','angler','crab','lanternfish','cuttlefish','oarfish'];
const icons={fish:'◁',jelly:'♧',shark:'⌁',squid:'⋔',whale:'◒',ray:'◇',turtle:'⬡',angler:'◖',crab:'⋈',lanternfish:'✦',cuttlefish:'〰',oarfish:'⌇'};
const behaviors={school:'群游',schooling:'群游',patrol:'巡游',hunt:'捕猎',hunting:'捕猎',flee:'逃离威胁',fleeing:'逃离威胁',drift:'随流漂游',drifting:'随流漂游',surface:'返回上层换气',surfacing:'返回上层换气',dive:'潜游觅食',diving:'潜游觅食',feed:'摄食',feeding:'摄食',rest:'休息',cruise:'巡游',breathe:'上层换气',glide:'贴底滑翔',graze:'游动觅食',ambush:'诱饵伏击',scavenge:'海底食腐'};
const setText=(id,value)=>{const node=document.getElementById(id);if(node&&node.textContent!==value)node.textContent=value;};

export function updateEcologyHUD(state) {
  const p=state.player,phase=lifeStageFor(p.level),body=LIFE_STAGES[phase],zone=zoneFor(p.y);
  const nutrition=Number.isFinite(p.nutrition)?p.nutrition:85;
  setText('nutrition-value',`${Math.ceil(nutrition)}%`);
  const bar=document.getElementById('nutrition-fill');
  if(bar){bar.style.width=`${nutrition}%`;bar.classList.toggle('low',nutrition<22);}
  const nutritionValue=document.getElementById('nutrition-value');
  if(nutritionValue&&nutritionValue.parentElement)nutritionValue.parentElement.classList.toggle('low',nutrition<22);
  setText('body-plan-name',body.name);
  setText('physiology-state',nutrition<22?'营养不足 · 恢复与运动受限':p.lightBonus?'光合共生正在补充营养':['细胞膜交换 · 鞭毛推进','细胞协作 · 纤毛推进','消化腔 · 收缩组织','摄食口器 · 呼吸褶皱'][phase]);
  setText('zone-name',`${zone.name} / ${Math.round(depthFor(p.y)).toLocaleString()} m`);
  const encounters=state.ecology?.encounters||[];
  setText('observation-count',`${WILDLIFE.filter(type=>encounters.includes(type)).length} / ${WILDLIFE.length}`);
  let nearest=null,distance=p.senseRadius||32;
  for(const e of state.entities) {
    if(!WILDLIFE.includes(e.type)||e.dead)continue;
    const d=Math.hypot(p.x-e.x,p.y-e.y,p.z-e.z)-e.radius;
    if(d<distance){distance=d;nearest=e;}
  }
  if(nearest) {
    const species=SPECIES[nearest.type];
    const abnormal=abnormalForms[nearest.variant];
    setText('observation-name',`${species.name}${abnormal?' · '+abnormal.name:''}`);
    setText('observation-role',`${behaviors[nearest.behavior]||species.role} · ${depthFor(nearest.y)<200?'透光层':depthFor(nearest.y)<1000?'微光层':'无光层'}`);
    const relation=nearest.type==='whale'?'以鱿鱼为食，会定期上浮换气。':p.level<5&&['shark','squid'].includes(nearest.type)?'你的微小体型还不会引起它的捕食兴趣。':nearest.type==='jelly'?'触手会伤害接触者，保持距离。':p.level>=species.minPlayerLevel?'你已具备捕猎它的身体结构。':'你的摄食结构还无法处理这种猎物。';
    setText('observation-detail',abnormal?`${abnormal.shape}${abnormal.consequence}`:`食物：${species.diet}。${relation}`);
    document.querySelector('.observation-panel')?.style.setProperty('--observed-color',abnormal?.color||species.color);
  } else {
    setText('observation-name','周围的微观生命');
    setText('observation-role','杆菌 · 硅藻 · 纤毛虫 · 多细胞群体');
    setText('observation-detail','镜头附近可见成群漂移的单细胞和细胞群体；靠近海草台地还能观察会随水流摆动的叶状海草。继续探索不同水层，大型动物会在更远处出现。');
    document.querySelector('.observation-panel')?.style.setProperty('--observed-color','#79d9bd');
  }
}

function bonusLabel(bonus) {
  if (!bonus) return '—';
  if (bonus.kind === 'damage') return `该物种的破绽伤害再 +${Math.round(bonus.value * 100)}%`;
  if (bonus.kind === 'dashRefund') return '打中破绽时立刻刷新冲刺';
  if (bonus.kind === 'resource') return `打中破绽额外获得 ${bonus.value} 生物质`;
  if (bonus.kind === 'safety') return '破绽窗口内不再被它反伤';
  return '—';
}

export function renderCodex(container,state,tab='forms') {
  const phase=lifeStageFor(state.player.level),encounters=state.ecology?.encounters||[];
  if(tab==='forms') {
    container.innerHTML=`<div class="codex-intro"><p class="codex-kicker">从一个细胞，到一个身体</p><p>进化不仅是体型和伤害。运动、消化与物质交换，需要不同的身体结构来支持。</p></div><div class="life-track">${LIFE_STAGES.map((body,index)=>`<article class="life-card ${phase===index?'current':''}"><div class="life-card-index"><span>0${index+1}</span><small>LV.${body.minLevel}${index<3?'–'+(body.minLevel+1):'+'}</small>${phase===index?'<em>当前结构</em>':''}</div><h3>${body.name}</h3><span class="size-label">${body.sizeLabel}</span><p>${body.summary}</p><div class="organ-tags">${body.organs.map(organ=>`<span>${organ}</span>`).join('')}</div><dl><dt>如何移动</dt><dd>${body.locomotion}</dd><dt>能够吃什么</dt><dd>${body.feeding}</dd><dt>生存代价</dt><dd>${body.tradeoff}</dd></dl></article>`).join('')}</div><div class="codex-scale-note"><strong>观察尺度</strong><p>微小细胞与养分经过放大，大型动物的尺寸也被压缩，便于在同一场景中观察。摄食资格由发育阶段决定，不能用屏幕上的大小判断能否吞食。单局内的快速异化是游戏设定，并非自然进化的速度或必然路线。</p></div>`;
  } else if(tab==='species') {
    container.innerHTML=`<div class="codex-intro"><p class="codex-kicker">你只是食物网中的一员</p><p>已观测 ${WILDLIFE.filter(type=>encounters.includes(type)).length} / ${WILDLIFE.length} 类海洋动物。它们会觅食、巡游、躲避与换气。</p></div><div class="species-grid">${WILDLIFE.map(type=>{const s=SPECIES[type];return `<article class="species-card" style="--species-color:${s.color}"><div class="species-top"><span class="species-symbol" aria-hidden="true">${icons[type]}</span><small>${encounters.includes(type)?'已观测':'尚未靠近'}</small></div><h3>${s.name}</h3><span class="species-role">${s.role}</span><p>${s.description}</p><dl><dt>食物</dt><dd>${s.diet}</dd><dt>你的摄食门槛</dt><dd>${s.huntable===false?'生态巨兽 · 不参与玩家战斗':`Lv.${s.minPlayerLevel} · ${s.minPlayerLevel>=7?'分化异化体':'多细胞幼体'}`}</dd></dl></article>`;}).join('')}<article class="species-card snow-card"><div class="species-top"><span class="species-symbol">✧</span><small>所有阶段都可利用</small></div><h3>海洋雪</h3><span class="species-role">来自上层的有机碎屑</span><p>${SPECIES.marineSnow.description}</p><dl><dt>深海生存</dt><dd>下潜后寻找浅色下沉颗粒，补充营养；辐射物质无法替代食物。</dd></dl></article><article class="species-card micro-card" style="--species-color:#79d9bd"><div class="species-top"><span class="species-symbol">◌</span><small>周围持续存在</small></div><h3>微观生命群落</h3><span class="species-role">细菌 · 硅藻 · 纤毛虫 · 细胞群体</span><p>水体里不只有玩家：细长的杆状细菌、放射形硅藻、带纤毛运动的原生生物，以及由多个细胞组成球状群体的浮游生命会随水流漂移。</p><dl><dt>观察方式</dt><dd>留意镜头附近缓慢漂移的小型透明轮廓。</dd><dt>生态意义</dt><dd>它们参与微型食物网，也让海洋不只由大型动物构成。</dd></dl></article><article class="species-card human-card" style="--species-color:${SPECIES.diver.color}"><div class="species-top"><span class="species-symbol" aria-hidden="true">⌂</span><small>灰屿人类设施</small></div><h3>灰屿科研人员</h3><span class="species-role">表层宿主 · 替代终局入口</span><p>码头上的人类维持排放、采样与通信。游到表层后可附着取样潜水员完成神经寄生；三类岛上中继被接管后，灰屿会停摆而不是被吞没。</p><dl><dt>接触方式</dt><dd>上浮至海平面，靠近黄灯潜水员按 G</dd><dt>终局条件</dt><dd>完成宿主适应后感染三处神经中继</dd></dl></article></div>`;
  } else if(tab==='notes') {
    const notes=Array.isArray(state.fieldNotes)?state.fieldNotes:[];
    container.innerHTML=`<div class="codex-intro"><p class="codex-kicker">观察就是武器</p><p>每种生物都有露破绽的一刻：鱼群的盲区、鲨鱼扑空后的回身、蟹蜕壳的软壳。第一次在那一刻打中它，你会把这件事记下来；笔记带来的加成是永久的。</p><p class="note-progress">已记录 ${notes.length} / ${FIELD_NOTES.length}</p></div><div class="field-note-grid">${FIELD_NOTES.map(note=>{const unlocked=notes.includes(note.id);const speciesName=note.species.map(type=>SPECIES[type]?.name||type).join(' / ');return `<article class="field-note ${unlocked?'':'locked'}"><span class="note-species">${speciesName}</span><h3>${unlocked?note.title:'尚未记录的习性'}</h3><p>${unlocked?note.text:'靠近它、观察它，并在它露出破绽的那一刻下手。'}</p><div class="note-bonus">${unlocked?`永久加成：${bonusLabel(note.bonus)}`:'—'}</div></article>`;}).join('')}</div>`;
  } else {
    container.innerHTML=`<div class="codex-intro"><p class="codex-kicker">阳光有边界，生命没有</p><p>越深，获取食物的方式越重要。鲸类跨越水层，海洋雪将上层的有机物带向深处。</p></div><div class="ocean-zones">${ZONES.map((zone,index)=>`<article class="zone-card zone-${zone.id}"><span class="zone-number">0${index+1}</span><div><h3>${zone.name}</h3><small>${zone.range}</small><p>${zone.description}</p>${index===0?'<span class="zone-trait">共生分支 ≥ 2 阶：获得光合营养补充</span>':'<span class="zone-trait">无光合营养补充 · 依靠摄食</span>'}</div></article>`).join('')}</div><div class="food-web"><strong>一条会发生的食物链</strong><p>浮游生物 <span>→</span> 鱼群 <span>→</span> 深海鱿鱼 <span>→</span> 潜游齿鲸</p><small>箭头表示被捕食。水母和鲨鱼也参与其中，海洋雪则为多个层次补充有机物。</small></div><div class="codex-scale-note"><strong>依据与想象</strong><p>膜交换、营养需求、光照限制和捕食关系参考生物规律；智慧觉醒、辐射能力及单局内的身体重塑属于虚构设定。深度与空间在场景中压缩呈现。</p><div class="biology-sources">${BIOLOGY_SOURCES.map(source=>`<a href="${source.url}" target="_blank" rel="noreferrer">${source.title} ↗</a>`).join('')}</div></div>`;
  }
  if(tab==='species')container.insertAdjacentHTML('beforeend',abnormalCodex());
  if(tab==='ocean')container.insertAdjacentHTML('beforeend',`<section class="codex-scale-note reactor-codex"><strong>海底反应堆</strong><p>沉船、断层与排放站留下三座仍在工作的反应堆。靠近它们时，先观察冷却、预警和排放周期，再进入管道。侵入进度可累积，预警时撤离，等下一次窗口继续。菌膜提供局部营养，鱼、鲸和海龟则可成为短暂的迁移宿主。生态经历推动身体发育，重复拾取食物只维持生存。</p></section>`);
  container.scrollTop=0;
}

