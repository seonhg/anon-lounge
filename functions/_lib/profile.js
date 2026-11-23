// 실명 사용자의 프로필 꾸미기 (사진·이모지, 색, 한 줄 소개, 관심 태그, 링크)
// 익명 보호: 프로필은 '실명으로 활동하기'를 켠 동안에만 보이고, 실명으로 쓴 글만 보여줌.
// 사용자 id 대신 따로 만든 profile_slug로만 주소를 만듦.

export const PROFILE_COLORS = ['violet', 'pink', 'blue', 'mint', 'orange', 'yellow', 'green', 'gray'];
const MAX_AVATAR_BYTES = 200 * 1024;

export async function migrateProfile(db) {
  const { results: cols } = await db.prepare('PRAGMA table_info(users)').all();
  const have = new Set(cols.map((c) => c.name));
  const add = [['profile', 'TEXT'], ['profile_slug', 'TEXT'], ['avatar_mime', 'TEXT'], ['avatar_data', 'BLOB'], ['avatar_ver', 'INTEGER NOT NULL DEFAULT 0']];
  for (const [name, type] of add) if (!have.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_profile_slug ON users(profile_slug)').run();
}

function parseProfile(raw) {
  let p = {};
  try { p = JSON.parse(raw || '{}') || {}; } catch {}
  return {
    bio: typeof p.bio === 'string' ? p.bio : '',
    emoji: typeof p.emoji === 'string' && p.emoji ? p.emoji : '🙂',
    color: PROFILE_COLORS.includes(p.color) ? p.color : 'violet',
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string').slice(0, 5) : [],
    links: Array.isArray(p.links) ? p.links.filter((l) => l && typeof l.url === 'string').slice(0, 3) : [],
    avatar: p.avatar === 'image' ? 'image' : 'emoji',
  };
}
const isPublic = (u) => !!(u && u.show_real && u.real_name);
function randomSlug() {
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function ensureSlug(db, u) {
  if (u.profile_slug) return u.profile_slug;
  for (let i = 0; i < 5; i++) {
    const slug = randomSlug();
    try {
      await db.prepare('UPDATE users SET profile_slug = ? WHERE id = ? AND profile_slug IS NULL').bind(slug, u.id).run();
      const r = await db.prepare('SELECT profile_slug FROM users WHERE id = ?').bind(u.id).first();
      if (r && r.profile_slug) { u.profile_slug = r.profile_slug; return r.profile_slug; }
    } catch {}
  }
  return null;
}
// 글 옆에 붙는 작은 프로필 (사진/이모지·색·주소)
function card(u, p) {
  const hasImage = p.avatar === 'image' && !!u.avatar_mime;
  return { slug: u.profile_slug, name: u.real_name, emoji: p.emoji, color: p.color, image: hasImage ? `/api/avatars/${u.profile_slug}?v=${u.avatar_ver || 0}` : null };
}

// 내 정보 화면용 (나에게만)
export async function myProfile(db, u) {
  const p = parseProfile(u.profile);
  if (isPublic(u)) await ensureSlug(db, u);
  return { ...p, slug: u.profile_slug || null, public: isPublic(u), hasImage: !!u.avatar_mime, image: u.avatar_mime && u.profile_slug ? `/api/avatars/${u.profile_slug}?v=${u.avatar_ver || 0}` : null };
}

// 글·답변 목록에서: 실명으로 쓴 것만 프로필 정보를 붙임
export async function profilesFor(db, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const { results } = await db.prepare(`SELECT id, real_name, show_real, profile, profile_slug, avatar_mime, avatar_ver FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  for (const u of results) {
    if (!isPublic(u)) continue;
    if (!(await ensureSlug(db, u))) continue;
    map.set(u.id, card(u, parseProfile(u.profile)));
  }
  return map;
}

function cleanUrl(v) {
  try {
    const u = new URL(String(v || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.href.slice(0, 200);
  } catch { return null; }
}

export async function handleProfile(ctx) {
  const { env, request, parts, method, user, H } = ctx;
  const { json, fail, cleanText, readJson, looksLikeImage, IMAGE_TYPES, banGuard } = H;
  const db = env.DB;

  // 프로필 사진 보기 (로그인한 사람만, 프로필이 공개일 때만)
  if (parts[0] === 'avatars' && parts[1] && method === 'GET') {
    const u = await db.prepare('SELECT real_name, show_real, avatar_mime, avatar_data FROM users WHERE profile_slug = ?').bind(parts[1]).first();
    if (!u || !u.avatar_mime || (!isPublic(u) && parts[1] !== user.profile_slug)) return fail(404, '사진이 없어요.');
    return new Response(new Uint8Array(u.avatar_data), { headers: { 'content-type': u.avatar_mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }

  // 남의 프로필
  if (parts[0] === 'profiles' && parts[1] && method === 'GET') {
    const u = await db.prepare('SELECT * FROM users WHERE profile_slug = ?').bind(parts[1]).first();
    if (!isPublic(u)) return fail(404, '프로필을 볼 수 없어요. 실명 활동을 끈 사용자예요.');
    const p = parseProfile(u.profile);
    // 실명으로 쓴 것만
    const { results: posts } = await db.prepare(
      `SELECT id, cat, subject, title, answer_count, help_count, created_at FROM posts
        WHERE user_id = ? AND author_name IS NOT NULL AND deleted = 0 ORDER BY created_at DESC LIMIT 50`
    ).bind(u.id).all();
    const a = await db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(help_count), 0) AS h FROM answers WHERE user_id = ? AND author_name IS NOT NULL AND deleted = 0').bind(u.id).first();
    const postHelps = posts.reduce((s, x) => s + x.help_count, 0);
    return json({
      profile: { ...card(u, p), bio: p.bio, tags: p.tags, links: p.links, me: u.id === user.id },
      stats: { posts: posts.length, answers: a.c, helps: postHelps + a.h },
      posts: posts.map((x) => ({ id: x.id, cat: x.cat, subject: x.subject, title: x.title, answers: x.answer_count, helps: x.help_count, createdAt: x.created_at })),
    });
  }

  if (parts[0] !== 'me') return null;

  // 프로필 고치기
  if (parts[1] === 'profile' && method === 'PATCH') {
    const banned = banGuard(); if (banned) return banned;
    if (!isPublic(user)) return fail(403, '실명으로 활동하기를 켜야 프로필을 꾸밀 수 있어요.');
    const b = await readJson(request);
    const cur = parseProfile(user.profile);
    const next = {
      bio: b.bio !== undefined ? cleanText(b.bio, 100).replace(/\n+/g, ' ') : cur.bio,
      emoji: b.emoji !== undefined ? ([...String(b.emoji).trim()].slice(0, 4).join('') || '🙂') : cur.emoji,
      color: PROFILE_COLORS.includes(b.color) ? b.color : cur.color,
      tags: Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => cleanText(String(t), 12).replace(/^#/, '')).filter(Boolean))].slice(0, 5) : cur.tags,
      links: Array.isArray(b.links)
        ? b.links.map((l) => ({ label: cleanText(String(l?.label || ''), 20), url: cleanUrl(l?.url) })).filter((l) => l.url).slice(0, 3)
        : cur.links,
      avatar: b.avatar === 'image' && user.avatar_mime ? 'image' : b.avatar === 'emoji' ? 'emoji' : cur.avatar,
    };
    if (Array.isArray(b.links) && b.links.some((l) => String(l?.url || '').trim() && !cleanUrl(l.url))) return fail(400, '링크는 https:// 로 시작하는 주소만 넣을 수 있어요.');
    await db.prepare('UPDATE users SET profile = ? WHERE id = ?').bind(JSON.stringify(next), user.id).run();
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ profile: await myProfile(db, u) });
  }

  // 프로필 사진 올리기 / 지우기
  if (parts[1] === 'avatar' && method === 'POST') {
    const banned = banGuard(); if (banned) return banned;
    if (!isPublic(user)) return fail(403, '실명으로 활동하기를 켜야 프로필 사진을 올릴 수 있어요.');
    const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (!IMAGE_TYPES.includes(mime)) return fail(400, '지원하지 않는 이미지 형식이에요.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return fail(400, '사진이 너무 커요.');
    if (!looksLikeImage(bytes, mime)) return fail(400, '이미지 파일이 아니에요.');
    const p = parseProfile(user.profile); p.avatar = 'image';
    await db.prepare('UPDATE users SET avatar_mime = ?, avatar_data = ?, avatar_ver = avatar_ver + 1, profile = ? WHERE id = ?').bind(mime, bytes, JSON.stringify(p), user.id).run();
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ profile: await myProfile(db, u) });
  }
  if (parts[1] === 'avatar' && method === 'DELETE') {
    const p = parseProfile(user.profile); p.avatar = 'emoji';
    await db.prepare('UPDATE users SET avatar_mime = NULL, avatar_data = NULL, avatar_ver = avatar_ver + 1, profile = ? WHERE id = ?').bind(JSON.stringify(p), user.id).run();
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ profile: await myProfile(db, u) });
  }
  return null;
}
