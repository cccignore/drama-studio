# M5 手动回归清单

1. 冷启动 seed：删除本地 `.data`，在 `.env` 填 `YUNWU_API_KEY`，执行 `npm run init-db`，确认 `/settings/models` 出现 GPT-5.4 / DeepSeek-V3.2 / Grok-4.2，且 GPT-5.4 为默认。
2. 模型角色：进入 `/settings/models`，确认 Primary / Secondary / Tertiary / Overseas 四个角色槽位可绑定模型。
3. 新建项目：进入项目增强面板，确认质量优先 MoE 已把 start/plan/characters/outline 指向 Primary，episode 指向 Secondary，review/compliance 指向 Tertiary。
4. 出海模式：完成 start 后运行 overseas，再重跑 episode 1，检查场记/动作/音乐为中文，对白为英文，且没有中英混杂台词。
5. AI 改写：在 `plan` 页面点击「编辑」，输入“第二幕节奏压缩 30%”，确认生成新版本并刷新页面内容。
6. 手动编辑：在 `characters` 页面打开「编辑」→「手动编辑」，改一个字保存，确认历史出现 `manual-edit` 版本，关系图仍能渲染。
7. 回滚：在历史 tab 回滚到 v1，确认生成新的 `revert` 版本，旧版本仍保留。
8. 对话历史：刷新页面后重新打开编辑抽屉，确认 AI 改写对话和版本历史仍在。
9. 并发禁用：正在生成 episode 时打开编辑抽屉，确认编辑操作处于禁用态。
