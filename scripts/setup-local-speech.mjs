import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const speechRoot = resolve(process.env.LOCAL_SPEECH_DIR || '.local-speech');
const venv = resolve(speechRoot, 'venv');
const python = resolve(venv, 'bin/python');
const cmake = resolve(venv, 'bin/cmake');
const whisperRoot = resolve(speechRoot, 'whisper.cpp');
const whisperCli = resolve(whisperRoot, 'build/bin/whisper-cli');
const whisperModel = resolve(whisperRoot, 'models/ggml-base.en.bin');

mkdirSync(speechRoot, { recursive: true });

const env = {
  ...process.env,
  VIRTUAL_ENV: venv,
  PATH: `${resolve(venv, 'bin')}:${process.env.PATH || ''}`,
  UV_CACHE_DIR: resolve(speechRoot, 'uv-cache'),
  UV_HTTP_TIMEOUT: process.env.UV_HTTP_TIMEOUT || '120',
  UV_HTTP_RETRIES: process.env.UV_HTTP_RETRIES || '5',
  UV_PYTHON_INSTALL_DIR: resolve(speechRoot, 'python'),
  HF_HOME: resolve(speechRoot, 'huggingface'),
  HF_HUB_DISABLE_XET: '1',
  XDG_CACHE_HOME: resolve(speechRoot, 'cache'),
  TORCH_HOME: resolve(speechRoot, 'torch'),
};

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n> ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed (${signal || code})`));
    });
  });
}

function completeWhisperModel(path) {
  return existsSync(path) && statSync(path).size > 140_000_000;
}

async function downloadWhisperModel() {
  const partial = `${whisperModel}.part`;
  if (completeWhisperModel(partial)) {
    renameSync(partial, whisperModel);
    return;
  }
  if (existsSync(whisperModel) && !completeWhisperModel(whisperModel) && !existsSync(partial)) {
    renameSync(whisperModel, partial);
  }
  const url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await run('curl', [
        '--http1.1', '-L', '--fail', '--continue-at', '-',
        '--connect-timeout', '30', '--output', partial, url,
      ]);
    } catch (error) {
      if (attempt === 10) throw error;
      console.warn(`Whisper model download interrupted; resuming (${attempt}/10)...`);
      continue;
    }
    if (completeWhisperModel(partial)) {
      renameSync(partial, whisperModel);
      return;
    }
  }
  throw new Error('Whisper model download is incomplete');
}

try {
  await run('uv', ['--version']);
  await run('uv', ['python', 'install', '3.12']);
  if (!existsSync(python)) await run('uv', ['venv', '--python', '3.12', venv]);
  await run('uv', [
    'pip', 'install', '--python', python,
    'kokoro==0.9.4', 'misaki[zh]==0.9.4', 'soundfile', 'numpy', 'espeakng-loader', 'cmake',
  ]);

  if (!existsSync(whisperRoot)) {
    await run('git', ['clone', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp.git', whisperRoot]);
  }
  if (!existsSync(whisperCli)) {
    await run(cmake, ['-S', whisperRoot, '-B', resolve(whisperRoot, 'build'), '-DCMAKE_BUILD_TYPE=Release']);
    await run(cmake, ['--build', resolve(whisperRoot, 'build'), '--config', 'Release', '-j', '4']);
  }
  if (!completeWhisperModel(whisperModel)) await downloadWhisperModel();

  await run(python, [
    'scripts/local-tts-server.py', '--warmup',
    '--output', resolve(speechRoot, 'kokoro-smoke.wav'),
  ]);
  rmSync(env.UV_CACHE_DIR, { recursive: true, force: true });
  console.log('\nLocal speech is ready. Start the app with `pnpm dev:local`.');
} catch (error) {
  console.error(`\nLocal speech setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
