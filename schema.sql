-- 익명 라운지 D1 스키마
-- Cloudflare 대시보드 > D1 > anon-lounge-db > Console 에 통째로 붙여넣고 실행하세요.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- 무작위 ID (화면에 절대 안 보임)
  token_hash    TEXT NOT NULL UNIQUE,        -- 로그인 토큰의 SHA-256
  is_admin      INTEGER NOT NULL DEFAULT 0,
  my_subject    INTEGER NOT NULL DEFAULT 10, -- 내 과목 (1~16)
  real_name     TEXT,                        -- 실명 (선택)
  show_real     INTEGER NOT NULL DEFAULT 0,  -- 1이면 실명 표시
  created_at    INTEGER NOT NULL,
  last_post_at  INTEGER NOT NULL DEFAULT 0   -- 도배 방지
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id),
  cat          TEXT NOT NULL CHECK (cat IN ('질문', '잡담', '건의')),
  subject      INTEGER NOT NULL,             -- 1~16, 건의는 0
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_name  TEXT,                         -- 실명 공개로 쓴 경우만 저장, 아니면 NULL(익명)
  answer_count INTEGER NOT NULL DEFAULT 0,
  help_count   INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_subject ON posts(subject, created_at DESC);

CREATE TABLE IF NOT EXISTS answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  author_name TEXT,
  help_count  INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_post ON answers(post_id, created_at);

-- 캡처 이미지: 브라우저에서 줄여서 올리고(최대 400KB) D1에 그대로 저장
CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('post', 'answer')),
  owner_id    INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  data        BLOB NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_type, owner_id);

-- 도움됐어요 (한 사람이 한 번만)
CREATE TABLE IF NOT EXISTS helps (
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'answer')),
  target_id   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);

-- 과목별로 마지막으로 본 시각 (안 읽은 글 수 계산용)
CREATE TABLE IF NOT EXISTS reads (
  user_id  TEXT NOT NULL,
  subject  INTEGER NOT NULL,
  seen_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject)
);
