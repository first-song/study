import { SPECIES } from './biology.js';
import { BIOFILM_SITES, HOST_TYPES, INTERACTION_RULES, PARASITE_SITE_DEFS, REACTOR_SITES, expeditionObjective, interactionTarget } from './ecosystem.js';
import { ABERRANT_ECHO_DEFS } from './echo-system.js';

let ui = null;
const phaseLabels = { cooldown:'冷却窗口', warning:'排放预警', discharge:'正在排放' };
const kindLabels = { biofilm:'菌膜附着', host:'宿主迁移', echo:'异变回声追猎', reactor:'反应堆侵入', infection:'神经寄生' };
const milestoneTotal = BIOFILM_SITES.length + HOST_TYPES.length + ABERRANT_ECHO_DEFS.length + REACTOR_SITES.length;
const write = (node, value) => { if(node && node.textContent !== value)node.textContent=value; };

export function mountExpeditionUI(host, { onInteract = () => {} } = {}) {
  const hud = host.id === 'hud' ? host : host.querySelector('#hud');
  if(!hud)return null;
  if(ui?.hud === hud){ui.onInteract=onInteract;return ui.context;}
  hud.classList.add('expedition-enabled');
  const context=document.createElement('section');
  context.id='expedition-context';
  context.className='expedition-context';
  context.setAttribute('aria-label','生态交互与污染风险');
  context.hidden=true;
  context.innerHTML=`<div class="expedition-action"><button id="expedition-interact" class="expedition-interact" type="button"><kbd>G</kbd><span>附着</span></button><div class="expedition-description"><span id="expedition-kind" class="panel-eyebrow"></span><strong id="expedition-target"></strong><p id="expedition-hint"></p></div></div><div id="expedition-progress" class="expedition-progress" hidden><div><span id="expedition-progress-label">附着进度</span><span id="expedition-progress-value">0%</span></div><div class="expedition-progress-track"><span id="expedition-progress-fill"></span></div></div><div id="reactor-cycle" class="reactor-cycle" hidden><span id="reactor-name" class="reactor-cycle-source"></span><div><span id="reactor-phase"></span><span id="reactor-countdown"></span></div><p id="reactor-risk"></p></div>`;
  hud.append(context);
  const mission=hud.querySelector('.mission-panel');
  const log=document.createElement('div');
  log.className='expedition-log';
  log.innerHTML=`<div><span>生态经历</span><strong id="expedition-count">0 / ${milestoneTotal}</strong></div><p id="expedition-milestones">菌膜 0 / 3 · 迁移 0 / ${HOST_TYPES.length} · 回声 0 / 3 · 停堆 0 / 3</p><p id="parasite-route-status" class="parasite-route-status">寄生路线：在上层寻找人类潜水员</p><small>首次经历推动发育 · 身体随机改变</small>`;
  mission?.insertBefore(log,mission.querySelector('.dive-telemetry'));
  const find=id=>hud.querySelector(`#${id}`);
  ui={hud,context,log,onInteract,button:find('expedition-interact'),kind:find('expedition-kind'),target:find('expedition-target'),hint:find('expedition-hint'),progress:find('expedition-progress'),progressLabel:find('expedition-progress-label'),progressValue:find('expedition-progress-value'),progressFill:find('expedition-progress-fill'),cycle:find('reactor-cycle'),reactorName:find('reactor-name'),phase:find('reactor-phase'),countdown:find('reactor-countdown'),risk:find('reactor-risk'),count:find('expedition-count'),milestones:find('expedition-milestones'),parasiteStatus:find('parasite-route-status'),objective:find('objective-text')};
  ui.button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();ui.onInteract();});
  return context;
}

export function updateExpeditionUI(state) {
  if(!ui || !state?.player || !state.expedition)return;
  const log=state.expedition;
  const milestones=new Set(log.milestones || []);
  const routeTotal=milestoneTotal+(log.hostAdaptations.includes('diver')?PARASITE_SITE_DEFS.length:0);
  write(ui.count,`${milestones.size} / ${routeTotal}`);
  write(ui.milestones,`菌膜 ${log.biofilms.length} / ${BIOFILM_SITES.length} · 迁移 ${log.hostAdaptations.length} / ${HOST_TYPES.length} · 回声 ${log.echoesPacified?.length||0} / ${ABERRANT_ECHO_DEFS.length} · 停堆 ${log.shutdowns.length} / ${REACTOR_SITES.length}`);
  const parasiteStatus=log.hostAdaptations.includes('diver')
    ? `寄生中继 ${log.parasiteNodes?.length||0} / ${PARASITE_SITE_DEFS.length} · 可接管灰屿设施`
    : state.player.parasiteCapability
      ? `${state.player.innateParasitism?'天生寄生原基':'随机异变已生成寄生原基'} · 到海面寻找人类潜水员`
      : '寄生原基休眠 · 人类路线尚未解锁；普通宿主仍可搭乘';
  write(ui.parasiteStatus,parasiteStatus);
  ui.parasiteStatus?.classList.toggle('unlocked',log.hostAdaptations.includes('diver'));
  const landAction=state.player.onLand
    ?state.player.level>=7
      ?'岸上掠食已解锁：按 E 吞噬附近人类；其收益是营养与恐慌，不会替代随机异变。'
      :'当前身体不足以掠食岸上人类：发育到 Lv.7 后再登陆。'
    :'';
  write(ui.objective,`${expeditionObjective(state)}${landAction?` · ${landAction}`:''}`);

  const target=interactionTarget(state),p=state.player;
  const nearbyEcho=!target?state.entities
    .filter(entity=>entity.type==='echo'&&!entity.pacified)
    .map(entity=>({entity,distance:Math.hypot(entity.x-p.x,entity.y-p.y,entity.z-p.z)}))
    .filter(entry=>entry.distance<72)
    .sort((a,b)=>a.distance-b.distance)[0]?.entity:null;
  const nearbyReactors=state.entities.filter(e=>e.type==='reactor' && !e.dead && e.status!=='shutdown')
    .map(entity=>({entity,distance:Math.hypot(entity.x-p.x,entity.y-p.y,entity.z-p.z)}))
    .filter(entry=>entry.distance<INTERACTION_RULES.pollutionRadius)
    .sort((a,b)=>a.distance-b.distance);
  const nearby=nearbyReactors[0]?.entity;
  const targeted=target && state.entities.find(e=>e.id===target.entityId);
  const reactor=target?.kind==='reactor'?targeted:nearbyEcho?null:nearby;
  ui.context.hidden=!target && !reactor && !nearbyEcho;
  ui.context.dataset.phase=reactor?.phase || '';
  ui.context.dataset.attached=target?.attached?'true':'false';
  ui.button.hidden=!target;
  if(target) {
    write(ui.kind,kindLabels[target.kind]);
    write(ui.target,target.name);
    let hint=target.hint;
    if(target.kind==='host' && log.hostAdaptations.includes(targeted?.type))hint=target.attached?'已完成此类宿主适应，仍可搭乘迁移。空格脱离。':'G 搭乘迁移 · 此类宿主已完成适应';
    else if(target.attached && target.kind==='host')hint='保持附着，随宿主经过足够的时间与距离。空格脱离。';
    else if(target.attached && target.kind==='biofilm')hint=targeted?.depleted?'菌膜适应已完成，继续附着仅补充营养。空格脱离。':'膜表面正在交换营养。空格可随时脱离。';
    else if(target.attached && target.kind==='reactor' && reactor?.phase==='cooldown')hint='正在侵入冷却管道，预警时按空格撤离。';
    write(ui.hint,hint);
    ui.button.disabled=!target.canAttach;
    write(ui.button.querySelector('kbd'),target.attached?'SPACE':'G');
    write(ui.button.querySelector('span'),target.attached?'脱离':!target.canAttach?'等待':target.kind==='host'?'搭乘':target.kind==='echo'?'切断共振':target.kind==='reactor'?'侵入':target.kind==='infection'?'接入':'附着');
    ui.button.setAttribute('aria-label',`${target.attached?'脱离':target.kind==='host'?'搭乘':target.kind==='echo'?'切断共振':target.kind==='reactor'?'侵入':target.kind==='infection'?'接入':'附着'}${target.name}`);
  } else if(nearbyEcho) {
    write(ui.kind,'异变回声追猎');
    write(ui.target,nearbyEcho.name);
    write(ui.hint,nearbyEcho.phase==='charge'?'污染脉冲正在蓄积：拉开距离或按 Space 冲刺。':nearbyEcho.phase==='exposed'?'外壳已经张开：按 Q 冲击，或贴近按 G 撕裂共振。':'它正在供给反应堆；保持追踪，等待下次开壳。');
  } else if(reactor) {
    write(ui.kind,'污染源感知');
    write(ui.target,reactor.name);
    write(ui.hint,reactor.phase==='cooldown'?'靠近冷却管道，寻找侵入位置。':'远离污染水体，等待下一次冷却窗口。');
  } else if(state.player.onLand) {
    // 站在灰屿上却没有目标时，明确告诉玩家"你可以吃人"以及需要什么条件。
    const ready=state.player.level>=7;
    write(ui.kind,'岸上掠食');
    write(ui.target,ready?'灰屿居民':'身体还太小');
    write(ui.hint,ready
      ?'按 E 吞下岸上的人类：营养与生物质都会涨，灰屿会因此陷入恐慌'
      :'身体还太小，发育到 Lv.7（分化异化体）后才能掠食人类');
    ui.button.hidden=true;
    ui.progress.hidden=true;
    ui.cycle.hidden=true;
    return;
  }
  const hostAlreadyAdapted=target?.kind==='host' && log.hostAdaptations.includes(targeted?.type);
  const showProgress=!!target && !hostAlreadyAdapted && target.kind!=='echo' && (target.attached || target.kind==='reactor' || target.kind==='infection' || target.kind==='biofilm' && targeted?.progress>0);
  ui.progress.hidden=!showProgress;
  if(showProgress) {
    const progress=Math.min(1,Math.max(0,Number(target.progress)||0));
    write(ui.progressLabel,target.kind==='reactor'?'管道侵入 · 撤离后保留':target.kind==='infection'?'神经接管 · 撤离后保留':target.kind==='host'?`随 ${SPECIES[targeted?.type]?.name || '宿主'} 迁移`:'菌膜消化');
    write(ui.progressValue,`${Math.floor(progress*100)}%`);
    ui.progressFill.style.width=`${progress*100}%`;
  }
  ui.cycle.hidden=!reactor;
  if(reactor) {
    write(ui.reactorName,reactor.name);
    write(ui.phase,phaseLabels[reactor.phase] || '污染信号');
    write(ui.countdown,`${Math.max(0,Math.ceil(reactor.phaseRemaining || 0))} 秒`);
    let risk=reactor.phase==='cooldown'?'排放较弱，仍有残余污染。观察身体负荷。':reactor.phase==='warning'?'排放即将增强。附着期间按空格撤离。':'污染正在扩散。停止侵入，离开这片水体。';
    if(nearbyReactors.some(entry=>entry.entity.id!==reactor.id && entry.entity.phase==='discharge'))risk+=' 附近另一处也在排放。';
    write(ui.risk,risk);
  }
}
