-- ============================================================
-- Үг Таа — мэдээллийн сангийн бүтэц (v7.2)
--
-- Шинээр суулгах бол: setup.php-г ажиллуул (энэ файлыг автоматаар
-- уншиж, дутуу хүснэгт/баганыг нэмнэ). Эсвэл phpMyAdmin → Import.
-- Хуучин өгөгдөлд хүрэхгүй: бүх хүснэгт "IF NOT EXISTS".
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  google_id          VARCHAR(64)  NULL,
  email              VARCHAR(191) NOT NULL,
  username           VARCHAR(100) NOT NULL DEFAULT '',
  avatar_url         VARCHAR(500) NOT NULL DEFAULT '',
  balance            INT          NOT NULL DEFAULT 0,
  won_balance        INT          NOT NULL DEFAULT 0,
  referral_balance   INT          NOT NULL DEFAULT 0,
  referral_code      VARCHAR(16)  NULL,
  referred_by        INT UNSIGNED NULL,
  is_premium         TINYINT(1)   NOT NULL DEFAULT 0,
  premium_expires_at DATETIME     NULL,
  is_admin           TINYINT(1)   NOT NULL DEFAULT 0,
  is_banned          TINYINT(1)   NOT NULL DEFAULT 0,
  plays_today        INT          NOT NULL DEFAULT 0,
  last_play_date     DATE         NULL,
  extra_plays        INT          NOT NULL DEFAULT 0,
  signup_ip          VARCHAR(45)  NULL,
  last_ip            VARCHAR(45)  NULL,
  last_seen_at       DATETIME     NULL,
  created_at         DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_id),
  UNIQUE KEY uq_users_refcode (referral_code),
  KEY idx_users_referred_by (referred_by),
  KEY idx_users_signup_ip (signup_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS words (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word           VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  length         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  definition     VARCHAR(500) NOT NULL DEFAULT '',
  is_answer      TINYINT(1)   NOT NULL DEFAULT 1,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  used_count     INT          NOT NULL DEFAULT 0,
  last_used_date DATE         NULL,
  created_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_words_word (word),
  KEY idx_words_pick (is_active, is_answer, used_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_words (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word_id   INT UNSIGNED NOT NULL,
  game_date DATE         NOT NULL,
  is_active TINYINT(1)   NOT NULL DEFAULT 1,
  is_fixed  TINYINT(1)   NOT NULL DEFAULT 0,   -- 1 = админ товлосон, бүгдэд ижил үг
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_date (game_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_sessions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  word_id        INT UNSIGNED NOT NULL,
  game_date      DATE         NOT NULL,
  attempts       TEXT         NULL,
  attempts_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_won         TINYINT(1)   NOT NULL DEFAULT 0,
  is_completed   TINYINT(1)   NOT NULL DEFAULT 0,
  reward_amount  INT          NOT NULL DEFAULT 0,
  reward_paid    TINYINT(1)   NOT NULL DEFAULT 0,
  hints          VARCHAR(64)  NULL,
  created_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_user_date (user_id, game_date),
  KEY idx_sessions_date (game_date, is_won)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS archive_sessions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  game_date      DATE         NOT NULL,
  word_id        INT UNSIGNED NOT NULL,
  attempts       TEXT         NULL,
  attempts_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_won         TINYINT(1)   NOT NULL DEFAULT 0,
  is_completed   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_archive_user_date (user_id, game_date),
  KEY idx_archive_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  type           VARCHAR(32)  NOT NULL DEFAULT '',
  amount         INT          NOT NULL,
  balance_before INT          NOT NULL DEFAULT 0,
  balance_after  INT          NOT NULL DEFAULT 0,
  description    VARCHAR(255) NOT NULL DEFAULT '',
  reference_id   INT UNSIGNED NULL,
  created_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_user (user_id, created_at),
  KEY idx_tx_type (type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referrals (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  referrer_id INT UNSIGNED NOT NULL,
  referred_id INT UNSIGNED NOT NULL,
  is_verified TINYINT(1)   NOT NULL DEFAULT 0,
  bonus_paid  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_referrals_referred (referred_id),
  KEY idx_referrals_referrer (referrer_id, is_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS withdrawals (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  amount         INT          NOT NULL,
  bank_name      VARCHAR(64)  NOT NULL,
  account_number VARCHAR(34)  NOT NULL,
  account_name   VARCHAR(100) NOT NULL,
  status         VARCHAR(16)  NOT NULL DEFAULT 'pending',
  admin_note     VARCHAR(255) NULL,
  tg_message_id  BIGINT       NULL,
  requested_at   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_withdrawals_status (status, requested_at),
  KEY idx_withdrawals_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournaments (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_date   DATE         NOT NULL,
  entry_fee         INT          NOT NULL DEFAULT 5000,
  status            VARCHAR(16)  NOT NULL DEFAULT 'open',
  participant_count INT          NOT NULL DEFAULT 0,
  prize_pool        INT          NOT NULL DEFAULT 0,
  first_prize       INT          NOT NULL DEFAULT 0,
  second_prize      INT          NOT NULL DEFAULT 0,
  third_prize       INT          NOT NULL DEFAULT 0,
  finished_at       DATETIME     NULL,
  created_at        DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournaments_date (tournament_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournament_entries (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  fee_paid      INT          NOT NULL DEFAULT 0,
  score         INT          NOT NULL DEFAULT 0,
  `rank`        INT          NULL,
  prize_won     INT          NOT NULL DEFAULT 0,
  joined_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_entries_user (tournament_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_kv (
  k          VARCHAR(64) NOT NULL,
  v          MEDIUMTEXT  NULL,
  expires_at INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v6.1: Хэтэвч цэнэглэлт (банкны шилжүүлэг → админ баталгаажуулна)
CREATE TABLE IF NOT EXISTS deposits (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  amount       INT          NOT NULL,
  reference    VARCHAR(20)  NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'created',
  admin_note   VARCHAR(255) NULL,
  notified     TINYINT(1)   NOT NULL DEFAULT 0,
  tg_message_id BIGINT      NULL,
  created_at   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME     NULL,
  processed_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deposits_ref (reference),
  KEY idx_deposits_status (status, created_at),
  KEY idx_deposits_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v6.2: Дасгал горим — хэрэглэгч бүрт санамсаргүй үг, өдөрт хэдэн ч удаа
CREATE TABLE IF NOT EXISTS practice_sessions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  word_id        INT UNSIGNED NOT NULL,
  attempts       TEXT         NULL,
  attempts_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_won         TINYINT(1)   NOT NULL DEFAULT 0,
  is_completed   TINYINT(1)   NOT NULL DEFAULT 0,
  hints          VARCHAR(64)  NULL,
  created_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_practice_user (user_id, created_at),
  KEY idx_practice_open (user_id, is_completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v7: Мини тоглоомууд (Дүүжлүүр, Үг холих, Тайлбар таах)
CREATE TABLE IF NOT EXISTS mini_sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  game         VARCHAR(16)  NOT NULL,
  word_id      INT UNSIGNED NOT NULL DEFAULT 0,
  state        TEXT         NULL,
  score        INT          NOT NULL DEFAULT 0,
  fee_paid     INT          NOT NULL DEFAULT 0,
  is_won       TINYINT(1)   NOT NULL DEFAULT 0,
  is_completed TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_mini_user (user_id, created_at),
  KEY idx_mini_open (user_id, game, is_completed),
  KEY idx_mini_done (is_completed, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v7: Blitz арена — 60 секундийн холимог үг. ranked = хураамжтай, шагналын сантай
CREATE TABLE IF NOT EXISTS blitz_runs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  run_date    DATE         NOT NULL,
  ranked      TINYINT(1)   NOT NULL DEFAULT 0,
  fee_paid    INT          NOT NULL DEFAULT 0,
  words       TEXT         NULL,
  idx         INT          NOT NULL DEFAULT 0,
  score       INT          NOT NULL DEFAULT 0,
  solved      INT          NOT NULL DEFAULT 0,
  skipped     INT          NOT NULL DEFAULT 0,
  started_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at     DATETIME     NOT NULL,
  finished    TINYINT(1)   NOT NULL DEFAULT 0,
  finished_at DATETIME     NULL,
  prize_won   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_blitz_day (run_date, ranked, score),
  KEY idx_blitz_user (user_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v7.2: Дуэль — 1 vs 1 мөрийтэй Blitz (тоглолт нь blitz_runs-д ranked = 2)
CREATE TABLE IF NOT EXISTS duels (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(12)  NOT NULL,
  creator_id   INT UNSIGNED NOT NULL,
  opponent_id  INT UNSIGNED NULL,
  stake        INT          NOT NULL,
  words        TEXT         NULL,
  creator_run  INT UNSIGNED NULL,
  opponent_run INT UNSIGNED NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'open',
  winner_id    INT UNSIGNED NULL,
  payout       INT          NOT NULL DEFAULT 0,
  rake         INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at  DATETIME     NULL,
  settled_at   DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_duels_code (code),
  KEY idx_duels_status (status, created_at),
  KEY idx_duels_creator (creator_id, status),
  KEY idx_duels_opponent (opponent_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
