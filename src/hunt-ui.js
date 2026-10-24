import { ECHO_PHASE_LABELS, ECHO_RESIST, ECHO_STRATEGY } from './echo-system.js';

let mounted=null;

const phaseHints={
  stalk:'贴近并观察外壳；此时连接最稳定。',
  charge:'污染脉冲正在蓄积：拉开距离，或按 Space 冲刺。',
  exposed:'外壳张开：Q 脉冲或贴近按 G 撕裂共振。',
  recovery:'共振正在回填；继续追击，别让它远离反应堆。',
  pacified:'连接已经切断，反应堆入口重新暴露。',
};

const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
const width=(node,value)=>{if(node)node.style.width=`${Math.max(0,Math.min(1,value))*100}%`;};

export function huntPresentation(echo) {
  if(!echo)return null;
  const ratio=Math.max(0,Math.min(1,Number(echo.hp)/Math.max(1,Number(echo.maxHp)||140)));
  // 这只回声体的"钥匙"：用错工具几乎打不动，用对工具才作数。
  const strategy=ECHO_STRATEGY[ECHO_RESIST[echo.echoKind]?.needs]||null;
  const revealed=Boolean(echo.revealedUntil&&echo.revealedUntil>0);
  const precisionHits=Math.max(0,Number(echo.precisionHits)||0),forceHits=Math.max(0,Number(echo.forceHits)||0);
  const hits=precisionHits+forceHits;
  const precision=hits?precisionHits/hits:0;
  return {
    id:echo.id,
    name:echo.name||'异变回声体',
    role:echo.role||'反应堆共生体',
    phase:echo.phase||'stalk',
    phaseLabel:ECHO_PHASE_LABELS[echo.phase]||'追踪猎物',
    hint:`${phaseHints[echo.phase]||phaseHints.stalk}${strategy?` ${strategy.hint}`:''}`,
    strategy:strategy?strategy.label:'',
    strategyKey:strategy?ECHO_RESIST[echo.echoKind].needs:'',
    revealed,
    resolve:ratio,
    link:Math.max(0,Math.min(1,Number(echo.link)||0)),
    exposed:echo.phase==='exposed',
    charging:echo.phase==='charge',
    pacified:Boolean(echo.pacified),
    finisher:ratio<=.32&&!echo.pacified,
    precision,
    potentialGrade:1+(precision>=.6?1:0),
  };
}

export function mountHuntUI(host=document.body){
  const hud=host?.id==='hud'?host:host?.querySelector?.('#hud');
  if(!hud)return null;
  if(mounted?.hud===hud)return mounted;
  const panel=document.createElement('section');
  panel.id='echo-hunt-panel';panel.className='echo-hunt-panel';panel.hidden=true;
  panel.setAttribute('aria-label','异变回声追猎状态');
  panel.innerHTML=`<header><div><small>ABERRANT ECHO / 异变回声</small><strong id="echo-hunt-name"></strong></div><span id="echo-hunt-phase"></span></header><p id="echo-hunt-role"></p><div class="echo-hunt-meter"><span>共振稳定</span><div><i id="echo-hunt-resolve"></i></div><b id="echo-hunt-resolve-value"></b></div><div class="echo-hunt-meter link"><span>反应堆连接</span><div><i id="echo-hunt-link"></i></div><b id="echo-hunt-link-value"></b></div><p id="echo-hunt-hint" class="echo-hunt-hint"></p><footer><span><kbd>Q</kbd> 脉冲</span><span><kbd>G</kbd> 撕链</span><span><kbd>E</kbd> 吞噬弱点</span><span><kbd>SPACE</kbd> 规避</span><b id="echo-hunt-discovery"></b></footer>`;
  hud.append(panel);
  const find=id=>panel.querySelector(`#${id}`);
  mounted={
    hud,panel,
    name:find('echo-hunt-name'),phase:find('echo-hunt-phase'),role:find('echo-hunt-role'),
    resolve:find('echo-hunt-resolve'),resolveValue:find('echo-hunt-resolve-value'),
    link:find('echo-hunt-link'),linkValue:find('echo-hunt-link-value'),
    hint:find('echo-hunt-hint'),discovery:find('echo-hunt-discovery'),
  };
  return mounted;
}

export function updateHuntUI(state,echo){
  if(!mounted)return null;
  const presentation=echo?huntPresentation(echo):null;
  mounted.panel.hidden=!presentation||state?.mode==='menu';
  if(!presentation)return null;
  const discoveries=state?.expedition?.echoEncounters?.length||0;
  text(mounted.name,presentation.name);
  text(mounted.phase,presentation.phaseLabel);
  text(mounted.role,presentation.strategy?`${presentation.role} · 钥匙：${presentation.strategy}${presentation.revealed?' · 真身已现':''}`:presentation.role);
  text(mounted.resolveValue,`${Math.ceil(presentation.resolve*100)}%`);
  text(mounted.linkValue,`${Math.ceil(presentation.link*100)}%`);
  text(mounted.hint,presentation.hint);
  text(mounted.discovery,`已感知 ${discoveries} / 3 · 评级潜力 ${presentation.potentialGrade} / 3`);
  width(mounted.resolve,presentation.resolve);
  width(mounted.link,presentation.link);
  mounted.panel.dataset.phase=presentation.phase;
  mounted.panel.classList.toggle('exposed',presentation.exposed);
  mounted.panel.classList.toggle('charging',presentation.charging);
  mounted.panel.classList.toggle('finisher',presentation.finisher);
  return presentation;
}

export function resetHuntUI(){
  if(!mounted)return;
  mounted.panel.hidden=true;
  mounted.panel.removeAttribute('data-phase');
}
