-- 익명 라운지 D1 스키마 (새로 설치할 때만 필요해요)
-- 이미 운영 중인 데이터베이스는 서버가 처음 실행될 때 빠진 표와 칸을 알아서 추가해요.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- 무작위 ID (화면에 그대로 안 보임)
  token_hash    TEXT UNIQUE,                 -- 예전 방식 로그인 흔적 (지금은 sessions 표 사용)
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_owner      INTEGER NOT NULL DEFAULT 0,  -- 소유자: 운영자를 지정/해제할 수 있음 (1명)
  banned        INTEGER NOT NULL DEFAULT 0,  -- 1이면 글쓰기 차단
  recovery_hash TEXT,                        -- 복구 코드의 SHA-256
  my_subject    INTEGER NOT NULL DEFAULT 10,
  real_name     TEXT,
  show_real     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL DEFAULT 0,
  last_post_at  INTEGER NOT NULL DEFAULT 0
);

-- 로그인한 기기마다 한 줄 (폰과 PC를 동시에 쓸 수 있음)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 패스키 (지문·얼굴·폰 잠금으로 로그인)
CREATE TABLE IF NOT EXISTS passkeys (
  id           TEXT PRIMARY KEY,             -- credential id (base64url)
  user_id      TEXT NOT NULL,
  public_key   TEXT NOT NULL,                -- JWK(JSON)
  alg          INTEGER NOT NULL,             -- -7 ES256, -257 RS256
  sign_count   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

-- 알림: 내 글에 답변이 달리면
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,              -- 'answer'
  post_id    INTEGER NOT NULL,
  answer_id  INTEGER,
  created_at INTEGER NOT NULL,
  read_at    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- 코드를 계속 틀리는 곳(IP 해시) 잠깐 막기
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id         TEXT PRIMARY KEY,
  challenge  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  user_id    TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id),
  cat          TEXT NOT NULL CHECK (cat IN ('질문', '잡담', '건의')),
  subject      INTEGER NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_name  TEXT,
  answer_count INTEGER NOT NULL DEFAULT 0,
  help_count   INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  edited_at    INTEGER NOT NULL DEFAULT 0     -- 글쓴이가 제목·내용을 고친 시각
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
  created_at  INTEGER NOT NULL,
  parent_id   INTEGER              -- 대댓글이면 맨 위 답변 id (한 단계까지만)
);
CREATE INDEX IF NOT EXISTS idx_answers_post ON answers(post_id, created_at);

CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('post', 'answer')),
  owner_id    INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  data        BLOB NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS helps (
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'answer')),
  target_id   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS reads (
  user_id  TEXT NOT NULL,
  subject  INTEGER NOT NULL,
  seen_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject)
);
