// 익명 라운지 — 질문 탭 (빌드 도구 없이 바로 동작하는 순수 JS)

const SUBJECTS = ['AI 기본', 'GitHub', '파이썬 기본', '클라우드 컴퓨팅', '데이터 전처리', '클라우드 ML', '파이썬 ML', '파이썬 딥러닝', '프로젝트 1', '클라우드 OpenAI', '클라우드 딥러닝', '웹 프론트엔드', '프로젝트 2', '웹 앱 제작', 'AI SaaS', 'MS Learn'];
const CATS = ['질문', '잡담', '건의'];
const TIER_COLORS = {
  브론즈: ['#FFD3A8', '#D08443', '#6E3A14', '#E39A5B', '#5A2C0E'],
  실버: ['#FFFFFF', '#B9C2CF', '#5B6574', '#C9D2DE', '#38414F'],
  골드: ['#FFF6C2', '#F5C21B', '#8A5A00', '#FFD95A', '#6E4200'],
  플래티넘: ['#E6FFFB', '#4FD8C4', '#0E6B60', '#6EF0DC', '#06463F'],
  다이아: ['#F2F6FF', '#7FA2FF', '#2B35B8', '#A9C1FF', '#1A1F7A'],
};
const MAX_IMAGES = 3;
const MAX_BYTES = 400 * 1024;

const app = document.getElementById('app');
const state = { me: null, unread: {}, subject: null, cat: '전체' };

// ---------- 도구 ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const svg = (path, size = 18, extra = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path + extra; // 아이콘 모양만 넣음 (사용자 입력 아님)
  return s;
};
const ICON = {
  q: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  note: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  quiz: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  thumb: '<path d="M7 10v11H3V10zM7 10l4-7c1.7 0 3 1.3 3 3v3h5.2a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.9 21H7"/>',
  img: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
};
const pad = (n) => (n < 10 ? '0' : '') + n;
const subjName = (n) => (n === 0 ? '사이트' : `${pad(n)} ${SUBJECTS[n - 1]}`);
function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { state.me = null; location.hash = '#/join'; throw new Error(data.error || '다시 들어와 주세요.'); }
  if (!res.ok) throw new Error(data.error || '문제가 생겼어요.');
  return data;
}
function hexBadge(tierName, size = 26) {
  const c = TIER_COLORS[tierName] || TIER_COLORS['브론즈'];
  const outer = h('span', { class: 'hex', 'aria-hidden': 'true', style: `width:${size}px;height:${Math.round(size * 1.12)}px;background:linear-gradient(180deg, ${c[0]}, ${c[1]} 45%, ${c[2]})` });
  outer.append(h('i', { style: `background: radial-gradient(circle at 50% 30%, ${c[3]}, ${c[4]} 80%)` }));
  return outer;
}

// ---------- 이미지: 붙여넣기 → 자동으로 줄이기 ----------
async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 1600 / bmp.width);
  for (let round = 0; round < 6; round++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.72, 0.6]) {
      let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', q));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= MAX_BYTES) return { mime: blob.type, data: await toBase64(blob), url: URL.createObjectURL(blob) };
    }
    scale *= 0.75;
  }
  throw new Error('이미지를 충분히 줄이지 못했어요.');
}
// 글쓰기 칸 하나에 붙는 이미지 관리자
function imageTray(container) {
  const files = [];
  const thumbs = h('div', { class: 'thumbs' });
  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  const addBtn = h('button', { type: 'button', class: 'add-img', 'aria-label': '이미지 추가', onclick: () => picker.click() }, svg(ICON.img, 20), '추가');
  function draw() {
    thumbs.replaceChildren(
      ...files.map((f, i) => h('figure', { class: 'thumb', style: 'margin:0' },
        h('img', { src: f.url, alt: `붙여넣은 이미지 ${i + 1}` }),
        h('button', { type: 'button', 'aria-label': '이미지 빼기', onclick: () => { files.splice(i, 1); draw(); } }, svg(ICON.x, 12)))),
      files.length < MAX_IMAGES ? addBtn : null, picker);
  }
  async function add(list) {
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue;
      if (files.length >= MAX_IMAGES) { toast(`이미지는 ${MAX_IMAGES}장까지예요.`); break; }
      try { files.push(await compressImage(file)); } catch (e) { toast(e.message); }
    }
    draw();
  }
  picker.addEventListener('change', () => { add([...picker.files]); picker.value = ''; });
  container.addEventListener('paste', (e) => {
    const imgs = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile());
    if (imgs.length) { e.preventDefault(); add(imgs); }
  });
  container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drag'); });
  container.addEventListener('dragleave', () => container.classList.remove('drag'));
  container.addEventListener('drop', (e) => { e.preventDefault(); container.classList.remove('drag'); add([...e.dataTransfer.files]); });
  draw();
  return { el: thumbs, payload: () => files.map(({ mime, data }) => ({ mime, data })), clear: () => { files.length = 0; draw(); }, count: () => files.length };
}

// ---------- 공통 틀 ----------
function shell(active, content) {
  const t = state.me?.tier;
  const unreadTotal = Object.values(state.unread).reduce((a, b) => a + b, 0);
  const side = h('nav', { class: 'side', 'aria-label': '메뉴' },
    h('div', { class: 'brand' }, '익명 라운지'),
    h('a', { class: 'tab', href: '#/', 'aria-current': active === 'q' ? 'page' : null }, svg(ICON.q, 20), '질문', unreadTotal ? h('span', { class: 'badge' }, unreadTotal) : null),
    h('span', { class: 'tab', 'aria-disabled': 'true', title: '곧 열려요' }, svg(ICON.note, 20), '정리', h('span', { class: 'soon' }, '준비 중')),
    h('span', { class: 'tab', 'aria-disabled': 'true', title: '곧 열려요' }, svg(ICON.quiz, 20), '퀴즈', h('span', { class: 'soon' }, '준비 중')),
    h('a', { class: 'tab', href: '#/settings', 'aria-current': active === 'set' ? 'page' : null, style: 'margin-top:auto' }, svg(ICON.gear, 20), '설정'),
    t ? h('div', { class: 'side-foot' }, h('div', { class: 'tier' }, hexBadge(t.name), h('span', {}, h('b', {}, t.name), h('br'), h('span', { style: 'color:var(--muted)' }, `받은 도움 ${t.points}`)))) : null);
  return h('div', { class: 'shell' }, side, h('main', { class: 'page' }, content));
}

// ---------- 입장 ----------
function joinView() {
  const err = h('div', { class: 'err', role: 'alert' });
  const input = h('input', { id: 'code', type: 'text', autocomplete: 'off', inputmode: 'text', placeholder: '반에서 받은 초대 코드', required: true });
  const form = h('form', { class: 'card join', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try { state.me = await api('/join', { method: 'POST', body: { code: input.value.trim() } }); location.hash = '#/'; }
    catch (ex) { err.textContent = ex.message; }
  } },
  h('h1', {}, '익명 라운지'),
  h('p', { class: 'sub', style: 'margin:0' }, '여기서 쓰는 글은 모두 익명이에요. 다른 수강생은 누가 썼는지 알 수 없어요.'),
  h('label', { class: 'field', for: 'code' }, '초대 코드', input),
  err,
  h('button', { class: 'btn', type: 'submit' }, '들어가기'),
  h('p', { class: 'sub', style: 'margin:0;font-size:12px' }, '운영자는 문제가 생긴 글을 지울 수 있어요. 개인정보가 담긴 캡처는 올리지 말아주세요.'));
  app.replaceChildren(h('div', { class: 'center' }, form));
  input.focus();
}

// ---------- 질문 목록 ----------
function subjectStrip() {
  const my = state.me.mySubject;
  const row = h('div', { class: 'strip-row' });
  row.append(
    h('div', { class: 'strip-line', 'aria-hidden': 'true', style: 'left:128px;right:32px;background:#E3E6EC' }),
    h('div', { class: 'strip-line', 'aria-hidden': 'true', style: `left:128px;width:${(my - 1) * 64}px;background:#A9BDEB` }));
  const allUnread = Object.values(state.unread).reduce((a, b) => a + b, 0);
  const mk = (key, num, name, unread, cls) => {
    const pressed = state.subject === key;
    return h('button', { type: 'button', class: `subj ${cls}`, 'aria-pressed': pressed ? 'true' : 'false', 'data-key': key,
      'aria-label': `${num === '전체' ? '모든 과목' : `${num} ${name}`}${unread ? `, 새 글 ${unread}개` : ''}${cls.includes('now') ? ', 내 과목' : ''}`,
      onclick: () => { state.subject = key; render(); } },
    h('span', { class: 'num' }, num),
    h('span', { class: 'node' }, h('span', { class: 'dot' }), unread ? h('span', { class: 'badge' }, unread) : null),
    h('span', { class: 'name' }, name));
  };
  row.append(mk('all', '전체', '모든 과목', allUnread, 'all'));
  SUBJECTS.forEach((n, i) => {
    const k = i + 1;
    row.append(mk(k, pad(k), n, state.unread[k] || 0, k === my ? 'now' : k < my ? 'done' : ''));
  });
  const scroller = h('div', { class: 'strip-scroll' }, row);
  requestAnimationFrame(() => {
    const target = row.querySelector('[aria-pressed="true"]') || row.querySelector('.now');
    if (target) scroller.scrollLeft = Math.max(0, target.offsetLeft - scroller.clientWidth / 2 + target.offsetWidth / 2);
  });
  return h('nav', { class: 'card strip edge', 'aria-label': '과목 고르기' }, scroller);
}

function composer(onDone) {
  const sel = state.subject === 'all' ? state.me.mySubject : state.subject;
  const root = h('section', { class: 'card composer edge', 'aria-label': '새 글 쓰기' });
  let cat = '질문';
  const subjTag = h('span', { class: 'tag c-질문', style: 'margin-left:auto' }, subjName(sel));
  const radios = h('div', { class: 'radios', role: 'radiogroup', 'aria-label': '말머리' },
    ...CATS.map((c) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'cat', value: c, checked: c === cat ? true : null, onchange: () => { cat = c; subjTag.textContent = c === '건의' ? '사이트 건의' : subjName(sel); } }), c)),
    subjTag);
  const title = h('input', { class: 'plain title-in', type: 'text', maxlength: '100', placeholder: '제목', 'aria-label': '제목' });
  const body = h('textarea', { class: 'plain body-in', rows: '3', maxlength: '5000', placeholder: '내용을 써주세요. 캡처는 Ctrl + V로 바로 붙여넣을 수 있어요.', 'aria-label': '내용' });
  const tray = imageTray(root);
  const send = h('button', { class: 'btn', type: 'button' }, '올리기');
  send.addEventListener('click', async () => {
    if (!title.value.trim()) { title.focus(); toast('제목을 써주세요.'); return; }
    send.disabled = true;
    try {
      await api('/posts', { method: 'POST', body: { cat, subject: sel, title: title.value, body: body.value, images: tray.payload() } });
      title.value = ''; body.value = ''; tray.clear();
      toast(state.me.showReal ? '실명으로 올라갔어요' : '익명으로 올라갔어요');
      onDone();
    } catch (e) { toast(e.message); }
    send.disabled = false;
  });
  root.append(radios, title, body, tray.el,
    h('div', { class: 'comp-foot' }, h('span', { class: 'hint' }, h('b', {}, 'Win + Shift + S'), ' → ', h('b', {}, 'Ctrl + V'), ' · 이름·API 키가 보이지 않는지 확인해 주세요'), send));
  return root;
}

function helpButton(type, item, onChange) {
  const b = h('button', { type: 'button', class: 'help', 'aria-pressed': item.helped ? 'true' : 'false', disabled: item.mine ? true : null, title: item.mine ? '내 글에는 누를 수 없어요' : null },
    svg(ICON.thumb, 14), `도움됐어요 ${item.helps}`);
  b.addEventListener('click', async () => {
    try {
      const r = await api('/help', { method: 'POST', body: { type, id: item.id } });
      item.helped = r.helped; item.helps = r.helps;
      b.setAttribute('aria-pressed', r.helped ? 'true' : 'false');
      b.lastChild.textContent = `도움됐어요 ${r.helps}`;
      onChange && onChange();
    } catch (e) { toast(e.message); }
  });
  return b;
}

async function listView() {
  if (state.subject === null) state.subject = state.me.mySubject;
  const list = h('ul', { class: 'list' }, h('li', { class: 'card empty' }, '불러오는 중…'));
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': '말머리' },
    ...['전체', ...CATS].map((c) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': state.cat === c ? 'true' : 'false', onclick: () => { state.cat = c; render(); } }, c)));
  const top = h('header', { style: 'display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap' },
    h('div', {}, h('h1', {}, '질문'), h('p', { class: 'sub' }, '질문, 잡담, 건의 모두 여기에. 전부 익명이에요.')),
    h('span', { class: 'topbar-tier' }, hexBadge(state.me.tier.name, 22), state.me.tier.name));
  app.replaceChildren(shell('q', [top, subjectStrip(), chips, composer(() => render()), list]));

  try {
    const q = new URLSearchParams({ subject: state.subject, cat: state.cat });
    const { posts } = await api(`/posts?${q}`);
    const { unread } = await api('/subjects');
    state.unread = unread;
    // 배지 숫자만 새로 그리기
    document.querySelectorAll('.subj').forEach((btn) => {
      const k = btn.dataset.key; const n = k === 'all' ? Object.values(unread).reduce((a, b) => a + b, 0) : unread[k] || 0;
      const node = btn.querySelector('.node'); node.querySelector('.badge')?.remove();
      if (n) node.append(h('span', { class: 'badge' }, n));
    });
    if (!posts.length) { list.replaceChildren(h('li', { class: 'card empty' }, '아직 글이 없어요. 첫 질문을 남겨보세요!')); return; }
    list.replaceChildren(...posts.map((p) => h('li', { class: 'card item edge' },
      h('span', { class: `unread-dot${p.unread ? ' on' : ''}`, 'aria-label': p.unread ? '새 글' : null }),
      h('div', { class: 'item-main' },
        h('div', { class: 'item-tags' }, h('span', { class: `tag c-${p.cat}` }, p.cat), h('span', { class: 'tag' }, subjName(p.subject))),
        h('a', { class: 'item-title', href: `#/post/${p.id}` }, p.title),
        p.excerpt ? h('div', { class: 'item-ex' }, p.excerpt) : null,
        h('div', { class: 'meta' }, h('span', {}, `${p.author} · ${ago(p.createdAt)}`), h('span', {}, `답변 ${p.answers}`),
          p.hasImage ? h('span', { style: 'display:inline-flex;align-items:center;gap:3px' }, svg(ICON.img, 13), '캡처') : null,
          helpButton('post', p))),
      p.thumb ? h('a', { class: 'item-thumb', href: `#/post/${p.id}`, 'aria-label': `${p.title} 첨부 이미지` }, h('img', { src: p.thumb, alt: '', loading: 'lazy' })) : null)));
  } catch (e) {
    list.replaceChildren(h('li', { class: 'card empty' }, e.message));
  }
}

// ---------- 글 보기 ----------
function lightbox(src) {
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': '이미지 크게 보기', tabindex: '-1', onclick: () => box.remove() }, h('img', { src, alt: '' }));
  document.body.append(box); box.focus();
  box.addEventListener('keydown', (e) => e.key === 'Escape' && box.remove());
}
const pics = (urls) => (urls.length ? h('div', { class: 'pics' }, ...urls.map((u, i) => h('img', { src: u, alt: `첨부 이미지 ${i + 1}`, loading: 'lazy', onclick: () => lightbox(u) }))) : null);

async function postView(id) {
  app.replaceChildren(shell('q', [h('div', { class: 'card empty' }, '불러오는 중…')]));
  let data;
  try { data = await api(`/posts/${id}`); } catch (e) { app.replaceChildren(shell('q', [h('a', { class: 'back', href: '#/' }, svg(ICON.back), '목록'), h('div', { class: 'card empty' }, e.message)])); return; }
  const { post, answers, canModerate } = data;
  const del = (type, itemId) => h('button', { type: 'button', class: 'link-btn', onclick: async () => {
    if (!confirm('정말 지울까요?')) return;
    try { await api(`/${type === 'post' ? 'posts' : 'answers'}/${itemId}`, { method: 'DELETE' }); toast('지웠어요'); type === 'post' ? (location.hash = '#/') : postView(id); } catch (e) { toast(e.message); }
  } }, '지우기');

  const ansList = h('ol', { class: 'answers', 'aria-label': '답변' },
    ...answers.map((a) => h('li', { class: 'answer' },
      h('div', { class: 'row' }, h('span', { class: `who${a.author === '익명(글쓴이)' ? ' op' : ''}` }, a.author, h('span', { style: 'font-weight:400;color:var(--muted);margin-left:6px' }, ago(a.createdAt))),
        (a.mine || canModerate) ? del('answer', a.id) : null),
      a.body ? h('p', { class: 'body' }, a.body) : null,
      pics(a.images),
      h('div', { class: 'meta' }, helpButton('answer', a)))));

  const ansRoot = h('section', { class: 'card composer edge', 'aria-label': '답변 쓰기' });
  const ansBody = h('textarea', { class: 'plain body-in', rows: '3', maxlength: '5000', placeholder: '답변을 써주세요. 캡처는 Ctrl + V로 붙여넣어요.', 'aria-label': '답변 내용' });
  const tray = imageTray(ansRoot);
  const send = h('button', { class: 'btn', type: 'button' }, '답변 올리기');
  send.addEventListener('click', async () => {
    if (!ansBody.value.trim() && !tray.count()) { ansBody.focus(); return; }
    send.disabled = true;
    try { await api(`/posts/${id}/answers`, { method: 'POST', body: { body: ansBody.value, images: tray.payload() } }); toast('답변을 올렸어요'); postView(id); }
    catch (e) { toast(e.message); send.disabled = false; }
  });
  ansRoot.append(ansBody, tray.el, h('div', { class: 'comp-foot' }, h('span', { class: 'hint' }, state.me.showReal ? '실명으로 올라가요' : '익명으로 올라가요'), send));

  app.replaceChildren(shell('q', [
    h('a', { class: 'back', href: '#/' }, svg(ICON.back), '목록'),
    h('article', { class: 'card post edge' },
      h('div', { class: 'item-tags' }, h('span', { class: `tag c-${post.cat}` }, post.cat), h('span', { class: 'tag' }, subjName(post.subject))),
      h('h2', {}, post.title),
      h('div', { class: 'meta' }, h('span', {}, `${post.author} · ${ago(post.createdAt)}`), (post.mine || canModerate) ? del('post', post.id) : null),
      post.body ? h('p', { class: 'body' }, post.body) : null,
      pics(post.images),
      h('div', { class: 'meta' }, helpButton('post', post)),
      h('h3', { style: 'margin:8px 0 0;font-size:15px' }, `답변 ${answers.length}`),
      answers.length ? ansList : h('p', { class: 'sub', style: 'margin:0' }, '아직 답변이 없어요. 아는 만큼만 적어도 큰 도움이 돼요.')),
    ansRoot,
  ]));
}

// ---------- 설정 ----------
function settingsView() {
  const me = state.me;
  const subj = h('select', { id: 'my-subj' }, ...SUBJECTS.map((n, i) => h('option', { value: i + 1, selected: me.mySubject === i + 1 ? true : null }, `${pad(i + 1)} ${n}`)));
  const name = h('input', { id: 'real-name', type: 'text', maxlength: '20', value: me.realName, placeholder: '예: 김성희' });
  const sw = h('input', { type: 'checkbox', role: 'switch', 'aria-label': '실명으로 활동하기', checked: me.showReal ? true : null });
  const save = h('button', { class: 'btn', type: 'button' }, '저장');
  save.addEventListener('click', async () => {
    if (sw.checked && !name.value.trim()) { toast('실명을 먼저 적어주세요.'); name.focus(); return; }
    try { state.me = await api('/me', { method: 'PATCH', body: { mySubject: Number(subj.value), realName: name.value, showReal: sw.checked } }); state.subject = null; toast('저장했어요'); }
    catch (e) { toast(e.message); }
  });
  const t = me.tier;
  app.replaceChildren(shell('set', [
    h('h1', {}, '설정'),
    h('section', { class: 'card', style: 'padding:20px;display:flex;flex-direction:column;gap:16px' },
      h('label', { class: 'field', for: 'my-subj' }, '내 과목 (과목 막대에서 기본으로 보여요)', subj),
      h('div', { class: 'row' }, h('span', {}, h('b', {}, '실명으로 활동하기'), h('br'), h('span', { class: 'sub', style: 'font-size:13px' }, '기본은 꺼짐. 켜도 예전에 쓴 익명 글은 그대로 익명이에요.')), h('span', { class: 'switch' }, sw, h('i'))),
      h('label', { class: 'field', for: 'real-name' }, '실명', name),
      h('div', {}, save)),
    h('section', { class: 'card', style: 'padding:20px;display:flex;align-items:center;gap:14px' },
      hexBadge(t.name, 40),
      h('div', {}, h('b', { style: 'font-size:18px' }, t.name), h('div', { class: 'sub' }, `받은 도움 ${t.points}${t.next ? ` · ${t.next.name}까지 ${t.next.need}개` : ''}`))),
    h('p', { class: 'sub' }, '다른 수강생에게는 익명이지만, 운영자는 문제가 생긴 글을 지울 수 있어요.'),
  ]));
}

// ---------- 라우팅 ----------
async function render() {
  const hash = location.hash || '#/';
  if (!state.me && hash !== '#/join') {
    try { state.me = await api('/me'); } catch { return; }
  }
  if (hash === '#/join') return joinView();
  const m = hash.match(/^#\/post\/(\d+)$/);
  if (m) return postView(m[1]);
  if (hash === '#/settings') return settingsView();
  return listView();
}
window.addEventListener('hashchange', render);
render();
