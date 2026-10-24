// Gameplay uses a compressed ocean and magnifies microscopic organisms for readability.
// These are ecological constraints and fictional body plans, not a phylogenetic simulation.
export const LIFE_STAGES = [
  {
    id:'cell', name:'单细胞生命', minLevel:1, sizeLabel:'微米级 · 观察放大',
    summary:'一个细胞承担全部生命活动。细胞膜交换物质，食物泡消化小颗粒，鞭毛推动身体。',
    locomotion:'鞭毛摆动：惯性小，转向灵活，但持续游动消耗储能。',
    feeding:'吞噬浮游颗粒与海洋雪；不能吞食鱼类和水母。',
    tradeoff:'体积不能无限增长：膜表面积相对不足，会限制物质交换。下一阶段通过细胞分工突破限制。',
    organs:['细胞膜','细胞核','食物泡','鞭毛'],
  },
  {
    id:'colony', name:'协作细胞群', minLevel:3, sizeLabel:'毫米级 · 观察放大',
    summary:'复制后的细胞保持黏附，形成协作群体。外围细胞负责运动与防护，内部细胞处理营养。',
    locomotion:'协同纤毛：推进更稳定，身体变大后转向开始变慢。',
    feeding:'通过纤毛形成水流，集中颗粒食物；仍不能整吞大型动物。',
    tradeoff:'细胞分工改善交换效率，但更多细胞需要更多食物。尚未形成真正的消化腔和口器。',
    organs:['黏附连接','外围运动细胞','营养细胞','协调信号'],
  },
  {
    id:'larva', name:'多细胞幼体', minLevel:5, sizeLabel:'厘米级 · 观察放大',
    summary:'形成连续的外层组织、消化腔和收缩组织，开始拥有不同于细胞群的整体身体结构。',
    locomotion:'肌肉收缩与鳍褶：可以主动追捕，但加速与转弯需要时间。',
    feeding:'开始捕食小鱼与水母；必须先削弱猎物，不能隔空吞噬完整大生物。',
    tradeoff:'更强的运动与消化带来更高的代谢需求；鲨鱼和鱿鱼开始将你识别为猎物。',
    organs:['外层组织','消化腔','收缩组织','感觉细胞'],
  },
  {
    id:'organism', name:'分化异化体', minLevel:7, sizeLabel:'米级 · 异化设定',
    summary:'摄食、呼吸和运动组织进一步分化。异常基因表达塑造出适合深海捕猎的完整躯体。',
    locomotion:'鳍与肌肉推进：高速但转向较慢，需要预判捕食者的路线。',
    feeding:'可挑战鲨鱼和鱿鱼；分化的摄食器官支持更大的猎物。',
    tradeoff:'庞大身体持续消耗营养。强大不代表不需要进食，辐射也不能代替有机物。',
    organs:['摄食口器','消化通道','呼吸褶皱','运动鳍'],
  },
];

export const WATER_SURFACE_Y = 53.3;
export const PLAYER_MAX_Y = WATER_SURFACE_Y - .25;

export const SPECIES = {
  food: {name:'微型浮游生物',role:'食物网基础',diet:'微小颗粒与溶解营养',description:'包含不同营养方式的微型浮游生物。对初生生命而言，它们是主要的有机物来源。',color:'#a5d99b',minY:9,maxY:50,radius:.48,minPlayerLevel:1,nutrition:9,prey:[]},
  marineSnow: {name:'海洋雪',role:'下沉有机碎屑',diet:'不适用 · 非生物',description:'上层海洋产生的有机碎屑缓慢下沉，最终沉积在起伏的海床上，为深海及底栖动物提供食物。本作将其放大显示。',color:'#bfd4de',minY:-3,maxY:39,radius:.4,minPlayerLevel:1,nutrition:7,prey:[]},
  predator: {name:'异化原生生物',role:'微型捕食者',diet:'微型浮游生物',description:'借助细胞表面与摄食结构捕食。与单细胞玩家处于同一观察尺度，是早期主要威胁。',color:'#cd8cad',minY:5,maxY:50,radius:1.25,minPlayerLevel:1,nutrition:14,prey:['food']},
  fish: {name:'中层鱼群',role:'群游 · 小型消费者',diet:'小型浮游生物',description:'借助群游降低个体被捕食的风险；邻近鲨鱼、鱿鱼或大型异化体时，会散开逃离。',color:'#89cddd',minY:22,maxY:48,radius:.9,minPlayerLevel:3,nutrition:25,prey:['food']},
  jelly: {name:'深海水母',role:'漂游 · 触手捕食者',diet:'浮游生物与小鱼',description:'伞体收缩提供推进，触手截获经过的猎物。并非专门追击玩家，但触手接触会造成伤害。',color:'#c7a3f2',minY:18,maxY:46,radius:2.8,minPlayerLevel:3,nutrition:28,prey:['food','fish']},
  shark: {name:'深水鲨',role:'巡游 · 捕食者',diet:'鱼类',description:'在领地中巡游并追捕鱼群。微小细胞不足以成为攻击目标，发育后的玩家则需要保持距离。',color:'#9cafbc',minY:25,maxY:48,radius:5,minPlayerLevel:7,nutrition:48,prey:['fish']},
  squid: {name:'巨型深海鱿鱼',role:'深层 · 伏击捕食者',diet:'鱼类',description:'以喷射推进和腕足协同捕猎，主要活动于较暗水层。遭遇潜游鲸类时优先逃离。',color:'#da918e',minY:5,maxY:25,radius:6,minPlayerLevel:7,nutrition:52,prey:['fish']},
  whale: {name:'潜游齿鲸',role:'跨层潜游 · 大型捕食者',diet:'鱿鱼',description:'以抹香鲸的潜游方式为原型：下潜搜寻鱿鱼，再返回上层换气。用肺呼吸，不以细胞为猎物。它是生态巨兽，本作不参与玩家战斗。',color:'#8da9b8',minY:8,maxY:52,radius:11,minPlayerLevel:13,huntable:false,nutrition:80,prey:['squid']},
  ray: {name:'底层鳐鱼',role:'滑翔 · 底栖捕食者',diet:'底栖甲壳类',description:'宽阔胸鳍波动推进，沿底层寻找甲壳类；遇到大型捕食者会滑翔逃离。本作压缩了栖息水层。',color:'#9cb9bb',minY:5,maxY:22,radius:3.5,minPlayerLevel:7,nutrition:42,prey:['crab']},
  turtle: {name:'巡游海龟',role:'上层游泳 · 肺呼吸',diet:'水母等小型动物',description:'以会摄食水母的海龟为原型，使用前肢划水，并定期浮到水面换气。不同海龟种类的食性存在差异。',color:'#a7bf87',minY:30,maxY:52,radius:2.2,minPlayerLevel:7,nutrition:38,prey:['jelly']},
  angler: {name:'深海鮟鱇',role:'发光诱饵 · 伏击捕食者',diet:'小鱼与甲壳类',description:'发光诱饵吸引小型猎物，在猎物接近后短距离出击。深海发光属于生物化学现象，并非辐射污染的标记。',color:'#bd9c8b',minY:5,maxY:19,radius:1.5,minPlayerLevel:3,nutrition:30,prey:['fish','crab']},
  lanternfish: {name:'灯笼鱼',role:'腹侧光器 · 群游小鱼',diet:'小型浮游生物',description:'细长的身体与腹侧成列光器形成可辨认的轮廓。灯笼鱼与拥有头部诱饵的鮟鱇不同；本作摄食后有概率表达发光特质。',color:'#8cbdcc',minY:14,maxY:32,radius:1.2,minPlayerLevel:3,nutrition:30,prey:['food']},
  cuttlefish: {name:'深层墨鱼',role:'裙鳍波动 · 喷射逃逸',diet:'小鱼与甲壳类',description:'宽扁外套膜两侧的裙鳍连续波动，短腕围绕口部，受到威胁时用虹吸推进逃逸。本作为深层异化生态设定。',color:'#c7a48f',minY:7,maxY:29,radius:3,minPlayerLevel:7,nutrition:44,prey:['fish','lanternfish','crab']},
  oarfish: {name:'皇带鱼',role:'带状身体 · 背鳍推进',diet:'小型浮游动物',description:'银色带状躯干、红色连续背鳍与头部鳍冠构成独特轮廓。背鳍波动推进；本作压缩了身体长度与活动水层。',color:'#c1c8ce',minY:4,maxY:20,radius:7,minPlayerLevel:7,nutrition:62,prey:['food','lanternfish']},
  diver: {name:'取样潜水员',role:'人类宿主 · 灰屿科研队',diet:'携带采样设备与声呐灯',description:'来自灰屿研究站的人类潜水员。细胞无法直接制服人类，但可以附着其潜水服完成神经寄生适应，打开通往岛岸控制网络的入口。',color:'#d6b77f',minY:47,maxY:56,radius:2.1,minPlayerLevel:99,huntable:false,nutrition:0,prey:[]},
  crab: {name:'底栖蟹',role:'海底步行 · 食腐',diet:'沉降有机碎屑',description:'沿起伏的海床缓慢步行，收集沉降有机碎屑；遇到鳐鱼等捕食者会横向退避。本作以食腐行为呈现底栖营养循环。',color:'#cd967f',minY:-3,maxY:2,radius:1.3,minPlayerLevel:3,nutrition:20,prey:['marineSnow']},
};

export const ZONES = [
  {id:'sunlit',name:'透光层',range:'0–200 m',description:'阳光可支持光合共生。大型巡游生物与鱼群在这里觅食。',light:1},
  {id:'twilight',name:'微光层',range:'200–1,000 m',description:'光线迅速衰减，不能依靠光合作用补充营养。漂游生物与猎食者交错活动。',light:0},
  {id:'midnight',name:'无光层',range:'1,000 m 以下',description:'依靠下沉有机物和捕食维持生命。生物发光来自化学反应，和污染无必然关系。',light:0},
];

export function lifeStageFor(level) { return Math.max(0,Math.min(3,Math.floor((level-1)/2))); }
// 等级门槛对应的身体阶段名称。猎杀提示用它告诉玩家"要长成什么样才能吃"。
export function lifeStageName(level) { return LIFE_STAGES[lifeStageFor(level)].name; }
export function depthFor(y) {
  const value=Math.max(3,Math.min(52,y));
  return value>=40?(52-value)/12*200:value>=20?200+(40-value)*40:1000+(20-value)/17*1200;
}
export function zoneFor(y) { return y>=40?ZONES[0]:y>=20?ZONES[1]:ZONES[2]; }

// Shared with the rendered seabed; simulation stays independent of Three.js.
export function seabedHeight(x, z) {
  return -0.95 + Math.sin(x * 0.075) * 1.05 + Math.cos(z * 0.1) * 0.75 + Math.sin(x * 0.31 + z * 0.11) * 0.25;
}
export const CRAB_GROUND_CLEARANCE = 0.42;
export const SEDIMENT_GROUND_CLEARANCE = 0.18;

export const BIOLOGY_SOURCES = [
  {title:'OpenStax · 细胞表面积与体积',url:'https://openstax.org/books/biology-ap-courses/pages/4-2-prokaryotic-cells'},
  {title:'NOAA · 海洋深度分层',url:'https://origin.oceanexplorer.noaa.gov/ocean-fact/deep-ocean/'},
  {title:'MBARI · 深海食物网',url:'https://www.mbari.org/news/unique-field-survey-yields-first-big-picture-view-of-deep-sea-food-webs/'},
  {title:'MBARI · 生物发光',url:'https://www.mbari.org/know-your-ocean/bioluminescence/'},
];
