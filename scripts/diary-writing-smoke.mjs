import assert from 'node:assert/strict';
import { diaryWritingRequest, validateDiaryWriting } from '../supabase/functions/_shared/diary-writing.mjs';
const base = 'http://127.0.0.1:8787';
const owner = `diary-writing-smoke-${Date.now()}`;
async function request(path, body) { const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-local-user-id': owner }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) }); const value = await response.json(); assert.ok(response.ok, value.error || response.status); return value; }
const source = '昨天下午三点，我和姐姐在家做了番茄面。虽然下雨没能去公园，但我觉得很开心。';
const results = await Promise.all(['natural','simple','polished'].map(async mode => { const input = { action: 'translate', source, mode }; const output = validateDiaryWriting(await request('/functions/v1/diary', input), diaryWritingRequest(input)); assert.equal(output.source_text, source); assert.match(output.content, /sister/i); assert.match(output.content, /rain/i); assert.match(output.content, /tomato/i); console.log(`OK live ${mode}: ${output.content}`); return output; }));
try {
 const output = results[0];
 const created = (await request('/data/diaries', { action: 'insert', values: { diary_type: 'daily', study_date: '2026-11-01', content: output.content, source_text: source, writing_mode: output.mode, source_kind: 'written', learning_expressions: output.expressions } })).data;
 await request('/data/diaries', { action: 'update', filters: { id: created.id }, values: { content: results[2].content, writing_mode: 'polished' } });
 const rows = (await request('/data/diaries', {})).data;
 assert.equal(rows.length, 1); assert.equal(rows[0].source_text, source); assert.equal(rows[0].writing_mode, 'polished'); assert.ok(Array.isArray(rows[0].learning_expressions)); assert.equal(rows[0].study_date, '2026-11-01');
 const weekly = await request('/functions/v1/diary', { action: 'weekly', diaries: rows, mode: 'natural' }); assert.ok(weekly.content); assert.ok(weekly.source_text); console.log('OK live weekly preview based on saved diary');
 console.log('OK bilingual persistence, selected date, update without duplicate, JSON expression round-trip');
} finally { await request('/data/diaries', { action: 'delete', filters: {} }); }
