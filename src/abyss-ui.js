import { biomeNameAt } from './world.js';
import { ASSIMILATIONS } from './assimilation.js';
import { SPECIES, depthFor, zoneFor, WATER_SURFACE_Y } from './biology.js';
import { HOST_TYPES, PARASITE_SITE_DEFS, REACTOR_SITES, expeditionObjective } from './ecosystem.js';
import { humanBoatStates } from './human-navigation.js';

export function mountAbyssUI({onMap}) {
  const row=document.createElement('label');row.className='seed-row';
  row.innerHTML='<span>海域种子</span><input id="world-seed" maxlength="40" placeholder="留空探索新海域 / 输入文字或数字" autocomplete="off"/><button id="random-seed" type="button" aria-label="随机海域种子">↻</button>';
  document.querySelector('.menu-actions').before(row);
  row.querySelector('button').onclick=()=>{row.querySelector('input').value=String(crypto.getRandomValues(new Uint32Array(1))[0]);};
  const mapButton=document.createElement('button');mapButton.className='utility-button';mapButton.id='chart-btn';mapButton.textContent='J · 海图';mapButton.onclick=onMap;
  document.querySelector('.hud-utility').prepend(mapButton);
  const dive=document.createElement('div');dive.className='dive-adaptation';dive.id='dive-adaptation';
  document.querySelector('.physiology-summary').after(dive);
  const patrol=document.createElement('div');patrol.className='patrol-status';patrol.id='human-patrol-status';patrol.hidden=true;
  dive.after(patrol);
  const modal=document.createElement('section');modal.className='modal-screen';modal.id='chart-screen';modal.hidden=true;modal.setAttribute('aria-label','海域探索图');
  modal.innerHTML='<div class="modal-dialog chart-dialog"><div class="chart-top"><div><small>OCEAN ATLAS</small><h2>这片海，尚待探索。</h2><p id="chart-seed"></p></div><button class="icon-button" id="chart-close" aria-label="关闭海图">×</button></div><canvas id="ocean-chart" width="700" height="580" aria-label="海域、生物栖息地、反应堆、当前位置与航线"></canvas><p id="chart-route" class="chart-route"></p><p class="chart-legend">▲ 你与朝向　┅ 当前路线　□ 反应堆　◇ 菌膜　✦ 排放母体　· 海图比例经过压缩</p></div>';
  document.body.append(modal);modal.querySelector('button').onclick=onMap;
}

export function updateAbyssHUD(state) {
  const p=state.player,node=document.getElementById('dive-adaptation');
  node.textContent=`${p.diveSupport||'基础耐受'} · 深潜负担 ${Math.round((p.depthStress||0)*100)}%`;
  node.classList.toggle('stressed',p.depthStress>.55);
  const surface=p.y>=WATER_SURFACE_Y-.8;
  document.getElementById('zone-name').textContent=`${surface?'海平面':zoneFor(p.y).name} · ${biomeNameAt(state.world,p)} · ${Math.round(depthFor(p.y)).toLocaleString()} m`;
  const patrol=document.getElementById('human-patrol-status');
  if(patrol){
    const nearby=humanBoatStates(state.world,state.time).map(boat=>({boat,distance:Math.hypot(p.x-boat.x,p.z-boat.z)})).sort((a,b)=>a.distance-b.distance)[0];
    const visible=nearby&&nearby.distance<62&&p.y>=WATER_SURFACE_Y-9;
    patrol.hidden=!visible;
    if(visible){
      const {boat,distance}=nearby;
      patrol.textContent=boat.active?`巡逻船声呐排放中 · ${Math.ceil(distance)} m · 立即下潜`:boat.warning?'巡逻船正在锁定海面 · 1.5 秒后声呐冲击':'进入船尾尾流可获得推进';
      patrol.dataset.alert=boat.warning?'warning':boat.active?'danger':'wake';
    }
  }
  if(p.apex){document.getElementById('form-name').textContent='深渊巨兽';document.getElementById('body-plan-name').textContent='巨型异化生命';}
}

export function renderAssimilations(state) {
  let section=document.getElementById('assimilation-records');
  if(!section){section=document.createElement('section');section.id='assimilation-records';document.getElementById('mutation-history').after(section);}
  section.replaceChildren();const title=document.createElement('h3');title.textContent='吞噬留下的结构';section.append(title);
  const hint=document.createElement('p');hint.textContent='吞食相容猎物的组织后随机形成；击杀本身不触发，同一个体只判定一次。';section.append(hint);
  const grid=document.createElement('div');grid.className='assimilation-grid';section.append(grid);
  for(const trait of ASSIMILATIONS){const card=document.createElement('article');card.className='assimilation-card';
    const rank=state.player.assimilations?.[trait.id]||0;card.classList.toggle('acquired',rank>0);
    const name=document.createElement('strong');name.textContent=`${trait.name} · ${rank}/2`;
    const text=document.createElement('p');text.textContent=trait.description;
    const source=document.createElement('small');source.textContent=`组织来源：${trait.sources.map(t=>SPECIES[t].name).join(' / ')} · 概率 ${Math.round(trait.chance*100)}%`;
    card.append(name,text,source);grid.append(card);
  }
  const recent=state.player.assimilationHistory?.slice(-5).reverse()||[];
  for(const record of recent){const line=document.createElement('p');line.className='assimilation-log';line.textContent=`${SPECIES[record.sourceType]?.name||'猎物'} → ${record.success?ASSIMILATIONS.find(t=>t.id===record.trait)?.name||'结构已形成':'未形成新结构'}`;section.append(line);}
}

export function navigationTarget(state) {
  const p=state.player,log=state.expedition,entities=state.entities.filter(entity=>!entity.dead);
  const nearest=items=>items.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]||null;
  if(log.hostAdaptations.includes('diver')&&log.parasiteNodes.length<PARASITE_SITE_DEFS.length) {
    return nearest(entities.filter(entity=>entity.type==='islandNode'&&!entity.disabled));
  }
  if(!log.biofilms.length)return nearest(entities.filter(entity=>entity.type==='biofilm'&&!entity.depleted));
  if(!log.hostAdaptations.length) {
    return nearest(entities.filter(entity=>HOST_TYPES.includes(entity.type)&&(entity.type!=='diver'||p.parasiteCapability)));
  }
  const echo=nearest(entities.filter(entity=>
    entity.type==='echo'&&!entity.pacified&&!log.shutdowns.includes(entity.reactorSiteId)
  ));
  if(echo)return echo;
  if(log.shutdowns.length<REACTOR_SITES.length)return nearest(entities.filter(entity=>entity.type==='reactor'&&entity.status!=='shutdown'));
  return entities.find(entity=>entity.type==='boss')||nearest(entities.filter(entity=>entity.type==='islandNode'))||null;
}

export function renderOceanChart(state,{heading=0}={}) {
  const canvas=document.getElementById('ocean-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,world=state.world;
  const scale=(h-75)/(world.radius*2),cx=w/2,cy=h/2;
  ctx.fillStyle='#071e2a';ctx.fillRect(0,0,w,h);
  const seaGlow=ctx.createRadialGradient(cx,cy,20,cx,cy,h*.52);
  seaGlow.addColorStop(0,'rgba(43,112,112,.18)');seaGlow.addColorStop(1,'rgba(0,11,18,0)');
  ctx.fillStyle=seaGlow;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#1e3a46';ctx.lineWidth=1;
  for(let n=-world.radius;n<=world.radius;n+=40){ctx.beginPath();ctx.moveTo(cx+n*scale,25);ctx.lineTo(cx+n*scale,h-25);ctx.moveTo(25,cy+n*scale);ctx.lineTo(w-25,cy+n*scale);ctx.stroke();}
  for(const biome of world.biomes){const x=cx+biome.x*scale,y=cy+biome.z*scale;ctx.fillStyle='#'+biome.color.toString(16).padStart(6,'0')+'70';ctx.beginPath();ctx.arc(x,y,biome.radius*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c7e4df';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(biome.name,x,y);}
  ctx.strokeStyle='#86afa8';ctx.beginPath();ctx.arc(cx,cy,world.radius*scale,0,Math.PI*2);ctx.stroke();
  for(const e of state.entities.filter(e=>['boss','reactor','biofilm','echo'].includes(e.type))){const x=cx+e.x*scale,y=cy+e.z*scale;ctx.fillStyle=e.type==='echo'?(e.pacified?'#688f86':'#efaa76'):e.status==='shutdown'?'#669e8d':e.type==='boss'?'#ffc697':'#c5d698';ctx.font='bold 19px sans-serif';ctx.fillText(e.type==='boss'?'✦':e.type==='echo'?'◉':e.type==='reactor'?'□':'◇',x,y);ctx.font='10px sans-serif';ctx.fillText(e.name||'灰屿',x,y+13);}
  for(const boat of humanBoatStates(state.world,state.time)){const x=cx+boat.x*scale,y=cy+boat.z*scale;ctx.fillStyle=boat.warning?'#ffbf71':'#86d8c9';ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+4,y+3);ctx.lineTo(x-4,y+3);ctx.closePath();ctx.fill();}
  const playerX=cx+state.player.x*scale,playerY=cy+state.player.z*scale;
  const target=navigationTarget(state);
  if(target) {
    const targetX=cx+target.x*scale,targetY=cy+target.z*scale;
    const angle=Math.atan2(targetY-playerY,targetX-playerX);
    ctx.save();ctx.strokeStyle='#d7f3a6';ctx.globalAlpha=.72;ctx.setLineDash([8,7]);ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(playerX,playerY);ctx.lineTo(targetX,targetY);ctx.stroke();ctx.restore();
    const arrowX=playerX+(targetX-playerX)*.58,arrowY=playerY+(targetY-playerY)*.58;
    ctx.save();ctx.translate(arrowX,arrowY);ctx.rotate(angle);ctx.fillStyle='#d7f3a6';
    ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-6,-5);ctx.lineTo(-3,0);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();ctx.restore();
    ctx.strokeStyle='#d7f3a6';ctx.lineWidth=2;ctx.beginPath();ctx.arc(targetX,targetY,10,0,Math.PI*2);ctx.stroke();
  }
  ctx.save();ctx.translate(playerX,playerY);ctx.rotate(-heading);
  ctx.fillStyle='#eaffd3';ctx.shadowColor='#8effd9';ctx.shadowBlur=13;
  ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(7,7);ctx.lineTo(0,3);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.restore();
  // A north rose is drawn in map space and remains readable at every seed.
  ctx.save();ctx.translate(w-55,55);ctx.strokeStyle='#8bbeb4';ctx.fillStyle='#d9eee4';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-17);ctx.lineTo(4,-3);ctx.lineTo(0,7);ctx.lineTo(-4,-3);ctx.closePath();ctx.fill();
  ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('N',0,-28);ctx.restore();
  const distance=target?Math.hypot(target.x-state.player.x,target.z-state.player.z):0;
  const targetName=target?.name||(target?.type==='echo'?'异变回声体':target?.type==='boss'?'污染控制核心':target?.type==='reactor'?'反应堆':target?.type==='biofilm'?'菌膜':target?.type==='islandNode'?'神经中继':target?.type==='fish'?'可搭乘鱼群':'当前目标');
  document.getElementById('chart-seed').textContent=`SEED ${world.seed} · 海域直径 ${world.radius*2} m · ${biomeNameAt(world,state.player)}`;
  document.getElementById('chart-route').textContent=target
    ?`当前航向　→　${targetName} · ${Math.ceil(distance)} m　｜　${expeditionObjective(state)}`
    :expeditionObjective(state);
}
