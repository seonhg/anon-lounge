// 정리 탭 API: 나만 보는 노트 + 모두 고칠 수 있는 공개 정리(위키)
// 메인 라우터에서 handleNotes(ctx)로 부름. 처리하지 않는 주소면 null을 돌려줌.

export const NOTE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, subject INTEGER NOT NULL,
     title TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
     rev INTEGER NOT NULL DEFAULT 1, help_count INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_editor_id TEXT, published_at INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(visibility, subject, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at DESC)',
  `CREATE TABLE IF NOT EXISTS note_revisions (
     id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL, rev INTEGER NOT NULL, user_id TEXT NOT NULL,
     author_name TEXT, title TEXT NOT NULL, body TEXT NOT NULL, summary TEXT, created_at INTEGER NOT NULL)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_note_rev ON note_revisions(note_id, rev)',
  'CREATE TABLE IF NOT EXISTS note_images (id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL, user_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_note_images_note ON note_images(note_id)',
  'CREATE TABLE IF NOT EXISTS note_helps (user_id TEXT NOT NULL, note_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, note_id))',
  'CREATE TABLE IF NOT EXISTS note_reads (user_id TEXT NOT NULL, subject INTEGER NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY (user_id, subject))',
];

const MAX_TITLE = 100;
const MAX_BODY = 50000;
const MAX_NOTE_IMAGES = 50;
const EDIT_COOLDOWN_MS = 3000;

// 목록 미리보기용: 마크다운 기호 걷어내기
function plain(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\*[^\]]*\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.|>)\s+/gm, '')
    .replace(/[*`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export async function noteHelpsReceived(env, userId) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(help_count), 0) AS n FROM notes WHERE user_id = ? AND deleted = 0').bind(userId).first();
  return r ? r.n : 0;
}

export async function handleNotes(ctx) {
  const { env, request, url, parts, method, user, H } = ctx;
  const { json, fail, cleanText, readJson, tagOf, looksLikeImage, IMAGE_TYPES, MAX_IMAGE_BYTES, nameFor, banGuard } = H;
  const db = env.DB;
  const now = Date.now();

  // 노트 이미지 보기: 공개 정리이거나 내 노트일 때만
  if (parts[0] === 'note-images' && parts[1] && method === 'GET') {
    const img = await db.prepare(
      `SELECT i.mime, i.data FROM note_images i JOIN notes n ON n.id = i.note_id
        WHERE i.id = ? AND n.deleted = 0 AND (n.visibility = 'public' OR n.user_id = ?)`
    ).bind(Number(parts[1]), user.id).first();
    if (!img) return fail(404, '이미지가 없어요.');
    return new Response(new Uint8Array(img.data), { headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (parts[0] !== 'notes') return null;

  // 과목별 새로 바뀐 공개 정리 수
  if (parts[1] === 'subjects' && method === 'GET') {
    const { results } = await db.prepare(
      `SELECT n.subject AS subject, COUNT(*) AS c FROM notes n
         LEFT JOIN note_reads r ON r.user_id = ?1 AND r.subject = n.subject
        WHERE n.deleted = 0 AND n.visibility = 'public' AND COALESCE(n.last_editor_id, n.user_id) != ?1
          AND n.updated_at > COALESCE(r.seen_at, ?2)
        GROUP BY n.subject`
    ).bind(user.id, user.created_at).all();
    const unread = {};
    for (const r of results) unread[r.subject] = r.c;
    return json({ unread });
  }

  // 목록
  if (parts.length === 1 && method === 'GET') {
    const scope = url.searchParams.get('scope') === 'mine' ? 'mine' : 'public';
    const sp = url.searchParams.get('subject') || 'all';
    const subject = sp === 'all' ? null : Number(sp);
    const where = ['n.deleted = 0'];
    const args = [user.id];
    if (scope === 'public') where.push("n.visibility = 'public'");
    else where.push('n.user_id = ?1');
    if (subject) { where.push(`n.subject = ?${args.length + 1}`); args.push(subject); }
    const seen = scope === 'public' && subject
      ? (await db.prepare('SELECT seen_at FROM note_reads WHERE user_id = ? AND subject = ?').bind(user.id, subject).first())?.seen_at ?? user.created_at
      : null;
    const { results } = await db.prepare(
      `SELECT n.id, n.subject, n.title, substr(n.body, 1, 600) AS body, n.visibility, n.rev, n.help_count, n.updated_at, n.created_at,
              n.user_id = ?1 AS mine, COALESCE(n.last_editor_id, n.user_id) AS last_editor,
              (SELECT COUNT(DISTINCT user_id) FROM note_revisions v WHERE v.note_id = n.id) AS contributors
         FROM notes n WHERE ${where.join(' AND ')} ORDER BY n.updated_at DESC LIMIT 200`
    ).bind(...args).all();
    if (scope === 'public' && subject) {
      await db.prepare('INSERT INTO note_reads (user_id, subject, seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id, subject) DO UPDATE SET seen_at = excluded.seen_at')
        .bind(user.id, subject, now).run();
    }
    return json({
      notes: results.map((n) => ({
        id: n.id, subject: n.subject, title: n.title, excerpt: plain(n.body), visibility: n.visibility, rev: n.rev,
        helps: n.help_count, updatedAt: n.updated_at, createdAt: n.created_at, mine: !!n.mine, contributors: n.contributors,
        unread: seen !== null && n.last_editor !== user.id && n.updated_at > seen,
        tag: user.is_admin ? tagOf(n.last_editor) : undefined,
      })),
    });
  }

  // 새 노트
  if (parts.length === 1 && method === 'POST') {
    const banned = banGuard(); if (banned) return banned;
    const b = await readJson(request);
    const subject = Number(b.subject);
    if (!(subject >= 1 && subject <= 16)) return fail(400, '과목을 골라주세요.');
    const title = cleanText(b.title, MAX_TITLE) || '제목 없음';
    const body = cleanText(b.body, MAX_BODY);
    const vis = b.visibility === 'public' ? 'public' : 'private';
    const res = await db.prepare(
      'INSERT INTO notes (user_id, subject, title, body, visibility, rev, created_at, updated_at, last_editor_id, published_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)'
    ).bind(user.id, subject, title, body, vis, now, now, user.id, vis === 'public' ? now : 0).run();
    const id = res.meta.last_row_id;
    await db.prepare('INSERT INTO note_revisions (note_id, rev, user_id, author_name, title, body, summary, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, nameFor(user), title, body, '처음 작성', now).run();
    return json({ id, rev: 1 }, 201);
  }

  const id = Number(parts[1]);
  const note = await db.prepare('SELECT * FROM notes WHERE id = ? AND deleted = 0').bind(id).first();
  // 나만 보기 노트는 주인 말고는 운영자에게도 없는 것처럼
  if (!note || (note.visibility !== 'public' && note.user_id !== user.id)) return fail(404, '정리를 찾을 수 없어요.');
  const mine = note.user_id === user.id;
  const canEdit = !user.banned && (mine || note.visibility === 'public');
  const others = async () => (await db.prepare('SELECT COUNT(*) AS c FROM note_revisions WHERE note_id = ? AND user_id != ?').bind(id, note.user_id).first()).c;

  // 기여한 사람 이름표: 처음 쓴 사람은 익명(작성자), 나머지는 고친 순서대로 익명1, 익명2…
  async function labels() {
    const { results } = await db.prepare('SELECT user_id, author_name, MIN(rev) AS first FROM note_revisions WHERE note_id = ? GROUP BY user_id ORDER BY first').bind(id).all();
    const map = new Map();
    let k = 0;
    for (const r of results) map.set(r.user_id, r.author_name || (r.user_id === note.user_id ? '익명(작성자)' : `익명${++k}`));
    return map;
  }

  // 노트 하나 보기
  if (parts.length === 2 && method === 'GET') {
    const lab = await labels();
    const { results: revs } = await db.prepare('SELECT user_id, COUNT(*) AS c FROM note_revisions WHERE note_id = ? GROUP BY user_id').bind(id).all();
    const helped = await db.prepare('SELECT 1 AS x FROM note_helps WHERE user_id = ? AND note_id = ?').bind(user.id, id).first();
    if (note.visibility === 'public') {
      await db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'note_edit' AND post_id = ? AND read_at = 0").bind(now, user.id, id).run();
    }
    const otherCount = revs.filter((r) => r.user_id !== note.user_id).length;
    return json({
      note: {
        id, subject: note.subject, title: note.title, body: note.body, visibility: note.visibility, rev: note.rev,
        helps: note.help_count, helped: !!helped, createdAt: note.created_at, updatedAt: note.updated_at, mine,
        lastEditor: lab.get(note.last_editor_id || note.user_id) || '익명',
        contributors: [...lab.entries()].map(([uid, name]) => ({ name, edits: revs.find((r) => r.user_id === uid)?.c || 0, me: uid === user.id, tag: user.is_admin ? tagOf(uid) : undefined, uid: user.is_admin ? uid : undefined })),
        tag: user.is_admin ? tagOf(note.user_id) : undefined, uid: user.is_admin ? note.user_id : undefined,
      },
      canEdit,
      canMakePrivate: mine && note.visibility === 'public' && otherCount === 0,
      canMakePublic: mine && note.visibility !== 'public',
      canDelete: (mine && otherCount === 0) || !!user.is_admin,
    });
  }

  // 고치기 (다른 사람이 먼저 고쳤으면 409로 알려줌)
  if (parts.length === 2 && method === 'PUT') {
    if (!canEdit) return user.banned ? banGuard() : fail(403, '고칠 수 없는 정리예요.');
    const b = await readJson(request);
    if (Number(b.baseRev) !== note.rev) {
      return json({ error: '그사이 다른 사람이 이 정리를 고쳤어요.', conflict: true, current: { rev: note.rev, title: note.title, body: note.body } }, 409);
    }
    const title = cleanText(b.title, MAX_TITLE) || '제목 없음';
    const body = cleanText(b.body, MAX_BODY);
    if (title === note.title && body === note.body) return json({ id, rev: note.rev, unchanged: true });
    if (now - (user.last_post_at || 0) < EDIT_COOLDOWN_MS) return fail(429, '조금만 있다가 다시 저장해 주세요.');
    const rev = note.rev + 1;
    const upd = await db.prepare('UPDATE notes SET title = ?, body = ?, rev = ?, updated_at = ?, last_editor_id = ? WHERE id = ? AND rev = ?')
      .bind(title, body, rev, now, user.id, id, note.rev).run();
    if (!upd.meta.changes) return fail(409, '그사이 다른 사람이 이 정리를 고쳤어요. 다시 열어 주세요.');
    await db.prepare('INSERT INTO note_revisions (note_id, rev, user_id, author_name, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, rev, user.id, nameFor(user), title, body, cleanText(b.summary, 60) || null, now).run();
    await db.prepare('UPDATE users SET last_post_at = ? WHERE id = ?').bind(now, user.id).run();
    // 공개 정리를 다른 사람이 고치면 작성자에게 알림 (안 읽은 알림이 있으면 시간만 새로)
    if (note.visibility === 'public' && note.user_id !== user.id) {
      const upd2 = await db.prepare("UPDATE notifications SET created_at = ?, answer_id = ? WHERE user_id = ? AND kind = 'note_edit' AND post_id = ? AND read_at = 0")
        .bind(now, rev, note.user_id, id).run();
      if (!upd2.meta.changes) {
        await db.prepare("INSERT INTO notifications (user_id, kind, post_id, answer_id, created_at) VALUES (?, 'note_edit', ?, ?, ?)").bind(note.user_id, id, rev, now).run();
      }
    }
    return json({ id, rev });
  }

  // 공개 ↔ 나만 보기
  if (parts[2] === 'visibility' && method === 'PATCH') {
    if (!mine) return fail(403, '작성자만 바꿀 수 있어요.');
    const b = await readJson(request);
    if (b.public) {
      await db.prepare("UPDATE notes SET visibility = 'public', published_at = CASE WHEN published_at = 0 THEN ? ELSE published_at END, updated_at = ? WHERE id = ?").bind(now, now, id).run();
    } else {
      if (await others()) return fail(403, '다른 사람이 함께 고친 정리는 다시 나만 보기로 바꿀 수 없어요.');
      await db.prepare("UPDATE notes SET visibility = 'private' WHERE id = ?").bind(id).run();
    }
    return json({ ok: true });
  }

  // 지우기: 작성자(혼자 쓴 경우) 또는 운영자
  if (parts.length === 2 && method === 'DELETE') {
    if (!(user.is_admin || (mine && !(await others())))) return fail(403, '여러 사람이 함께 쓴 정리는 운영자만 지울 수 있어요.');
    await db.prepare('UPDATE notes SET deleted = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // 고친 기록
  if (parts[2] === 'revisions' && method === 'GET') {
    const lab = await labels();
    if (!parts[3]) {
      const { results } = await db.prepare('SELECT rev, user_id, summary, created_at, length(body) AS size FROM note_revisions WHERE note_id = ? ORDER BY rev DESC').bind(id).all();
      return json({
        current: note.rev, title: note.title,
        revisions: results.map((r, i) => ({ rev: r.rev, who: lab.get(r.user_id) || '익명', summary: r.summary || '', createdAt: r.created_at, size: r.size, delta: r.size - (results[i + 1]?.size ?? 0), me: r.user_id === user.id })),
      });
    }
    const r = await db.prepare('SELECT * FROM note_revisions WHERE note_id = ? AND rev = ?').bind(id, Number(parts[3])).first();
    if (!r) return fail(404, '그 기록이 없어요.');
    const prev = await db.prepare('SELECT body FROM note_revisions WHERE note_id = ? AND rev < ? ORDER BY rev DESC LIMIT 1').bind(id, r.rev).first();
    return json({ rev: r.rev, title: r.title, body: r.body, prevBody: prev ? prev.body : '', who: lab.get(r.user_id) || '익명', summary: r.summary || '', createdAt: r.created_at, current: note.rev });
  }

  // 예전 버전으로 되돌리기 (새 기록으로 남음)
  if (parts[2] === 'revert' && method === 'POST') {
    if (!canEdit) return user.banned ? banGuard() : fail(403, '고칠 수 없는 정리예요.');
    const b = await readJson(request);
    const r = await db.prepare('SELECT * FROM note_revisions WHERE note_id = ? AND rev = ?').bind(id, Number(b.rev)).first();
    if (!r) return fail(404, '그 기록이 없어요.');
    const rev = note.rev + 1;
    const upd = await db.prepare('UPDATE notes SET title = ?, body = ?, rev = ?, updated_at = ?, last_editor_id = ? WHERE id = ? AND rev = ?')
      .bind(r.title, r.body, rev, now, user.id, id, note.rev).run();
    if (!upd.meta.changes) return fail(409, '그사이 다른 사람이 고쳤어요. 다시 시도해 주세요.');
    await db.prepare('INSERT INTO note_revisions (note_id, rev, user_id, author_name, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, rev, user.id, nameFor(user), r.title, r.body, `${r.rev}번 기록으로 되돌림`, now).run();
    return json({ id, rev });
  }

  // 이미지 올리기 (본문에 넣을 주소를 돌려줌)
  if (parts[2] === 'images' && method === 'POST') {
    if (!canEdit) return user.banned ? banGuard() : fail(403, '고칠 수 없는 정리예요.');
    const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (!IMAGE_TYPES.includes(mime)) return fail(400, '지원하지 않는 이미지 형식이에요.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return fail(400, '이미지가 너무 커요. 400KB 이하로 줄여주세요.');
    if (!looksLikeImage(bytes, mime)) return fail(400, '이미지 파일이 아니에요.');
    const cnt = await db.prepare('SELECT COUNT(*) AS c FROM note_images WHERE note_id = ?').bind(id).first();
    if (cnt.c >= MAX_NOTE_IMAGES) return fail(400, `정리 하나에 이미지는 ${MAX_NOTE_IMAGES}장까지예요.`);
    const day = await db.prepare('SELECT COUNT(*) AS c FROM note_images WHERE user_id = ? AND created_at > ?').bind(user.id, now - 86400000).first();
    if (day.c >= 200) return fail(429, '이미지는 하루 200장까지 올릴 수 있어요.');
    const res = await db.prepare('INSERT INTO note_images (note_id, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, mime, bytes, now).run();
    return json({ id: res.meta.last_row_id, url: `/api/note-images/${res.meta.last_row_id}` }, 201);
  }

  // 도움됐어요 (공개 정리, 내 것 말고)
  if (parts[2] === 'help' && method === 'POST') {
    const banned = banGuard(); if (banned) return banned;
    if (note.visibility !== 'public') return fail(400, '공개 정리에만 누를 수 있어요.');
    if (mine) return fail(400, '내 정리에는 누를 수 없어요.');
    const had = await db.prepare('SELECT 1 AS x FROM note_helps WHERE user_id = ? AND note_id = ?').bind(user.id, id).first();
    if (had) {
      await db.prepare('DELETE FROM note_helps WHERE user_id = ? AND note_id = ?').bind(user.id, id).run();
      await db.prepare('UPDATE notes SET help_count = MAX(help_count - 1, 0) WHERE id = ?').bind(id).run();
    } else {
      await db.prepare('INSERT INTO note_helps (user_id, note_id, created_at) VALUES (?, ?, ?)').bind(user.id, id, now).run();
      await db.prepare('UPDATE notes SET help_count = help_count + 1 WHERE id = ?').bind(id).run();
    }
    const after = await db.prepare('SELECT help_count FROM notes WHERE id = ?').bind(id).first();
    return json({ helped: !had, helps: after.help_count });
  }

  return fail(404, '없는 주소예요.');
}
