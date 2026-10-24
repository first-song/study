# 最新交接 · v15 微生物运动、寄生门槛与活性羽流

## 本轮结果

- 微生物群不再作为整体跟随玩家。实例保持世界坐标，只在远离局部生态区后逐个回收；细菌、纤毛虫、硅藻、群体、幼体、桡足类、樽海鞘链、轮虫、放射虫和蠕状体具有不同的漂移、聚集与受惊响应。
- 人类寄生不再是人人可用的能力。约 32% 的种子会天然表达“寄生原基”；其余个体仍可搭乘鱼、鲸和海龟，但必须等待后期随机异变出现新的 `parasitism` 器官后才能接管潜水员与岛屿神经中继。玩家不能选择该路线。
- 新玩法“活性营养羽流”替代纯拾取式回能：按 `E` 连续滤食，外壳提供较安全的营养；靠近橙色核心获得更高异变能，同时增加辐射与捕食者注意。羽流失稳后会爆裂，伤害附近生命并散落碎屑，短冷却后在别处重生。附近鱼会主动聚集觅食。
- 首股羽流固定在出生镜头前方；目标标记显示状态与剩余时间，教学、生存指南和异变记录均说明玩法与随机寄生条件。
- 画面继续降低塑料绿和高亮反差，增加自然海床矿物色、浅海青色散射、暖色生物核心、轻微镜头色差和柔和光雾；浅层光柱与悬浮颗粒更早出现。
- 存档升级为 v9，并兼容 v1–v8。校验覆盖寄生能力、羽流生命周期、位置、营养和重生计时。

## 验收

- `npm.cmd test`：119 / 119 通过。
- `node scripts/smoke.mjs`：30 / 30 通过，约 551 秒；桌面、竖屏、横屏、巨兽结局、寄生结局和存档均通过。
- 浏览器运行错误 0，失败请求 0，Pointer Lock 正常。
- 完整场景：290 draw calls，2,837,445 triangles。
- v15 专项：215 draw calls，2,372,815 triangles；羽流投影可见、滤食状态生效、微生物四个方向均有独立速度样本。
- 鱼群显示运动连续，低画质仍逐帧变化。

## 压缩证据

- `artifacts/previews/v15-active-bloom-calm.jpg`：约 153 KB。
- `artifacts/previews/v15-active-bloom-unstable.jpg`：约 151 KB。
- `artifacts/previews/art-contact-sheet.jpg`：约 150 KB。
- `artifacts/smoke-report.json`：完整浏览器状态。

## 关键文件

- `src/bloom-system.js`、`src/bloom-model.js`、`src/plankton-bloom.js`
- `src/microfauna.js`
- `src/mutations.js`、`src/ecosystem.js`、`src/expedition-ui.js`
- `src/scene.js`、`src/ocean-rendering.js`、`src/ocean-habitat.js`
- `scripts/review-v15.mjs`
- `tests/bloom-*.test.mjs`

## 后续优先项

1. 当前仍有约 284 万三角形；下一步优先做远景珊瑚、岩块、树冠与背景鱼的分层 LOD。
2. 程序化模型仍未达到扫描级商业 PBR 精度。若继续向《深海迷航》级近景推进，需要授权的 GLB/PBR 资产、独立碰撞代理与移动端简化资产。
3. 需要真人试玩调整羽流出现频率、核心理赔收益、寄生原基概率和中低端显卡帧率。

## 413 约束

不要一次读取多张原始 PNG、完整 `PROJECT_MEMORY.md` 或多个大型源码文件。先读 `CONTEXT_INDEX.md`，再按需读取单个模块和小于 350 KB 的 JPEG。
