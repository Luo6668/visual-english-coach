CREATE DATABASE IF NOT EXISTS visual_english_coach CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE visual_english_coach;

CREATE TABLE IF NOT EXISTS learning_records (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, input_type VARCHAR(20) NOT NULL,
  scene_image LONGTEXT, input_text TEXT, scene_name VARCHAR(255) NOT NULL,
  i_see TEXT NOT NULL, i_think TEXT NOT NULL, i_say TEXT NOT NULL,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'natural', words JSON,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE, shadowing_score INT,
  shadowing_feedback TEXT, user_note TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_learning_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS words (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, word VARCHAR(255) NOT NULL,
  phonetic VARCHAR(255), meaning TEXT, part_of_speech VARCHAR(100), collocations JSON,
  example_sentences JSON, record_id CHAR(36), learned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_words_user_word (user_id, word)
);

CREATE TABLE IF NOT EXISTS sentences (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, sentence TEXT NOT NULL,
  translation TEXT, record_id CHAR(36), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sentences_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS scenes (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, scene_name VARCHAR(255) NOT NULL,
  scene_image LONGTEXT, practice_count INT NOT NULL DEFAULT 1,
  last_practiced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scenes_user_name (user_id, scene_name)
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id VARCHAR(128) PRIMARY KEY, level INT NOT NULL DEFAULT 1, total_words INT NOT NULL DEFAULT 0,
  total_scenes INT NOT NULL DEFAULT 0, total_shadowing INT NOT NULL DEFAULT 0,
  total_dialogues INT NOT NULL DEFAULT 0, streak_days INT NOT NULL DEFAULT 0,
  last_study_date DATE, total_xp INT NOT NULL DEFAULT 0, current_level INT NOT NULL DEFAULT 1,
  last_checkin_date DATE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, study_date DATE NOT NULL,
  scene_count INT NOT NULL DEFAULT 0, word_count INT NOT NULL DEFAULT 0,
  shadowing_count INT NOT NULL DEFAULT 0, dialogue_count INT NOT NULL DEFAULT 0,
  study_minutes INT NOT NULL DEFAULT 0, UNIQUE KEY uq_daily_user_date (user_id, study_date)
);

CREATE TABLE IF NOT EXISTS diaries (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, diary_type VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL, study_date DATE, week_start DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_diaries_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS high_freq_words (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, word VARCHAR(255) NOT NULL,
  count INT NOT NULL DEFAULT 1, study_date DATE NOT NULL,
  UNIQUE KEY uq_high_freq_user_word_date (user_id, word, study_date)
);

CREATE TABLE IF NOT EXISTS xp_logs (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, xp_amount INT NOT NULL,
  source VARCHAR(255) NOT NULL, reward_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_xp_reward (user_id, source, reward_date)
);

CREATE TABLE IF NOT EXISTS scene_progress (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, scene_key VARCHAR(255) NOT NULL,
  is_unlocked BOOLEAN NOT NULL DEFAULT FALSE, visit_count INT NOT NULL DEFAULT 0,
  expressions_count INT NOT NULL DEFAULT 0, mastery DECIMAL(5,2) NOT NULL DEFAULT 0,
  last_visited_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scene_progress (user_id, scene_key)
);

CREATE TABLE IF NOT EXISTS scene_map_progress (
  id CHAR(36) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, scene_id VARCHAR(255) NOT NULL,
  scene_name_zh VARCHAR(255) NOT NULL, scene_name_en VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'daily', status VARCHAR(30) NOT NULL DEFAULT 'locked',
  dialogue_rounds INT NOT NULL DEFAULT 0, last_practiced TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scene_map_progress (user_id, scene_id)
);

INSERT IGNORE INTO user_stats (user_id) VALUES ('local-demo-user');
