# Miaoda Migration Status

## Local single-user version - Completed

- Project installs with a frozen pnpm lockfile outside Miaoda.
- The Web app runs without a Supabase account and uses a local demo session.
- Learning records, words, scenes, diaries, progress, daily stats, streaks, and XP persist in MySQL.
- DeepSeek and DashScope secrets are separated from Expo public configuration.
- All Web microphone entry points use MediaRecorder and 16 kHz mono WAV conversion.
- Local Whisper.cpp ASR is shared by Home, AI Coach, Dialogue, Scene Dialogue, and Shadowing.
- Shadowing transcribes audio before sending the transcript to DeepSeek for scoring.
- XP values and activity counters are calculated by the local server; duplicate daily rewards are blocked.
- Settings show live local-service configuration and can clear local learning data after confirmation.
- `pnpm smoke:local` validates MySQL stats, XP, idempotency, and cleanup with an isolated test user.
- Local Kokoro-82M provides both the preferred English voice and a Mandarin voice; pending synthesis is invalidated immediately when playback is stopped.
- Local/cloud function routing now uses the validated Supabase configuration state, so placeholder Supabase values cannot divert local chat or TTS requests.
- Selected images are resized and compressed before vision requests; missing, unreadable, and oversized images produce actionable errors.
- Thinking-mode responses are validated before rendering or persistence, and generated expressions are saved to the sentence book.
- The learning diary tab reads real diary records and exposes load failures with a retry action.
- Daily streaks are owned by daily check-in only, preventing activity plus check-in from incrementing the same day twice.
- Local calendar dates use the device timezone instead of UTC.
- Cancelled AI streams remove unfinished messages, and scene progress advances only after a valid AI reply.
- The local gateway returns 400 for malformed JSON, 404 for unknown functions, and 413 for oversized payloads.

## Verification - 2026-10-10

- `pnpm verify`: lint and TypeScript passed across 71 files.
- `pnpm smoke:local`: MySQL CRUD, sentence persistence, counters, XP idempotency, streak ownership, and cleanup passed.
- Expo Web production export completed successfully with 1,522 bundled modules.
- DeepSeek translation, thinking mode, dictionary, dialogue, diary, AI Coach streaming, and scene dialogue streaming returned valid responses.
- Local gateway health and 400/404/413 error contracts passed.
- Kokoro-to-Whisper end-to-end speech smoke tests passed three consecutive runs with an exact transcript match.
- Whisper transcription passed for both Web WAV and native-style M4A input.
- The sanitized source archive passed ZIP integrity checks and contains no `.env` files or API-key patterns.

## Local speech

- `pnpm speech:setup` installs an isolated Python 3.12 environment, Kokoro-82M, Whisper.cpp, and the `base.en` model under `.local-speech`.
- English ASR plus English/Mandarin TTS run on the local machine without API fees or provider quotas.

## External dependency

- The current DashScope account must have available balance or free quota for image recognition.
- DeepSeek must remain active for chat, translation, diary generation, dictionary details, and shadowing evaluation.

## Before multi-user or public deployment

- Replace demo login with real password authentication.
- Remove the fixed `local-demo-user` identity and derive `user_id` from a verified session.
- Add API authentication, request validation, restricted CORS, rate limits, and provider cost quotas.
- Host the API and MySQL behind HTTPS and move secrets to the server environment.
- Run Android/iOS device tests with reachable API URLs.

## Maintainability

- Split the largest route files into feature components and hooks.
- Reuse the shared audio-capture module in AI Coach, Dialogue, and Scene Dialogue to remove the remaining duplicate recorder code.
- Persist the word-detail bookmark state instead of keeping it only in component state.
- Replace the external Youdao pronunciation URL and remote fallback image if fully offline operation is required.
- Add visible retry states to Home and Profile when the local MySQL gateway is unavailable.
- Add a confirmation step before deleting a diary.
- Replace the remaining `miaoda-expo-devkit` Babel, Metro, TypeScript, and lint presets with standard Expo configuration.
- Add CI that runs `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm smoke:local`, and a production bundle.
