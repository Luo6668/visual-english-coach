import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { awardXp, clearLocalData, handleDataRequest, recordActivity } from './local-mysql.mjs';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

loadEnv(resolve('supabase/.env'));
loadEnv(resolve('.env'));
loadEnv(resolve('mysql/.env'));

const speechRoot = resolve(process.env.LOCAL_SPEECH_DIR || '.local-speech');
const whisperCli = resolve(process.env.WHISPER_CLI_PATH || join(speechRoot, 'whisper.cpp/build/bin/whisper-cli'));
const whisperModel = resolve(process.env.WHISPER_MODEL_PATH || join(speechRoot, 'whisper.cpp/models/ggml-base.en.bin'));
const localTtsUrl = `http://127.0.0.1:${Number(process.env.LOCAL_TTS_PORT || 8766)}`;
const dashscopeCompatibleUrl = `${(process.env.DASHSCOPE_COMPATIBLE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '')}/chat/completions`;
const visionModels = [...new Set([
  process.env.DASHSCOPE_VISION_MODEL,
  'qwen3.8-flash',
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'qwen-vl-max',
  'qwen-vl-plus',
].filter(Boolean))];

function localAsrInstalled() {
  return existsSync(whisperCli) && existsSync(whisperModel) && statSync(whisperModel).size > 140_000_000;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
};

const MAX_REQUEST_BYTES = 15_000_000;
const KNOWN_FUNCTIONS = new Set([
  'add-xp', 'record-activity', 'clear-local-data', 'local-tts', 'qwen-tts',
  'short-speech-recognition', 'diary', 'shadowing', 'thinking-mode',
  'translate', 'word-detail', 'dialogue', 'ai-coach-chat', 'scene-dialogue-chat',
]);

function json(res, status, value) {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return {};
}

function curlJson(url, apiKey, payload, timeoutSeconds = 90) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '-sS', '--connect-timeout', '8', '--max-time', String(timeoutSeconds), '-w', '\n%{http_code}', '-X', 'POST', url,
      '-H', `Authorization: Bearer ${apiKey}`, '-H', 'Content-Type: application/json', '--data-binary', '@-',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const split = stdout.lastIndexOf('\n');
      const body = split >= 0 ? stdout.slice(0, split) : stdout;
      const status = Number(stdout.slice(split + 1)) || 0;
      if (code !== 0 || status < 200 || status >= 300) {
        reject(new Error(`上游 AI 请求失败 (${status || code}): ${body || stderr}`));
      } else {
        resolve({ json: async () => JSON.parse(body), text: async () => body });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function runProcess(command, args, timeout = 120_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error(`${command} 执行超时`));
    }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new Error(`${command} 执行失败 (${code})：${(stderr || stdout).trim().slice(-2000)}`));
    });
  });
}

async function chat({ messages, jsonMode = false, stream = false, maxTokens = 700, timeoutSeconds = 90 }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('未配置 DEEPSEEK_API_KEY');
  return curlJson('https://api.deepseek.com/chat/completions', key, {
    model: 'deepseek-chat', messages, stream, max_tokens: maxTokens,
    temperature: 0.7, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  }, timeoutSeconds);
}

function localCoachReply(messages) {
  const lastUserMessage = [...messages].reverse().find((message) => message?.role === 'user');
  const input = String(lastUserMessage?.content || '').trim();
  const lower = input.toLowerCase();
  const lessons = [
    {
      matches: ['咖啡', 'coffee', 'latte', '拿铁', '点单'],
      reply: '咖啡馆点单可以说：\n\n“I’d like a latte, please.”\n\n想问尺寸时可以接着说：“What sizes do you have?”\n\n现在试着用这两个句型完成一次点单。',
    },
    {
      matches: ['自我介绍', 'introduce', 'introduction'],
      reply: '自我介绍可以从这三句开始：\n\n“Hi, I’m Alex.”\n“I’m from China.”\n“I work in design.”\n\n把 Alex、China 和 design 换成你的真实信息，再完整说一遍。',
    },
    {
      matches: ['机场', '登机', 'airport', 'boarding', 'flight'],
      reply: '机场里可以说：\n\n“Excuse me, where is Gate 12?”\n“What time does boarding start?”\n\n第一句用来问登机口，第二句用来确认登机时间。',
    },
    {
      matches: ['酒店', 'hotel', 'check in', '入住'],
      reply: '酒店入住可以说：\n\n“Hi, I’d like to check in.”\n“I have a reservation under Wang.”\n\nunder 后面接预订时使用的姓名。',
    },
    {
      matches: ['餐厅', 'restaurant', '菜单', '结账'],
      reply: '餐厅里可以说：\n\n“Could I see the menu, please?”\n“Could we have the bill, please?”\n\n前一句用来要菜单，后一句用来结账。',
    },
    {
      matches: ['地铁', 'subway', 'metro', '换乘'],
      reply: '乘坐地铁时可以说：\n\n“Does this train go to the city center?”\n“Where should I change lines?”\n\n分别用于确认方向和询问换乘。',
    },
    {
      matches: ['纠正', 'correct', 'grammar', '语法', '表达'],
      reply: '把你想纠正的英文句子直接发给我。\n\n我会按照这个格式帮助你：\n1. 更自然的说法\n2. 简短中文解释\n3. 一个可以马上开口的例句',
    },
  ];
  const lesson = lessons.find((item) => item.matches.some((keyword) => lower.includes(keyword)));
  if (lesson) return `${lesson.reply}\n\n（当前由本地练习模式生成）`;

  if (/^[\x00-\x7F\s.,!?;:'"-]+$/.test(input) && input) {
    return `Your sentence is understandable: “${input.slice(0, 180)}”\n\nA useful follow-up is: “Could you tell me more about that?”\n\nTry saying both sentences aloud once.\n\n（当前由本地练习模式生成）`;
  }

  return '我们先用一个通用的场景表达开始：\n\n“Excuse me, could you help me with this, please?”\n\n这句话适合礼貌地向别人求助。你也可以告诉我具体场景，例如咖啡馆、机场、酒店或餐厅。\n\n（当前由本地练习模式生成）';
}

const thinkingDifficultyPrompts = {
  simple: 'A1-A2：场景描述8-14词，实用表达6-12词，地道开口8-14词，使用基础词汇和简单句型。',
  natural: 'B1-B2：场景描述8-14词，实用表达6-12词，地道开口10-18词，表达自然、日常、可直接使用。',
  advanced: 'C1-C2：场景描述8-14词，实用表达6-12词，地道开口12-20词，可使用更准确的搭配，但必须保持真实口语感。',
};

const thinkingSentenceKeys = ['i_see', 'i_think', 'i_say'];

function thinkingModePrompt(difficulty) {
  return `你是英语场景学习教练。根据真实场景生成“看场景、学表达、开口说”三步英语内容。

严格只返回JSON：
{
  "scene_name": "准确、简短的中文场景名",
  "i_see": "一句客观的英文场景描述",
  "i_think": "一句该场景中最常用、最容易马上使用的英文表达",
  "i_say": "一句更自然、更完整、可以直接对别人说的英文口语",
  "words": ["5-8个来自句子的重点英文单词或短语，使用小写"]
}

生成规则：
1. 三个字段都只能有一句英文，不要中文、标题、Markdown或解释。
2. 不要为了匹配字段而强制使用 I see、I think、I'd say 开头。
3. i_say 直接给出用户真正要说的话，不要写成 I'd say, "..." 或类似包装。
4. i_think 与 i_say 必须用途不同：前者简单常用，后者更完整自然。
5. 每句只表达一个沟通目的，适合朗读和跟读。
6. scene_name 必须真实反映图片或文字描述，不能猜测不存在的细节。
7. 默认始终只生成这三句，不增加第四句或第五句。

难度要求：${thinkingDifficultyPrompts[difficulty] || thinkingDifficultyPrompts.natural}`;
}

function cleanGeneratedSentence(value, fallback, removeSpeechWrapper = false) {
  let sentence = String(value || fallback).trim();
  if (removeSpeechWrapper) {
    sentence = sentence.replace(/^I(?:['’]d| would)\s+say\s*[:,]?\s*/i, '').trim();
  }
  return sentence
    .replace(/^["'“‘]+/, '')
    .replace(/["'”’]+$/, '')
    .trim();
}

function normalizeThinkingModeResult(value, fallbackScene) {
  const result = value && typeof value === 'object' ? value : {};
  return {
    scene_name: String(result.scene_name || fallbackScene || '学习场景').trim(),
    i_see: cleanGeneratedSentence(result.i_see, 'This is a useful everyday scene.'),
    i_think: cleanGeneratedSentence(result.i_think, 'Could you help me, please?'),
    i_say: cleanGeneratedSentence(result.i_say, 'Excuse me, could you help me with this, please?', true),
    words: Array.isArray(result.words)
      ? [...new Set(result.words.map((word) => String(word).trim().toLowerCase()).filter(Boolean))].slice(0, 8)
      : [],
  };
}

function thinkingRegenerationInstruction(body) {
  const current = body.currentResult && typeof body.currentResult === 'object'
    ? normalizeThinkingModeResult(body.currentResult, body.scene)
    : null;
  if (!current) return '';

  const currentJson = JSON.stringify({
    scene_name: current.scene_name,
    i_see: current.i_see,
    i_think: current.i_think,
    i_say: current.i_say,
  });
  if (thinkingSentenceKeys.includes(body.regenerateKey)) {
    return `\n当前内容：${currentJson}\n只替换 ${body.regenerateKey}，新句不能与当前句相同；另外两句和 scene_name 必须原样返回。`;
  }
  if (body.regenerateAll) {
    return `\n当前内容：${currentJson}\n换一组新的三句，三句都要与当前内容不同，但场景保持一致。`;
  }
  return '';
}

function preserveThinkingFields(next, body) {
  if (!thinkingSentenceKeys.includes(body.regenerateKey) || !body.currentResult) return next;
  const current = normalizeThinkingModeResult(body.currentResult, body.scene);
  for (const key of thinkingSentenceKeys) {
    if (key !== body.regenerateKey) next[key] = current[key];
  }
  next.scene_name = current.scene_name;
  return next;
}

function countEnglishWords(value) {
  return String(value || '').match(/[a-z]+(?:['’-][a-z]+)*/gi)?.length || 0;
}

function thinkingLengthViolations(result) {
  const rules = [
    { key: 'i_see', min: 8, max: 14 },
    { key: 'i_think', min: 6, max: 12 },
  ];
  return rules.filter(({ key, min, max }) => {
    const count = countEnglishWords(result[key]);
    return count < min || count > max;
  });
}

async function enforceThinkingLengths(initialResult, body, prompt) {
  let candidate = preserveThinkingFields(initialResult, body);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const violations = thinkingLengthViolations(candidate);
    if (violations.length === 0) return candidate;
    const requirements = violations
      .map(({ key, min, max }) => `${key} 必须为 ${min}-${max} 个英文单词`)
      .join('；');
    const response = await chat({
      jsonMode: true,
      maxTokens: 800,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `下面内容不符合句长规则：${requirements}。只重写违规字段，其他字段原样返回；每句仍只表达一个目的。\n当前JSON：${JSON.stringify(candidate)}`,
        },
      ],
    });
    const data = await response.json();
    const corrected = normalizeThinkingModeResult(
      parseJson(data.choices?.[0]?.message?.content || ''),
      candidate.scene_name,
    );
    const violationKeys = new Set(violations.map(({ key }) => key));
    for (const key of thinkingSentenceKeys) {
      if (!violationKeys.has(key)) corrected[key] = candidate[key];
    }
    corrected.scene_name = candidate.scene_name;
    candidate = preserveThinkingFields(corrected, body);
  }
  throw new Error('AI 未能按句长规则生成内容，请再试一次');
}

async function thinkingMode(body) {
  const prompt = thinkingModePrompt(body.difficulty || 'natural');
  const regenerationInstruction = thinkingRegenerationInstruction(body);
  const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.length > 500;
  if (hasImage && process.env.DASHSCOPE_API_KEY) {
    let response;
    let visionModel;
    let lastModelError;
    try {
      for (const model of visionModels) {
        try {
          response = await curlJson(dashscopeCompatibleUrl, process.env.DASHSCOPE_API_KEY, {
            model,
            max_tokens: 800,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${body.imageBase64}` } },
                { type: 'text', text: `仔细识别图片中的真实场景，并按要求生成三步英语内容。${regenerationInstruction}` },
              ] },
            ],
          });
          visionModel = model;
          break;
        } catch (error) {
          if (!/model_not_found|Model not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
          lastModelError = error;
        }
      }
      if (!response) throw lastModelError || new Error('没有可用的千问视觉模型');
    } catch (error) {
      throw friendlyDashScopeError(error, '图片识别');
    }
    const data = await response.json();
    const normalized = await enforceThinkingLengths(
      normalizeThinkingModeResult(parseJson(data.choices?.[0]?.message?.content || ''), body.scene),
      body,
      prompt,
    );
    return {
      ...normalized,
      vision_used: true,
      vision_model: visionModel,
    };
  }
  const response = await chat({ jsonMode: true, messages: [
    { role: 'system', content: prompt },
    { role: 'user', content: `场景：${body.scene || '日常室内场景'}；难度：${body.difficulty || 'natural'}${regenerationInstruction}` },
  ] });
  const data = await response.json();
  const normalized = await enforceThinkingLengths(
    normalizeThinkingModeResult(parseJson(data.choices?.[0]?.message?.content || ''), body.scene),
    body,
    prompt,
  );
  return {
    ...normalized,
    vision_used: false,
  };
}

function cleanTtsText(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*#>`_\u2022]/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function friendlyDashScopeError(error, feature) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Arrearage/i.test(message)) {
    return new Error(`千问账户余额或免费额度不足，${feature}暂不可用。请在阿里云百炼控制台恢复额度后重试。`);
  }
  if (/InvalidApiKey|Unauthorized|AccessDenied/i.test(message)) {
    return new Error(`千问 API Key 无效或无权使用${feature}。请检查 DASHSCOPE_API_KEY。`);
  }
  return error instanceof Error ? error : new Error(message);
}

async function qwenTts(body) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('未配置 DASHSCOPE_API_KEY');
  const text = cleanTtsText(body.text).slice(0, 2000);
  if (!text) throw new Error('朗读内容不能为空');
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const letterCount = (text.match(/[a-z]/gi) || []).length;
  const english = letterCount >= chineseCount * 2;
  const voice = english ? 'Jennifer' : 'Cherry';
  let response;
  try {
    response = await curlJson(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      key,
      { model: 'qwen3-tts-flash', input: { text, voice, language_type: english ? 'English' : 'Chinese' } },
    );
  } catch (error) {
    throw friendlyDashScopeError(error, '语音合成');
  }
  const data = await response.json();
  const audioUrl = data.output?.audio?.url;
  if (!audioUrl) throw new Error(data.message || '千问语音合成未返回音频');
  return { audioUrl, voice, language: english ? 'en-US' : 'zh-CN', provider: 'qwen3-tts-flash' };
}

async function qwenAsr(body) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('未配置 DASHSCOPE_API_KEY');
  const speech = String(body.speech || '').replace(/^data:[^,]+,/, '');
  const format = String(body.format || 'wav').toLowerCase();
  const mimeTypes = { wav: 'audio/wav', m4a: 'audio/mp4', mp3: 'audio/mpeg', webm: 'audio/webm' };
  if (!speech || !mimeTypes[format]) throw new Error('录音数据或格式无效');
  if (speech.length > 13_500_000) throw new Error('录音超过 10MB 限制');

  let response;
  try {
    response = await curlJson(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      key,
      {
        model: 'qwen3-asr-flash',
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: { data: `data:${mimeTypes[format]};base64,${speech}` },
          }],
        }],
        stream: false,
        asr_options: { language: body.language || 'en', enable_itn: true },
      },
    );
  } catch (error) {
    throw friendlyDashScopeError(error, '语音识别');
  }
  const data = await response.json();
  const transcript = String(data.choices?.[0]?.message?.content || '').trim();
  if (!transcript) throw new Error('千问未识别到语音内容');
  const annotation = data.choices?.[0]?.message?.annotations?.[0];
  return {
    err_no: 0,
    result: [transcript],
    language: annotation?.language || body.language || 'en',
    provider: 'qwen3-asr-flash',
  };
}

async function localTts(body) {
  const text = cleanTtsText(body.text).slice(0, 2000);
  if (!text) throw new Error('朗读内容不能为空');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${localTtsUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `本地语音合成失败 (${response.status})`);
    return payload;
  } catch (error) {
    if (error instanceof Error && !/fetch failed|aborted/i.test(error.message)) throw error;
    throw new Error('本地 Kokoro 朗读服务未启动，请先运行 pnpm speech:setup，再使用 pnpm dev:local 启动。');
  } finally {
    clearTimeout(timeout);
  }
}

async function localAsr(body) {
  if (!localAsrInstalled()) {
    throw new Error('本地 Whisper 尚未安装，请先运行 pnpm speech:setup');
  }

  const speech = String(body.speech || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  const format = String(body.format || 'wav').toLowerCase();
  const extensions = new Set(['wav', 'm4a', 'mp3', 'webm', 'mp4']);
  if (!speech || !extensions.has(format) || !/^[a-z0-9+/]+=*$/i.test(speech)) {
    throw new Error('录音数据或格式无效');
  }
  if (speech.length > 13_500_000) throw new Error('录音超过 10MB 限制');

  const audio = Buffer.from(speech, 'base64');
  if (audio.length < 44) throw new Error('录音数据为空或损坏');

  const workDir = await mkdtemp(join(tmpdir(), 'visual-english-asr-'));
  const inputPath = join(workDir, `source.${format === 'mp4' ? 'm4a' : format}`);
  const wavPath = join(workDir, 'input.wav');
  const outputPath = join(workDir, 'transcript');
  try {
    await writeFile(inputPath, audio);
    await runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-v', 'error', '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath,
    ], 45_000);
    await runProcess(whisperCli, [
      '-ng', '-m', whisperModel, '-f', wavPath, '-l', 'en', '-nt', '-otxt', '-of', outputPath, '-np',
    ]);
    const transcript = (await readFile(`${outputPath}.txt`, 'utf8'))
      .replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE|SILENCE)\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!transcript) throw new Error('未识别到清晰的英文语音，请靠近麦克风后重试');
    return {
      err_no: 0,
      result: [transcript],
      language: 'en',
      provider: 'whisper.cpp/base.en',
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function localTtsReady() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${localTtsUrl}/health`, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function handle(name, body) {
  if (name === 'add-xp') return awardXp(body.source);
  if (name === 'record-activity') return recordActivity(body.kind);
  if (name === 'clear-local-data') return clearLocalData();
  if (name === 'local-tts') return localTts(body);
  if (name === 'qwen-tts') return qwenTts(body);
  if (name === 'short-speech-recognition') {
    return process.env.LOCAL_SPEECH_PROVIDER === 'qwen' ? qwenAsr(body) : localAsr(body);
  }
  if (name === 'diary') {
    if (!Array.isArray(body.records) || !body.records.length) throw new Error('没有可用的学习记录');
    const summaries = body.records.map((record, index) =>
      `${index + 1}. ${record.scene_name}: ${record.i_see}; ${record.i_think}; ${record.i_say}`,
    ).join('\n');
    const weekly = body.diaryType === 'weekly';
    const response = await chat({ messages: [
      { role: 'system', content: weekly
        ? '根据学习记录写一篇200词左右的第一人称英文 Weekly Story，只返回正文，结尾鼓励下周继续学习。'
        : '根据学习记录写一篇150词左右的第一人称英文日记，以 Dear Diary, 开头，只返回正文。' },
      { role: 'user', content: summaries },
    ], maxTokens: 600 });
    const data = await response.json();
    return { content: data.choices?.[0]?.message?.content?.trim() || '' };
  }
  if (name === 'shadowing') {
    const sentence = String(body.sentence || '').trim();
    const transcript = String(body.transcript || '').trim();
    if (!sentence || !transcript) throw new Error('未识别到跟读内容，请重试');
    const clean = (value) => value.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(/\s+/).filter(Boolean);
    const targetWords = clean(sentence);
    const spokenWords = clean(transcript);
    const wordScores = targetWords.map((word, index) => {
      const exact = spokenWords[index] === word;
      const elsewhere = spokenWords.includes(word);
      return { word, score: exact ? 95 : elsewhere ? 75 : 45, tip: exact ? '' : '放慢并清晰重读' };
    });
    const score = Math.round(wordScores.reduce((sum, item) => sum + item.score, 0) / Math.max(wordScores.length, 1));
    const weakWords = wordScores.filter((item) => item.score < 80).map((item) => item.word);
    return {
      score, wordScores, weakWords,
      pronunciation: score >= 80 ? '多数单词识别准确。' : '部分单词未被准确识别。',
      rhythm: '建议保持自然停顿并完整读完句子。',
      strongPoints: score >= 80 ? '句子完整度较好。' : '已经完成了一次有效跟读。',
      suggestion: weakWords.length ? `重点重读：${weakWords.slice(0, 3).join(', ')}` : '继续保持自然语速。',
      feedback: score >= 80 ? '表现不错，发音清晰度较高！' : '继续放慢语速，逐词练习后再试一次。',
      transcript,
    };
  }
  if (name === 'thinking-mode') return thinkingMode(body);
  if (name === 'translate') {
    const response = await chat({ messages: [
      { role: 'system', content: '只返回准确自然的中文翻译，不要解释。' },
      { role: 'user', content: body.text || '' },
    ], maxTokens: 300 });
    const data = await response.json();
    return { translation: data.choices?.[0]?.message?.content?.trim() || '' };
  }
  if (name === 'word-detail') {
    const response = await chat({ jsonMode: true, messages: [
      { role: 'system', content: '你是英语词典。严格返回JSON字段 word, phonetic, meaning, partOfSpeech, collocations数组, examples数组, memoryTip。' },
      { role: 'user', content: `查询单词 ${body.word}，场景 ${body.scene || '日常'}` },
    ] });
    const data = await response.json();
    return parseJson(data.choices?.[0]?.message?.content || '');
  }
  if (name === 'dialogue') {
    const messages = (body.messages || []).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
    if (!messages.length) messages.push({ role: 'user', content: '请开始对话' });
    const response = await chat({ jsonMode: true, messages: [
      { role: 'system', content: `扮演${body.scene || '日常'}场景角色。严格返回JSON字段 content,isNatural,suggestion,feedback，简短推进英语对话。` },
      ...messages,
    ], maxTokens: 350 });
    const data = await response.json();
    return { role: 'ai', ...parseJson(data.choices?.[0]?.message?.content || '') };
  }
  throw new Error(`${name} 在本地演示模式下暂不可用`);
}

async function streamChat(name, body, res) {
  const scene = body.scene || body.sceneNameZh || '日常英语练习';
  const requiredRounds = Math.max(1, Number(body.requiredRounds) || 5);
  const currentRound = Math.max(1, Math.min(Number(body.currentRound) || 1, requiredRounds));
  const isFinalRound = body.isFinalRound === true || currentRound >= requiredRounds;
  const dialogueGoal = String(body.dialogueGoal || '').trim();
  const roundInstruction = isFinalRound
    ? `这是第 ${currentRound}/${requiredRounds} 轮，也是本轮最后一次回复。请自然完成当前场景，用1到2句英语礼貌收尾；不要再提问，不要邀请用户继续回答。`
    : `这是第 ${currentRound}/${requiredRounds} 轮，请用不超过3句英语自然推进对话。`;
  const system = name === 'scene-dialogue-chat'
    ? `你是${scene}场景中的角色，用简短自然的英语与学习者对话。${dialogueGoal ? `练习目标：${dialogueGoal}。` : ''}${roundInstruction}`
    : `你是友好专业的英语教练。围绕${scene}纠正表达并自然推进对话。`;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  let content = '';
  try {
    const response = await chat({
      messages: [{ role: 'system', content: system }, ...messages],
      maxTokens: 500,
      timeoutSeconds: name === 'ai-coach-chat' ? 20 : 90,
    });
    const data = await response.json();
    content = data.choices?.[0]?.message?.content || '';
  } catch (error) {
    if (name !== 'ai-coach-chat') throw error;
    console.warn(`[ai-coach-chat] 上游模型不可用，启用本地练习模式：${error instanceof Error ? error.message : String(error)}`);
    content = localCoachReply(messages);
  }
  res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/health') {
    return json(res, 200, {
      ok: true,
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      dashscope: Boolean(process.env.DASHSCOPE_API_KEY),
      localAsr: localAsrInstalled(),
      localTts: await localTtsReady(),
    });
  }
  const name = req.url?.match(/^\/functions\/v1\/([^/?]+)/)?.[1];
  const dataTable = req.url?.match(/^\/data\/([^/?]+)/)?.[1];
  if ((!name && !dataTable) || req.method !== 'POST') return json(res, 404, { error: 'Not found' });
  if (name && !KNOWN_FUNCTIONS.has(name)) return json(res, 404, { error: `未知本地接口：${name}` });
  let raw = '';
  let receivedBytes = 0;
  let tooLarge = false;
  req.on('data', (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_REQUEST_BYTES) {
      tooLarge = true;
      raw = '';
      return;
    }
    if (!tooLarge) raw += chunk;
  });
  req.on('end', async () => {
    if (tooLarge) return json(res, 413, { error: '请求内容过大，请压缩图片或缩短录音后重试' });
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { error: '请求 JSON 格式无效' });
    }
    try {
      if (dataTable) return json(res, 200, { data: await handleDataRequest(dataTable, body) });
      if (name === 'ai-coach-chat' || name === 'scene-dialogue-chat') return await streamChat(name, body, res);
      json(res, 200, await handle(name, body));
    }
    catch (error) { json(res, 500, { error: error instanceof Error ? error.message : String(error) }); }
  });
});

const port = Number(process.env.LOCAL_AI_PORT || 8787);
server.listen(port, '127.0.0.1', () => {
  console.log(`Local AI gateway: http://127.0.0.1:${port}`);
});
