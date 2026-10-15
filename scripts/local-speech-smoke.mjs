const gateway = process.env.LOCAL_AI_URL || 'http://127.0.0.1:8787/functions/v1';

async function invoke(name, body) {
  const response = await fetch(`${gateway}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${name} failed (${response.status})`);
  return payload;
}

try {
  const phrase = 'The local English voice is clear and ready for practice.';
  const tts = await invoke('local-tts', { text: phrase });
  if (tts.language !== 'en-US' || !String(tts.voice || '').startsWith('a')) {
    throw new Error(`English TTS selected the wrong voice (${tts.voice || 'unknown'})`);
  }
  const speech = String(tts.audioData || '').replace(/^data:[^,]+,/, '');
  if (!speech) throw new Error('Kokoro returned no audio');

  const mandarin = await invoke('local-tts', {
    text: '你好，普通话语音已经准备好了。',
  });
  const mandarinSpeech = String(mandarin.audioData || '').replace(/^data:[^,]+,/, '');
  if (!mandarinSpeech) throw new Error('Kokoro returned no Mandarin audio');
  if (mandarin.language !== 'zh-CN' || !String(mandarin.voice || '').startsWith('z')) {
    throw new Error(`Mandarin TTS selected the wrong voice (${mandarin.voice || 'unknown'})`);
  }

  const bilingual = await invoke('local-tts', {
    text: '很好，这句英语应该这样说：I would like a coffee, please.',
  });
  const bilingualSpeech = String(bilingual.audioData || '').replace(/^data:[^,]+,/, '');
  if (!bilingualSpeech) throw new Error('Kokoro returned no bilingual audio');
  if (bilingual.language !== 'mixed'
      || !String(bilingual.voice || '').includes('af_heart')
      || !String(bilingual.voice || '').includes('zf_xiaoxiao')) {
    throw new Error(`Bilingual TTS selected the wrong voices (${bilingual.voice || 'unknown'})`);
  }

  const asr = await invoke('short-speech-recognition', { speech, format: 'wav', language: 'en' });
  const transcript = String(asr.result?.[0] || '').trim();
  if (!transcript) throw new Error('Whisper returned no transcript');

  console.log(`OK  TTS provider: ${tts.provider} (${tts.voice})`);
  console.log(`OK  Mandarin TTS: ${mandarin.provider} (${mandarin.voice}, ${mandarin.language})`);
  console.log(`OK  Bilingual TTS: ${bilingual.provider} (${bilingual.voice}, ${bilingual.language})`);
  console.log(`OK  ASR provider: ${asr.provider}`);
  console.log(`OK  Transcript: ${transcript}`);
} catch (error) {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
