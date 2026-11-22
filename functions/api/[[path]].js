// 익명 라운지 API — Cloudflare Pages Functions
// 필요한 설정: D1 바인딩 이름 DB, 환경 변수 INVITE_CODE(반 공용 코드), ADMIN_CODE(운영자 코드)

const CATS = ['질문', '잡담', '건의'];
const TIERS = [
  { name: '브론즈', min: 0 },
  { name: '실버', min: 20 },
  { name: '골드', min: 60 },
  { name: '플래티넘', min: 150 },
  { name: '다이아', min: 300 },
];
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 400 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const POST_COOLDOWN_MS = 15 * 1000;
const COOKIE = 'al_token';

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
function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
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
  if (list.length > MAX_IMAGES) throw new Error(`이미지는 최대 ${MAX_IMAGES}장까지 올릴 수 있어요.`);
  return list.map((img) => {
    if (!img || !IMAGE_TYPES.includes(img.mime) || typeof img.data !== 'string') throw new Error('지원하지 않는 이미지 형식이에요.');
    const bin = atob(img.data);
    if (bin.length > MAX_IMAGE_BYTES) throw new Error('이미지가 너무 커요. 400KB 이하로 줄여주세요.');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: img.mime, bytes };
  });
}
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ---------- 인증 ----------
async function currentUser(env, request) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  return env.DB.prepare('SELECT * FROM users WHERE token_hash = ?').bind(await sha256(token)).first();
}
function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}
async function receivedHelps(env, userId) {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(help_count), 0) FROM posts WHERE user_id = ?1 AND deleted = 0) +
       (SELECT COALESCE(SUM(help_count), 0) FROM answers WHERE user_id = ?1 AND deleted = 0) AS n`
  ).bind(userId).first();
  return row ? row.n : 0;
}
async function meView(env, user) {
  return {
    mySubject: user.my_subject,
    isAdmin: !!user.is_admin,
    realName: user.real_name || '',
    showReal: !!user.show_real,
    tier: tierOf(await receivedHelps(env, user.id)),
  };
}
const nameFor = (user) => (user.show_real && user.real_name ? user.real_name : null);

// ---------- 라우터 ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;

  try {
    // 입장 (초대 코드)
    if (parts[0] === 'join' && method === 'POST') {
      const { code } = await readJson(request);
      const isAdmin = env.ADMIN_CODE && safeEqual(String(code || ''), env.ADMIN_CODE);
      if (!isAdmin && !(env.INVITE_CODE && safeEqual(String(code || ''), env.INVITE_CODE))) return fail(403, '초대 코드가 맞지 않아요.');
      const token = randomHex(32);
      const id = randomHex(12);
      await env.DB.prepare('INSERT INTO users (id, token_hash, is_admin, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, await sha256(token), isAdmin ? 1 : 0, Date.now()).run();
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return json(await meView(env, user), 200, { 'set-cookie': sessionCookie(token, request) });
    }

    const user = await currentUser(env, request);
    if (!user) return fail(401, '먼저 초대 코드로 들어와 주세요.');

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
        if (subject) { where.push("(p.subject = ? OR p.cat = '건의')"); args.push(subject); }
        if (CATS.includes(cat)) { where.push('p.cat = ?'); args.push(cat); }
        const { results } = await env.DB.prepare(
          `SELECT p.id, p.cat, p.subject, p.title, substr(p.body, 1, 120) AS excerpt, p.author_name,
                  p.answer_count, p.help_count, p.created_at, (p.user_id = ?1) AS mine,
                  EXISTS (SELECT 1 FROM helps h WHERE h.user_id = ?1 AND h.target_type = 'post' AND h.target_id = p.id) AS helped,
                  EXISTS (SELECT 1 FROM images i WHERE i.owner_type = 'post' AND i.owner_id = p.id) AS has_image
             FROM posts p WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC LIMIT 100`
        ).bind(...args).all();
        const posts = results.map((p) => ({
          id: p.id, cat: p.cat, subject: p.subject, title: p.title, excerpt: p.excerpt,
          author: p.author_name || '익명', answers: p.answer_count, helps: p.help_count, createdAt: p.created_at,
          mine: !!p.mine, helped: !!p.helped, hasImage: !!p.has_image,
          unread: seen !== null && !p.mine && p.created_at > seen,
        }));
        if (subject) {
          await env.DB.prepare(
            'INSERT INTO reads (user_id, subject, seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id, subject) DO UPDATE SET seen_at = excluded.seen_at'
          ).bind(user.id, subject, Date.now()).run();
        }
        return json({ posts });
      }
      if (method === 'POST') {
        const b = await readJson(request);
        const now = Date.now();
        if (now - user.last_post_at < POST_COOLDOWN_MS) return fail(429, '조금만 있다가 다시 올려주세요.');
        const cat = CATS.includes(b.cat) ? b.cat : null;
        if (!cat) return fail(400, '말머리를 골라주세요.');
        const subject = cat === '건의' ? 0 : Number(b.subject);
        if (cat !== '건의' && !(subject >= 1 && subject <= 16)) return fail(400, '과목을 골라주세요.');
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
             FROM answers a WHERE a.post_id = ? AND a.deleted = 0 ORDER BY a.created_at`
        ).bind(user.id, postId).all();
        const { results: imgs } = await env.DB.prepare(
          `SELECT id, owner_type, owner_id FROM images
            WHERE (owner_type = 'post' AND owner_id = ?)
               OR (owner_type = 'answer' AND owner_id IN (SELECT id FROM answers WHERE post_id = ? AND deleted = 0))`
        ).bind(postId, postId).all();
        const helpedPost = await env.DB.prepare("SELECT 1 AS x FROM helps WHERE user_id = ? AND target_type = 'post' AND target_id = ?").bind(user.id, postId).first();
        // 에브리타임처럼: 글 안에서 같은 사람은 같은 번호
        const numbers = new Map();
        const label = (uid, name) => {
          if (name) return name;
          if (uid === post.user_id) return '익명(글쓴이)';
          if (!numbers.has(uid)) numbers.set(uid, numbers.size + 1);
          return `익명${numbers.get(uid)}`;
        };
        const imagesOf = (type, id) => imgs.filter((i) => i.owner_type === type && i.owner_id === id).map((i) => `/api/images/${i.id}`);
        return json({
          post: {
            id: post.id, cat: post.cat, subject: post.subject, title: post.title, body: post.body,
            author: post.author_name || '익명', createdAt: post.created_at, helps: post.help_count,
            helped: !!helpedPost, mine: post.user_id === user.id, images: imagesOf('post', post.id),
          },
          answers: answers.map((a) => ({
            id: a.id, body: a.body, author: label(a.user_id, a.author_name), createdAt: a.created_at,
            helps: a.help_count, helped: !!a.helped, mine: a.user_id === user.id, images: imagesOf('answer', a.id),
          })),
          canModerate: !!user.is_admin,
        });
      }
      if (parts.length === 2 && method === 'DELETE') {
        if (post.user_id !== user.id && !user.is_admin) return fail(403, '지울 수 없는 글이에요.');
        await env.DB.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').bind(postId).run();
        return json({ ok: true });
      }
      if (parts[2] === 'answers' && method === 'POST') {
        const b = await readJson(request);
        const now = Date.now();
        if (now - user.last_post_at < POST_COOLDOWN_MS / 3) return fail(429, '조금만 있다가 다시 올려주세요.');
        const body = cleanText(b.body, 5000);
        if (!body && !(b.images || []).length) return fail(400, '답변 내용을 써주세요.');
        let images;
        try { images = decodeImages(b.images); } catch (e) { return fail(400, e.message); }
        const res = await env.DB.prepare('INSERT INTO answers (post_id, user_id, body, author_name, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(postId, user.id, body, nameFor(user), now).run();
        const answerId = res.meta.last_row_id;
        for (const img of images) {
          await env.DB.prepare('INSERT INTO images (owner_type, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind('answer', answerId, img.mime, img.bytes, now).run();
        }
        await env.DB.prepare('UPDATE posts SET answer_count = answer_count + 1 WHERE id = ?').bind(postId).run();
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

    // 도움됐어요 (누르면 켜지고, 다시 누르면 꺼짐)
    if (parts[0] === 'help' && method === 'POST') {
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

    // 이미지 보기 (들어온 사람만)
    if (parts[0] === 'images' && parts[1] && method === 'GET') {
      const img = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?').bind(Number(parts[1])).first();
      if (!img) return fail(404, '이미지가 없어요.');
      const bytes = img.data instanceof ArrayBuffer ? new Uint8Array(img.data) : new Uint8Array(img.data);
      return new Response(bytes, { headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
    }

    return fail(404, '없는 주소예요.');
  } catch (err) {
    console.error(err);
    return fail(500, '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  }
}
