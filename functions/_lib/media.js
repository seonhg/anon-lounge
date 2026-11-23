// GIF·스티커: 글·답변에 붙이는 움짤과 스티커
// - 우리 스티커(/stickers/*.svg): 키 없이 바로 사용
// - GIPHY GIF·스티커: Cloudflare에 GIPHY_API_KEY를 넣으면 사용 (키는 서버에만, 결과는 캐시해서 호출 수 아낌)

export const LOCAL_STICKERS = [
  ['thanks', '감사합니다'], ['fighting', '화이팅'], ['wow', '대박'], ['question', '질문있어요'],
  ['gotit', '이해 완료'], ['huh', '헐'], ['lol', 'ㅋㅋㅋ'], ['goodjob', '수고했어요'],
  ['help', '도와주세요'], ['best', '최고'], ['error', '오류났어요'], ['coffee', '커피 한잔'],
  ['sleepy', '졸려요'], ['congrats', '축하해요'], ['ok', '알겠어요'], ['deploy', '배포 성공'],
];
const LOCAL_IDS = new Set(LOCAL_STICKERS.map(([id]) => id));
export const MAX_MEDIA = 4;
const GIPHY_SRC = /^https:\/\/(?:media\d*|i)\.giphy\.com\/[A-Za-z0-9._~\-\/]+\.(?:webp|gif)(?:\?[A-Za-z0-9=&._\-]*)?$/;

export async function migrateMedia(db) {
  for (const table of ['posts', 'answers']) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    if (!results.some((c) => c.name === 'media')) await db.prepare(`ALTER TABLE ${table} ADD COLUMN media TEXT`).run();
  }
}

// 글쓰기에서 받은 GIF·스티커 목록 검사 → 저장할 JSON (없으면 null)
export function cleanMedia(list) {
  if (!Array.isArray(list) || !list.length) return null;
  if (list.length > MAX_MEDIA) throw new Error(`GIF·스티커는 ${MAX_MEDIA}개까지 붙일 수 있어요.`);
  const out = list.map((m) => {
    if (m && m.type === 'sticker' && LOCAL_IDS.has(m.id)) return { type: 'sticker', id: m.id };
    if (m && (m.type === 'gif' || m.type === 'gsticker') && typeof m.src === 'string' && m.src.length <= 500 && GIPHY_SRC.test(m.src)) {
      const w = Math.max(1, Math.min(1000, Math.round(Number(m.w) || 200)));
      const h = Math.max(1, Math.min(1000, Math.round(Number(m.h) || 200)));
      return { type: m.type, src: m.src, w, h };
    }
    throw new Error('붙일 수 없는 GIF·스티커예요.');
  });
  return JSON.stringify(out);
}
// 저장된 JSON → 화면에 보낼 목록
export function viewMedia(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw).map((m) => (m.type === 'sticker'
      ? { type: 'sticker', src: `/stickers/${m.id}.svg`, label: (LOCAL_STICKERS.find(([id]) => id === m.id) || [])[1] || '스티커', w: 200, h: 200 }
      : { type: m.type, src: m.src, w: m.w, h: m.h, label: m.type === 'gif' ? 'GIF' : '스티커' }));
  } catch { return []; }
}

// GIPHY 찾기/인기 (서버가 대신 불러오고 1시간 캐시)
export async function handleGifs({ env, url, json, fail, ctxWaitUntil }) {
  const kind = url.searchParams.get('kind') === 'stickers' ? 'stickers' : 'gifs';
  const local = LOCAL_STICKERS.map(([id, label]) => ({ type: 'sticker', id, label, src: `/stickers/${id}.svg`, w: 200, h: 200 }));
  if (!env.GIPHY_API_KEY) return json({ enabled: false, items: [], local: kind === 'stickers' ? local : undefined });
  const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
  const offset = Math.max(0, Math.min(200, Number(url.searchParams.get('offset')) || 0));
  const api = new URL(`https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}`);
  api.searchParams.set('limit', '24'); api.searchParams.set('offset', String(offset));
  api.searchParams.set('rating', 'g'); api.searchParams.set('bundle', 'messaging_non_clips');
  if (q) { api.searchParams.set('q', q); api.searchParams.set('lang', 'ko'); }
  const cacheKey = new Request(`https://giphy-cache.anon-lounge/${kind}?${api.searchParams}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let data = null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) data = await hit.json(); }
  if (!data) {
    api.searchParams.set('api_key', env.GIPHY_API_KEY);
    const r = await fetch(api.toString(), { headers: { accept: 'application/json' } });
    if (r.status === 429) return fail(429, 'GIF를 너무 많이 찾았어요. 잠시 후 다시 해주세요.');
    if (!r.ok) return fail(502, 'GIF를 불러오지 못했어요.');
    const j = await r.json();
    data = {
      items: (j.data || []).map((g) => {
        const im = g.images || {};
        const pick = im.fixed_width || im.fixed_height || im.original || {};
        const small = im.fixed_width_small || im.fixed_width_downsampled || pick;
        const src = pick.webp || pick.url;
        return { type: kind === 'stickers' ? 'gsticker' : 'gif', src, preview: small.webp || small.url || src, w: Number(pick.width) || 200, h: Number(pick.height) || 200, label: g.title || 'GIF' };
      }).filter((x) => x.src && GIPHY_SRC.test(x.src)),
      next: (j.pagination && j.pagination.total_count > offset + 24) ? offset + 24 : null,
    };
    if (cache) {
      const res = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
      const p = cache.put(cacheKey, res);
      if (ctxWaitUntil) ctxWaitUntil(p); else await p;
    }
  }
  return json({ enabled: true, ...data, local: kind === 'stickers' ? local : undefined });
}
