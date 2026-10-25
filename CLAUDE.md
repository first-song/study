# 《异潮 · ABERRANT TIDE》项目说明

原生 Three.js 0.180 + ES modules 的 3D 海洋异化生存游戏。**不是 Vite / TypeScript 项目**，
不要套用脚手架模板；现有结构就是目标结构。

## 工作室框架（Claude Code Game Studios）

项目根目录已安装 CCGS 框架（`.claude/` 下 49 个 agent、74 个 skill、hooks 与 rules，
配置在 `project.yaml`）。它的默认引擎是 Godot/Unity/Unreal——**本项目不是**，
所以引擎专精类 agent（godot-* / unity-* / unreal-*）不适用，其余设计、评审、QA、
制作管理类可正常使用。

| 需要什么 | 用什么 |
| --- | --- |
| 开局/阶段判断 | `/start`、`/project-stage-detect` |
| 设计文档与评审 | `/quick-design`、`/design-review`、`/review-all-gdds`、`/consistency-check` |
| 数值与平衡 | `/balance-check`、`gameplay-mechanics` |
| QA 与回归 | `/qa-plan`、`/smoke-check`、`/regression-suite`、`/playtest-report` |
| 性能 | `/perf-profile` |
| 版本与发布 | `/changelog`、`/release-checklist`、`/launch-checklist` |

同时仍然使用 Three.js 专门技能（全局安装）：`threejs-game-director`、
`threejs-gameplay-systems`、`threejs-aaa-graphics-builder`、`game-ui-frontend`、
`threejs-debug-profiler`、`threejs-qa-release`。

**协作方式**：CCGS 默认要求每次写文件前询问。本项目按用户长期指示执行——
日常实现直接做，只有设计文档、破坏性操作与对外发布前才需要确认。

## 硬性约束

1. **玩家不能选择进化路线**。器官、本能只能随机抵达；玩家决定的是"去哪、猎什么、何时撤"。
   任何"让玩家选一个技能/路线"的改动都违反核心设计。
2. **模拟与渲染分离**。`src/engine.js` 与纯规则模块不得 import Three.js；它们要能在 Node 里单测。
3. **确定性**。所有随机走 `this.random()`（LCG）；`tests/expedition-journey.test.mjs` 用固定种子
   跑完整通关，任何改变生物移动/刷新的改动都要在这个测试上重新验证。
4. **不要无脑加内容**。用户明确反对"再加一堆能吃的东西"。新内容必须改变决策，而不是增加数量。
5. **打包产物不进仓库**。`dist/`、`artifacts/`、`.prof/` 已在 `.gitignore`。

## 验证

```powershell
npm.cmd test                 # 165 项单元测试
npm.cmd start                # 本地服务 http://127.0.0.1:4173
node scripts/smoke.mjs       # 桌面 + 手机全流程回归（约 10 分钟）
npm.cmd run verify:v23       # 潮汐日 / 猎杀窗口 / 野外笔记
npm.cmd run verify:single    # 单文件 exe 验证
```

改造前先读 `docs/PROJECT_MEMORY.md`（历次决策与踩坑）和 `artifacts/game-progress.md`（当前进度）。
