# Learning Loop v1 · 本地 Web 验收记录

日期：2026-11-04。环境：Expo Web :8095、本地 AI/MySQL 网关 :8787、Kokoro :8766、Whisper.cpp/base.en。全部写入使用独立 QA 账号，不修改原账号的学习内容。

## 可重复运行的检查

```sh
pnpm typecheck
pnpm test:learning
pnpm test:learning:tasks
pnpm test:learning:help
pnpm test:learning:retry
pnpm test:learning:review
pnpm smoke:learning
pnpm smoke:speech
```

模块规则合计 27 项：M1 3 / M2 6 / M3 6 / M4 12。smoke:learning 调用真实配置的模型，模型不可用时应失败，不能用固定成功结果替代。

## 浏览器验收

| 编号 | 操作 | 已观察结果 | 结论 |
|---|---|---|---|
| B01 | 新 QA 账号进入复习、打开表达选择 | 0 条收藏，真实空态，不展示其他用户数据 | 通过 |
| B02 | AI 教练发送 I has a reservation. | 原句、建议 I have a reservation.、解释分别展示 | 通过 |
| B03 | 开始单句重说，输入目标句并检查 | 文字核对通过，说明不是发音评分；主输入区隐藏 | 通过 |
| B04 | 同一句多次收录 | 不产生重复项；新中文提示补齐后保留原练习次数 | 通过 |
| B05 | 场景对话发送 Hello. | 1/5 轮，0/3 沟通目标 | 通过 |
| B06 | 发送中杯拿铁外带请求、展开目标 | 2/5 轮，3/3 目标；有来自真实输入的原句 | 通过 |
| B07 | 帮助接口注入 503 后重试 | Hot, please. 草稿和原目标证据不丢；不自动发送提示 | 通过 |
| B08 | 暂缓对话请求后点击重新开始，再释放旧请求 | 新会话保持 0/5 与 0/3，不被旧回复覆盖 | 通过 |
| B09 | 揭示复习答案后尝试独立按钮 | 按钮 disabled=true，不能记作独立说出 | 通过 |
| B10 | localStorage 写入注入配额失败 | 错误可见，输入保留、原 attempts 不变；恢复后可写 | 通过 |
| B11 | 还需提示 / 独立自评 | 分别安排 10 分钟 / 24 小时；来源与次数持久化 | 通过 |
| B12 | 模拟麦克风权限拒绝 | 错误提示、文字输入仍可用，没有伪造识别成功 | 通过 |
| B13 | 合成语音送入 MediaRecorder，再停止识别 | 实际经过 WebM→WAV→Whisper，正确回填英语；method=voice | 通过，非真人录音 |
| B14 | 点击朗读 | 实际 audio.currentTime>0、duration=2.025s、paused=false | 通过 |
| B15 | 账号 A→空账号 B→账号 A | A 的 2 条记录不出现在 B，返回 A 保留 | 通过 |
| B16 | 浏览器冷重载→重新登录 A | 存储重建后仍为 2 条；符合每次启动先登录规则 | 通过 |
| B17 | 从数据库表达本选句加入→移除复习项 | 带入真实译文，原数据库收藏未删除 | 通过 |
| B18 | 375 / 390 / 430px | root.scrollWidth=viewport，控件均在水平边界内，已截图检查 | 通过 |
| B19 | prefers-reduced-motion=reduce | 媒体查询启用，新增模块无持续空间动画依赖 | 通过当前模块检查 |
| B20 | 畅聊模式发送→主动请求建议 | 不自动弹结构化批改；主动请求后展示；真实 API 新提示词直接接话 | 通过 |
| B21 | Tab/焦点定位按钮后按 Enter 揭示答案 | 正常揭示，独立自评按钮同时禁用 | 通过 |
| B22 | 独立表达卡保存失败注入、再保存 | 输入保留；不出现 AI 重试；恢复后成功收录 | 通过 |

## 截图证据

- [复习 · 375px](evidence/review-375.png)
- [复习 · 390px](evidence/review-390.png)
- [复习 · 430px](evidence/review-430.png)
- [场景目标与帮助 · 375px](evidence/scene-375.png)

## 未覆盖项

- 真人物理麦克风、不同口音与背景噪声准确率。
- iOS/Android 原生录音、SQLite 持久化的实机运行。
- Supabase 云函数部署后的认证和真实上游联调（共享契约已由本地执行）。
- 全项目既有 lint 错误、全产品连续 60fps 性能基准。

以上均不以合成语音、规则测试、页面可运行或截图替代实测结论。
