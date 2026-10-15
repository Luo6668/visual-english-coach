# Visual English Coach

基于 Expo SDK 55 + React Native + expo-router + NativeWind v4 打造的视觉化英语学习 App。

## 技术栈

- **框架**: React Native + Expo SDK 55
- **导航**: expo-router
- **样式**: NativeWind v4 / Tailwind CSS v3
- **本地数据库**: MySQL 8/9 + Node.js 数据 API
- **AI**: DeepSeek 对话/翻译/评分 + 千问图片识别
- **云端兼容**: 保留 Supabase Edge Functions 目录，供未来部署参考
- **语音**: MediaRecorder / expo-audio + 本地 Whisper.cpp 英文识别 + 本地 Kokoro-82M 中英文朗读
- **包管理**: pnpm + workspace catalog

## 快速开始

1. 复制环境变量
   ```bash
   cp .env.example .env
   cp mysql/.env.example mysql/.env
   # 在 mysql/.env 填入本机 MySQL 账号
   ```

   未配置 Supabase 时，登录和注册自动使用本地演示模式。

2. 安装依赖
   ```bash
   pnpm install
   ```

3. 安装本地语音模型（首次运行一次）
   ```bash
   pnpm speech:setup
   ```

   该命令在项目的 `.local-speech` 目录安装隔离的 Python 3.12、Kokoro-82M（英文和普通话）、Whisper.cpp 和 `base.en` 模型，不修改系统 Python。首次下载和编译需要几分钟，安装后约占 1.7 GB。模型目录已被 Git 和源码压缩包排除，换电脑后需重新运行一次该命令。

4. 初始化本地 MySQL（首次运行一次）
   ```bash
   pnpm mysql:init
   ```

5. 启动开发服务、本地数据/AI 网关及 Kokoro 朗读服务
   ```bash
   pnpm dev:local
   ```

6. 在浏览器打开 Expo 输出的本地地址

需要使用 DeepSeek/千问图片识别时，推荐复制 `supabase/.env.example` 为 `supabase/.env` 并填写相应密钥；本地网关也兼容从根目录 `.env` 读取。英文语音识别以及英文/普通话朗读完全在本机运行，不消耗 API 额度。

该命令会同时启动 Expo Web、仅监听本机 `127.0.0.1:8787` 的 AI 网关，以及 `127.0.0.1:8766` 的 Kokoro 服务。密钥和本地模型都不会发送到浏览器之外。

检查本地配置（只显示配置状态，不输出密钥）：

```bash
pnpm check:config
```

运行本地 MySQL 烟雾测试（使用临时测试用户，结束后自动清理）：

```bash
pnpm smoke:local
```

服务启动后运行本地语音端到端测试（含英文、普通话和中英混合朗读，英文音频会继续交给 Whisper 识别）：

```bash
pnpm smoke:speech
```

本地演示登录为单用户模式，学习数据统一归属 `local-demo-user`。本地网关只监听 `127.0.0.1:8787`，不要直接暴露到公网。

## Supabase 部署

需要先创建一个 Supabase 项目，并在 Project Settings > API 中取得 Project URL 和 Anon Key。将它们写入根目录 `.env`：

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

不要将 `service_role` key 写入 Expo 的 `.env`。它拥有绕过 RLS 的权限，只能由 Supabase Edge Functions 使用。

安装并登录 Supabase CLI 后执行：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set --env-file supabase/.env
supabase functions deploy
```

复制 `supabase/.env.example` 为 `supabase/.env`，按需配置：

- `DEEPSEEK_API_KEY`：必需。AI 对话、翻译、日记、词典、跟读评分及文字降级使用。
- `DASHSCOPE_API_KEY`：本地版仅用于千问图片识别；缺失或额度不足时图片识别会显示明确提示。
- `INTEGRATIONS_API_KEY`：仅旧版秒哒 Edge Functions 使用，本地 MySQL 版本不依赖它。

Supabase 会自动向已部署的 Edge Functions 注入 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，无需手工写入 secrets 文件。

## 项目结构

```
src/
  app/          # expo-router 路由
  client/       # Supabase 客户端
  components/   # UI 组件
  lib/          # 工具函数与 API
  global.css    # Tailwind 主题变量
supabase/
  functions/    # Edge Functions
  migrations/   # 数据库迁移
assets/         # 图标等静态资源
```

## 注意事项

- `.env` 文件包含敏感信息，已加入 `.gitignore`，请勿提交到 GitHub。
- 本项目使用 pnpm 的 workspace catalog 管理依赖，建议使用 pnpm 安装。
- 当前完整验证目标是本机单用户 Web 版；Android/iOS 真机需要把 `EXPO_PUBLIC_DATA_API_URL` 和 `EXPO_PUBLIC_LOCAL_AI_URL` 设置为手机可访问的局域网地址。
- 若未来开放给其他用户，需要先增加正式认证、按用户隔离 MySQL 数据、接口鉴权、限流和 HTTPS，不能直接公开本地网关。
