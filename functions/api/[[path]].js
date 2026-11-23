// 익명 라운지 API — Cloudflare Pages Functions
// 필요한 설정: D1 바인딩 이름 DB, 환경 변수 INVITE_CODE(반 공용 코드), ADMIN_CODE(소유자 최초 등록용)
import { b64urlToBytes, bytesToB64url, verifyRegistration, verifyAuthentication } from '../_lib/webauthn.js';
import { NOTE_SCHEMA, handleNotes, noteHelpsReceived, migrateNotes } from '../_lib/notes.js';

const CATS = ['질문', '잡담', '건의'];
// 과목 구분 없이 모든 과목 화면에 같이 보이는 말머리 (subject = 0)
const GLOBAL_CATS = ['잡담', '건의'];
const isGlobal = (cat) => GLOBAL_CATS.includes(cat);
const TIERS = [
  { name: '브론즈', min: 0 },
  { name: '실버', min: 20 },
  { name: '골드', min: 60 },
  { name: '플래티넘', min: 150 },
  { name: '다이아', min: 300 },
];
const MAX_IMAGES = 20;          // 글·답변 하나당
const MAX_INLINE_IMAGES = 3;    // 글 올릴 때 한 번에 같이 보내는 수 (나머지는 한 장씩 따로 올림)
const MAX_IMAGE_BYTES = 400 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const POST_COOLDOWN_MS = 15 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const COOKIE = 'al_token';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 뺌

// ---------- 작은 도구들 ----------
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const fail = (status, message) => json({ error: message }, status);

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newRecoveryCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const chars = [...a].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join(''); // 32글자 → 편향 없음
  return chars.match(/.{4}/g).join('-');
}
const normalizeRecovery = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// 같은 이름 쿠키가 둘 있을 수 있어서(예전 방식 + 팀즈용) 모두 돌려줌
function getCookies(request, name) {
  const raw = request.headers.get('cookie') || '';
  const out = [];
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name && v.length) { try { out.push(decodeURIComponent(v.join('='))); } catch {} }
  }
  return out;
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function tierOf(points) {
  let t = TIERS[0];
  for (const x of TIERS) if (points >= x.min) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1] || null;
  return { name: t.name, points, next: next ? { name: next.name, need: next.min - points } : null };
}
function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n/g, '\n').trim().slice(0, max);
}
function decodeImages(list) {
  if (!Array.isArray(list)) return [];
  if (list.length > MAX_INLINE_IMAGES) throw new Error('이미지는 한 장씩 따로 올려 주세요.');
  return list.map((img) => {
    if (!img || !IMAGE_TYPES.includes(img.mime) || typeof img.data !== 'string') throw new Error('지원하지 않는 이미지 형식이에요.');
    const bin = atob(img.data);
    if (bin.length > MAX_IMAGE_BYTES) throw new Error('이미지가 너무 커요. 400KB 이하로 줄여주세요.');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (!looksLikeImage(bytes, img.mime)) throw new Error('이미지 파일이 아니에요.');
    return { mime: img.mime, bytes };
  });
}
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}
const tagOf = (userId) => '#' + userId.slice(0, 6);

// 실제 이미지 파일인지 앞부분(매직 바이트)으로 확인
function looksLikeImage(bytes, mime) {
  const b = bytes;
  if (mime === 'image/png') return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === 'image/webp') return b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return false;
}

// 같은 곳(IP)에서 코드를 계속 틀리면 잠깐 막기. IP는 해시로만 저장
const FAIL_LIMIT = 30; // 한 교실이 같은 IP를 써도 넉넉하게
const FAIL_WINDOW_MS = 10 * 60 * 1000;
async function rateKey(request, kind) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  return `${kind}:${(await sha256('al-rate:' + ip)).slice(0, 32)}`;
}
async function isLimited(env, key) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first();
  return !!row && row.reset_at > Date.now() && row.count >= FAIL_LIMIT;
}
async function noteFailure(env, key) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at > ?3 THEN count + 1 ELSE 1 END,
                                    reset_at = CASE WHEN reset_at > ?3 THEN reset_at ELSE ?2 END`
  ).bind(key, now + FAIL_WINDOW_MS, now).run();
}
const DAILY_IMAGE_LIMIT = 200; // 한 사람이 하루에 올릴 수 있는 이미지 수 (저장 공간 보호)

// ---------- 스키마 자동 보강 (이미 운영 중인 DB도 그대로 씀) ----------
let schemaReady = null;
async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = env.DB;
      const stmts = [
        'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
        'CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, alg INTEGER NOT NULL, sign_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL DEFAULT 0)',
        'CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id)',
        'CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, created_at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, post_id INTEGER NOT NULL, answer_id INTEGER, created_at INTEGER NOT NULL, read_at INTEGER NOT NULL DEFAULT 0)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)',
      ];
      for (const s of [...stmts, ...NOTE_SCHEMA]) await db.prepare(s).run();
      await migrateNotes(db);
      const { results: cols } = await db.prepare('PRAGMA table_info(users)').all();
      const have = new Set(cols.map((c) => c.name));
      const add = [
        ['is_owner', 'INTEGER NOT NULL DEFAULT 0'],
        ['banned', 'INTEGER NOT NULL DEFAULT 0'],
        ['recovery_hash', 'TEXT'],
        ['last_seen_at', 'INTEGER NOT NULL DEFAULT 0'],
      ];
      for (const [name, type] of add) if (!have.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run();
      const { results: pcols } = await db.prepare('PRAGMA table_info(posts)').all();
      if (!pcols.some((c) => c.name === 'edited_at')) await db.prepare('ALTER TABLE posts ADD COLUMN edited_at INTEGER NOT NULL DEFAULT 0').run();
      const { results: acols } = await db.prepare('PRAGMA table_info(answers)').all();
      if (!acols.some((c) => c.name === 'parent_id')) await db.prepare('ALTER TABLE answers ADD COLUMN parent_id INTEGER').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_answers_parent ON answers(parent_id)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_users_recovery ON users(recovery_hash)').run();
      // 예전 방식(사용자 1명 = 토큰 1개)으로 로그인해 있던 사람을 그대로 이어줌
      await db.prepare("INSERT OR IGNORE INTO sessions (token_hash, user_id, created_at, last_seen_at) SELECT token_hash, id, created_at, created_at FROM users WHERE token_hash IS NOT NULL AND token_hash NOT LIKE 'unused-%'").run();
      await db.prepare("UPDATE users SET token_hash = 'unused-' || id WHERE token_hash IS NOT NULL AND token_hash NOT LIKE 'unused-%'").run();
      // 잡담은 과목 구분 없이 전체 하나로 (예전에 과목별로 올라온 잡담도 옮김)
      await db.prepare("UPDATE posts SET subject = 0 WHERE cat = '잡담' AND subject != 0").run();
      // 소유자가 없으면 가장 먼저 들어온 운영자를 소유자로
      const owner = await db.prepare('SELECT 1 AS x FROM users WHERE is_owner = 1').first();
      if (!owner) await db.prepare('UPDATE users SET is_owner = 1 WHERE id = (SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at LIMIT 1)').run();
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// ---------- 인증 ----------
async function currentUser(env, request) {
  let user = null, h = null;
  for (const token of getCookies(request, COOKIE).slice(0, 3)) {
    h = await sha256(token);
    user = await env.DB.prepare('SELECT u.*, s.token_hash AS session_hash, s.last_seen_at AS session_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(h).first();
    if (user) break;
  }
  if (!user) return null;
  if (user && Date.now() - user.session_seen > 10 * 60 * 1000) {
    const now = Date.now();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, h).run();
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, user.id).run();
  }
  return user;
}
// 팀즈 탭은 이 사이트를 팀즈 화면 안에 끼워서 보여줘요. 그 안에서도 로그인이 유지되도록
// SameSite=None + Partitioned(팀즈 안 / 일반 브라우저 따로 보관). 다른 사이트의 요청은 Origin 검사로 막아요.
function cookieFlags(request) {
  const u = new URL(request.url);
  const secure = u.protocol === 'https:' || u.hostname === 'localhost';
  return secure ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax';
}
async function startSession(env, request, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now, now).run();
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, userId).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Max-Age=31536000${cookieFlags(request)}`;
}
async function receivedHelps(env, userId) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(help_count), 0) FROM posts WHERE user_id = ?1 AND deleted = 0) +
            (SELECT COALESCE(SUM(help_count), 0) FROM answers WHERE user_id = ?1 AND deleted = 0) AS n`
  ).bind(userId).first();
  return (row ? row.n : 0) + (await noteHelpsReceived(env, userId));
}
async function meView(env, user) {
  const pk = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?').bind(user.id).first();
  return {
    mySubject: user.my_subject,
    isAdmin: !!user.is_admin,
    isOwner: !!user.is_owner,
    banned: !!user.banned,
    hasRecovery: !!user.recovery_hash,
    passkeys: pk ? pk.n : 0,
    realName: user.real_name || '',
    showReal: !!user.show_real,
    tier: tierOf(await receivedHelps(env, user.id)),
  };
}
const nameFor = (user) => (user.show_real && user.real_name ? user.real_name : null);
const rpInfo = (request) => { const u = new URL(request.url); return { origin: u.origin, rpId: u.hostname }; };

async function newChallenge(env, kind, userId) {
  await env.DB.prepare('DELETE FROM challenges WHERE created_at < ?').bind(Date.now() - CHALLENGE_TTL_MS).run();
  const id = randomHex(12);
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const challenge = bytesToB64url(bytes);
  await env.DB.prepare('INSERT INTO challenges (id, challenge, kind, user_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, challenge, kind, userId || null, Date.now()).run();
  return { id, challenge };
}
async function takeChallenge(env, id, kind) {
  const row = await env.DB.prepare('SELECT * FROM challenges WHERE id = ? AND kind = ?').bind(String(id || ''), kind).first();
  if (!row) return null;
  await env.DB.prepare('DELETE FROM challenges WHERE id = ?').bind(row.id).run();
  if (Date.now() - row.created_at > CHALLENGE_TTL_MS) return null;
  return row;
}

// ---------- 라우터 ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;

  try {
    // 다른 사이트에서 몰래 보내는 요청 막기 (CSRF): 쓰기 요청은 이 사이트에서 온 것만
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const origin = request.headers.get('origin');
      const site = request.headers.get('sec-fetch-site');
      if ((origin && origin !== url.origin) || (site && !['same-origin', 'none'].includes(site))) return fail(403, '이 사이트에서만 보낼 수 있어요.');
    }
    await ensureSchema(env);

    // ===== 로그인 없이 쓰는 주소 =====
    // 처음 입장 (초대 코드). ADMIN_CODE는 소유자가 아직 없을 때 한 번만 통함
    if (parts[0] === 'join' && method === 'POST') {
      const rk = await rateKey(request, 'join');
      if (await isLimited(env, rk)) return fail(429, '코드를 너무 많이 틀렸어요. 10분 뒤에 다시 해주세요.');
      const { code } = await readJson(request);
      const c = String(code || '').trim();
      let isAdmin = false;
      if (env.ADMIN_CODE && safeEqual(c, env.ADMIN_CODE)) {
        const owner = await env.DB.prepare('SELECT * FROM users WHERE is_owner = 1 ORDER BY created_at LIMIT 1').first();
        if (owner) {
          // 소유자 계정 되찾기: 새 계정을 만들지 않고 기존 소유자로 들어감.
          // 복구 코드를 새로 만들어 한 번 보여줌 (예전 복구 코드는 더 이상 안 통함)
          const recovery = newRecoveryCode();
          await env.DB.prepare('UPDATE users SET recovery_hash = ?, banned = 0, is_admin = 1 WHERE id = ?').bind(await sha256(normalizeRecovery(recovery)), owner.id).run();
          const cookie = await startSession(env, request, owner.id);
          const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(owner.id).first();
          return json({ ...(await meView(env, u)), recoveryCode: recovery, ownerRestored: true }, 200, { 'set-cookie': cookie });
        }
        isAdmin = true;
      } else if (!(env.INVITE_CODE && safeEqual(c, env.INVITE_CODE))) {
        await noteFailure(env, rk);
        return fail(403, '초대 코드가 맞지 않아요.');
      }
      const id = randomHex(12);
      const recovery = newRecoveryCode();
      await env.DB.prepare('INSERT INTO users (id, token_hash, is_admin, is_owner, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, 'unused-' + id, isAdmin ? 1 : 0, isAdmin ? 1 : 0, await sha256(normalizeRecovery(recovery)), Date.now()).run();
      const cookie = await startSession(env, request, id);
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return json({ ...(await meView(env, user)), recoveryCode: recovery }, 200, { 'set-cookie': cookie });
    }

    // 복구 코드로 다른 기기에서 들어오기
    if (parts[0] === 'recover' && method === 'POST') {
      const rk = await rateKey(request, 'recover');
      if (await isLimited(env, rk)) return fail(429, '코드를 너무 많이 틀렸어요. 10분 뒤에 다시 해주세요.');
      const { code } = await readJson(request);
      const norm = normalizeRecovery(code);
      if (norm.length !== 16) return fail(400, '복구 코드는 16글자예요. (예: ABCD-EFGH-JKLM-NPQR)');
      const user = await env.DB.prepare('SELECT * FROM users WHERE recovery_hash = ?').bind(await sha256(norm)).first();
      if (!user) { await noteFailure(env, rk); return fail(403, '복구 코드가 맞지 않아요.'); }
      const cookie = await startSession(env, request, user.id);
      return json(await meView(env, user), 200, { 'set-cookie': cookie });
    }

    // 패스키로 들어오기
    if (parts[0] === 'passkey' && parts[1] === 'login' && method === 'POST') {
      const { rpId, origin } = rpInfo(request);
      if (parts[2] === 'options') {
        const ch = await newChallenge(env, 'auth');
        return json({ challengeId: ch.id, challenge: ch.challenge, rpId, timeout: 60000, userVerification: 'preferred' });
      }
      if (parts[2] === 'verify') {
        const b = await readJson(request);
        const ch = await takeChallenge(env, b.challengeId, 'auth');
        if (!ch) return fail(400, '인증 요청이 만료됐어요. 다시 시도해 주세요.');
        const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(String(b.rawId || '')).first();
        if (!pk) return fail(403, '이 사이트에 등록된 패스키가 아니에요.');
        try {
          const r = await verifyAuthentication(
            { clientDataJSON: b64urlToBytes(b.clientDataJSON), authenticatorData: b64urlToBytes(b.authenticatorData), signature: b64urlToBytes(b.signature) },
            { challenge: ch.challenge, origin, rpId, alg: pk.alg, jwk: JSON.parse(pk.public_key), storedCount: pk.sign_count }
          );
          await env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?').bind(r.signCount, Date.now(), pk.id).run();
        } catch (e) {
          return fail(403, e.message);
        }
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(pk.user_id).first();
        const cookie = await startSession(env, request, user.id);
        return json(await meView(env, user), 200, { 'set-cookie': cookie });
      }
    }

    // ===== 여기부터는 로그인 필요 =====
    const user = await currentUser(env, request);
    if (!user) return fail(401, '먼저 들어와 주세요.');

    if (parts[0] === 'logout' && method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.session_hash).run();
      const res = json({ ok: true });
      // 새 방식(팀즈용)과 예전 방식 쿠키를 둘 다 지움
      res.headers.append('set-cookie', `${COOKIE}=; Path=/; HttpOnly; Max-Age=0${cookieFlags(request)}`);
      res.headers.append('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
      return res;
    }

    // 내 정보
    if (parts[0] === 'me' && parts.length === 1) {
      if (method === 'GET') return json(await meView(env, user));
      if (method === 'PATCH') {
        const b = await readJson(request);
        const subject = Number.isInteger(b.mySubject) && b.mySubject >= 1 && b.mySubject <= 16 ? b.mySubject : user.my_subject;
        const realName = b.realName !== undefined ? cleanText(b.realName, 20) : user.real_name || '';
        const showReal = b.showReal !== undefined ? (b.showReal && realName ? 1 : 0) : user.show_real;
        await env.DB.prepare('UPDATE users SET my_subject = ?, real_name = ?, show_real = ? WHERE id = ?')
          .bind(subject, realName || null, showReal, user.id).run();
        const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        return json(await meView(env, u));
      }
    }
    // 복구 코드 새로 만들기 (예전 코드는 바로 못 씀)
    if (parts[0] === 'me' && parts[1] === 'recovery' && method === 'POST') {
      const code = newRecoveryCode();
      await env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').bind(await sha256(normalizeRecovery(code)), user.id).run();
      return json({ recoveryCode: code });
    }

    // 패스키 등록·목록·삭제
    if (parts[0] === 'passkey' && parts[1] === 'register' && method === 'POST') {
      const { rpId, origin } = rpInfo(request);
      if (parts[2] === 'options') {
        const ch = await newChallenge(env, 'reg', user.id);
        const { results: existing } = await env.DB.prepare('SELECT id FROM passkeys WHERE user_id = ?').bind(user.id).all();
        return json({
          challengeId: ch.id,
          publicKey: {
            challenge: ch.challenge,
            rp: { name: '익명 라운지', id: rpId },
            user: { id: bytesToB64url(new TextEncoder().encode(user.id)), name: `익명 라운지 ${tagOf(user.id)}`, displayName: '익명 라운지' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
            attestation: 'none',
            timeout: 60000,
            excludeCredentials: existing.map((p) => ({ type: 'public-key', id: p.id })),
          },
        });
      }
      if (parts[2] === 'verify') {
        const b = await readJson(request);
        const ch = await takeChallenge(env, b.challengeId, 'reg');
        if (!ch || ch.user_id !== user.id) return fail(400, '등록 요청이 만료됐어요. 다시 시도해 주세요.');
        let r;
        try {
          r = await verifyRegistration(
            { clientDataJSON: b64urlToBytes(b.clientDataJSON), attestationObject: b64urlToBytes(b.attestationObject) },
            { challenge: ch.challenge, origin, rpId }
          );
        } catch (e) {
          return fail(400, e.message);
        }
        await env.DB.prepare('INSERT INTO passkeys (id, user_id, public_key, alg, sign_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(r.credentialId, user.id, JSON.stringify(r.jwk), r.alg, r.signCount, Date.now()).run();
        return json({ ok: true }, 201);
      }
    }
    if (parts[0] === 'passkeys') {
      if (method === 'GET' && parts.length === 1) {
        const { results } = await env.DB.prepare('SELECT id, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
        return json({ passkeys: results.map((p) => ({ id: p.id, createdAt: p.created_at, lastUsedAt: p.last_used_at })) });
      }
      if (method === 'DELETE' && parts[1]) {
        await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(parts[1], user.id).run();
        return json({ ok: true });
      }
    }

    // 운영자 화면
    if (parts[0] === 'admin') {
      if (!user.is_admin) return fail(403, '운영자만 볼 수 있어요.');
      if (parts[1] === 'users' && parts.length === 2 && method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT u.id, u.is_admin, u.is_owner, u.banned, u.created_at, u.last_seen_at, u.recovery_hash IS NOT NULL AS has_recovery,
                  (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) AS posts,
                  (SELECT COUNT(*) FROM answers a WHERE a.user_id = u.id AND a.deleted = 0) AS answers,
                  (SELECT COALESCE(SUM(help_count), 0) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) +
                  (SELECT COALESCE(SUM(help_count), 0) FROM answers a WHERE a.user_id = u.id AND a.deleted = 0) AS helps,
                  (SELECT COUNT(*) FROM passkeys k WHERE k.user_id = u.id) AS passkeys
             FROM users u ORDER BY u.is_owner DESC, u.is_admin DESC, u.last_seen_at DESC LIMIT 500`
        ).all();
        return json({
          users: results.map((u) => ({
            id: u.id, tag: tagOf(u.id), isAdmin: !!u.is_admin, isOwner: !!u.is_owner, banned: !!u.banned, me: u.id === user.id,
            createdAt: u.created_at, lastSeenAt: u.last_seen_at, posts: u.posts, answers: u.answers, helps: u.helps,
            hasRecovery: !!u.has_recovery, passkeys: u.passkeys,
          })),
          canAssignAdmins: !!user.is_owner,
        });
      }
      // 한 사용자가 쓴 글·답변 (지운 것 포함)
      if (parts[1] === 'users' && parts[2] && parts[3] === 'activity' && method === 'GET') {
        const target = await env.DB.prepare('SELECT id, is_admin, is_owner, banned, created_at, last_seen_at FROM users WHERE id = ?').bind(parts[2]).first();
        if (!target) return fail(404, '사용자를 찾을 수 없어요.');
        const { results: posts } = await env.DB.prepare(
          `SELECT p.id, p.cat, p.subject, p.title, substr(p.body, 1, 120) AS excerpt, p.author_name, p.answer_count, p.help_count, p.deleted, p.created_at,
                  (SELECT COUNT(*) FROM images i WHERE i.owner_type = 'post' AND i.owner_id = p.id) AS images
             FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 200`
        ).bind(target.id).all();
        const { results: answers } = await env.DB.prepare(
          `SELECT a.id, a.post_id, a.parent_id, substr(a.body, 1, 160) AS excerpt, a.author_name, a.help_count, a.deleted, a.created_at,
                  p.title AS post_title, p.deleted AS post_deleted,
                  (SELECT COUNT(*) FROM images i WHERE i.owner_type = 'answer' AND i.owner_id = a.id) AS images
             FROM answers a JOIN posts p ON p.id = a.post_id WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 200`
        ).bind(target.id).all();
        return json({
          user: { id: target.id, tag: tagOf(target.id), isAdmin: !!target.is_admin, isOwner: !!target.is_owner, banned: !!target.banned, createdAt: target.created_at, lastSeenAt: target.last_seen_at, me: target.id === user.id },
          posts: posts.map((p) => ({ id: p.id, cat: p.cat, subject: p.subject, title: p.title, excerpt: p.excerpt, realName: p.author_name, answers: p.answer_count, helps: p.help_count, images: p.images, deleted: !!p.deleted, createdAt: p.created_at })),
          answers: answers.map((a) => ({ id: a.id, isReply: !!a.parent_id, postId: a.post_id, postTitle: a.post_title, postDeleted: !!a.post_deleted, excerpt: a.excerpt, realName: a.author_name, helps: a.help_count, images: a.images, deleted: !!a.deleted, createdAt: a.created_at })),
        });
      }
      if (parts[1] === 'users' && parts[2] && method === 'PATCH') {
        const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(parts[2]).first();
        if (!target) return fail(404, '사용자를 찾을 수 없어요.');
        if (target.id === user.id) return fail(400, '나 자신은 바꿀 수 없어요.');
        if (target.is_owner) return fail(403, '소유자는 바꿀 수 없어요.');
        const b = await readJson(request);
        if (b.admin !== undefined) {
          if (!user.is_owner) return fail(403, '운영자 지정은 소유자만 할 수 있어요.');
          await env.DB.prepare('UPDATE users SET is_admin = ? WHERE id = ?').bind(b.admin ? 1 : 0, target.id).run();
        }
        if (b.banned !== undefined) {
          if (target.is_admin && !user.is_owner) return fail(403, '운영자는 소유자만 차단할 수 있어요.');
          await env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(b.banned ? 1 : 0, target.id).run();
          if (b.banned) await env.DB.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').bind(target.id).run();
        }
        return json({ ok: true });
      }
    }

    // 알림
    if (parts[0] === 'notifications') {
      const alive = `((n.kind != 'note_edit' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = n.post_id AND p.deleted = 0)
                       AND (n.answer_id IS NULL OR EXISTS (SELECT 1 FROM answers a WHERE a.id = n.answer_id AND a.deleted = 0)))
                     OR (n.kind = 'note_edit' AND EXISTS (SELECT 1 FROM notes t WHERE t.id = n.post_id AND t.deleted = 0 AND t.visibility = 'public')))`;
      if (parts[1] === 'count' && method === 'GET') {
        const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications n WHERE n.user_id = ? AND n.read_at = 0 AND ${alive}`).bind(user.id).first();
        return json({ unread: r.n });
      }
      if (parts.length === 1 && method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT n.id, n.kind, n.post_id, n.created_at, n.read_at,
                  CASE WHEN n.kind = 'note_edit' THEN t.title ELSE p.title END AS post_title, p.cat,
                  CASE WHEN n.kind = 'note_edit' THEN t.subject ELSE p.subject END AS subject,
                  CASE WHEN n.kind = 'note_edit' THEN NULL ELSE substr(a.body, 1, 80) END AS snippet,
                  (SELECT COUNT(*) FROM images i WHERE n.kind != 'note_edit' AND i.owner_type = 'answer' AND i.owner_id = a.id) AS images
             FROM notifications n
             LEFT JOIN posts p ON n.kind != 'note_edit' AND p.id = n.post_id
             LEFT JOIN notes t ON n.kind = 'note_edit' AND t.id = n.post_id
             LEFT JOIN answers a ON n.kind != 'note_edit' AND a.id = n.answer_id
            WHERE n.user_id = ? AND ${alive} ORDER BY n.created_at DESC LIMIT 50`
        ).bind(user.id).all();
        return json({ notifications: results.map((n) => ({
          id: n.id, kind: n.kind, postId: n.post_id, postTitle: n.post_title, cat: n.cat, subject: n.subject,
          snippet: n.snippet || (n.images ? '(이미지)' : ''), createdAt: n.created_at, read: !!n.read_at,
        })) });
      }
      if (parts[1] === 'read' && method === 'POST') {
        await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = 0').bind(Date.now(), user.id).run();
        return json({ ok: true });
      }
    }

    // 과목별 안 읽은 글 수
    if (parts[0] === 'subjects' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT p.subject AS subject, COUNT(*) AS n
           FROM posts p
           LEFT JOIN reads r ON r.user_id = ?1 AND r.subject = p.subject
          WHERE p.deleted = 0 AND p.user_id != ?1 AND p.subject BETWEEN 1 AND 16
            AND p.created_at > COALESCE(r.seen_at, ?2)
          GROUP BY p.subject`
      ).bind(user.id, user.created_at).all();
      const unread = {};
      for (const r of results) unread[r.subject] = r.n;
      return json({ unread });
    }

    const banGuard = () => (user.banned ? json({ error: '운영자가 글쓰기를 제한했어요. 글은 계속 읽을 수 있어요.', banned: true }, 403) : null);

    // 정리 탭 (functions/_lib/notes.js)
    if (parts[0] === 'notes' || parts[0] === 'note-images') {
      const r = await handleNotes({ env, request, url, parts, method, user, H: { json, fail, cleanText, readJson, tagOf, looksLikeImage, IMAGE_TYPES, MAX_IMAGE_BYTES, nameFor, banGuard } });
      if (r) return r;
    }

    // 글 목록 / 글쓰기
    if (parts[0] === 'posts' && parts.length === 1) {
      if (method === 'GET') {
        const subjectParam = url.searchParams.get('subject') || 'all';
        const cat = url.searchParams.get('cat') || '전체';
        const subject = subjectParam === 'all' ? null : Number(subjectParam);
        const seen = subject
          ? (await env.DB.prepare('SELECT seen_at FROM reads WHERE user_id = ? AND subject = ?').bind(user.id, subject).first())?.seen_at ?? user.created_at
          : null;
        const where = ['p.deleted = 0'];
        const args = [user.id];
        if (subject) { where.push("(p.subject = ? OR p.cat IN ('잡담', '건의'))"); args.push(subject); }
        if (CATS.includes(cat)) { where.push('p.cat = ?'); args.push(cat); }
        const { results } = await env.DB.prepare(
          `SELECT p.id, p.user_id, p.cat, p.subject, p.title, substr(p.body, 1, 120) AS excerpt, p.author_name,
                  p.answer_count, p.help_count, p.created_at, (p.user_id = ?1) AS mine,
                  EXISTS (SELECT 1 FROM helps h WHERE h.user_id = ?1 AND h.target_type = 'post' AND h.target_id = p.id) AS helped,
                  (SELECT i.id FROM images i WHERE i.owner_type = 'post' AND i.owner_id = p.id ORDER BY i.id LIMIT 1) AS thumb_id,
                  (SELECT COUNT(*) FROM images i WHERE i.owner_type = 'post' AND i.owner_id = p.id) AS image_count
             FROM posts p WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC LIMIT 100`
        ).bind(...args).all();
        const posts = results.map((p) => ({
          id: p.id, cat: p.cat, subject: p.subject, title: p.title, excerpt: p.excerpt,
          author: p.author_name || '익명', answers: p.answer_count, helps: p.help_count, createdAt: p.created_at,
          mine: !!p.mine, helped: !!p.helped, hasImage: !!p.thumb_id, imageCount: p.image_count, thumb: p.thumb_id ? `/api/images/${p.thumb_id}` : null,
          unread: seen !== null && !p.mine && p.created_at > seen,
          tag: user.is_admin ? tagOf(p.user_id) : undefined, uid: user.is_admin ? p.user_id : undefined,
        }));
        if (subject) {
          await env.DB.prepare(
            'INSERT INTO reads (user_id, subject, seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id, subject) DO UPDATE SET seen_at = excluded.seen_at'
          ).bind(user.id, subject, Date.now()).run();
        }
        return json({ posts });
      }
      if (method === 'POST') {
        const banned = banGuard(); if (banned) return banned;
        const b = await readJson(request);
        const now = Date.now();
        if (now - user.last_post_at < POST_COOLDOWN_MS) return fail(429, '조금만 있다가 다시 올려주세요.');
        const cat = CATS.includes(b.cat) ? b.cat : null;
        if (!cat) return fail(400, '말머리를 골라주세요.');
        const subject = isGlobal(cat) ? 0 : Number(b.subject);
        if (!isGlobal(cat) && !(subject >= 1 && subject <= 16)) return fail(400, '과목을 골라주세요.');
        const title = cleanText(b.title, 100);
        const body = cleanText(b.body, 5000);
        if (!title) return fail(400, '제목을 써주세요.');
        let images;
        try { images = decodeImages(b.images); } catch (e) { return fail(400, e.message); }
        const res = await env.DB.prepare(
          'INSERT INTO posts (user_id, cat, subject, title, body, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(user.id, cat, subject, title, body, nameFor(user), now).run();
        const postId = res.meta.last_row_id;
        for (const img of images) {
          await env.DB.prepare('INSERT INTO images (owner_type, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind('post', postId, img.mime, img.bytes, now).run();
        }
        await env.DB.prepare('UPDATE users SET last_post_at = ? WHERE id = ?').bind(now, user.id).run();
        return json({ id: postId }, 201);
      }
    }

    // 글 하나 보기 / 삭제 / 답변
    if (parts[0] === 'posts' && parts[1]) {
      const postId = Number(parts[1]);
      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').bind(postId).first();
      if (!post) return fail(404, '글을 찾을 수 없어요.');

      if (parts.length === 2 && method === 'GET') {
        const { results: answers } = await env.DB.prepare(
          `SELECT a.*, EXISTS (SELECT 1 FROM helps h WHERE h.user_id = ? AND h.target_type = 'answer' AND h.target_id = a.id) AS helped
             FROM answers a WHERE a.post_id = ? AND (a.deleted = 0 OR (a.parent_id IS NULL AND EXISTS (
                    SELECT 1 FROM answers c WHERE c.parent_id = a.id AND c.deleted = 0)))
            ORDER BY a.created_at`
        ).bind(user.id, postId).all();
        const { results: imgs } = await env.DB.prepare(
          `SELECT id, owner_type, owner_id FROM images
            WHERE (owner_type = 'post' AND owner_id = ?)
               OR (owner_type = 'answer' AND owner_id IN (SELECT id FROM answers WHERE post_id = ? AND deleted = 0))`
        ).bind(postId, postId).all();
        await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND post_id = ? AND read_at = 0').bind(Date.now(), user.id, postId).run();
        const helpedPost = await env.DB.prepare("SELECT 1 AS x FROM helps WHERE user_id = ? AND target_type = 'post' AND target_id = ?").bind(user.id, postId).first();
        const numbers = new Map();
        const label = (uid, name) => {
          if (name) return name;
          if (uid === post.user_id) return '익명(글쓴이)';
          if (!numbers.has(uid)) numbers.set(uid, numbers.size + 1);
          return `익명${numbers.get(uid)}`;
        };
        const imagesOf = (type, id) => imgs.filter((i) => i.owner_type === type && i.owner_id === id).map((i) => `/api/images/${i.id}`);
        const adminTag = (uid) => (user.is_admin ? tagOf(uid) : undefined);
        const adminUid = (uid) => (user.is_admin ? uid : undefined);
        return json({
          post: {
            id: post.id, cat: post.cat, subject: post.subject, title: post.title, body: post.body,
            author: post.author_name || '익명', createdAt: post.created_at, helps: post.help_count,
            helped: !!helpedPost, mine: post.user_id === user.id, images: imagesOf('post', post.id), tag: adminTag(post.user_id), uid: adminUid(post.user_id),
            editedAt: post.edited_at || 0,
          },
          answers: answers.map((a) => (a.deleted
            // 지운 답변 아래에 대댓글이 남아 있으면 자리만 남김
            ? { id: a.id, parentId: null, deleted: true, body: '', author: '', createdAt: a.created_at, helps: 0, helped: false, mine: false, images: [] }
            : {
              id: a.id, parentId: a.parent_id || null, body: a.body, author: label(a.user_id, a.author_name), createdAt: a.created_at,
              helps: a.help_count, helped: !!a.helped, mine: a.user_id === user.id, images: imagesOf('answer', a.id), tag: adminTag(a.user_id), uid: adminUid(a.user_id),
            })),
          canModerate: !!user.is_admin,
          banned: !!user.banned,
        });
      }
      // 글 고치기: 글쓴이는 전부, 운영자는 말머리·과목만 (잘못 올린 글 옮기기)
      if (parts.length === 2 && method === 'PATCH') {
        const mine = post.user_id === user.id;
        if (!mine && !user.is_admin) return fail(403, '고칠 수 없는 글이에요.');
        if (mine) { const banned = banGuard(); if (banned) return banned; }
        const b = await readJson(request);
        const cat = b.cat === undefined ? post.cat : CATS.includes(b.cat) ? b.cat : null;
        if (!cat) return fail(400, '말머리를 골라주세요.');
        let subject = b.subject === undefined ? post.subject : Number(b.subject);
        if (isGlobal(cat)) subject = 0;
        else if (!(subject >= 1 && subject <= 16)) return fail(400, '과목을 골라주세요.');
        let title = post.title, body = post.body;
        if (mine) {
          if (b.title !== undefined) title = cleanText(b.title, 100);
          if (b.body !== undefined) body = cleanText(b.body, 5000);
          if (!title) return fail(400, '제목을 써주세요.');
        } else if (b.title !== undefined || b.body !== undefined) {
          return fail(403, '운영자는 말머리와 과목만 옮길 수 있어요.');
        }
        const textChanged = title !== post.title || body !== post.body;
        await env.DB.prepare('UPDATE posts SET cat = ?, subject = ?, title = ?, body = ?, edited_at = ? WHERE id = ?')
          .bind(cat, subject, title, body, textChanged ? Date.now() : post.edited_at || 0, postId).run();
        return json({ ok: true });
      }
      if (parts.length === 2 && method === 'DELETE') {
        if (post.user_id !== user.id && !user.is_admin) return fail(403, '지울 수 없는 글이에요.');
        await env.DB.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').bind(postId).run();
        return json({ ok: true });
      }
      if (parts[2] === 'answers' && method === 'POST') {
        const banned = banGuard(); if (banned) return banned;
        const b = await readJson(request);
        const now = Date.now();
        if (now - user.last_post_at < POST_COOLDOWN_MS / 3) return fail(429, '조금만 있다가 다시 올려주세요.');
        const body = cleanText(b.body, 5000);
        if (!body && !(b.images || []).length && !b.withImages) return fail(400, '답변 내용을 써주세요.');
        let images;
        try { images = decodeImages(b.images); } catch (e) { return fail(400, e.message); }
        // 대댓글: 한 단계까지만. 대댓글에 다시 달면 같은 줄기(맨 위 답변) 아래로
        let parent = null;
        if (b.parentId !== undefined && b.parentId !== null) {
          parent = await env.DB.prepare('SELECT id, user_id, parent_id, deleted FROM answers WHERE id = ? AND post_id = ?').bind(Number(b.parentId), postId).first();
          if (parent && parent.parent_id) parent = await env.DB.prepare('SELECT id, user_id, parent_id, deleted FROM answers WHERE id = ?').bind(parent.parent_id).first();
          if (!parent || parent.deleted) return fail(404, '답글을 달 답변을 찾을 수 없어요.');
        }
        const res = await env.DB.prepare('INSERT INTO answers (post_id, user_id, body, author_name, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(postId, user.id, body, nameFor(user), now, parent ? parent.id : null).run();
        const answerId = res.meta.last_row_id;
        for (const img of images) {
          await env.DB.prepare('INSERT INTO images (owner_type, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind('answer', answerId, img.mime, img.bytes, now).run();
        }
        await env.DB.prepare('UPDATE posts SET answer_count = answer_count + 1 WHERE id = ?').bind(postId).run();
        // 알림: 대댓글이면 그 답변을 쓴 사람에게, 그리고 글쓴이에게 (본인 것은 빼고, 한 사람에게 한 번만)
        const notify = new Map();
        if (parent && parent.user_id !== user.id) notify.set(parent.user_id, 'reply');
        if (post.user_id !== user.id && !notify.has(post.user_id)) notify.set(post.user_id, 'answer');
        for (const [uid, kind] of notify) {
          await env.DB.prepare('INSERT INTO notifications (user_id, kind, post_id, answer_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(uid, kind, postId, answerId, now).run();
        }
        await env.DB.prepare('UPDATE users SET last_post_at = ? WHERE id = ?').bind(now, user.id).run();
        return json({ id: answerId }, 201);
      }
    }

    // 답변 삭제
    if (parts[0] === 'answers' && parts[1] && method === 'DELETE') {
      const a = await env.DB.prepare('SELECT * FROM answers WHERE id = ? AND deleted = 0').bind(Number(parts[1])).first();
      if (!a) return fail(404, '답변을 찾을 수 없어요.');
      if (a.user_id !== user.id && !user.is_admin) return fail(403, '지울 수 없는 답변이에요.');
      await env.DB.prepare('UPDATE answers SET deleted = 1 WHERE id = ?').bind(a.id).run();
      await env.DB.prepare('UPDATE posts SET answer_count = MAX(answer_count - 1, 0) WHERE id = ?').bind(a.post_id).run();
      return json({ ok: true });
    }

    // 도움됐어요
    if (parts[0] === 'help' && method === 'POST') {
      const banned = banGuard(); if (banned) return banned;
      const { type, id } = await readJson(request);
      if (!['post', 'answer'].includes(type)) return fail(400, '잘못된 요청이에요.');
      const table = type === 'post' ? 'posts' : 'answers';
      const target = await env.DB.prepare(`SELECT id, user_id, help_count FROM ${table} WHERE id = ? AND deleted = 0`).bind(Number(id)).first();
      if (!target) return fail(404, '대상을 찾을 수 없어요.');
      if (target.user_id === user.id) return fail(400, '내 글에는 누를 수 없어요.');
      const had = await env.DB.prepare('SELECT 1 AS x FROM helps WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, type, target.id).first();
      if (had) {
        await env.DB.prepare('DELETE FROM helps WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, type, target.id).run();
        await env.DB.prepare(`UPDATE ${table} SET help_count = MAX(help_count - 1, 0) WHERE id = ?`).bind(target.id).run();
      } else {
        await env.DB.prepare('INSERT INTO helps (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)').bind(user.id, type, target.id, Date.now()).run();
        await env.DB.prepare(`UPDATE ${table} SET help_count = help_count + 1 WHERE id = ?`).bind(target.id).run();
      }
      const after = await env.DB.prepare(`SELECT help_count FROM ${table} WHERE id = ?`).bind(target.id).first();
      return json({ helped: !had, helps: after.help_count });
    }

    // 이미지 한 장 올리기: POST /api/images?type=post|answer&id=N, 본문은 이미지 파일 그대로
    if (parts[0] === 'images' && parts.length === 1 && method === 'POST') {
      const banned = banGuard(); if (banned) return banned;
      const type = url.searchParams.get('type');
      const ownerId = Number(url.searchParams.get('id'));
      if (!['post', 'answer'].includes(type)) return fail(400, '잘못된 요청이에요.');
      const owner = await env.DB.prepare(`SELECT id, user_id FROM ${type === 'post' ? 'posts' : 'answers'} WHERE id = ? AND deleted = 0`).bind(ownerId).first();
      if (!owner) return fail(404, '글을 찾을 수 없어요.');
      if (owner.user_id !== user.id) return fail(403, '내 글에만 이미지를 올릴 수 있어요.');
      const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
      if (!IMAGE_TYPES.includes(mime)) return fail(400, '지원하지 않는 이미지 형식이에요.');
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.length) return fail(400, '빈 이미지예요.');
      if (bytes.length > MAX_IMAGE_BYTES) return fail(400, '이미지가 너무 커요. 400KB 이하로 줄여주세요.');
      if (!looksLikeImage(bytes, mime)) return fail(400, '이미지 파일이 아니에요.');
      const today = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM images i WHERE i.created_at > ?2 AND (
           (i.owner_type = 'post' AND i.owner_id IN (SELECT id FROM posts WHERE user_id = ?1)) OR
           (i.owner_type = 'answer' AND i.owner_id IN (SELECT id FROM answers WHERE user_id = ?1)))`
      ).bind(user.id, Date.now() - 24 * 3600 * 1000).first();
      if (today.n >= DAILY_IMAGE_LIMIT) return fail(429, `이미지는 하루 ${DAILY_IMAGE_LIMIT}장까지 올릴 수 있어요.`);
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM images WHERE owner_type = ? AND owner_id = ?').bind(type, ownerId).first();
      if (cnt.n >= MAX_IMAGES) return fail(400, `이미지는 ${MAX_IMAGES}장까지예요.`);
      const res = await env.DB.prepare('INSERT INTO images (owner_type, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(type, ownerId, mime, bytes, Date.now()).run();
      return json({ id: res.meta.last_row_id, url: `/api/images/${res.meta.last_row_id}` }, 201);
    }
    // 이미지 빼기 (글쓴이 또는 운영자)
    if (parts[0] === 'images' && parts[1] && method === 'DELETE') {
      const img = await env.DB.prepare('SELECT id, owner_type, owner_id FROM images WHERE id = ?').bind(Number(parts[1])).first();
      if (!img) return fail(404, '이미지가 없어요.');
      const owner = await env.DB.prepare(`SELECT user_id FROM ${img.owner_type === 'post' ? 'posts' : 'answers'} WHERE id = ?`).bind(img.owner_id).first();
      if (!owner || (owner.user_id !== user.id && !user.is_admin)) return fail(403, '뺄 수 없는 이미지예요.');
      await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(img.id).run();
      return json({ ok: true });
    }

    // 이미지 보기 (들어온 사람만)
    if (parts[0] === 'images' && parts[1] && method === 'GET') {
      const img = await env.DB.prepare(
        `SELECT i.mime, i.data FROM images i WHERE i.id = ? AND (
           (i.owner_type = 'post' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = i.owner_id AND p.deleted = 0)) OR
           (i.owner_type = 'answer' AND EXISTS (SELECT 1 FROM answers a JOIN posts p ON p.id = a.post_id WHERE a.id = i.owner_id AND a.deleted = 0 AND p.deleted = 0)))`
      ).bind(Number(parts[1])).first();
      if (!img) return fail(404, '이미지가 없어요.');
      const bytes = new Uint8Array(img.data);
      return new Response(bytes, { headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': 'inline' } });
    }

    return fail(404, '없는 주소예요.');
  } catch (err) {
    console.error(err);
    return fail(500, '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  }
}
