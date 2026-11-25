// 해결 탭 API: 에러·막힌 문제를 "증상 → 환경 → 원인 → 해결" 양식으로 모아 두는 곳
// 질문 탭이 "모르는 걸 묻는 곳"이라면, 해결 탭은 "겪은 문제와 푼 방법을 남기는 곳"이에요.
// 메인 라우터에서 handleFixes(ctx)로 부름. 처리하지 않는 주소면 null을 돌려줌.

export const FIX_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fixes (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, author_name TEXT, subject INTEGER NOT NULL,
     title TEXT NOT NULL, symptom TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', cause TEXT NOT NULL DEFAULT '',
     solution TEXT NOT NULL DEFAULT '', metoo_count INTEGER NOT NULL DEFAULT 0, from_post_id INTEGER,
     solved_by TEXT, solved_name TEXT, last_editor_id TEXT, deleted INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_fixes_subject ON fixes(deleted, subject, updated_at DESC)',
  'CREATE TABLE IF NOT EXISTS fix_metoo (user_id TEXT NOT NULL, fix_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, fix_id))',
];

const LIMITS = { title: 100, symptom: 5000, env: 300, cause: 5000, solution: 10000 };
const COOLDOWN_MS = 5000;

// LIKE 검색에서 %, _ 를 글자 그대로 찾게
const likeArg = (q) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

export async function handleFixes(ctx) {
  const { env, url, request, parts, method, user, subjectCount, H } = ctx;
  const { json, fail, cleanText, readJson, tagOf, nameFor, banGuard } = H;
  if (parts[0] !== 'fixes') return null;
  const db = env.DB;
  const now = Date.now();
  const okSubject = (n) => Number.isInteger(n) && n >= 1 && n <= subjectCount;

  // 목록 + 검색
  if (parts.length === 1 && method === 'GET') {
    const sp = url.searchParams.get('subject') || 'all';
    const subject = sp === 'all' ? null : Number(sp);
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') === 'metoo' ? 'metoo' : 'recent';
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const where = ['f.deleted = 0'];
    const args = [user.id];
    if (subject) { args.push(subject); where.push(`f.subject = ?${args.length}`); }
    if (status === 'solved') where.push("f.solution != ''");
    if (status === 'open') where.push("f.solution = ''");
    if (q) {
      args.push(likeArg(q));
      const n = args.length;
      where.push(`(f.title LIKE ?${n} ESCAPE '\\' OR f.symptom LIKE ?${n} ESCAPE '\\' OR f.env LIKE ?${n} ESCAPE '\\' OR f.cause LIKE ?${n} ESCAPE '\\' OR f.solution LIKE ?${n} ESCAPE '\\')`);
    }
    const order = sort === 'metoo' ? 'f.metoo_count DESC, f.updated_at DESC' : 'f.updated_at DESC';
    const { results } = await db.prepare(
      `SELECT f.id, f.user_id, f.author_name, f.subject, f.title, substr(f.symptom, 1, 200) AS symptom, f.env,
              f.solution != '' AS solved, f.metoo_count, f.created_at, f.updated_at, f.user_id = ?1 AS mine,
              EXISTS (SELECT 1 FROM fix_metoo m WHERE m.user_id = ?1 AND m.fix_id = f.id) AS metoo
         FROM fixes f WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`
    ).bind(...args).all();
    return json({
      fixes: results.map((f) => ({
        id: f.id, subject: f.subject, title: f.title, symptom: f.symptom, env: f.env, solved: !!f.solved,
        metoo: f.metoo_count, iMetoo: !!f.metoo, mine: !!f.mine, author: f.author_name || '익명',
        createdAt: f.created_at, updatedAt: f.updated_at,
        tag: user.is_admin ? tagOf(f.user_id) : undefined, uid: user.is_admin ? f.user_id : undefined,
      })),
    });
  }

  // 새 기록
  if (parts.length === 1 && method === 'POST') {
    const banned = banGuard(); if (banned) return banned;
    const b = await readJson(request);
    const subject = Number(b.subject);
    if (!okSubject(subject)) return fail(400, '과목을 골라주세요.');
    const f = {};
    for (const k of Object.keys(LIMITS)) f[k] = cleanText(b[k], LIMITS[k]);
    if (!f.title) return fail(400, '제목을 써주세요.');
    if (!f.symptom) return fail(400, '증상(에러 메시지나 막힌 상황)을 써주세요.');
    if (now - (user.last_post_at || 0) < COOLDOWN_MS) return fail(429, '조금만 있다가 다시 올려주세요.');
    let fromPost = null;
    if (b.fromPost) {
      const p = await db.prepare('SELECT id FROM posts WHERE id = ? AND deleted = 0').bind(Number(b.fromPost)).first();
      if (p) fromPost = p.id;
    }
    const name = nameFor(user);
    const r = await db.prepare(
      `INSERT INTO fixes (user_id, author_name, subject, title, symptom, env, cause, solution, from_post_id, solved_by, solved_name, last_editor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(user.id, name, subject, f.title, f.symptom, f.env, f.cause, f.solution, fromPost,
      f.solution ? user.id : null, f.solution ? name : null, user.id, now, now).run();
    await db.prepare('UPDATE users SET last_post_at = ? WHERE id = ?').bind(now, user.id).run();
    return json({ id: r.meta.last_row_id });
  }

  const id = Number(parts[1]);
  if (!Number.isInteger(id)) return fail(404, '없는 주소예요.');
  const fix = await db.prepare('SELECT * FROM fixes WHERE id = ? AND deleted = 0').bind(id).first();
  if (!fix) return fail(404, '지워졌거나 없는 기록이에요.');
  const isAuthor = fix.user_id === user.id;
  const canManage = isAuthor || !!user.is_admin;

  // 보기
  if (parts.length === 2 && method === 'GET') {
    const metoo = await db.prepare('SELECT 1 AS x FROM fix_metoo WHERE user_id = ? AND fix_id = ?').bind(user.id, id).first();
    let fromPost = null;
    if (fix.from_post_id) {
      const p = await db.prepare('SELECT id, title FROM posts WHERE id = ? AND deleted = 0').bind(fix.from_post_id).first();
      if (p) fromPost = { id: p.id, title: p.title };
    }
    return json({
      fix: {
        id: fix.id, subject: fix.subject, title: fix.title, symptom: fix.symptom, env: fix.env, cause: fix.cause,
        solution: fix.solution, solved: !!fix.solution, metoo: fix.metoo_count, iMetoo: !!metoo, mine: isAuthor,
        author: fix.author_name || '익명', solvedBy: fix.solution ? (fix.solved_name || (fix.solved_by === fix.user_id ? fix.author_name || '익명' : '익명')) : null,
        createdAt: fix.created_at, updatedAt: fix.updated_at, fromPost,
        tag: user.is_admin ? tagOf(fix.user_id) : undefined, uid: user.is_admin ? fix.user_id : undefined,
      },
      // 원인·해결은 누구나 보탤 수 있고, 제목·증상·과목은 쓴 사람과 운영자만
      canEdit: !user.banned, canEditAll: canManage && !user.banned, canDelete: canManage,
    });
  }

  // 고치기 / 해결 방법 보태기
  if (parts.length === 2 && method === 'PATCH') {
    const banned = banGuard(); if (banned) return banned;
    const b = await readJson(request);
    const next = { subject: fix.subject, title: fix.title, symptom: fix.symptom, env: fix.env, cause: fix.cause, solution: fix.solution };
    for (const k of ['env', 'cause', 'solution']) if (k in b) next[k] = cleanText(b[k], LIMITS[k]);
    if (canManage) {
      if ('title' in b) next.title = cleanText(b.title, LIMITS.title);
      if ('symptom' in b) next.symptom = cleanText(b.symptom, LIMITS.symptom);
      if ('subject' in b) { const s = Number(b.subject); if (!okSubject(s)) return fail(400, '과목을 골라주세요.'); next.subject = s; }
    } else if (['title', 'symptom', 'subject'].some((k) => k in b && String(b[k]) !== String(fix[k]))) {
      return fail(403, '제목·증상·과목은 쓴 사람만 고칠 수 있어요. 원인과 해결 방법은 누구나 보탤 수 있어요.');
    }
    if (!next.title) return fail(400, '제목을 써주세요.');
    if (!next.symptom) return fail(400, '증상을 써주세요.');
    // 처음 해결 방법을 적은 사람을 기록 (해결 방법을 지우면 다시 미해결)
    let solvedBy = fix.solved_by, solvedName = fix.solved_name;
    if (!fix.solution && next.solution) { solvedBy = user.id; solvedName = nameFor(user); }
    if (!next.solution) { solvedBy = null; solvedName = null; }
    await db.prepare(
      `UPDATE fixes SET subject = ?, title = ?, symptom = ?, env = ?, cause = ?, solution = ?, solved_by = ?, solved_name = ?, last_editor_id = ?, updated_at = ? WHERE id = ?`
    ).bind(next.subject, next.title, next.symptom, next.env, next.cause, next.solution, solvedBy, solvedName, user.id, now, id).run();
    return json({ ok: true, solved: !!next.solution });
  }

  if (parts.length === 2 && method === 'DELETE') {
    if (!canManage) return fail(403, '쓴 사람이나 운영자만 지울 수 있어요.');
    await db.prepare('UPDATE fixes SET deleted = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // 나도 겪었어요 (한 번 더 누르면 취소)
  if (parts[2] === 'metoo' && method === 'POST') {
    const had = await db.prepare('SELECT 1 AS x FROM fix_metoo WHERE user_id = ? AND fix_id = ?').bind(user.id, id).first();
    if (had) await db.prepare('DELETE FROM fix_metoo WHERE user_id = ? AND fix_id = ?').bind(user.id, id).run();
    else await db.prepare('INSERT INTO fix_metoo (user_id, fix_id, created_at) VALUES (?, ?, ?)').bind(user.id, id, now).run();
    const c = await db.prepare('SELECT COUNT(*) AS n FROM fix_metoo WHERE fix_id = ?').bind(id).first();
    await db.prepare('UPDATE fixes SET metoo_count = ? WHERE id = ?').bind(c.n, id).run();
    return json({ metoo: c.n, iMetoo: !had });
  }

  return fail(404, '없는 주소예요.');
}
