export const onboardingSteps=Object.freeze([
  Object.freeze({
    id:'feeding',
    kicker:'01 / 营养',
    title:'先活下来，再改变海洋。',
    detail:'你出生时只有一枚细胞；镜头是为了观察而贴近，鱼、舰船和排污管在真实尺度上都远大于你。周围可见细菌、硅藻、纤毛虫、多细胞群与下沉海洋雪。浅色有机碎屑和菌膜提供营养，按 <kbd>E</kbd> 牵引附近碎屑；黄色同位素不是食物。普通摄食维持身体运转，不会直接兑换等级。开阔海面是活动上限；只有贴近浅岸坡并保持在水表附近才能登岛。',
  }),
  Object.freeze({
    id:'instincts',
    kicker:'02 / 本能',
    title:'你的操作是随机抵达的，但会用得很重。',
    detail:'身体会随机长出器官，而器官对应着真正的操作：<kbd>撕咬</kbd>（左键）朝向前方重创单体并打断蓄力，<kbd>喷射突进</kbd>（<kbd>Z</kbd>）撞开沿途的生物，<kbd>辐射脉冲</kbd>（<kbd>Q</kbd>）放出定向扇形并击退致晕，按住 <kbd>C</kbd> <b>拟态</b>收敛发光让捕食者锁定不到你，按住 <kbd>X</kbd> <b>感电扫描</b>看见周围生命的轮廓。你永远不能指定它们，但可以决定去哪里猎什么 —— 想拿到撕咬，就去抓甲壳类。',
  }),
  Object.freeze({
    id:'radiation',
    kicker:'03 / 辐射',
    title:'辐射会伤你，也会重塑你。',
    detail:'吞入同位素、靠近正在排放的反应堆，都会提高辐射负荷。负荷增强 <kbd>Q</kbd> 辐射脉冲，但超过耐受会持续掉血。剂量堆到临界会进入<b>暴走</b>：伤害提升，同时生命加速流失，直到组织重构把辐射释放掉 —— 主动去污染区刷异变能，还是及时撤出，这是你的选择。每积累 32 点异变能，身体自动发生一次随机响应。移动中的活性营养羽流可连续滤食：青绿色外壳补充营养，橙色核心会加速异变；失稳前撤离。',
  }),
  Object.freeze({
    id:'evolution',
    kicker:'04 / 随机发育',
    title:'没有进化菜单。',
    detail:'首次消化菌膜、完成宿主迁移、停机反应堆或接管神经中继，会推动身体发育。具体器官、路线与能力由系统概率决定；出生后便无法指定下一形态。寄生也是概率性状：少数个体出生便带寄生原基，其余个体必须等待后期随机异变解锁。贴近鱼群并保持不发光可暂时融入鱼群，让大型捕食者更难锁定。',
  }),
  Object.freeze({
    id:'echoes',
    kicker:'05 / 异变回声',
    title:'反应堆不是按钮，它们在捕食。',
    detail:'每座活跃反应堆都由一种异变回声体供给共振：折脊回声体会冲锋，诱光群落会用假光贴近你，压力蠕冠会在水层间潜行。先观察它们开壳的短暂窗口，按 <kbd>Q</kbd> 脉冲或贴近后按 <kbd>G</kbd> 切断连接；残余共振很低时靠近按 <kbd>E</kbd> 可直接吞下核心。只在开壳窗口命中并快速结束追猎，会得到更高的 1–3 级异变收益；离开太远，连接会重新生长。',
  }),
  Object.freeze({
    id:'mother',
    kicker:'06 / 排放母体',
    title:'最后一关不是一块靶子。',
    detail:'灰屿的排放母体有三层：外甲上长着三条触须，要用<b>撕咬</b>一条条切下来；断掉之后它开始喷发污染云，用<b>脉冲</b>打散云团，或者按住 <kbd>C</kbd> 拟态硬扛灼烧；最后核心只在张开的几秒里露出来，趁窗口撕咬它，或者用冲刺撞击。母体死了，灰屿的排放结构才暴露出来。',
  }),
  Object.freeze({
    id:'endings',
    kicker:'07 / 三种收束',
    title:'灰屿只有一种污染，却有不止一种结局。',
    detail:'巨兽路线：停掉三座反应堆，削弱母体，成为 Lv.11 巨兽后靠近按 <kbd>E</kbd> 吞岛。寄生路线只对拥有寄生原基的个体开放：游到表层，找到灰屿的人类取样潜水员，按 <kbd>G</kbd> 附着并完成适应，再感染港口泵站、海面实验舱和通信继电器。但真正决定结局的是你这一路的账：左上角的<b>海洋之息</b>记着你的猎杀与共生 —— 走共生路线它会变宽，走捕食路线它会变窄，海水也会跟着变浑。共潮、灰烬、深渊之宴，由你的行为决定，不由菜单决定。',
  }),
]);

export function nextStepIndex(index,delta=1){
  const current=Number.isInteger(index)?index:0;
  return Math.max(0,Math.min(onboardingSteps.length-1,current+delta));
}

export function mountOnboarding({root=document.body,onFinish=()=>{}}={}) {
  const host=root?.body || root;
  const section=document.createElement('section');
  section.id='onboarding-screen';
  section.className='onboarding-screen';
  section.hidden=true;
  section.setAttribute('role','dialog');
  section.setAttribute('aria-modal','false');
  section.setAttribute('aria-labelledby','onboarding-title');
  section.innerHTML=`<div class="onboarding-backdrop" aria-hidden="true"></div>
    <article class="onboarding-card">
      <header class="onboarding-header"><span>INHERITED MEMORY / 初始本能</span><button id="onboarding-skip" type="button" class="onboarding-skip">跳过说明</button></header>
      <div class="onboarding-index" aria-label="教学步骤"><span id="onboarding-kicker"></span><div id="onboarding-dots"></div></div>
      <h2 id="onboarding-title"></h2>
      <p id="onboarding-detail"></p>
      <footer class="onboarding-actions"><span id="onboarding-step-value"></span><button id="onboarding-next" type="button" class="onboarding-next"><span></span><b>→</b></button></footer>
    </article>`;
  host.appendChild(section);
  const kicker=section.querySelector('#onboarding-kicker'),title=section.querySelector('#onboarding-title'),detail=section.querySelector('#onboarding-detail'),dots=section.querySelector('#onboarding-dots'),stepValue=section.querySelector('#onboarding-step-value'),next=section.querySelector('#onboarding-next'),skip=section.querySelector('#onboarding-skip');
  let index=0,finishPending=false;
  const render=()=>{
    const step=onboardingSteps[index];
    kicker.textContent=step.kicker;title.textContent=step.title;detail.innerHTML=step.detail;
    stepValue.textContent=`${index+1} / ${onboardingSteps.length}`;
    dots.replaceChildren(...onboardingSteps.map((_,dotIndex)=>{const dot=document.createElement('i');dot.className=dotIndex===index?'active':'';return dot;}));
    next.querySelector('span').textContent=index===onboardingSteps.length-1?'进入海域':'继续';
    next.querySelector('b').textContent=index===onboardingSteps.length-1?'↗':'→';
  };
  const open=()=>{
    index=0;finishPending=false;render();section.hidden=false;document.body.classList.add('onboarding-active');
    next.focus({preventScroll:true});
  };
  const close=()=>{
    if(section.hidden)return;
    section.hidden=true;document.body.classList.remove('onboarding-active');
    if(!finishPending){finishPending=true;onFinish();}
  };
  const advance=()=>{
    if(index>=onboardingSteps.length-1)close();
    else{index=nextStepIndex(index,1);render();next.focus({preventScroll:true});}
  };
  next.addEventListener('click',advance);skip.addEventListener('click',close);
  section.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key==='ArrowRight'){event.preventDefault();advance();}
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  });
  return {open,close,isOpen:()=>!section.hidden};
}
