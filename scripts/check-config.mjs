import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnv(relativePath) {
  const path = resolve(process.cwd(), relativePath);
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1).trim()];
      }),
  );
}

const client = readEnv('.env');
const server = { ...client, ...readEnv('supabase/.env') };
const mysql = readEnv('mysql/.env');
const speechRoot = resolve(process.cwd(), process.env.LOCAL_SPEECH_DIR || '.local-speech');
const localAsrReady = existsSync(resolve(speechRoot, 'whisper.cpp/build/bin/whisper-cli'))
  && existsSync(resolve(speechRoot, 'whisper.cpp/models/ggml-base.en.bin'));
const localTtsReady = existsSync(resolve(speechRoot, 'venv/bin/python'))
  && existsSync(resolve(speechRoot, 'kokoro-smoke.wav'));
const checks = [
  ['MySQL Host', mysql.MYSQL_HOST, true],
  ['MySQL Database', mysql.MYSQL_DATABASE, true],
  ['MySQL User', mysql.MYSQL_USER, true],
  ['MySQL Password', mysql.MYSQL_PASSWORD, true],
  ['DeepSeek API Key', server.DEEPSEEK_API_KEY, true],
  ['DashScope API Key', server.DASHSCOPE_API_KEY, false],
  ['Miaoda Integrations Key', server.INTEGRATIONS_API_KEY, false],
  ['Supabase URL (unused locally)', client.EXPO_PUBLIC_SUPABASE_URL, false],
];

let missingRequired = false;
for (const [label, value, required] of checks) {
  const configured = Boolean(value && !/placeholder|your-/i.test(value));
  console.log(`${configured ? 'OK' : required ? 'MISSING' : 'OPTIONAL'}  ${label}`);
  if (required && !configured) missingRequired = true;
}

console.log(`${localAsrReady ? 'OK' : 'MISSING'}  Local Whisper ASR`);
console.log(`${localTtsReady ? 'OK' : 'MISSING'}  Local Kokoro TTS`);
if (!localAsrReady || !localTtsReady) missingRequired = true;

if (missingRequired) {
  console.error('\nRequired configuration is incomplete. See README.md and the example env files.');
  process.exitCode = 1;
}
