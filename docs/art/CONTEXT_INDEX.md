# 美术上下文索引

用途：以后让模型检查美术时，按需读取小文件，不发送整个项目或原始 PNG。

## 推荐读取顺序

1. `docs/art/LATEST_HANDOFF.md`：v15 最新结论、指标和待办，优先读取。
2. `docs/art/GAMEPLAY_LOOP_V15.md`：活性羽流玩法、风险循环与首分钟节奏。
3. `docs/art/ART_DIRECTION.md`：当前视觉方向与必须保留的约束。
4. `docs/art/QA_CARDS.md`：本轮要检查的具体视觉问题。
5. `src/visual-materials.js`：共享材质和程序纹理。
6. 微观生态只读 `src/microfauna.js`；活性羽流只读 `src/bloom-system.js` 或 `src/bloom-model.js`；鱼群碰撞只读 `src/engine.js` 的 collision 段和 `src/marine-models.js` 的 background-school 段。
7. 与任务有关的单一源码片段：岛屿看 `src/island.js` 的布局；植被看 `src/ocean-rendering.js` 的 foliage 段；水下看 `src/ocean-habitat.js`；光照看 `src/scene.js` 的 update 光照段。
8. `artifacts/previews/*.jpg`：低体积验收图。优先只附 `art-contact-sheet.jpg` 或一张指定近景。

## 不要一次性读取

- 不发送 `artifacts/*.png` 原图；单张常见大小为 1–2 MB。
- 不把 `docs/PROJECT_MEMORY.md` 全文和源码全文同时塞进一次请求。
- 不读取旧失败实验图：`pre-art-*.png`、`debug-*.png`。
- 不把 `scripts/smoke.mjs`、`src/scene.js`、`src/ocean-rendering.js` 全文一起传入。
- `artifacts/smoke-report.json` 可整体读取；不要连同多张 PNG 一起发送。

## 压缩预览

在 Windows PowerShell 中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/context/New-Previews.ps1
```

脚本输出位于 `artifacts/previews/`，单图目标小于 350 KB，并生成不超过 500 KB 的四格接触表。原 PNG 保留作为完整质量证据。
