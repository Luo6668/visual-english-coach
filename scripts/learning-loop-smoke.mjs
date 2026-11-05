// Optional live-provider smoke check. Uses synthetic text, writes no learning data.
import assert from 'node:assert/strict';
const base = process.env.LOCAL_AI_URL || 'http://127.0.0.1:8787/functions/v1';
const tasks = [
  { id: 'drink', label: '点饮料', criterion: 'The learner explicitly orders a named drink.' },
  { id: 'size', label: '说明杯型', criterion: 'The learner specifies drink size.' },
  { id: 'takeaway', label: '确认外带', criterion: 'The learner states dine-in or takeaway.' },
];
async function assist(action, text, partner = 'What can I get for you?') {
  const response = await fetch(`${base}/learning-assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, text, scene: '咖啡馆', partner, tasks }), signal: AbortSignal.timeout(35000) });
  const data = await response.json(); assert.equal(response.status, 200, data.error); return data;
}
try {
  const greeting = await assist('feedback', 'Hello.'); assert.deepEqual(greeting.completedTasks, []); console.log('OK M1 greeting does not complete concrete tasks');
  const text = 'Could I have a medium latte to go, please?';
  const order = await assist('feedback', text); assert.equal(order.completedTasks.length, 3); assert.ok(order.completedTasks.every(item => text.toLowerCase().includes(item.evidence.toLowerCase()))); console.log('OK M1 concrete order produces three source-backed goals');
  for (const action of ['keywords', 'example', 'simplify']) { const result = await assist(action, '', 'Would you like your drink hot or iced?'); assert.ok(result.hint); assert.equal(result.feedback, null); assert.deepEqual(result.completedTasks, []); console.log(`OK M2 ${action}`); }
  const correction = await assist('feedback', 'I has a reservation.'); assert.equal(correction.feedback?.kind, 'correction'); assert.match(correction.feedback.suggestion, /I have/i); console.log('OK M3 grammar correction and optional Chinese cue');
  const invalid = await fetch(`${base}/learning-assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'award-xp' }) }); assert.ok(!invalid.ok); console.log('OK invalid action rejected');
} catch (e) { console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
