// 로컬 테스트용 서버: Cloudflare Pages + D1을 흉내 냅니다 (배포에는 쓰이지 않아요).
// 실행: node dev/server.mjs  →  http://localhost:8788  (초대 코드: test-code, 운영자 코드: admin-code)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(process.env.DB_FILE || ':memory:');
db.exec(await readFile(path.join(root, 'schema.sql'), 'utf8'));

// D1과 같은 모양의 작은 어댑터
const D1 = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind(...a) { args = a.map((v) => (typeof v === 'boolean' ? Number(v) : v)); return stmt; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    };
    return stmt;
  },
};
const env = { DB: D1, INVITE_CODE: process.env.INVITE_CODE || 'test-code', ADMIN_CODE: process.env.ADMIN_CODE || 'admin-code' };
// GIPHY 흉내 (테스트용): GIPHY_FAKE=1 이면 api.giphy.com 대신 가짜 결과
if (process.env.GIPHY_FAKE) {
  env.GIPHY_API_KEY = 'fake';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    if (u.hostname !== 'api.giphy.com') return realFetch(input, init);
    const sticker = u.pathname.includes('/stickers/');
    const q = u.searchParams.get('q') || 'trending';
    const off = Number(u.searchParams.get('offset')) || 0;
    const data = Array.from({ length: 24 }, (_, i) => {
      const id = `${sticker ? 'S' : 'G'}${q.length}x${off + i}`;
      const src = `https://media2.giphy.com/media/v1.Y2lk/${id}/200w.webp?cid=abc&rid=200w.webp&ct=${sticker ? 's' : 'g'}`;
      return { title: `${q} ${off + i}`, images: { fixed_width: { webp: src, url: src.replace('.webp', '.gif'), width: '200', height: String(120 + (i % 4) * 30) }, fixed_width_small: { webp: src, width: '100', height: '60' } } };
    });
    return new Response(JSON.stringify({ data, pagination: { total_count: 72, offset: off } }), { headers: { 'content-type': 'application/json' } });
  };
}
const { onRequest } = await import(pathToFileURL(path.join(root, 'functions/api/[[path]].js')).href);

const types = { '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const port = Number(process.env.PORT || 8788);
// public/_headers의 '/*' 헤더를 로컬에서도 똑같이 붙임
const staticHeaders = {};
try {
  for (const line of (await readFile(path.join(root, 'public/_headers'), 'utf8')).split('\n')) {
    const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (m && m[1] !== 'Strict-Transport-Security') staticHeaders[m[1]] = m[2];
  }
} catch {}
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const r = await onRequest({ request, env, params: {} });
    const hdrs = Object.fromEntries([...r.headers].filter(([k]) => k !== 'set-cookie'));
    const cookies = r.headers.getSetCookie?.() || [];
    if (cookies.length) hdrs['set-cookie'] = cookies;
    res.writeHead(r.status, hdrs);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  // Cloudflare Pages처럼 /demo → demo.html
  const file = url.pathname === '/' ? '/index.html' : (!path.extname(url.pathname) ? url.pathname.replace(/\/$/, '') + '.html' : url.pathname);
  try {
    const body = await readFile(path.join(root, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { ...staticHeaders, 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`익명 라운지 로컬 서버: http://localhost:${port}`));
