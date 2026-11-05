# Learning Loop v1 · 总进程

> 最新复习逻辑与验收以 [Review v2](../review-v2/00-progress.md) 为准。以下为 v1 历史记录，旧“揭示答案 / 独立自评”流程已替换。

版本名：learning-loop-v1 / 2026-11-04。范围：任务式场景、对话内帮助、纠正后重说、真实表现复习。保留现有首页视觉、录音、TTS、登录、XP 与业务表，不引入新的动画库。

## 最新交互显示版本

对话精简改动与最新验收见 [Conversation UI v2 总进度](../conversation-ui-v2/00-progress.md)。以下保留 v1 的历史交付记录；v2 将表达收藏、帮助和反馈改为按需展开。

## 业务目标
用户能知道练什么，在当前对话获得帮助，重说改善后的表达，之后从自己的真实记录继续复习。场景全部开放；任务反馈是 AI 辅助判断，轮次不是能力评分，文字匹配不是发音测评。

## 模块与依赖
| 模块 | 文档 | 独立边界 | 状态 |
|---|---|---|---|
| M1 任务式场景 | [01](01-scene-tasks.md) | 场景任务定义、原句证据、任务进度组件 | 开发完成 · 本地 Web 通过 |
| M2 对话内帮助 | [02](02-conversation-help.md) | 帮助面板、独立 AI 请求契约 | 开发完成 · 本地 Web 通过 |
| M3 纠正后重说 | [03](03-retry-practice.md) | 表达反馈、重说匹配、复习收录 | 开发完成 · 本地 Web 通过 |
| M4 真实表现复习 | [04](04-review.md) | 账号隔离存储、复习算法、独立复习页面 | 开发完成 · 本地 Web 通过 |

## 独立模块边界

| 功能 | 独立 UI | 规则 / 数据 | 独立测试 |
|---|---|---|---|
| M1 | scene-task-board.tsx | tasks.ts、原句证据合并 | test:learning:tasks |
| M2 | conversation-help-card.tsx | assistant.ts、共享接口契约 | test:learning:help |
| M3 | expression-practice-card.tsx、practice-input.tsx | 反馈验证、文字核对、单句保存 | test:learning:retry |
| M4 | review.tsx | model.ts、repository.ts、store.ts | test:learning:review |

learning-companion.tsx 只协调对话上下文和请求；M2 请求错误、M3 保存错误、M4 持久化错误分别维护。learning-action.tsx 是共享基础控件。

M1/M2/M3 共用新增 learning-assist 接口；M3 可写入 M4；M4 不依赖 AI 才能浏览和复习。需求、纯函数、存储、UI 分层，便于独立测试。

## 实施顺序
1. 先冻结文档、请求契约和纯函数测试。
2. 完成独立组件与复习存储。
3. 接入场景详情/场景对话、AI 教练、表达本。
4. 运行类型检查、模块测试、真实本地 AI 接口检查、浏览器端到端验收。

## 数据与异常约定
- 未得到有效 AI 结果，不显示成功、任务完成或虚构反馈。
- 每个任务完成必须引用用户已发送原句；AI 的语义判断仍可能有误，界面标识 AI 辅助。
- 提示与范例不自动发送、不增加轮次；查看提示与独立重说区分记录。
- 复习数据保存在当前设备，按当前账号分区，不承诺云同步。写入失败保留输入并允许重试。
- 不存原始录音，不在文档或日志打印密钥；自动化使用独立测试账号。

## 发布门槛
模块自动化全通过；TypeScript 全通过；375/390/430px 可用；失败重试、重复点击、账号隔离、重进页面持久化均有记录。真实麦克风/原生端未验证项如实列为待验收，不用模拟成功代替。

## 验证记录
- `pnpm typecheck`：通过。
- `pnpm test:learning`：27/27 通过。各模块也提供独立命令。
- `pnpm smoke:learning`：真实 AI 接口 7 项检查通过，使用合成文本、不写学习数据。
- `pnpm smoke:speech`：本地 Kokoro 英语/普通话/混合 TTS、Whisper 识别通过。
- 新增模块与本轮接入页面的定向 oxlint：通过；`git diff --check`：通过。
- 全项目 `pnpm lint`：未通过。既有页面中仍有 require 全局声明和 achievements 原生 Pressable 函数样式问题；未将其表述为本轮全库通过。
- 真实浏览器端到端、权限/接口/存储失败注入、账号切换、冷启动重载、小屏和音频播放，详见 [验收记录](05-acceptance.md)。

## 明确边界与待验收

1. 物理麦克风真人录音的噪声、口音表现，以及 iOS/Android 原生端尚未实机验收。合成语音回放测试不等于真人准确率验证。
2. 新 Supabase `learning-assist` 云函数尚未部署；本地 8787 入口已运行。未改变现有数据库结构、登录方式与 XP 计算规则。
3. 任务完成是有原句证据的 AI 辅助判断，语义可能误判；任务证据只属于本次会话。最高轮次沿用原数据。
4. 复习仅此设备按账号保存，不能当作云同步；“独立说出”为用户自评，不是 AI 口语能力分。
5. 本轮不包含支付订阅、宠物养成、专业音素发音评价、真人效果验证或新的获客流程。

## 后续维护入口

- 接口契约：`supabase/functions/_shared/learning-assist.mjs`，本地/云端共享，修改后先运行模块测试与真实接口 smoke。
- 复习策略：`src/lib/learning-loop/model.ts`；当前上限 300 条，不自动删除用户旧数据。
- 页面入口：场景地图 → 场景详情 → 对话；首页 AI 教练 → 两种对话模式；学习 → 今天再说一次。
- 不重复引入动画库；沿用项目 MotionPressable 和原有 TTS/ASR 提供方。


## 命名检查点

learning-loop-v1-20261104-135655

本地保存位置：`/Users/lawerance/Documents/Codex/2026-09-20/new-chat/outputs/checkpoints/learning-loop-v1-20261104-135655`。这是当前完整工作区快照，保留了本轮之前已有的修改；未重置工作区，未自动提交或推送 GitHub。


## 2026-11-05 最新验收入口

新增 [表达句库详解](../sentence-library-v1/00-progress.md) 与 [整项目核心冒烟](../project-smoke-20261104/00-progress.md)。最新全库 lint、55 项模块测试与 Web 导出已通过；本轮修复活动/XP 并发死锁。上文 v1 验证结果为历史记录，最新结果和未覆盖项目以新文档为准。
