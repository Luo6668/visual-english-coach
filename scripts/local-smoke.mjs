import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

loadEnv(resolve('mysql/.env'));
process.env.LOCAL_USER_ID = `local-smoke-${process.pid}`;

const database = await import('./local-mysql.mjs');
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE || 'visual_english_coach',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
});

try {
  await connection.query(
    `INSERT INTO user_stats (user_id, streak_days, last_study_date, last_checkin_date)
     VALUES (?, 4, DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY))`,
    [process.env.LOCAL_USER_ID],
  );
  await database.recordActivity('scene');
  await database.recordActivity('word');
  const beforeCheckIn = await database.handleDataRequest('user_stats', { single: true });
  const record = await database.handleDataRequest('learning_records', { action: 'insert', values: {
    input_type: 'manual', input_text: 'smoke test', scene_name: '测试场景',
    i_see: 'I see a test.', i_think: 'I think it works.', i_say: 'I would say hello.',
    difficulty: 'natural', words: ['test'],
  } });
  await database.handleDataRequest('sentences', { action: 'insert', values: {
    sentence: 'I see a test.', record_id: record.id,
  } });
  const sentences = await database.handleDataRequest('sentences', { filters: { record_id: record.id } });
  await database.handleDataRequest('scene_map_progress', { action: 'upsert', values: {
    scene_id: 'smoke-subway', scene_name_zh: '地铁', scene_name_en: 'Subway',
    category: 'daily', status: 'in_progress', dialogue_rounds: 1,
    last_practiced: new Date().toISOString(),
  } });
  const sceneMapProgress = await database.handleDataRequest('scene_map_progress', {
    filters: { scene_id: 'smoke-subway' }, single: true,
  });
  const sceneXp = await database.awardXp('scene_analysis_smoke');
  const dialogueXp = await database.awardXp('dialogue_scene_smoke');
  await database.recordActivity('dialogue');
  const duplicateDialogueXp = await database.awardXp('dialogue_scene_smoke');
  const checkIn = await database.awardXp('daily_checkin');
  const duplicate = await database.awardXp('daily_checkin');
  const stats = await database.handleDataRequest('user_stats', { single: true });
  const daily = await database.handleDataRequest('daily_stats', { single: true });

  assert(sceneXp.awarded === 20, '场景 XP 规则异常');
  assert(dialogueXp.awarded === 30, '场景对话 XP 规则异常');
  assert(duplicateDialogueXp.awarded === 0 && duplicateDialogueXp.duplicate, '场景对话奖励未阻止重复发放');
  assert(checkIn.awarded === 10, '每日打卡 XP 规则异常');
  assert(duplicate.awarded === 0 && duplicate.duplicate, '每日奖励未阻止重复发放');
  assert(beforeCheckIn.streak_days === 4, '普通学习活动不应提前增加连续打卡天数');
  assert(sentences.length === 1 && sentences[0].sentence === 'I see a test.', '表达句子写入或读取异常');
  assert(sceneMapProgress?.dialogue_rounds === 1, 'ISO 时间写入 MySQL 时场景进度保存异常');
  assert(stats.total_scenes === 1 && stats.total_words === 1 && stats.total_dialogues === 1, '累计学习统计异常');
  assert(stats.total_xp === 60 && stats.streak_days === 5, 'XP 或连续学习统计异常');
  assert(daily.scene_count === 1 && daily.word_count === 1 && daily.dialogue_count === 1, '每日学习统计异常');
  console.log('Local MySQL smoke test passed.');
} finally {
  await database.clearLocalData().catch(() => {});
  await connection.query('DELETE FROM user_stats WHERE user_id = ?', [process.env.LOCAL_USER_ID]);
  await connection.end();
  await database.closeLocalDatabase();
}
