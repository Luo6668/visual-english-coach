# 检查与修复

## 实际通过的检查

| 检查 | 结果 |
|---|---|
| pnpm check:config | 通过，本地配置可用；不把未使用的可选云参数当阻断 |
| pnpm typecheck | 通过 |
| pnpm lint | 全库通过，106 个文件 |
| pnpm test:learning | 46/46 |
| pnpm test:sentences | 9/9 |
| pnpm smoke:local | MySQL CRUD、XP 与去重通过 |
| pnpm smoke:learning | 7 项真实 AI 接口检查通过 |
| pnpm smoke:speech | Kokoro 英/中/混合 TTS 与 Whisper 合成音频识别通过 |
| pnpm smoke:concurrency | 8 组并发活动/XP，计数与奖励精确；重复事件只奖励一次 |
| Expo Web production export | 通过，输出 /tmp/vec-sentence-and-smoke-build |
| git diff --check | 通过 |

原始命令日志见 logs/。构建成功不等于原生端或实际帧率通过。

## 已修复的实际问题

1. **活动增加但 XP 丢失**：recordActivity 与 awardXp 并发 INSERT IGNORE 到同一 user_stats 行，再升级锁会死锁。基线 8 组中 7 组报 ER_LOCK_DEADLOCK。现在事务入口统一使用 INSERT … ON DUPLICATE KEY UPDATE 获得一致排他锁，回归全部通过。文件 scripts/local-mysql.mjs；独立回归 scripts/local-concurrency-smoke.mjs。未修改 XP 数值、表结构或奖励去重规则。没有自动补写真实用户历史 XP；仅向 QA 账号重试一条已知失败的真实分析事件。
2. **返回场景详情显示旧轮次**：改为聚焦时重新读取，取消失焦旧请求，5/5 完成状态能正确回读。文件 src/app/(app)/scene-detail.tsx。
3. **词条收藏只改图标**：沿用词条查询自动收录流程，实际落库后才显示已收录；请求失败可重试，避免旧词条残留。文件 src/app/(app)/word-detail.tsx。
4. **本地重置密码冒充发信/成功改密**：本地模式显示演示说明，保留真实云模式成功文案；本轮未执行真实密码修改。
5. **跟读文字匹配被称为专业发音评分**：本地页明确为识别文字核对，不声称测量音素、重音或节奏；不修改原比较算法。
6. **类型/lint 与原生 Pressable 样式**：Metro 静态资源 require 补类型声明；成就按钮使用兼容原生的静态样式和按压反馈。
7. **首页文字输入缺少操作语义**：输入和提交增加可访问名称；今日目标改名“对话与跟读”，匹配实际计数含义。
8. **句库只有跟读入口**：新增独立句子详解及共享接口契约，见独立需求与验收文档。

## 发布边界

本地 Web、MySQL、8787 网关有效。新增云端 sentence-detail 及既有 learning-assist 云函数本轮未部署，不把本地接口可用表述成线上可用。未推送 GitHub。
