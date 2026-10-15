import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const speechRoot = resolve(process.env.LOCAL_SPEECH_DIR || '.local-speech');
const venv = resolve(speechRoot, 'venv');
const python = resolve(venv, 'bin/python');
const expoCli = resolve('node_modules/expo/bin/cli');
const speechEnv = {
  ...process.env,
  VIRTUAL_ENV: venv,
  PATH: `${resolve(venv, 'bin')}:${process.env.PATH || ''}`,
  HF_HOME: process.env.HF_HOME || resolve(speechRoot, 'huggingface'),
  HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || '1',
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || resolve(speechRoot, 'cache'),
  TORCH_HOME: process.env.TORCH_HOME || resolve(speechRoot, 'torch'),
};

const commands = [];
if (existsSync(python)) {
  commands.push(spawn(python, ['scripts/local-tts-server.py'], { stdio: 'inherit', env: speechEnv }));
} else {
  console.warn('Local speech is not installed. Run `pnpm speech:setup` to enable Whisper and Kokoro.');
}
commands.push(
  spawn('node', ['scripts/local-ai-gateway.mjs'], { stdio: 'inherit', env: speechEnv }),
  process.env.EXPO_WEB_PORT
    ? spawn(process.execPath, [expoCli, 'start', '--web', '--port', process.env.EXPO_WEB_PORT], { stdio: 'inherit', env: speechEnv })
    : spawn(process.execPath, [expoCli, 'start', '--web'], { stdio: 'inherit', env: speechEnv }),
);

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of commands) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 200);
}

for (const child of commands) {
  child.on('exit', (code) => {
    if (!stopping && code) stop(code);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
