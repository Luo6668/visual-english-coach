import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
try { for (const line of readFileSync('mysql/.env', 'utf8').split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } } catch {}
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE || 'visual_english_coach', user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
try {
  const [rows] = await db.query('SHOW COLUMNS FROM diaries');
  const fields = new Set(rows.map(row => row.Field));
  for (const [field, type] of [['source_text', 'MEDIUMTEXT NULL'], ['writing_mode', 'VARCHAR(16) NULL'], ['source_kind', 'VARCHAR(20) NULL'], ['learning_expressions', 'JSON NULL']]) {
    if (!fields.has(field)) await db.query(`ALTER TABLE diaries ADD COLUMN \`${field}\` ${type}`);
  }
  console.log('Diary writing metadata ready; existing diary content preserved.');
} finally { await db.end(); }
