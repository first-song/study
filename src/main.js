import { GameEngine, BRANCHES, STAGES } from './engine.js';
import { OceanScene } from './scene.js';
import { SPECIES, depthFor, WATER_SURFACE_Y } from './biology.js';
import { renderCodex, updateEcologyHUD } from './ecology-ui.js';
import { tideAt, tideLabel } from './tide.js';
import { renderMutations, updateMutationHUD } from './mutation-records.js';
import { createMouseLook } from './mouse-look.js';
import { mountExpeditionUI, updateExpeditionUI } from './expedition-ui.js';
import { interactionTarget, interactionPosition, HOST_TYPES } from './ecosystem.js';
import { FrameStepper, seedFromText } from './frame-step.js';
import { mountAbyssUI, updateAbyssHUD, renderAssimilations, renderOceanChart } from './abyss-ui.js';
import { mountOnboarding } from './onboarding.js';
import { humanBoatStates } from './human-navigation.js';
import { PLANKTON_BLOOM_RULES } from './plankton-bloom.js';
import { mountHuntUI, updateHuntUI } from './hunt-ui.js';
import { mountInstinctUI } from './instinct-ui.js';
import { INSTINCTS } from './instincts.js';
import { outcomeFor } from './ocean-breath.js';

export const engine = new GameEngine();
export let ocean;
export let mouseLook;
let instinctUI;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'aberrant-tide-save-v1';
const SETTINGS_KEY = 'aberrant-tide-settings-v1';
const ONBOARDING_KEY = 'aberrant-tide-onboarding-v1';
const keys = new Set();
const touches = new Set();
const abilities = { dash:false, pulse:false, feed:false, interact:false, bite:false, jet:false };
const frameStepper = new FrameStepper();
let previousMode = '';
let saveElapsed = 0;
let helpOpen = false;
let helpWasPlaying = false;
let biologyOpen = false;
let biologyWasPlaying = false;
let mutationOpen = false;
let mutationWasPlaying = false;
let chartOpen = false;
let chartWasPlaying = false;
let finaleActive = false;
let finaleToken = 0;
let onboardingOpen = false;
let onboardingWasPlaying = false;
let onboarding;
let codexTab = 'forms';
let soundEnabled = false;
let audioContext;
let ambient;
let waterSound;
let lastSound = 0;
let lastTime = performance.now();
let frameCount = 0;
let toastTimeout;
let ignoreEscapeUntil=0;
let settings = { quality:'medium',sound:false,firstPerson:false,mouseSensitivity:1,invertY:false,reducedMotion:false };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch {}
settings.mouseSensitivity=Number.isFinite(settings.mouseSensitivity)?Math.max(.3,Math.min(2,settings.mouseSensitivity)):1;

const minutes = time => `${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;
function text(id, value) { const el=$(id); if(el && el.textContent!==String(value))el.textContent=value; }
function show(id, visible) { if($(id))$(id).hidden=!visible; }
function fill(id, ratio) { if($(id))$(id).style.width=`${Math.max(0,Math.min(1,ratio))*100}%`; }
function bind(id,fn) { $(id)?.addEventListener('click',fn); }
function storeSettings() { try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); } catch {} }

function toast(message, kind='info') {
  const container=$('toast-container');
  if(!container)return;
  const item=document.createElement('div');
  item.className=`toast toast-${kind}`;
  item.textContent=message;
  container.appendChild(item);
  while(container.childElementCount>3)container.firstElementChild.remove();
  setTimeout(()=>item.remove(),4200);
}

function sound(frequency=440,duration=.1,type='sine',volume=.035) {
  if(!soundEnabled)return;
  try {
    if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume();
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*.5),audioContext.currentTime+duration);
    gain.gain.setValueAtTime(volume,audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);
    oscillator.connect(gain);gain.connect(audioContext.destination);
    oscillator.start();oscillator.stop(audioContext.currentTime+duration);
  } catch {}
}

function updateAudio() {
  if(soundEnabled) {
    sound(180,.3,'sine',.02);
    if(audioContext&&!ambient) {
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      oscillator.type='sine';oscillator.frequency.value=54;gain.gain.value=.018;
      oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();
      ambient={oscillator,gain};
    }
    if(audioContext&&!waterSound) {
      const buffer=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate);
      const samples=buffer.getChannelData(0);
      let filtered=0;
      for(let i=0;i<samples.length;i++){filtered=(filtered+.025*(Math.random()*2-1))/1.025;samples[i]=filtered*6;}
      const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=220;gain.gain.value=.02;
      source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);source.start();
      waterSound={source,filter,gain};
    }
  }
  if(ambient)ambient.gain.gain.value=soundEnabled?.018:0;
  if(waterSound&&!soundEnabled)waterSound.gain.gain.value=0;
  text('sound-btn',soundEnabled?'声音 · 开':'声音 · 关');
  $('sound-btn')?.setAttribute('aria-pressed',String(soundEnabled));
}

function updateWaterSound() {
  if(!soundEnabled||!waterSound||!audioContext)return;
  const p=engine.state.player,motion=Math.min(1,Math.hypot(p.vx,p.vy,p.vz)/22);
  const volume=engine.state.mode==='playing'?.025+motion*.07:.012;
  waterSound.gain.gain.setTargetAtTime(volume,audioContext.currentTime,.15);
  waterSound.filter.frequency.setTargetAtTime(160+motion*420,audioContext.currentTime,.2);
}

function hasSave() {
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return false;
    const data=JSON.parse(raw);
    return [1,2,3,4,5,6,7,8,9,10].includes(data.version)&&['playing','paused','evolving'].includes(data.state?.mode);
  } catch { return false; }
}

function save(manual=false) {
  if(!['playing','paused','evolving'].includes(engine.state.mode))return;
  try {
    localStorage.setItem(SAVE_KEY,JSON.stringify(engine.serialize()));
    if(manual)toast('记忆已保存，下次可以继续进化。');
  } catch { if(manual)toast('浏览器未允许保存，请检查存储设置。','danger'); }
}

function clearInput() { keys.clear();touches.clear();abilities.dash=abilities.pulse=abilities.feed=abilities.interact=abilities.bite=abilities.jet=false;mouseLook?.clear(); }

function newRun() {
  clearInput();helpOpen=false;biologyOpen=false;mutationOpen=false;mutationWasPlaying=false;
  chartOpen=false;chartWasPlaying=false;finaleActive=false;finaleToken++;
  document.body.classList.remove('finale-active');
  document.body.classList.remove('hud-hidden');
  let runSeed=seedFromText($('world-seed')?.value);
  if(runSeed===undefined)runSeed=crypto.getRandomValues(new Uint32Array(1))[0];
  engine.start(runSeed);ocean.syncWorld(engine.state.world);ocean.resetFinale();ocean.yaw=0;ocean.pitch=.18;
  $('finale-caption').textContent='灰屿正在沉入巨兽腹中';
  frameStepper.reset();
  if($('world-seed'))$('world-seed').value=String(runSeed);
  if(soundEnabled)updateAudio();
  saveElapsed=0;
  syncScreens();
  save();
  sound(330,.3);
  let onboardingSeen=false;
  try{onboardingSeen=localStorage.getItem(ONBOARDING_KEY)==='seen';}catch{}
  if(!onboardingSeen)openOnboarding(true);
  setTimeout(()=>{if(engine.state.mode==='playing')toast(`海域种子 ${runSeed} · 靠近菌膜按 G 附着；按 E 可连续滤食活性营养羽流。`);},1600);
}

function continueRun() {
  let data;
  try { data=JSON.parse(localStorage.getItem(SAVE_KEY)); } catch {}
  if(!engine.restore(data)) {
    toast('这份记忆已经损坏，无法读取。可以重新开始。','danger');
    show('continue-btn',false);
    return;
  }
  if(engine.state.mode==='paused')engine.togglePause();
  ocean.syncWorld(engine.state.world);ocean.yaw=0;ocean.pitch=.18;
  frameStepper.reset();
  if($('world-seed'))$('world-seed').value=String(engine.state.world.seed);
  if(engine.state.player.attachment?.kind==='reactor')frameReactorInteraction();
  if(soundEnabled)updateAudio();
  syncScreens();
  sound(330,.3);
}

function pause() {
  if(onboardingOpen)return;
  if(chartOpen){closeChart();return;}
  if(mutationOpen){closeMutations();return;}
  if(biologyOpen){closeBiology();return;}
  if(helpOpen){closeHelp();return;}
  engine.togglePause();clearInput();syncScreens();save();
}

function openOnboarding(auto=false) {
  if(onboardingOpen||!onboarding)return;
  onboardingWasPlaying=engine.state.mode==='playing';
  if(onboardingWasPlaying)engine.togglePause();
  onboardingOpen=true;clearInput();mouseLook?.release();onboarding.open();syncScreens();
}

function closeOnboarding() {
  if(!onboardingOpen)return;
  onboardingOpen=false;
  try{localStorage.setItem(ONBOARDING_KEY,'seen');}catch{}
  if(onboardingWasPlaying&&engine.state.mode==='paused')engine.togglePause();
  onboardingWasPlaying=false;syncScreens();
}

function menu() {
  save();clearInput();helpOpen=false;biologyOpen=false;mutationOpen=false;mutationWasPlaying=false;
  chartOpen=false;chartWasPlaying=false;finaleActive=false;finaleToken++;
  document.body.classList.remove('finale-active');
  ocean?.resetFinale();
  engine.reset();frameStepper.reset();
  document.body.classList.remove('hud-hidden');
  syncScreens();
}

function openHelp() {
  if(chartOpen)closeChart();
  if(mutationOpen)closeMutations();
  if(biologyOpen)closeBiology();
  helpWasPlaying=engine.state.mode==='playing';
  if(helpWasPlaying)engine.togglePause();
  helpOpen=true;clearInput();syncScreens();
}
function closeHelp() {
  helpOpen=false;
  if(helpWasPlaying&&engine.state.mode==='paused')engine.togglePause();
  helpWasPlaying=false;syncScreens();
}

function openBiology() {
  if(chartOpen)closeChart();
  if(mutationOpen)closeMutations();
  if(helpOpen)closeHelp();
  biologyWasPlaying=engine.state.mode==='playing';
  if(biologyWasPlaying)engine.togglePause();
  biologyOpen=true;clearInput();
  renderCodex($('biology-content'),engine.state,codexTab);
  syncScreens();
  $('biology-close-btn')?.focus({preventScroll:true});
}
function closeBiology() {
  biologyOpen=false;
  if(biologyWasPlaying&&engine.state.mode==='paused')engine.togglePause();
  biologyWasPlaying=false;syncScreens();
}

function openMutations() {
  if(mutationOpen)return;
  if(!['playing','paused'].includes(engine.state.mode))return;
  if(chartOpen)closeChart();
  if(helpOpen)closeHelp();
  if(biologyOpen)closeBiology();
  mutationWasPlaying=engine.state.mode==='playing';
  if(mutationWasPlaying)engine.togglePause();
  mutationOpen=true;clearInput();
  renderMutationPanel();syncScreens();
  $('mutation-close-btn')?.focus({preventScroll:true});
}

function renderMutationPanel() {
  renderMutations($('mutation-content'),engine.state);
  renderAssimilations(engine.state);
}

function closeMutations() {
  mutationOpen=false;
  if(mutationWasPlaying&&engine.state.mode==='paused')engine.togglePause();
  mutationWasPlaying=false;syncScreens();save();
}

function openChart() {
  if(chartOpen||!['playing','paused'].includes(engine.state.mode))return;
  if(helpOpen)closeHelp();
  if(biologyOpen)closeBiology();
  if(mutationOpen)closeMutations();
  chartWasPlaying=engine.state.mode==='playing';
  if(chartWasPlaying)engine.togglePause();
  chartOpen=true;clearInput();renderOceanChart(engine.state,{heading:ocean.yaw});syncScreens();
  $('chart-close')?.focus({preventScroll:true});
}

function closeChart() {
  if(!chartOpen)return;
  chartOpen=false;
  if(chartWasPlaying&&engine.state.mode==='paused')engine.togglePause();
  chartWasPlaying=false;syncScreens();
}

function toggleChart() {
  chartOpen?closeChart():openChart();
}

function toggleCamera() {
  ocean.firstPerson=!ocean.firstPerson;
  settings.firstPerson=ocean.firstPerson;storeSettings();
  updateCameraLabel();
}
function updateCameraLabel() {
  text('camera-btn',ocean.firstPerson?'V · 第一人称':'V · 第三人称');
  $('camera-btn')?.setAttribute('aria-label',ocean.firstPerson?'当前第一人称，点击切换第三人称':'当前第三人称，点击切换第一人称');
  show('crosshair',ocean.firstPerson&&engine.state.mode==='playing');
}

function frameReactorInteraction() {
  if(ocean.firstPerson)return;
  ocean.yaw=Math.PI-.4;ocean.pitch=.22;
  ocean.cameraYaw=ocean.yaw;ocean.cameraPitch=ocean.pitch;
  // Treat settling at the inlet as a camera transition. Interpolating from the
  // far side of a pressure vessel otherwise keeps the camera inside its collar.
  ocean.cameraMode='interaction';
}

function syncScreens() {
  const mode=engine.state.mode;
  const changed=mode!==previousMode;
  show('menu-screen',mode==='menu');
  show('hud',mode!=='menu');
  show('pause-screen',mode==='paused'&&!helpOpen&&!biologyOpen&&!mutationOpen&&!chartOpen&&!onboardingOpen);
  show('end-screen',(mode==='dead'||mode==='won')&&!helpOpen&&!biologyOpen&&!mutationOpen&&!chartOpen&&!finaleActive&&!onboardingOpen);
  show('help-screen',helpOpen);
  show('biology-screen',biologyOpen);
  show('mutation-screen',mutationOpen);
  show('chart-screen',chartOpen);
  show('continue-btn',hasSave());
  document.body.dataset.mode=mode;
  if(mode!=='playing')mouseLook?.release();
  if(changed&&(mode==='dead'||mode==='won')) {
    clearInput();
    const won=mode==='won',state=engine.state,parasite=won&&state.ending==='parasite';
    const outcome=won?outcomeFor(state):null;
    text('end-eyebrow',won&&outcome?`${outcome.name} · ${outcome.tag}`:won?'THE OCEAN REMEMBERS':'LIFE RETURNS TO THE SEA');
    text('end-title',won?(parasite?'岛屿开始以你的节奏呼吸。':'让海洋，重新呼吸。'):'生命沉入了深海。');
    text('end-description',won
      ? `${parasite?'你没有撕碎灰屿。人类设施停止排放，海面灯光逐一转向你的神经频率。':'灰屿的排放核心已经沉寂。'} ${outcome?outcome.line:''} ${outcome?outcome.detail:''}`
      : '你的意识消散了，异化的可能仍留在海洋中。每个生命的突变都不同。猎杀与共生会留下不同的账。');
    text('end-stats',`存活 ${minutes(state.time)}　·　等级 ${state.player.level}　·　${parasite?'寄生中继 3 / 3':'终局 吞噬灰屿'}　·　猎杀 ${state.stats.preyKills||0}　·　共生 ${(state.expedition.biofilms?.length||0)+(state.expedition.hostAdaptations?.length||0)+(state.expedition.parasiteNodes?.length||0)}　·　海洋之息 ${state.oceanBalance>0?'+':''}${state.oceanBalance||0}`);
    try{localStorage.removeItem(SAVE_KEY);}catch{}
  }
  previousMode=mode;
  updateCameraLabel();
}

// 本能整合的瞬间：一张卡片告诉玩家"你多了什么、怎么按"。
let revealTimer = 0;
function showInstinctReveal(id) {
  const definition = INSTINCTS.find(entry => entry.id === id);
  const panel = $('instinct-reveal');
  if (!definition || !panel) return;
  text('reveal-name', definition.name);
  text('reveal-detail', definition.summary);
  text('reveal-key', definition.keyLabel);
  const card = panel.querySelector('.reveal-card');
  if (card) {
    card.classList.remove('reveal-in');
    void card.offsetWidth; // 强制回流，让入场动画能重播
    card.classList.add('reveal-in');
  }
  panel.hidden = false;
  panel.classList.remove('fading');
  panel.setAttribute('aria-hidden', 'false');
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    panel.classList.add('fading');
    revealTimer = setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove('fading');
      panel.setAttribute('aria-hidden', 'true');
    }, 430);
  }, 2600);
}

// 海洋之息仪表：以零为中点，向右是共生，向左是猎杀。
// 光有一根条没人看得懂，所以还要有一句人话和一个阈值提示。
let lastBreathBand = '';
function updateBreathHUD(state) {
  const balance = state.oceanBalance || 0;
  text('breath-value', balance > 0 ? `+${balance}` : `${balance}`);
  const half = Math.min(50, Math.abs(balance) / 2);
  const fill = $('breath-fill');
  if (fill) {
    fill.style.left = balance >= 0 ? '50%' : `${50 - half}%`;
    fill.style.width = `${half}%`;
  }
  const panel = $('ocean-breath');
  if (panel) {
    panel.classList.toggle('thriving', balance >= 20);
    panel.classList.toggle('decayed', balance <= -20);
  }
  const band = balance >= 20 ? 'thriving' : balance <= -20 ? 'decayed' : balance > 0 ? 'waking' : balance < 0 ? 'fading' : 'neutral';
  text('breath-state', {
    thriving: '海洋在好转', waking: '海洋略有余温', neutral: '海还是那样',
    fading: '海洋在变冷', decayed: '海洋正在死去',
  }[band]);
  if (band !== lastBreathBand) {
    if (lastBreathBand && (band === 'thriving' || band === 'decayed')) {
      const message = band === 'thriving'
        ? '海洋之息回升：鱼群重新靠近你，灰屿的灯火开始熄灭'
        : '海洋之息跌落：鱼群散开了，海水开始变浑';
      toast(message, band === 'decayed' ? 'danger' : 'info');
    }
    lastBreathBand = band;
  }
}

function updateHUD() {  const state=engine.state,p=state.player,stage=STAGES[state.stage];
  text('stage-name',stage.name);text('stage-subtitle',stage.subtitle);
  const tide=tideAt(state.time);
  text('tide-name',`潮汐日 · ${tideLabel(state.time)}`);
  const tideChip=$('tide-name');
  if(tideChip){tideChip.classList.toggle('night',tide.id==='night');tideChip.classList.toggle('dusk',tide.id==='dusk');}
  text('level-value',String(p.level).padStart(2,'0'));
  const dominant=BRANCHES.reduce((best,b)=>p.branches[b.id]>p.branches[best.id]?b:best,BRANCHES[0]);
  text('form-name',p.level===1?'觉醒的单细胞':p.branches[dominant.id]?dominant.upgrades[p.branches[dominant.id]-1].name:'异化生命');
  text('hp-value',`${Math.ceil(p.hp)} / ${p.maxHp}`);fill('hp-fill',p.hp/p.maxHp);
  text('energy-value',`${Math.floor(p.energy)} / ${p.maxEnergy}`);fill('energy-fill',p.energy/p.maxEnergy);
  text('radiation-value',`${Math.round(p.radiation)}%`);fill('radiation-fill',p.radiation/100);
  text('xp-value',`${Math.floor(p.xp)} / ${p.xpNext}`);fill('xp-fill',p.xp/p.xpNext);
  text('biomass-value',Math.floor(p.biomass));
  text('depth-value',Math.round(depthFor(p.y)));text('time-value',minutes(state.time));
  updateEcologyHUD(state);
  updateMutationHUD(state);
  updateAbyssHUD(state);
  instinctUI?.update(state);
  updateBreathHUD(state);
  for(const branch of BRANCHES)text(`branch-${branch.id}`,`${'●'.repeat(p.branches[branch.id])}${'○'.repeat(4-p.branches[branch.id])}`);
  for(const ability of ['dash','pulse','feed']) {
    const cd=p.cooldowns[ability];
    text(`${ability}-cooldown`,cd>.05?`${cd.toFixed(1)}s`:'');
    const button=document.querySelector(`[data-ability="${ability}"]`);
    if(button){button.classList.toggle('cooling',cd>.05);button.setAttribute('aria-label',`${{dash:'喷射冲刺',pulse:'辐射脉冲',feed:'吞噬牵引'}[ability]} ${cd>.05?'冷却中':'就绪'}`);}
  }
  const boss=state.entities.find(e=>e.type==='boss');
  show('boss-panel',!!boss&&state.mode!=='menu');
  if(boss){
    fill('boss-hp-fill',boss.hp/boss.maxHp);text('boss-hp-value',`${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    const tendrilsLeft=state.entities.filter(entity=>entity.type==='tendril'&&entity.bossId===boss.id).length;
    const cloudsLeft=(boss.clouds||[]).filter(cloud=>cloud.active).length;
    text('boss-phase',boss.motherPhase==='armor'?`外甲 · 撕断触须（${tendrilsLeft} / 3）· 脉冲打不动外甲，靠近撕咬`
      :boss.motherPhase==='spout'?`喷发 · 打散污染云（${cloudsLeft} / 3）· 用脉冲，或按住 C 拟态硬扛`
      :boss.motherPhase==='core'?(boss.coreWindowOpen?'核心张开 · 现在撕咬它，或用冲刺撞击':'核心闭合 · 等它下一次张开')
      :'核心崩解 · 巨兽可以吞没灰屿');
  }
  const dist=boss?Math.round(Math.hypot(p.x-boss.x,p.y-boss.y,p.z-boss.z)):0;
  text('objective-text',boss
    ? boss.weakened
      ? p.apex?`靠近灰屿核心 · 按 E 吞噬岛国 · ${dist} m`:'核心已削弱 · 先发育为巨兽，才能吞没灰屿'
      : boss.motherPhase==='armor'?`排放母体：撕断它的三条触须 · ${dist} m`
      : boss.motherPhase==='spout'?`排放母体：用脉冲打散污染云 · ${dist} m`
      : boss.coreWindowOpen?`排放母体核心张开：现在撕咬它 · ${dist} m`
      : `排放母体核心闭合，等下一次窗口 · ${dist} m`
    : stage.objective);
  updateExpeditionUI(state);
  const activeEcho=state.entities
    .filter(entity=>entity.type==='echo'&&!entity.pacified)
    .map(entity=>({entity,distance:Math.hypot(p.x-entity.x,p.y-entity.y,p.z-entity.z)}))
    .filter(entry=>entry.distance<92)
    .sort((a,b)=>a.distance-b.distance)[0]?.entity||null;
  updateHuntUI(state,activeEcho);
  updateTarget(boss);
  drawRadar(state);
}

const targetMarker=document.createElement('div');
targetMarker.id='world-marker';
targetMarker.setAttribute('aria-hidden','true');
targetMarker.style.cssText='position:fixed;pointer-events:none;transform:translate(-50%,-50%);z-index:4;text-align:center;color:#f0b374;font-size:11px;letter-spacing:1px;text-shadow:0 2px 8px #000;display:none';
document.body.appendChild(targetMarker);
function updateTarget(boss) {
  const state=engine.state,p=state.player,log=state.expedition;
  const interaction=interactionTarget(state);
  const distance=entity=>Math.hypot(p.x-entity.x,p.y-entity.y,p.z-entity.z);
  const nearbyEcho=state.entities
    .filter(entity=>entity.type==='echo'&&!entity.pacified)
    .map(entity=>({entity,distance:distance(entity)}))
    .filter(entry=>entry.distance<72)
    .sort((a,b)=>a.distance-b.distance)[0]?.entity;
  const candidate=nearbyEcho||interaction&&state.entities.find(entity=>entity.id===interaction.entityId);
  if(!candidate&&p.y>=WATER_SURFACE_Y-9) {
    const boat=humanBoatStates(state.world,state.time)
      .map(boat=>({boat,distance:Math.hypot(p.x-boat.x,p.z-boat.z)}))
      .filter(entry=>entry.distance<150)
      .sort((a,b)=>a.distance-b.distance)[0];
    if(boat) {
      const projected=ocean.project(boat.boat);
      if(projected.visible) {
        targetMarker.style.display='block';targetMarker.style.left=`${projected.x}px`;targetMarker.style.top=`${projected.y-56}px`;
        targetMarker.textContent=`${boat.boat.warning?'声呐预警':boat.boat.active?'声呐排放':'巡逻船'} · ${Math.ceil(boat.distance)} m`;
        return;
      }
    }
  }
  const parasiteActive=log.hostAdaptations.includes('diver')&&log.parasiteNodes.length<3;
  const objectives=state.entities.filter(entity=>!entity.dead&&(parasiteActive
    ? entity.type==='islandNode'&&!entity.disabled
    : !log.biofilms.length ? entity.type==='biofilm'&&!entity.depleted
    : !log.hostAdaptations.length ? HOST_TYPES.includes(entity.type)&&(entity.type!=='diver'||p.parasiteCapability)
    : log.shutdowns.length<3 ? entity.type==='echo'&&!entity.pacified&&!log.shutdowns.includes(entity.reactorSiteId)
    : entity.type==='boss'));
  if(!parasiteActive&&log.shutdowns.length<3&&!objectives.some(entity=>entity.type==='echo')) {
    objectives.push(...state.entities.filter(entity=>!entity.dead&&entity.type==='reactor'&&entity.status!=='shutdown'));
  }
  if(!parasiteActive&&log.shutdowns.length<3)objectives.push(...state.entities.filter(entity=>!entity.dead&&entity.type==='bloom'));
  objectives.sort((a,b)=>distance(a)-distance(b));
  const target=candidate||objectives[0]||boss;
  if(!target||state.mode!=='playing'||document.body.classList.contains('hud-hidden')){targetMarker.style.display='none';return;}
  const point=target.type==='boss'||target.type==='bloom'?target:interactionPosition(target);
  const projected=ocean.project(point);
  const name=target.name||SPECIES[target.type]?.name||(target.type==='bloom'?'活性营养羽流':'排放核心');
  const vertical=point.y-p.y;
  const depthHint=Math.abs(vertical)>6?(vertical>0?' · 上方':' · 下方'):'';
  const label=target.type==='bloom'
    ?`E · ${target.phase==='unstable'?'羽流失稳，准备撤离':'活性营养羽流'} · ${Math.ceil(distance(target))} m · ${Math.max(0,Math.ceil(PLANKTON_BLOOM_RULES.lifetime-target.age))}s`
    :candidate===target
      ?target.type==='echo'
        ?`${p.level>=3?'G ·':'◇'} ${name} · ${Math.ceil(distance(target))} m`
        :`${interaction.canAttach?'G ·':'◇'} ${interaction.name} · ${Math.ceil(interaction.distance)} m`
      :`◇ ${name} · ${Math.ceil(distance(target))} m${depthHint}`;
  if(projected.visible) {
    targetMarker.style.display='block';targetMarker.style.left=`${projected.x}px`;targetMarker.style.top=`${projected.y-65}px`;
    targetMarker.textContent=label;
  } else {
    const dx=point.x-p.x,dz=point.z-p.z;
    const worldBearing=Math.atan2(-dx,-dz);
    const relative=Math.atan2(Math.sin(worldBearing-ocean.yaw),Math.cos(worldBearing-ocean.yaw));
    const radius=Math.min(innerWidth*.42,innerHeight*.39);
    const x=Math.max(34,Math.min(innerWidth-34,innerWidth*.5+Math.sin(relative)*radius));
    const y=Math.max(70,Math.min(innerHeight-54,innerHeight*.5-Math.cos(relative)*radius*.82));
    const arrows=['↑','↗','→','↘','↓','↙','←','↖'];
    const arrow=arrows[(Math.round(relative/(Math.PI/4))+8)%8];
    targetMarker.style.display='block';targetMarker.style.left=`${x}px`;targetMarker.style.top=`${y}px`;
    targetMarker.textContent=`${arrow} ${label.replace(/^◇\s*/,'')}`;
  }
}

function drawRadar(state) {
  const canvas=$('radar');if(!canvas||state.mode==='menu')return;
  const range=state.player.senseRadius||32;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,scale=w*.43/range;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(150,200,180,.17)';ctx.lineWidth=1;
  for(const r of [w*.22,w*.44]){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(cx,7);ctx.lineTo(cx,h-7);ctx.moveTo(7,cy);ctx.lineTo(w-7,cy);ctx.stroke();
  ctx.fillStyle='#89aa9c';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('N',cx,10);
  for(const e of state.entities) {
    const landmark=['boss','reactor','biofilm','bloom','diver','echo'].includes(e.type)||e.type==='islandNode'&&state.expedition.hostAdaptations.includes('diver');
    if(!landmark&&Math.hypot(e.x-state.player.x,e.y-state.player.y,e.z-state.player.z)>range)continue;
    let dx=(e.x-state.player.x)*scale,dz=(e.z-state.player.z)*scale;
    const length=Math.hypot(dx,dz);
    if(length>w*.43){if(!landmark)continue;dx*=w*.43/length;dz*=w*.43/length;}
    ctx.fillStyle=SPECIES[e.type]?.color||{isotope:'#e3d87b',vent:'#e3d87b',drone:'#f58f68',boss:'#ffb462'}[e.type]||'#a3cecb';
    if(e.type==='vent'){ctx.strokeStyle='#d9d28c';ctx.strokeRect(cx+dx-3,cy+dz-3,6,6);continue;}
    if(e.type==='reactor'){ctx.strokeStyle=e.status==='shutdown'?'#709f91':e.phase==='discharge'?'#f49c74':'#dab975';ctx.lineWidth=1.5;ctx.strokeRect(cx+dx-4,cy+dz-4,8,8);ctx.lineWidth=1;continue;}
    if(e.type==='biofilm'){ctx.fillStyle=e.depleted?'#507569':'#b0d8bc';ctx.fillRect(cx+dx-2.5,cy+dz-2.5,5,5);continue;}
    if(e.type==='echo'){ctx.strokeStyle=e.pacified?'#52786f':'#f0a675';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx+dx,cy+dz,e.phase==='exposed'?5:4,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;continue;}
    if(e.type==='islandNode'){ctx.strokeStyle=e.disabled?'#6e9b8d':'#76e7d4';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx+dx,cy+dz-3.5);ctx.lineTo(cx+dx+3.3,cy+dz);ctx.lineTo(cx+dx,cy+dz+3.5);ctx.lineTo(cx+dx-3.3,cy+dz);ctx.closePath();ctx.stroke();ctx.lineWidth=1;continue;}
    if(e.type==='diver'){ctx.fillStyle='#d7bd88';ctx.beginPath();ctx.arc(cx+dx,cy+dz,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f4e4ba';ctx.beginPath();ctx.arc(cx+dx,cy+dz,5,0,Math.PI*2);ctx.stroke();continue;}
    if(e.type==='bloom'){ctx.fillStyle=e.phase==='unstable'?'#ed9b66':'#76c8b3';ctx.beginPath();ctx.arc(cx+dx,cy+dz,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b9ead6';ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(cx+dx,cy+dz,9,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;continue;}
    if(e.variant&&e.variant!=='normal'){ctx.fillStyle='#cda68f';ctx.beginPath();ctx.moveTo(cx+dx,cy+dz-3.2);ctx.lineTo(cx+dx-2.8,cy+dz+2.4);ctx.lineTo(cx+dx+2.8,cy+dz+2.4);ctx.closePath();ctx.fill();continue;}
    ctx.beginPath();ctx.arc(cx+dx,cy+dz,e.type==='boss'?4:e.type==='whale'?4.5:['shark','squid'].includes(e.type)?3.2:['food','marineSnow'].includes(e.type)?1.2:2.2,0,Math.PI*2);ctx.fill();
  }
  for(const boat of humanBoatStates(state.world,state.time)) {
    let dx=(boat.x-state.player.x)*scale,dz=(boat.z-state.player.z)*scale;
    const length=Math.hypot(dx,dz)||1;if(length>w*.43){dx*=w*.43/length;dz*=w*.43/length;}
    ctx.save();ctx.translate(cx+dx,cy+dz);ctx.rotate(-boat.heading);
    ctx.fillStyle=boat.warning?'#ffb46d':boat.active?'#ffd68d':'#a8c8bf';
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3.5,3);ctx.lineTo(-3.5,3);ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-ocean.yaw);
  ctx.fillStyle='#d9fbb1';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3.5,4);ctx.lineTo(0,2);ctx.lineTo(-3.5,4);ctx.closePath();ctx.fill();ctx.restore();
}

function events() {
  for(const event of engine.drainEvents()) {
    const p=engine.state.player;
    if(['pulse','feed','dash','bossPulse'].includes(event.type)) {
      ocean.effect(event.type==='bossPulse'?'pulse':event.type,event,event.type==='bossPulse'?0xf8a45f:event.type==='pulse'?0xd5f779:0x81e7d5,event.dir||null);
      if(event.type!=='bossPulse')sound(event.type==='pulse'?90:230,.3,event.type==='pulse'?'triangle':'sine',.05);
    }
    // 本能相关：解锁是这个游戏最重要的正反馈，必须被看见、被听见。
    if(event.type==='instinctUnlocked') {
      instinctUI?.flash(event.id);
      ocean.effect('pulse',{x:p.x,y:p.y,z:p.z},Number.parseInt((event.color||'#b9ef98').slice(1),16));
      sound(520,.5,'sine',.05);
      setTimeout(()=>sound(780,.45,'sine',.04),110);
      showInstinctReveal(event.id);
    }
    if(event.type==='instinctFailed')toast(event.text);
    if(event.type==='echoResist'){toast(event.text,'danger');sound(150,.25,'square',.03);}
    if(event.type==='huntWindow'){toast(event.text,'success');sound(760,.18,'triangle',.03);}
    if(event.type==='fieldNote'){toast(event.text,'info');sound(680,.4,'sine',.038);}
    if(event.type==='tideChanged'){toast(event.text,'info');sound(420,.3,'sine',.026);}
    if(event.type==='tendrilSevered'){sound(190,.5,'triangle',.055);ocean.effect('pulse',event,0xff9d7a);ocean.shake?.(.45);}
    if(event.type==='tendrilDamage')sound(150,.12,'square',.028);
    if(event.type==='tendrilWindup')sound(320,.3,'triangle',.035);
    if(event.type==='motherSpout'){sound(96,.7,'triangle',.05);ocean.shake?.(.3);}
    if(event.type==='cloudDispersed')sound(600,.3,'sine',.035);
    if(event.type==='coreOpen'){sound(520,.5,'sine',.045);ocean.effect('pulse',event,0xffb26a);}
    if(event.type==='coreSealed')sound(200,.35,'triangle',.03);
    if(event.type==='motherPhase'){sound(70,.9,'triangle',.06);ocean.shake?.(.6);toast(event.text,'danger');}
    if(event.type==='motherDefeated'){sound(55,1.8,'triangle',.08);ocean.shake?.(1);toast(event.text,'danger');}
    if(event.type==='motherArmor')sound(140,.2,'square',.022);
    if(event.type==='biteWindup')sound(150,.1,'triangle',.03);
    if(event.type==='bite') {
      sound(event.hits?120:210,.18,event.hits?'triangle':'sine',event.hits?.05:.025);
      if(event.hits)ocean.effect('bite',event,0xff9d7a,event.dir);
    }
    if(event.type==='mimicStart')sound(300,.4,'sine',.022);
    if(event.type==='mimicEnd')sound(240,.24,'sine',.015);
    if(event.type==='scanStart')sound(660,.3,'sine',.022);
    if(event.type==='scanEnd')sound(420,.18,'sine',.012);
    if(event.type==='jet') {
      ocean.effect('dash',event,0x7fe0c0);
      sound(70,.4,'triangle',.05);
    }
    if(event.type==='dashImpact'||event.type==='jetImpact') {
      ocean.effect('feed',event,event.type==='dashImpact'?0xffba8a:0x7fe0c0);
      sound(96,.2,'triangle',.045);
      ocean.shake?.(event.type==='dashImpact'?.5:.32);
    }
    if(event.type==='eat') {
      if(performance.now()-lastSound>100){sound(event.kind==='isotope'?780:520,.07,'sine',.025);lastSound=performance.now();}
    }
    if(event.type==='humanDevoured') {
      ocean.consumeNearestHuman(p);
      ocean.effect('pulse',event,0xe1a36d);
      sound(92,.34,'triangle',.055);
    }
    if(event.type==='damage') {
      document.body.classList.add('damaged');clearTimeout(toastTimeout);
      toastTimeout=setTimeout(()=>document.body.classList.remove('damaged'),260);
    }
    if(['stage','evolution','mutation','boss','start','restore','discovery','encounter','dietBlocked','physiology','nutritionWarning','assimilation','coreWeakened'].includes(event.type))toast(event.text,['boss','nutritionWarning','coreWeakened'].includes(event.type)?'danger':'info');
    if(event.type==='mutationOutcome'&&event.outcome!=='mutation')toast(event.text||'本次辐射适应没有形成新结构。');
    if(event.type==='mutation')ocean.effect('pulse',p,0xadebca);
    if(['interaction','attach','detach','biofilmComplete','hostAdaptation','parasiteNode','reactorShutdown','coreUnsealed','reactorWarning','sonarWarning','sonarPulse','wakeCatch','schoolCover','wildlifeMutation','bloomSpawn','bloomFeed','bloomWarning','bloomBurst','parasiteAwakened','humanDevoured','echoDiscovery','echoCharge','echoExposed','echoDisrupt','echoPacified'].includes(event.type))toast(event.text,['reactorWarning','sonarWarning','sonarPulse','bloomBurst','bloomWarning','humanDevoured','echoCharge','echoExposed'].includes(event.type)?'danger':'info');
    if(event.type==='attach') {
      sound(260,.16,'sine',.03);
      if(event.kind==='reactor')frameReactorInteraction();
    }
    if(event.type==='detach')sound(145,.12,'sine',.025);
    if(event.type==='reactorWarning')sound(78,.65,'triangle',.06);
    if(event.type==='sonarWarning'){ocean.effect('pulse',event,0xffc477);sound(620,.24,'sine',.035);}
    if(event.type==='sonarPulse'){ocean.effect('pulse',event,0xffbd72);sound(46,.8,'sine',.075);}
    if(event.type==='echoCharge'){ocean.effect('pulse',event,0xe29064);sound(84,.55,'triangle',.055);}
    if(event.type==='echoExposed'){ocean.effect('pulse',event,0xcfe5a0);sound(680,.32,'sine',.038);}
    if(event.type==='echoDisrupt'){ocean.effect('feed',event,0xa8e6cd);sound(350,.22,'triangle',.035);}
    if(event.type==='echoPacified'){ocean.effect('pulse',event,0xdaf2b6);sound(160,.9,'sine',.06);}
    if(event.type==='bloomFeed'){ocean.effect('feed',event,0x7bd6bd);sound(420,.28,'sine',.025);}
    if(event.type==='bloomWarning'){ocean.effect('pulse',event,0xe79a60);sound(118,.55,'triangle',.045);}
    if(event.type==='bloomBurst'){ocean.effect('pulse',event,0xf0a269);sound(62,.8,'triangle',.065);}
    if(event.type==='parasiteAwakened'){ocean.effect('pulse',p,0xd9b38c);sound(700,.7,'sine',.045);}
    if(event.type==='wakeCatch')sound(190,.35,'sine',.025);
    if(event.type==='schoolCover')sound(340,.22,'sine',.018);
    if(['biofilmComplete','hostAdaptation','reactorShutdown'].includes(event.type)) {
      const target=engine.state.entities.find(entity=>entity.id===event.entityId);
      ocean.effect('pulse',target||p,event.type==='reactorShutdown'?0x82c5b3:0xb9d6a5);
      sound(event.type==='reactorShutdown'?110:620,.65,'sine',.05);
    }
    if(['evolution','mutationOutcome','attach','detach','milestone','reactorShutdown','coreUnsealed','bloomBurst','parasiteAwakened','echoPacified','instinctUnlocked'].includes(event.type))save();
    if(event.type==='level')sound(800,.4,'sine',.045);
    if(event.type==='kill'){ocean.effect('eat',event.x!==undefined?event:p,0xffba8a);sound(140,.14,'triangle');}
    if(event.type==='islandDevoured') {
      const outcome=outcomeFor(engine.state);
      $('finale-caption').textContent=outcome.id==='ruined'?'海水开始变黑。那是你。':outcome.id==='restored'?'灰屿沉入深海，海水重新变蓝。':'灰屿正在沉入巨兽腹中';
      finaleActive=true;
      const token=++finaleToken;
      document.body.classList.add('finale-active');
      ocean.beginFinale(engine.state);
      clearInput();
      sound(55,2.8,'triangle',.08);
      setTimeout(()=>{
        if(token!==finaleToken)return;
        finaleActive=false;
        document.body.classList.remove('finale-active');
        syncScreens();
      },5900);
    }
    if(event.type==='parasiteNetwork') {
      $('finale-caption').textContent='灰屿的控制权，正在转向新的生命';
      finaleActive=true;
      const token=++finaleToken;
      document.body.classList.add('finale-active');
      ocean.beginParasiteFinale(engine.state);
      clearInput();
      sound(880,1.8,'sine',.045);
      setTimeout(()=>{
        if(token!==finaleToken)return;
        finaleActive=false;
        document.body.classList.remove('finale-active');
        syncScreens();
      },5900);
    }
    if(event.type==='win')ocean.effect('pulse',p,0xffffff);
  }
}

function getInput() {
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')||touches.has('forward')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')||touches.has('back')?1:0);
  const side=(keys.has('KeyD')||keys.has('ArrowRight')||touches.has('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||touches.has('left')?1:0);
  const vertical=(keys.has('KeyR')||touches.has('up')?1:0)-(keys.has('KeyF')||touches.has('down')?1:0);
  const aim=Math.cos(ocean.pitch);
  // 相机前向：撕咬、脉冲扇形、喷射突进都以它为准，与移动方向共用同一套公式。
  const dir={x:-Math.sin(ocean.yaw)*aim,y:-Math.sin(ocean.pitch),z:-Math.cos(ocean.yaw)*aim};
  // 按住型技能从常驻按键集合读取，不能走一次性 abilities，否则第一个子步后就会失效。
  const input={x:-Math.sin(ocean.yaw)*aim*forward+Math.cos(ocean.yaw)*side,y:vertical-Math.sin(ocean.pitch)*forward,z:-Math.cos(ocean.yaw)*aim*forward-Math.sin(ocean.yaw)*side,dir,mimic:keys.has('KeyC'),scan:keys.has('KeyX'),...abilities};
  abilities.dash=abilities.pulse=abilities.feed=abilities.interact=abilities.bite=abilities.jet=false;
  return input;
}

function loop(now) {
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  const renderState=frameStepper.advance(dt,engine,getInput);
  events();
  if(previousMode!==engine.state.mode)syncScreens();
  ocean.update(dt,renderState,engine.state.mode==='menu');
  if(++frameCount%3===0){updateHUD();updateWaterSound();}
  if(engine.state.mode==='playing') {
    saveElapsed+=dt;
    if(saveElapsed>=8){saveElapsed=0;save();}
  }
  requestAnimationFrame(loop);
}

try {
  ocean=new OceanScene($('scene-container'));
  ocean.quality(settings.quality);ocean.firstPerson=Boolean(settings.firstPerson);
  ocean.reducedMotion=Boolean(settings.reducedMotion);
  onboarding=mountOnboarding({onFinish:closeOnboarding});
  mountExpeditionUI(document.body,{onInteract:()=>{if(engine.state.mode==='playing')abilities.interact=true;}});
  mountHuntUI(document.body);
  // 技能条与原有技能条并排。按住型技能在按钮上是"切换"，键盘上仍是按住。
  instinctUI=mountInstinctUI($('abilities'),{onActivate:(id)=>{
    if(engine.state.mode!=='playing')return;
    if(id==='bite')abilities.bite=true;
    else if(id==='jet')abilities.jet=true;
    else if(id==='mimic'){keys.has('KeyC')?keys.delete('KeyC'):keys.add('KeyC');}
    else if(id==='sense'){keys.has('KeyX')?keys.delete('KeyX'):keys.add('KeyX');}
  }});
  mountAbyssUI({onMap:toggleChart});
  $('mouse-sensitivity').value=settings.mouseSensitivity;
  text('sensitivity-value',`${settings.mouseSensitivity.toFixed(1)}×`);
  $('invert-y').checked=Boolean(settings.invertY);
  $('reduced-motion').checked=Boolean(settings.reducedMotion);
  $('mouse-sensitivity').addEventListener('input',event=>{settings.mouseSensitivity=Number(event.target.value);text('sensitivity-value',`${settings.mouseSensitivity.toFixed(1)}×`);storeSettings();});
  $('invert-y').addEventListener('change',event=>{settings.invertY=event.target.checked;storeSettings();});
  $('reduced-motion').addEventListener('change',event=>{settings.reducedMotion=event.target.checked;ocean.reducedMotion=settings.reducedMotion;storeSettings();});
  soundEnabled=Boolean(settings.sound);
  $('quality-select').value=settings.quality;
  $('quality-select').addEventListener('change',event=>{settings.quality=event.target.value;ocean.quality(settings.quality);storeSettings();});
  show('loading-label',false);
  bind('start-btn',newRun);bind('continue-btn',continueRun);
  bind('pause-btn',pause);bind('resume-btn',pause);bind('save-btn',()=>save(true));
  bind('restart-btn',newRun);bind('retry-btn',newRun);bind('menu-btn',menu);bind('end-menu-btn',menu);
  bind('camera-btn',toggleCamera);bind('help-btn',openHelp);bind('help-close-btn',closeHelp);
  bind('tutorial-btn',()=>openOnboarding(false));
  const biologyButton=document.createElement('button');
  biologyButton.id='biology-btn';biologyButton.className='utility-button';biologyButton.textContent='B · 生命图鉴';
  biologyButton.title='观察物种、身体结构和海洋食物网';
  document.querySelector('.hud-utility').prepend(biologyButton);
  bind('biology-btn',openBiology);bind('biology-close-btn',closeBiology);
  bind('mutation-btn',openMutations);bind('mutation-close-btn',closeMutations);
  document.querySelectorAll('[data-open-biology]').forEach(el=>el.addEventListener('click',openBiology));
  document.querySelectorAll('[data-codex-tab]').forEach(el=>el.addEventListener('click',()=>{
    codexTab=el.dataset.codexTab;
    document.querySelectorAll('[data-codex-tab]').forEach(button=>{const active=button===el;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    renderCodex($('biology-content'),engine.state,codexTab);
  }));
  bind('sound-btn',()=>{soundEnabled=!soundEnabled;settings.sound=soundEnabled;storeSettings();updateAudio();});
  // A second guide button is useful when the menu and HUD have separate entry points.
  document.querySelectorAll('[data-open-help]').forEach(el=>el.addEventListener('click',openHelp));
  document.querySelectorAll('[data-ability]').forEach(el=>el.addEventListener('click',()=>{abilities[el.dataset.ability]=true;}));
  document.querySelectorAll('[data-move]').forEach(el=>{
    el.addEventListener('pointerdown',event=>{event.preventDefault();el.setPointerCapture(event.pointerId);touches.add(el.dataset.move);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,()=>touches.delete(el.dataset.move));
  });
  window.addEventListener('keydown',event=>{
    if(onboardingOpen)return;
    if(mutationOpen&&event.code==='Tab') {
      const controls=[...$('mutation-screen').querySelectorAll('button:not(:disabled)')];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      return;
    }
    if(event.repeat)return;
    if(event.code==='Escape'&&performance.now()<ignoreEscapeUntil)return;
    if(event.code==='Escape'||event.code==='KeyP'){pause();return;}
    if(event.target instanceof HTMLSelectElement||event.target instanceof HTMLInputElement)return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
    if(event.code==='KeyB'){biologyOpen?closeBiology():openBiology();return;}
    if(event.code==='KeyM'){mutationOpen?closeMutations():openMutations();return;}
    if(event.code==='KeyJ'&&engine.state.mode!=='menu'){toggleChart();return;}
    if(event.code==='KeyV'&&engine.state.mode!=='menu'){toggleCamera();return;}
    if(event.code==='KeyH'&&engine.state.mode==='playing'){document.body.classList.toggle('hud-hidden');return;}
    if(engine.state.mode!=='playing')return;
    keys.add(event.code);
    if(event.code==='Space')abilities.dash=true;
    if(event.code==='KeyQ')abilities.pulse=true;
    if(event.code==='KeyE')abilities.feed=true;
    if(event.code==='KeyG')abilities.interact=true;
    if(event.code==='KeyZ')abilities.jet=true;
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  const canvas=ocean.renderer.domElement;
  mouseLook=createMouseLook(canvas,{
    isPlaying:()=>engine.state.mode==='playing',
    turn:(dx,dy)=>{
      const sensitivity=.0024*settings.mouseSensitivity;
      ocean.yaw-=dx*sensitivity;
      ocean.pitch=Math.max(-1.35,Math.min(1.35,ocean.pitch+dy*sensitivity*(settings.invertY?-1:1)));
    },
    onAttack:()=>{ if(engine.state.mode==='playing')abilities.bite=true; },
    onUnlock:()=>{ignoreEscapeUntil=performance.now()+160;pause();},
    onState:locked=>{
      document.body.classList.toggle('mouse-locked',locked);
      text('mouse-look-status',locked?'鼠标已锁定 · ESC 释放并暂停':'移动鼠标环视 · 点击海面锁定');
    },
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){clearInput();if(engine.state.mode==='playing'){engine.togglePause();syncScreens();}save();if(audioContext?.state==='running')audioContext.suspend();}
    else if(soundEnabled&&audioContext?.state==='suspended')audioContext.resume();
  });
  window.addEventListener('blur',()=>{clearInput();if(engine.state.mode==='playing'){engine.togglePause();syncScreens();save();}});
  window.addEventListener('pagehide',()=>save());
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(engine.state.mode==='playing')pause();save();show('error-banner',true);text('error-banner','图形连接中断。进度已保存，请刷新页面后继续。');});
  syncScreens();updateHUD();text('sound-btn',soundEnabled?'声音 · 开':'声音 · 关');
  requestAnimationFrame(loop);
} catch(error) {
  console.error(error);
  show('error-banner',true);text('error-banner','无法启动 3D 场景。请用最新版 Chrome 或 Edge，并开启浏览器的硬件加速。');
  text('loading-label','3D 场景初始化失败');
  if($('start-btn'))$('start-btn').disabled=true;
}
