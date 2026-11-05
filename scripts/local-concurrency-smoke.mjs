// Real MySQL concurrency regression. All rows belong to this process's synthetic owner.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
for (const line of readFileSync('mysql/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
process.env.LOCAL_USER_ID = `local-concurrency-smoke-${process.pid}`;
const owner = process.env.LOCAL_USER_ID;
const db = await import('./local-mysql.mjs');
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE || 'visual_english_coach', user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
try {
  // Match an established logged-in account, then use the same concurrency as real pages.
  await db.awardXp('daily_checkin');
  const failures = [];
  for (let i = 0; i < 8; i++) {
    const results = await Promise.allSettled([db.recordActivity('scene'), db.awardXp(`scene_analysis_parallel_${i}`)]);
    failures.push(...results.filter(result => result.status === 'rejected').map(result => result.reason?.code || 'request-failed'));
  }
  assert.deepEqual(failures, [], 'Concurrent activity / XP requests must never lose writes');
  const stats = await db.handleDataRequest('user_stats', { single: true });
  assert.equal(stats.total_scenes, 8);
  assert.equal(stats.total_xp, 170);
  const duplicate = await Promise.all([db.awardXp('dialogue_same_event'), db.awardXp('dialogue_same_event')]);
  assert.equal(duplicate.reduce((sum, item) => sum + item.awarded, 0), 30);
  assert.equal(duplicate.filter(item => item.duplicate).length, 1);
  console.log('OK concurrent activity / XP: 8 pairs, exact counts, no lost rewards');
  console.log('OK concurrent duplicate reward: awarded exactly once');
} finally {
  await db.clearLocalData(owner);
  await connection.query('DELETE FROM user_stats WHERE user_id = ?', [owner]);
  await connection.end();
  await db.closeLocalDatabase();
}
