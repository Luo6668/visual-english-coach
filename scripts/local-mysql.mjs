import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

const TABLES = new Set([
  'learning_records', 'words', 'sentences', 'scenes', 'user_stats', 'daily_stats',
  'diaries', 'high_freq_words', 'xp_logs', 'scene_progress', 'scene_map_progress',
]);
const JSON_FIELDS = new Set(['words', 'collocations', 'example_sentences']);
const USER_ID = process.env.LOCAL_USER_ID || 'local-demo-user';
const ACTIVITY_FIELDS = {
  scene: ['total_scenes', 'scene_count'],
  word: ['total_words', 'word_count'],
  shadowing: ['total_shadowing', 'shadowing_count'],
  dialogue: ['total_dialogues', 'dialogue_count'],
};
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 5000];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
let pool;

function getPool() {
  pool ??= mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || 'visual_english_coach', user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '', waitForConnections: true, connectionLimit: 8,
    namedPlaceholders: true, dateStrings: true,
  });
  return pool;
}

export async function closeLocalDatabase() {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  await activePool.end();
}

function normalizeRow(row) {
  if (!row) return row;
  for (const field of JSON_FIELDS) {
    if (typeof row[field] === 'string') try { row[field] = JSON.parse(row[field]); } catch {}
  }
  for (const field of ['is_favorited', 'is_unlocked']) if (field in row) row[field] = Boolean(row[field]);
  return row;
}

function normalizeWriteValues(input = {}) {
  const values = { ...input };
  for (const [field, value] of Object.entries(values)) {
    if (JSON_FIELDS.has(field)) {
      values[field] = JSON.stringify(value);
    } else if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
      values[field] = value.slice(0, 19).replace('T', ' ');
    }
  }
  return values;
}

function where(filters = {}) {
  const parts = ['user_id = :currentUser'];
  const params = { currentUser: USER_ID };
  for (const [key, value] of Object.entries(filters)) {
    if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid filter');
    parts.push(`\`${key}\` = :f_${key}`);
    params[`f_${key}`] = value;
  }
  return { sql: parts.join(' AND '), params };
}

export async function handleDataRequest(table, body) {
  if (!TABLES.has(table)) throw new Error('Unsupported table');
  const db = getPool();
  const action = body.action || 'select';
  const scope = where(body.filters);
  if (action === 'select') {
    const order = /^[a-z_]+$/.test(body.orderBy || '') ? ` ORDER BY \`${body.orderBy}\` ${body.ascending ? 'ASC' : 'DESC'}` : '';
    const limit = Math.min(Number(body.limit || 500), 500);
    const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE ${scope.sql}${order} LIMIT ${limit}`, scope.params);
    const data = rows.map(normalizeRow);
    return body.single ? (data[0] ?? null) : data;
  }
  if (action === 'insert') {
    const values = normalizeWriteValues({ id: randomUUID(), ...body.values, user_id: USER_ID });
    const keys = Object.keys(values).filter((key) => /^[a-z_]+$/.test(key));
    await db.query(`INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map((k) => `:${k}`).join(',')})`, values);
    return normalizeRow(values);
  }
  if (action === 'update') {
    const values = normalizeWriteValues(body.values);
    const keys = Object.keys(values).filter((key) => /^[a-z_]+$/.test(key));
    if (!keys.length) return null;
    const params = { ...scope.params, ...Object.fromEntries(keys.map((k) => [`v_${k}`, values[k]])) };
    await db.query(`UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\` = :v_${k}`).join(',')} WHERE ${scope.sql}`, params);
    return true;
  }
  if (action === 'delete') {
    await db.query(`DELETE FROM \`${table}\` WHERE ${scope.sql}`, scope.params);
    return true;
  }
  if (action === 'upsert') {
    const values = normalizeWriteValues({ id: randomUUID(), ...body.values, user_id: USER_ID });
    const keys = Object.keys(values).filter((key) => /^[a-z_]+$/.test(key));
    const updates = keys.filter((k) => !['id', 'user_id'].includes(k));
    await db.query(`INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map((k) => `:${k}`).join(',')}) ON DUPLICATE KEY UPDATE ${updates.map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(',')}`, values);
    return normalizeRow(values);
  }
  throw new Error('Unsupported action');
}

function levelForXp(totalXp) {
  let level = 1;
  for (let index = 0; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (totalXp >= LEVEL_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

export async function recordActivity(kind) {
  const fields = ACTIVITY_FIELDS[kind];
  if (!fields) throw new Error('Invalid activity kind');
  const [totalField, dailyField] = fields;
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('INSERT IGNORE INTO user_stats (user_id) VALUES (?)', [USER_ID]);
    await connection.query(
      `UPDATE user_stats SET
        \`${totalField}\` = \`${totalField}\` + 1,
        last_study_date = CURDATE()
       WHERE user_id = ?`,
      [USER_ID],
    );
    await connection.query(
      `INSERT INTO daily_stats (id, user_id, study_date, \`${dailyField}\`)
       VALUES (?, ?, CURDATE(), 1)
       ON DUPLICATE KEY UPDATE \`${dailyField}\` = \`${dailyField}\` + 1`,
      [randomUUID(), USER_ID],
    );
    await connection.commit();
    return { recorded: true, kind };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function clearLocalData() {
  const db = getPool();
  const connection = await db.getConnection();
  const tables = [
    'learning_records', 'words', 'sentences', 'scenes', 'daily_stats', 'diaries',
    'high_freq_words', 'xp_logs', 'scene_progress', 'scene_map_progress',
  ];
  try {
    await connection.beginTransaction();
    for (const table of tables) {
      await connection.query(`DELETE FROM \`${table}\` WHERE user_id = ?`, [USER_ID]);
    }
    await connection.query(
      `UPDATE user_stats SET
        level = 1, total_words = 0, total_scenes = 0, total_shadowing = 0,
        total_dialogues = 0, streak_days = 0, last_study_date = NULL,
        total_xp = 0, current_level = 1, last_checkin_date = NULL
       WHERE user_id = ?`,
      [USER_ID],
    );
    await connection.commit();
    return { cleared: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function awardXp(source) {
  const baseAmount = source === 'daily_checkin' ? 10
    : source?.startsWith('scene_analysis_') ? 20
      : source?.startsWith('dialogue_') ? 30
        : source?.startsWith('shadowing_') ? 25
          : source?.startsWith('translation_') ? 5
            : source?.startsWith('learning_scene_') ? 10
              : 0;
  if (!baseAmount) throw new Error('Invalid XP source');
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('INSERT IGNORE INTO user_stats (user_id) VALUES (?)', [USER_ID]);
    const [[dates]] = await connection.query(
      'SELECT CURDATE() AS today, DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS yesterday',
    );
    const [[stats]] = await connection.query(
      'SELECT total_xp, streak_days, last_checkin_date FROM user_stats WHERE user_id = ? FOR UPDATE',
      [USER_ID],
    );
    let streak = Number(stats?.streak_days || 0);
    if (source === 'daily_checkin') {
      if (stats?.last_checkin_date === dates.today) {
        await connection.rollback();
        return { awarded: 0, duplicate: true };
      }
      streak = stats?.last_checkin_date === dates.yesterday ? streak + 1 : 1;
    }
    const amount = baseAmount + (source === 'daily_checkin' && streak % 7 === 0 ? 50 : 0);
    await connection.query(
      'INSERT INTO xp_logs (id, user_id, xp_amount, source, reward_date) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), USER_ID, amount, source, dates.today],
    );
    const totalXp = Number(stats?.total_xp || 0) + amount;
    await connection.query(
      `UPDATE user_stats SET total_xp = ?, current_level = ?,
        streak_days = ?, last_checkin_date = IF(? = 'daily_checkin', CURDATE(), last_checkin_date)
       WHERE user_id = ?`,
      [totalXp, levelForXp(totalXp), streak, source, USER_ID],
    );
    await connection.commit();
    return { awarded: amount, totalXp, level: levelForXp(totalXp), streak };
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return { awarded: 0, duplicate: true };
    throw error;
  } finally {
    connection.release();
  }
}
