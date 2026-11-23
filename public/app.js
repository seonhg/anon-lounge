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
const MAX_IMAGES = 20; // 글·답변 하나당
const MAX_BYTES = 400 * 1024;

const app = document.getElementById('app');

// ---------- 화면 테마 (라이트 / 다크 / 기기 설정 따라가기) ----------
const themePref = () => { try { return localStorage.getItem('al-theme') || 'light'; } catch { return 'light'; } };
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = themePref();
  const t = pref === 'system' ? (darkMQ.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0A0920' : '#F5F3FF');
  return t;
}
function setTheme(pref) { try { localStorage.setItem('al-theme', pref); } catch {} applyTheme(); }
darkMQ.addEventListener?.('change', () => themePref() === 'system' && applyTheme());
applyTheme();
const state = { me: null, unread: {}, subject: null, cat: '전체', alerts: 0, noteUnread: {}, noteScope: 'public', editorDirty: null, curHash: '' };

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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  reply: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3" stroke-linecap="round"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
};
const pad = (n) => (n < 10 ? '0' : '') + n;
const subjName = (n) => (n === 0 ? '사이트' : `${pad(n)} ${SUBJECTS[n - 1]}`);
// 잡담·건의는 과목 구분 없이 전체 공용
const GLOBAL_CATS = ['잡담', '건의'];
const placeName = (cat, n) => (cat === '잡담' ? '전체' : cat === '건의' ? '사이트' : subjName(n));
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
  if (data.banned && state.me && !state.me.banned) { state.me.banned = true; setTimeout(render, 0); }
  if (!res.ok) throw new Error(data.error || '문제가 생겼어요.');
  return data;
}
// ---------- 패스키 (지문·얼굴·PIN으로 로그인) ----------
const b64uToBuf = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
const bufToB64u = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
// 팀즈 탭처럼 다른 화면 안에 들어가 있는지
const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
// 팀즈 안에서는 패스키 창이 막혀서 숨김 (복구 코드 사용)
const passkeySupported = () => !inFrame && !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
const openOutside = () => h('a', { class: 'btn ghost sm', href: location.origin + '/', target: '_blank', rel: 'noopener' }, '새 창(브라우저)에서 열기');
// 입장 직후 로그인이 정말 유지되는지 확인 (팀즈 안에서 쿠키가 막히는 경우 대비)
async function cookieWorks() {
  try { const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' }); return r.ok; } catch { return false; }
}
function cookieBlockedView() {
  app.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'card join' },
    h('h1', {}, '익명 라운지'),
    h('div', { class: 'warn' }, h('b', {}, '이 화면에서는 로그인이 저장되지 않아요.'), h('br'),
      '팀즈나 브라우저 설정이 이 사이트의 쿠키를 막고 있어요. 아래 버튼으로 브라우저에서 열어 주세요. 복구 코드를 저장해 두었다면 거기서 그대로 이어 쓸 수 있어요.'),
    openOutside())));
}
function passkeyError(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return '패스키 창이 닫혔어요. 팀즈 안에서는 안 될 수 있으니 브라우저에서 열어 보세요.';
  if (e && e.name === 'InvalidStateError') return '이 기기에는 이미 패스키가 있어요.';
  return e?.message || '패스키를 쓸 수 없어요.';
}
async function registerPasskey() {
  const { challengeId, publicKey: o } = await api('/passkey/register/options', { method: 'POST' });
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: b64uToBuf(c.id) })),
  } });
  await api('/passkey/register/verify', { method: 'POST', body: {
    challengeId, clientDataJSON: bufToB64u(cred.response.clientDataJSON), attestationObject: bufToB64u(cred.response.attestationObject),
  } });
}
async function loginWithPasskey() {
  const o = await api('/passkey/login/options', { method: 'POST' });
  const cred = await navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification } });
  return api('/passkey/login/verify', { method: 'POST', body: {
    challengeId: o.challengeId, rawId: bufToB64u(cred.rawId),
    clientDataJSON: bufToB64u(cred.response.clientDataJSON), authenticatorData: bufToB64u(cred.response.authenticatorData), signature: bufToB64u(cred.response.signature),
  } });
}

// ---------- 복구 코드 안내 창 ----------
function recoveryModal(code, onClose) {
  const close = () => { box.remove(); onClose && onClose(); };
  const copy = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(code); toast('복사했어요'); } catch { toast('길게 눌러 직접 복사해 주세요'); }
  } }, '복사');
  const ok = h('input', { type: 'checkbox', id: 'rc-ok' });
  const done = h('button', { class: 'btn', type: 'button', disabled: true, onclick: close }, '저장했어요');
  ok.addEventListener('change', () => { done.disabled = !ok.checked; });
  const box = h('div', { class: 'modal-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rc-title' },
    h('div', { class: 'card modal' },
      h('h2', { id: 'rc-title' }, '복구 코드를 꼭 저장해 주세요'),
      h('p', { class: 'sub', style: 'margin:0' }, '노트북을 반납하거나 다른 기기에서 들어올 때 이 코드로 내 글과 티어를 그대로 이어 쓸 수 있어요. 지금 한 번만 보여드려요.'),
      h('div', { class: 'rc-code', 'aria-label': '복구 코드' }, code),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, copy),
      h('p', { class: 'sub', style: 'margin:0;font-size:12.5px' }, '개인 휴대폰 메모나 비밀번호 관리자에 저장하세요. 학교·회사 계정 메일은 반납하면 사라져요. 남에게 보이면 내 계정으로 글을 쓸 수 있어요.'),
      h('label', { class: 'radio', for: 'rc-ok', style: 'align-self:flex-start' }, ok, '안전한 곳에 저장했어요'),
      done));
  document.body.append(box);
  copy.focus();
}

function hexBadge(tierName, size = 26) {
  const c = TIER_COLORS[tierName] || TIER_COLORS['브론즈'];
  const outer = h('span', { class: 'hex', 'aria-hidden': 'true', style: `width:${size}px;height:${Math.round(size * 1.12)}px;background:linear-gradient(180deg, ${c[0]}, ${c[1]} 45%, ${c[2]})` });
  outer.append(h('i', { style: `background: radial-gradient(circle at 50% 30%, ${c[3]}, ${c[4]} 80%)` }));
  return outer;
}

// ---------- 프로필 (실명 사용자만) ----------
const PROFILE_COLORS = [['violet', '보라'], ['pink', '핑크'], ['blue', '파랑'], ['mint', '민트'], ['orange', '주황'], ['yellow', '노랑'], ['green', '초록'], ['gray', '회색']];
const AVATAR_EMOJIS = '🙂 😎 🤓 🧐 🥳 😺 🐶 🐱 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐸 🐧 🐣 🦄 🐳 🐙 🦉 🌱 🌸 🌻 🍀 ⭐ 🌙 🔥 ⚡ 🚀 💻 🎧 🎮 🎨 📚 ☕ 🍩 🍕 🍓'.split(' ');
function avatarEl(pf, size = 22) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.58)}px`;
  if (pf.image) return h('span', { class: `avatar pc-${pf.color}`, style: st, 'aria-hidden': 'true' }, h('img', { src: pf.image, alt: '' }));
  return h('span', { class: `avatar pc-${pf.color}`, style: st, 'aria-hidden': 'true' }, pf.emoji || '🙂');
}
// 실명으로 쓴 글이면 프로필 사진 + 이름(누르면 프로필), 아니면 그냥 글자
function authorEl(name, pf, extra = '') {
  if (!pf) return h('span', {}, name + extra);
  return h('span', { class: 'author' }, h('a', { class: 'author-link', href: `#/u/${pf.slug}`, title: `${name} 프로필 보기`, onclick: (e) => e.stopPropagation() }, avatarEl(pf), h('span', {}, name)), extra ? h('span', { style: 'white-space:pre' }, extra) : null);
}

// ---------- 이모티콘 ----------
const EMOJI_SETS = [
  ['표정', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫠 😏 😒 🙄 😬 😮‍💨 😌 😔 😪 😴 😷 🤒 🥵 🥶 😵‍💫 🤯 🥳 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 💀 👻 🤖 👾'],
  ['손', '👍 👎 👏 🙌 👐 🤲 🙏 🤝 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 💪 ✍️ 🫶 🫵'],
  ['공부·코딩', '💻 🖥️ ⌨️ 🖱️ 💾 📁 📂 📄 📝 📚 📖 📒 ✏️ 🖊️ 📌 📎 🔍 🔑 🔒 🔓 🐛 🛠️ ⚙️ 🧪 🧠 💡 📊 📈 📉 ☁️ 🌐 🔗 🚀 ⏰ ⏳ 📅 ✅ ☑️ ❌ ⭕ ❗ ❓ ⚠️ 🚫 💯 🆗 🆘 🎯 🏆 🥇 🎓'],
  ['마음', '❤️ 🧡 💛 💚 💙 💜 🤍 🖤 🤎 💖 💗 💓 💕 💞 💘 💝 💔 ❣️ ✨ ⭐ 🌟 💫 🔥 💥 💢 💦 💨 🎉 🎊 🎁 🎈 👀 💬 💭 💤'],
  ['자연·날씨', '☀️ 🌤️ ⛅ ☁️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ 🌈 🌙 🌛 ⭐ 🌍 🌊 🌋 🌸 🌷 🌹 🌻 🌼 🍀 🌿 🌱 🌳 🌵 🍁 🍂 🌺 💐'],
  ['활동·사물', '⚽ 🏀 ⚾ 🎾 🏐 🎮 🕹️ 🎲 🧩 🎨 🎬 🎤 🎧 🎵 🎶 🎸 🎹 🏃 🚶 🧘 🛌 🚌 🚇 🚗 ✈️ 🏠 🏫 🏢 📱 📷 💰 💳 🛒 🎒 👓 ⌚ 🧸 🎂 🍀 🙈 🙉 🙊'],
  ['동물·음식', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐣 🦄 🐝 🐢 🐳 🐬 🐙 ☕ 🍵 🧃 🥤 🍺 🍕 🍔 🍟 🌭 🍗 🍜 🍣 🍙 🍰 🍩 🍪 🍫 🍦 🍓 🍎 🍌 🍉'],
].map(([name, list]) => [name, list.split(' ')]);
const recentEmojis = () => { try { return JSON.parse(localStorage.getItem('al-emoji') || '[]'); } catch { return []; } };
function rememberEmoji(e) { try { localStorage.setItem('al-emoji', JSON.stringify([e, ...recentEmojis().filter((x) => x !== e)].slice(0, 24))); } catch {} }
// 커서 자리에 글자 넣기
function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
  const max = Number(el.getAttribute('maxlength')) || Infinity;
  if (el.value.length - (end - start) + text.length > max) { toast('글자 수가 꽉 찼어요.'); return; }
  el.setRangeText(text, start, end, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}
// 😊 버튼: fields 중 마지막으로 누른 칸(없으면 마지막 칸)에 넣음.
// 이모티콘 창은 글쓰기 칸 '아래'에 펼쳐져서 쓰던 글을 가리지 않음
function emojiButton(...fields) {
  let last = fields[fields.length - 1];
  fields.forEach((f) => f && f.addEventListener('focus', () => { last = f; }));
  const wrap = h('span', { class: 'emoji-wrap' });
  const btn = h('button', { type: 'button', class: 'emoji-btn', 'aria-label': '이모티콘 넣기', 'aria-expanded': 'false', title: '이모티콘' }, svg(ICON.smile, 20));
  let pop = null, box = null, cat = recentEmojis().length ? -1 : 0;
  const close = () => { pop?.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
  const outside = (e) => { if (!box.contains(e.target)) close(); }; // 글쓰기 칸 안(글자 칸 포함)을 누르는 건 괜찮음
  const esc = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); last.focus(); } };
  function draw() {
    const tabs = [...(recentEmojis().length ? [[-1, '🕘', '최근']] : []), ...EMOJI_SETS.map(([name, list], i) => [i, list[0], name])];
    const list = cat === -1 ? recentEmojis() : EMOJI_SETS[cat][1];
    pop.replaceChildren(
      h('div', { class: 'emoji-top' },
        h('div', { class: 'emoji-tabs', role: 'tablist', 'aria-label': '이모티콘 종류' }, ...tabs.map(([i, icon, name]) =>
          h('button', { type: 'button', role: 'tab', 'aria-selected': i === cat ? 'true' : 'false', title: name, 'aria-label': name, onclick: () => { cat = i; draw(); } }, icon))),
        h('button', { type: 'button', class: 'emoji-close', 'aria-label': '이모티콘 창 닫기', onclick: () => { close(); last.focus(); } }, svg(ICON.x, 16))),
      h('div', { class: 'emoji-name' }, cat === -1 ? '최근 쓴 이모티콘' : EMOJI_SETS[cat][0]),
      h('div', { class: 'emoji-grid' }, ...list.map((e) => h('button', { type: 'button', 'aria-label': e, onclick: () => { insertAtCursor(last, e); rememberEmoji(e); } }, e))),
      h('div', { class: 'emoji-foot' }, '고를 때마다 위 글에 바로 들어가요 · 여러 개 골라도 돼요 · Windows는 ', h('b', {}, 'Win + .'), '으로도 열 수 있어요'));
  }
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // 글 칸의 커서 위치 유지
  btn.addEventListener('click', () => {
    if (pop) { close(); return; }
    box = wrap.closest('.reply-box, .composer') || wrap.parentElement;
    pop = h('div', { class: 'emoji-panel', role: 'group', 'aria-label': '이모티콘 고르기' });
    pop.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    draw(); box.append(pop); btn.setAttribute('aria-expanded', 'true');
    pop.scrollIntoView({ block: 'nearest' });
    document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true);
  });
  wrap.append(btn);
  return wrap;
}

// ---------- 이미지: 붙여넣기 → 자동으로 줄이기 ----------
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
      if (blob && blob.size <= MAX_BYTES) return { mime: blob.type, blob, url: URL.createObjectURL(blob) };
    }
    scale *= 0.75;
  }
  throw new Error('이미지를 충분히 줄이지 못했어요.');
}
// 글쓰기 칸 하나에 붙는 이미지 관리자
function imageTray(container, limit = () => MAX_IMAGES) {
  const files = [];
  const thumbs = h('div', { class: 'thumbs' });
  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  const addBtn = h('button', { type: 'button', class: 'add-img', 'aria-label': '이미지 추가', onclick: () => picker.click() }, svg(ICON.img, 20), '추가');
  function draw() {
    thumbs.replaceChildren(
      ...files.map((f, i) => h('figure', { class: 'thumb', style: 'margin:0' },
        h('img', { src: f.url, alt: `붙여넣은 이미지 ${i + 1}` }),
        h('button', { type: 'button', 'aria-label': '이미지 빼기', onclick: () => { files.splice(i, 1); draw(); } }, svg(ICON.x, 12)))),
      ...(files.length < limit() ? [addBtn] : []), picker);
  }
  async function add(list) {
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue;
      if (files.length >= limit()) { toast(`이미지는 ${MAX_IMAGES}장까지예요.`); break; }
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
  return { el: thumbs, files: () => files.slice(), clear: () => { files.length = 0; draw(); }, count: () => files.length, redraw: draw };
}
// 이미지는 한 장씩 따로 올림 (20장이어도 서버가 버거워하지 않게)
async function uploadImages(type, id, files) {
  for (let i = 0; i < files.length; i++) {
    if (files.length > 1) toast(`이미지 올리는 중 ${i + 1}/${files.length}`);
    const res = await fetch(`/api/images?type=${type}&id=${id}`, { method: 'POST', headers: { 'content-type': files[i].mime }, body: files[i].blob, credentials: 'same-origin' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(`${i + 1}번째 이미지: ${d.error || '올리지 못했어요.'}`); }
  }
}

// ---------- 공통 틀 ----------
function shell(active, content) {
  const t = state.me?.tier;
  const unreadTotal = Object.values(state.unread).reduce((a, b) => a + b, 0);
  const side = h('nav', { class: 'side', 'aria-label': '메뉴' },
    h('div', { class: 'brand' }, '익명 라운지'),
    h('a', { class: 'tab', href: '#/', 'aria-current': active === 'q' ? 'page' : null }, svg(ICON.q, 20), '질문', unreadTotal ? h('span', { class: 'badge' }, unreadTotal) : null),
    h('a', { class: 'tab', href: '#/notes', 'aria-current': active === 'notes' ? 'page' : null }, svg(ICON.note, 20), '정리', h('span', { class: 'badge note-badge', hidden: Object.values(state.noteUnread || {}).reduce((a, b) => a + b, 0) ? null : true }, Object.values(state.noteUnread || {}).reduce((a, b) => a + b, 0))),
    h('span', { class: 'tab', 'aria-disabled': 'true', title: '곧 열려요' }, svg(ICON.quiz, 20), '퀴즈', h('span', { class: 'soon' }, '준비 중')),
    h('a', { class: 'tab desk-only', href: '#/alerts', 'aria-current': active === 'alerts' ? 'page' : null }, svg(ICON.bell, 20), '알림', h('span', { class: 'badge alert-badge', hidden: !state.alerts ? true : null }, state.alerts)),
    state.me?.isAdmin ? h('a', { class: 'tab', href: '#/admin', 'aria-current': active === 'admin' ? 'page' : null, style: 'margin-top:auto' }, svg(ICON.shield, 20), '운영') : null,
    h('a', { class: 'tab', href: '#/settings', 'aria-current': active === 'set' ? 'page' : null, style: state.me?.isAdmin ? null : 'margin-top:auto' }, svg(ICON.gear, 20), '설정'),
    t ? h('div', { class: 'side-foot' }, h('div', { class: 'tier' }, hexBadge(t.name), h('span', {}, h('b', {}, t.name), h('br'), h('span', { style: 'color:var(--muted)' }, `받은 도움 ${t.points}`)))) : null);
  const isDark = document.documentElement.dataset.theme === 'dark';
  const themeBtn = h('button', { type: 'button', class: 'top-gear', 'aria-label': isDark ? '라이트 모드로' : '다크 모드로', title: isDark ? '라이트 모드로' : '다크 모드로',
    onclick: () => { setTheme(isDark ? 'light' : 'dark'); render(); } }, svg(isDark ? ICON.sun : ICON.moon, 18), isDark ? '라이트' : '다크');
  const gear = h('a', { class: 'top-gear', href: '#/settings', 'aria-current': active === 'set' ? 'page' : null }, svg(ICON.gear, 18), '설정');
  const bell = h('a', { class: 'top-gear bell', href: '#/alerts', 'aria-current': active === 'alerts' ? 'page' : null, 'aria-label': state.alerts ? `알림 ${state.alerts}개` : '알림' },
    svg(ICON.bell, 18), h('span', { class: 'desk-only' }, '알림'), h('span', { class: 'badge alert-badge', hidden: !state.alerts ? true : null }, state.alerts));
  const tierChip = t ? h('span', { class: 'top-gear tier-chip phone-only', 'aria-label': `내 티어 ${t.name}` }, hexBadge(t.name, 18), t.name) : null;
  themeBtn.classList.add('desk-only'); gear.classList.add('desk-only');
  return h('div', { class: 'shell' }, side, h('main', { class: 'page' }, content), h('div', { class: 'top-actions' }, tierChip, bell, themeBtn, gear));
}

// ---------- 입장 ----------
function joinView() {
  const enter = (me) => { state.me = me; state.subject = null; location.hash = '#/'; };
  // 처음 왔어요
  const err = h('div', { class: 'err', role: 'alert' });
  const input = h('input', { id: 'code', type: 'text', autocomplete: 'off', inputmode: 'text', placeholder: '반에서 받은 초대 코드', required: true });
  const form = h('form', { class: 'join-sec', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      const r = await api('/join', { method: 'POST', body: { code: input.value.trim() } });
      const { recoveryCode, ...me } = r;
      const ok = await cookieWorks();
      // 쿠키가 막혀도 복구 코드는 꼭 보여줌 → 브라우저에서 이 코드로 이어 쓰기
      recoveryModal(recoveryCode, () => { if (!ok) return cookieBlockedView(); enter(me); if (r.ownerRestored) toast('소유자 계정으로 다시 들어왔어요'); });
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h2', {}, '처음 왔어요'),
  h('label', { class: 'field', for: 'code' }, '초대 코드', input),
  err,
  h('button', { class: 'btn', type: 'submit' }, '들어가기'));

  // 이미 계정이 있어요
  const err2 = h('div', { class: 'err', role: 'alert' });
  const rc = h('input', { id: 'rc', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABCD-EFGH-JKLM-NPQR' });
  const back = h('form', { class: 'join-sec', onsubmit: async (e) => {
    e.preventDefault(); err2.textContent = '';
    try { const me = await api('/recover', { method: 'POST', body: { code: rc.value } }); (await cookieWorks()) ? enter(me) : cookieBlockedView(); } catch (ex) { err2.textContent = ex.message; }
  } },
  h('h2', {}, '이미 계정이 있어요'),
  passkeySupported() ? h('button', { class: 'btn ghost pk-btn', type: 'button', onclick: async () => {
    err2.textContent = '';
    try { enter(await loginWithPasskey()); } catch (ex) { err2.textContent = passkeyError(ex); }
  } }, svg(ICON.key, 18), '패스키로 들어가기') : null,
  h('label', { class: 'field', for: 'rc' }, '복구 코드', rc),
  err2,
  h('button', { class: 'btn ghost', type: 'submit' }, '복구 코드로 들어가기'));

  const card = h('div', { class: 'card join' },
    h('h1', {}, '익명 라운지'),
    h('p', { class: 'sub', style: 'margin:0' }, '여기서 쓰는 글은 모두 익명이에요. 다른 수강생은 누가 썼는지 알 수 없어요.'),
    form, h('hr', { class: 'sep' }), back,
    inFrame ? h('p', { class: 'sub', style: 'margin:0;font-size:12.5px' }, '팀즈 안에서는 패스키 대신 복구 코드로 들어와요. 잘 안 되면 ', openOutside()) : null,
    h('p', { class: 'sub', style: 'margin:0;font-size:12px' }, '운영자는 문제가 생긴 글을 지우거나 글쓰기를 막을 수 있어요. 개인정보가 담긴 캡처는 올리지 말아주세요.'));
  app.replaceChildren(h('div', { class: 'center' }, card));
  input.focus();
}

// ---------- 질문 목록 ----------
function subjectStrip(unreadMap = state.unread) {
  const my = state.me.mySubject;
  const row = h('div', { class: 'strip-row' });
  row.append(
    h('div', { class: 'strip-line base', 'aria-hidden': 'true', style: 'left:128px;right:32px' }),
    h('div', { class: 'strip-line fill', 'aria-hidden': 'true', style: `left:128px;width:${(my - 1) * 64}px` }));
  const allUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);
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
    row.append(mk(k, pad(k), n, unreadMap[k] || 0, k === my ? 'now' : k < my ? 'done' : ''));
  });
  const scroller = h('div', { class: 'strip-scroll' }, row);
  requestAnimationFrame(() => {
    const target = row.querySelector('[aria-pressed="true"]') || row.querySelector('.now');
    if (target) scroller.scrollLeft = Math.max(0, target.offsetLeft - scroller.clientWidth / 2 + target.offsetWidth / 2);
  });
  return h('nav', { class: 'card strip edge', 'aria-label': '과목 고르기' }, scroller);
}

const bannedNote = () => h('section', { class: 'card empty edge', role: 'note' }, '운영자가 글쓰기를 제한했어요. 글은 계속 읽을 수 있어요.');
const adminTag = (tag, uid) => (!tag ? null : uid
  ? h('a', { class: 'admin-tag', href: `#/admin/user/${uid}`, title: '이 사용자가 쓴 글·답변 보기 (운영자에게만 보임)' }, tag)
  : h('span', { class: 'admin-tag', title: '운영자에게만 보이는 작성자 번호' }, tag));

function composer(onDone) {
  if (state.me.banned) return bannedNote();
  const sel = state.subject === 'all' ? state.me.mySubject : state.subject;
  // 평소엔 한 줄짜리 막대 → 누르면 글쓰기 칸이 펼쳐짐 (목록이 더 많이 보이게)
  if (!state.composeOpen) {
    const open = () => { state.composeOpen = true; const full = composer(onDone); bar.replaceWith(full); full.querySelector('.title-in').focus(); };
    const bar = h('button', { type: 'button', class: 'card compose-bar compose-open edge', 'aria-label': `${subjName(sel)}에 글쓰기`, onclick: open },
      h('span', { class: 'pen', 'aria-hidden': 'true' }, svg(ICON.pen, 17)),
      h('span', { class: 'ph' }, `${subjName(sel)} · 궁금한 점이나 하고 싶은 말을 남겨보세요`),
      h('span', { class: 'go', 'aria-hidden': 'true' }, '글쓰기'));
    // 접힌 상태에서도 캡처를 바로 붙여넣으면 펼치고 이미지 넣기
    bar.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault(); open();
      const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
      document.querySelector('.composer')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    });
    return bar;
  }
  const root = h('section', { class: 'card composer edge', 'aria-label': '새 글 쓰기' });
  let cat = '질문';
  const subjTag = h('span', { class: 'tag c-질문', style: 'margin-left:auto' }, subjName(sel));
  const radios = h('div', { class: 'radios', role: 'radiogroup', 'aria-label': '말머리' },
    ...CATS.map((c) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'cat', value: c, checked: c === cat ? true : null, onchange: () => { cat = c; subjTag.textContent = c === '건의' ? '사이트 건의' : c === '잡담' ? '전체 잡담 (모든 과목)' : subjName(sel); } }), c)),
    subjTag);
  const title = h('input', { class: 'plain title-in', type: 'text', maxlength: '100', placeholder: '제목', 'aria-label': '제목' });
  const body = h('textarea', { class: 'plain body-in', rows: '3', maxlength: '5000', placeholder: '내용을 써주세요. 캡처는 Ctrl + V로 바로 붙여넣을 수 있어요.', 'aria-label': '내용' });
  const tray = imageTray(root);
  const send = h('button', { class: 'btn', type: 'button' }, '올리기');
  send.addEventListener('click', async () => {
    if (!title.value.trim()) { title.focus(); toast('제목을 써주세요.'); return; }
    send.disabled = true;
    try {
      const { id } = await api('/posts', { method: 'POST', body: { cat, subject: sel, title: title.value, body: body.value } });
      const imgs = tray.files();
      title.value = ''; body.value = ''; tray.clear(); state.composeOpen = false;
      try { await uploadImages('post', id, imgs); } catch (e) { toast(`${e.message} 글은 올라갔으니 '고치기'로 다시 넣어 주세요.`); onDone(); send.disabled = false; return; }
      toast(state.me.showReal ? '실명으로 올라갔어요' : '익명으로 올라갔어요');
      onDone();
    } catch (e) { toast(e.message); }
    send.disabled = false;
  });
  root.append(radios, title, body, tray.el,
    h('div', { class: 'comp-foot' }, emojiButton(title, body), h('span', { class: 'hint pc-hint' }, h('b', {}, 'Win + Shift + S'), ' → ', h('b', {}, 'Ctrl + V'), ' · 이름·API 키가 보이지 않는지 확인해 주세요'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => {
        if ((title.value.trim() || body.value.trim() || tray.count()) && !confirm('쓰던 내용을 지우고 접을까요?')) return;
        state.composeOpen = false; root.replaceWith(composer(onDone));
      } }, '접기'), send));
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
    h('div', {}, h('h1', {}, '질문'), h('p', { class: 'sub' }, '질문, 잡담, 건의 모두 여기에. 전부 익명이에요.')));
  app.replaceChildren(shell('q', [top, subjectStrip(), chips, composer(() => render()), list]));

  try {
    const q = new URLSearchParams({ subject: state.subject, cat: state.cat });
    const { posts } = await api(`/posts?${q}`);
    const { unread } = await api('/subjects');
    state.unread = unread;
    api('/me').then((me) => { const changed = me.banned !== state.me.banned || me.isAdmin !== state.me.isAdmin; state.me = me; if (changed) render(); }).catch(() => {});
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
        h('div', { class: 'item-tags' }, h('span', { class: `tag c-${p.cat}` }, p.cat), h('span', { class: 'tag' }, placeName(p.cat, p.subject))),
        h('a', { class: 'item-title', href: `#/post/${p.id}` }, p.title),
        p.excerpt ? h('div', { class: 'item-ex' }, p.excerpt) : null,
        h('div', { class: 'meta' }, authorEl(p.author, p.profile, ` · ${ago(p.createdAt)}`), adminTag(p.tag, p.uid), h('span', {}, `답변 ${p.answers}`),
          helpButton('post', p))),
      p.thumb ? h('a', { class: 'item-thumb', href: `#/post/${p.id}`, 'aria-label': `${p.title} 첨부 이미지 ${p.imageCount}장` },
        h('img', { src: p.thumb, alt: '', loading: 'lazy' }),
        p.imageCount > 1 ? h('span', { class: 'img-count', 'aria-hidden': 'true' }, p.imageCount) : null) : null)));
  } catch (e) {
    list.replaceChildren(h('li', { class: 'card empty' }, e.message));
  }
}

// ---------- 글 보기 ----------
// 이미지 크게 보기: 여러 장이면 ← → 버튼, 키보드 방향키, 손가락으로 밀어서 넘기기
function lightbox(urls, start = 0) {
  if (typeof urls === 'string') urls = [urls];
  let i = start;
  const prevFocus = document.activeElement;
  const img = h('img', { alt: '' });
  const count = h('div', { class: 'lb-count', 'aria-live': 'polite' });
  const strip = h('div', { class: 'lb-strip' });
  const many = urls.length > 1;
  const show = (n) => {
    i = (n + urls.length) % urls.length;
    img.src = urls[i]; img.alt = `첨부 이미지 ${i + 1} / ${urls.length}`;
    count.textContent = `${i + 1} / ${urls.length}`;
    strip.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
    strip.children[i]?.scrollIntoView({ block: 'nearest', inline: 'center' });
    // 다음 이미지 미리 불러오기
    if (many) new Image().src = urls[(i + 1) % urls.length];
  };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (many && e.key === 'ArrowRight') show(i + 1);
    else if (many && e.key === 'ArrowLeft') show(i - 1);
  };
  const nav = (dir, label) => h('button', { type: 'button', class: `lb-nav ${dir > 0 ? 'next' : 'prev'}`, 'aria-label': label, onclick: (e) => { e.stopPropagation(); show(i + dir); } },
    svg(dir > 0 ? ICON.next : ICON.back, 28));
  if (many) strip.append(...urls.map((u, k) => h('button', { type: 'button', 'aria-label': `${k + 1}번째 이미지`, onclick: (e) => { e.stopPropagation(); show(k); } }, h('img', { src: u, alt: '' }))));
  const stage = h('div', { class: 'lb-stage' }, img);
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '이미지 크게 보기', tabindex: '-1', onclick: (e) => { if (e.target === box || e.target === stage) close(); } },
    h('button', { type: 'button', class: 'lb-close', 'aria-label': '닫기', onclick: close }, svg(ICON.x, 24)),
    many ? count : null, stage, many ? nav(-1, '이전 이미지') : null, many ? nav(1, '다음 이미지') : null, many ? strip : null);
  // 손가락으로 밀기
  let sx = null, sy = 0;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchmove', (e) => { if (sx !== null) img.style.transform = `translateX(${e.touches[0].clientX - sx}px)`; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    img.style.transform = ''; sx = null;
    if (many && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(i + (dx < 0 ? 1 : -1));
  });
  document.addEventListener('keydown', onKey);
  document.body.append(box); show(start); box.focus();
}
const pics = (urls) => (urls.length ? h('div', { class: `pics${urls.length > 3 ? ' many' : ''}` }, ...urls.map((u, i) => h('img', { src: u, alt: `첨부 이미지 ${i + 1}`, loading: 'lazy', onclick: () => lightbox(urls, i) }))) : null);

async function postView(id) {
  app.replaceChildren(shell('q', [h('div', { class: 'card empty' }, '불러오는 중…')]));
  let data;
  try { data = await api(`/posts/${id}`); } catch (e) { app.replaceChildren(shell('q', [h('a', { class: 'back', href: '#/' }, svg(ICON.back), '목록'), h('div', { class: 'card empty' }, e.message)])); return; }
  const { post, answers, canModerate } = data;
  const del = (type, itemId) => h('button', { type: 'button', class: 'link-btn', onclick: async () => {
    if (!confirm('정말 지울까요?')) return;
    try { await api(`/${type === 'post' ? 'posts' : 'answers'}/${itemId}`, { method: 'DELETE' }); toast('지웠어요'); type === 'post' ? (location.hash = '#/') : postView(id); } catch (e) { toast(e.message); }
  } }, '지우기');

  // 답변 + 그 아래 대댓글 (한 단계)
  const tops = answers.filter((a) => !a.parentId);
  const kids = (pid) => answers.filter((a) => a.parentId === pid);
  const canWrite = !state.me.banned;
  function replyBox(top, slot, replyTo) {
    slot.querySelector('.reply-box')?.remove();
    const root = h('div', { class: 'reply-box composer' });
    const ta = h('textarea', { class: 'plain body-in', rows: '2', maxlength: '5000', placeholder: `${replyTo}에게 답글 (캡처는 Ctrl + V)`, 'aria-label': '대댓글 내용' });
    const tray = imageTray(root);
    const go = h('button', { class: 'btn sm', type: 'button' }, '답글 달기');
    go.addEventListener('click', async () => {
      if (!ta.value.trim() && !tray.count()) { ta.focus(); return; }
      go.disabled = true;
      try {
        const { id: rid } = await api(`/posts/${id}/answers`, { method: 'POST', body: { body: ta.value, parentId: top.id, withImages: tray.count() } });
        try { await uploadImages('answer', rid, tray.files()); toast('답글을 달았어요'); } catch (e) { toast(e.message); }
        postView(id);
      } catch (e) { toast(e.message); go.disabled = false; }
    });
    root.append(ta, tray.el, h('div', { class: 'comp-foot' }, emojiButton(ta), h('span', { class: 'hint' }, state.me.showReal ? '실명으로 올라가요' : '익명으로 올라가요'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => root.remove() }, '취소'), go));
    slot.append(root);
    ta.focus();
  }
  function answerItem(a, top, slot, isReply) {
    if (a.deleted) return h('li', { class: 'answer gone-answer' }, h('p', { class: 'body sub', style: 'margin:0' }, '삭제된 답변이에요.'));
    return h('li', { class: `answer${isReply ? ' reply' : ''}` },
      h('div', { class: 'row' }, h('span', { class: `who${a.author === '익명(글쓴이)' ? ' op' : ''}` },
        isReply ? h('span', { class: 'reply-mark', 'aria-hidden': 'true' }, svg(ICON.reply, 14)) : null,
        a.profile ? authorEl(a.author, a.profile) : a.author, h('span', { style: 'font-weight:400;color:var(--muted);margin-left:6px' }, ago(a.createdAt)), adminTag(a.tag, a.uid)),
        (a.mine || canModerate) ? del('answer', a.id) : null),
      a.body ? h('p', { class: 'body' }, a.body) : null,
      pics(a.images),
      h('div', { class: 'meta' },
        canWrite && !top.deleted ? h('button', { type: 'button', class: 'reply-btn', onclick: () => replyBox(top, slot, a.author) }, svg(ICON.reply, 14), '답글') : null,
        helpButton('answer', a)));
  }
  const ansList = h('ol', { class: 'answers', 'aria-label': '답변' },
    ...tops.map((t) => {
      const slot = h('div', { class: 'reply-slot' });
      const children = kids(t.id);
      return h('li', { class: 'thread' },
        h('ol', { class: 'answers' }, answerItem(t, t, slot, false)),
        children.length ? h('ol', { class: 'answers replies', 'aria-label': '대댓글' }, ...children.map((c) => answerItem(c, t, slot, true))) : null,
        slot);
    }));

  const ansRoot = h('section', { class: 'card composer edge', 'aria-label': '답변 쓰기' });
  const ansBody = h('textarea', { class: 'plain body-in', rows: '3', maxlength: '5000', placeholder: '답변을 써주세요. 캡처는 Ctrl + V로 붙여넣어요.', 'aria-label': '답변 내용' });
  const tray = imageTray(ansRoot);
  const send = h('button', { class: 'btn', type: 'button' }, '답변 올리기');
  send.addEventListener('click', async () => {
    if (!ansBody.value.trim() && !tray.count()) { ansBody.focus(); return; }
    send.disabled = true;
    try {
      const { id: aid } = await api(`/posts/${id}/answers`, { method: 'POST', body: { body: ansBody.value, withImages: tray.count() } });
      try { await uploadImages('answer', aid, tray.files()); toast('답변을 올렸어요'); } catch (e) { toast(e.message); }
      postView(id);
    } catch (e) { toast(e.message); send.disabled = false; }
  });
  ansRoot.append(ansBody, tray.el, h('div', { class: 'comp-foot' }, emojiButton(ansBody), h('span', { class: 'hint' }, state.me.showReal ? '실명으로 올라가요' : '익명으로 올라가요'), send));

  app.replaceChildren(shell('q', [
    h('a', { class: 'back', href: '#/' }, svg(ICON.back), '목록'),
    h('article', { class: 'card post edge' },
      h('div', { class: 'item-tags' }, h('span', { class: `tag c-${post.cat}` }, post.cat), h('span', { class: 'tag' }, placeName(post.cat, post.subject))),
      h('h2', {}, post.title),
      h('div', { class: 'meta' }, authorEl(post.author, post.profile, ` · ${ago(post.createdAt)}${post.editedAt ? ' · 수정됨' : ''}`), adminTag(post.tag, post.uid),
        (post.mine && !state.me.banned) || canModerate ? h('button', { type: 'button', class: 'link-btn', onclick: () => editPost(post, () => postView(id)) }, post.mine ? '고치기' : '옮기기') : null,
        (post.mine || canModerate) ? del('post', post.id) : null),
      post.body ? h('p', { class: 'body' }, post.body) : null,
      pics(post.images),
      h('div', { class: 'meta' }, helpButton('post', post)),
      h('h3', { style: 'margin:8px 0 0;font-size:15px' }, `답변 ${answers.filter((a) => !a.deleted).length}`),
      answers.length ? ansList : h('p', { class: 'sub', style: 'margin:0' }, '아직 답변이 없어요. 아는 만큼만 적어도 큰 도움이 돼요.')),
    state.me.banned ? bannedNote() : ansRoot,
  ]));
}

// ---------- 글 고치기 ----------
// 글쓴이: 말머리·과목·제목·내용·이미지 / 운영자(남의 글): 말머리·과목만 옮기기
function editPost(post, done) {
  const full = post.mine;
  let cat = post.cat;
  const subj = h('select', { 'aria-label': '과목' }, ...SUBJECTS.map((n, i) => h('option', { value: i + 1, selected: post.subject === i + 1 ? true : null }, `${pad(i + 1)} ${n}`)));
  if (post.subject === 0) subj.value = String(state.me.mySubject);
  const syncSubj = () => { subj.disabled = GLOBAL_CATS.includes(cat); };
  const radios = h('div', { class: 'radios', role: 'radiogroup', 'aria-label': '말머리' },
    ...CATS.map((c) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'edit-cat', value: c, checked: c === cat ? true : null, onchange: () => { cat = c; syncSubj(); } }), c)), subj);
  syncSubj();
  const kept = post.images.slice();
  const removed = [];
  const title = full ? h('input', { class: 'plain title-in', type: 'text', maxlength: '100', value: post.title, 'aria-label': '제목' }) : null;
  const body = full ? h('textarea', { class: 'plain body-in', rows: '6', maxlength: '5000', 'aria-label': '내용' }) : null;
  if (body) body.value = post.body;
  const root = h('section', { class: 'card composer edge', 'aria-label': full ? '글 고치기' : '글 옮기기' });
  const tray = full ? imageTray(root, () => MAX_IMAGES - kept.length) : null;
  const keptBox = h('div', { class: 'thumbs' });
  const drawKept = () => {
    keptBox.replaceChildren(...kept.map((u, i) => h('figure', { class: 'thumb', style: 'margin:0' }, h('img', { src: u, alt: `지금 이미지 ${i + 1}` }),
      h('button', { type: 'button', 'aria-label': '이미지 빼기', onclick: () => { removed.push(...kept.splice(i, 1)); drawKept(); tray && tray.redraw(); } }, svg(ICON.x, 12)))));
  };
  drawKept();
  const save = h('button', { class: 'btn', type: 'button' }, '저장');
  save.addEventListener('click', async () => {
    if (full && !title.value.trim()) { title.focus(); toast('제목을 써주세요.'); return; }
    save.disabled = true;
    try {
      const b = { cat, subject: Number(subj.value) };
      if (full) { b.title = title.value; b.body = body.value; }
      await api(`/posts/${post.id}`, { method: 'PATCH', body: b });
      for (const u of removed) await api(`/images/${u.split('/').pop()}`, { method: 'DELETE' });
      if (full) await uploadImages('post', post.id, tray.files());
      toast(cat === post.cat ? '고쳤어요' : `${cat}(으)로 옮겼어요`);
      done();
    } catch (e) { toast(e.message); save.disabled = false; }
  });
  root.append(...[
    h('h2', { style: 'margin:0;font-size:16px' }, full ? '글 고치기' : '말머리·과목 옮기기'),
    radios, title, body,
    full ? h('div', { class: 'sub', style: 'font-size:12.5px' }, `이미지 ${MAX_IMAGES}장까지 · 캡처는 Ctrl + V`) : null,
    full ? keptBox : null, full ? tray.el : null,
    h('div', { class: 'comp-foot' }, full ? emojiButton(title, body) : null, h('button', { class: 'btn ghost', type: 'button', onclick: done }, '취소'), h('span', { class: 'hint' }), save)].filter(Boolean));
  const article = document.querySelector('.post');
  article.replaceWith(root);
  (title || subj).focus();
}

// ---------- 설정 ----------
function settingsView() {
  const me = state.me;
  const subj = h('select', { id: 'my-subj' }, ...SUBJECTS.map((n, i) => h('option', { value: i + 1, selected: me.mySubject === i + 1 ? true : null }, `${pad(i + 1)} ${n}`)));
  const name = h('input', { id: 'real-name', type: 'text', maxlength: '20', value: me.realName, placeholder: '예: 홍길동' });
  const sw = h('input', { type: 'checkbox', role: 'switch', 'aria-label': '실명으로 활동하기', checked: me.showReal ? true : null });
  const save = h('button', { class: 'btn', type: 'button' }, '저장');
  save.addEventListener('click', async () => {
    if (sw.checked && !name.value.trim()) { toast('실명을 먼저 적어주세요.'); name.focus(); return; }
    try { state.me = await api('/me', { method: 'PATCH', body: { mySubject: Number(subj.value), realName: name.value, showReal: sw.checked } }); state.subject = null; toast('저장했어요'); settingsView(); }
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
    profileSection(),
    h('section', { class: 'card', style: 'padding:20px;display:flex;align-items:center;gap:14px' },
      hexBadge(t.name, 40),
      h('div', {}, h('b', { style: 'font-size:18px' }, t.name), h('div', { class: 'sub' }, `받은 도움 ${t.points}${t.next ? ` · ${t.next.name}까지 ${t.next.need}개` : ''}`))),
    themeSection(),
    accountSection(),
    h('p', { class: 'sub' }, '다른 수강생에게는 익명이지만, 운영자는 문제가 생긴 글을 지울 수 있어요.'),
  ]));
}

// 프로필 꾸미기 (실명 켠 사람만)
function profileSection() {
  const me = state.me;
  const sec = h('section', { class: 'card profile-edit', 'aria-labelledby': 'pf-h' });
  if (!me.showReal || !me.realName) {
    sec.append(h('h2', { id: 'pf-h' }, '내 프로필 꾸미기'),
      h('p', { class: 'sub', style: 'margin:0' }, '위에서 "실명으로 활동하기"를 켜면 프로필 사진·소개·관심 태그·링크로 꾸밀 수 있어요. 실명으로 쓴 글에 내 프로필이 보여요.'));
    return sec;
  }
  const pf = { ...me.profile, tags: [...(me.profile.tags || [])], links: (me.profile.links || []).map((l) => ({ ...l })) };
  const preview = h('div', { class: 'pf-preview-wrap' });
  const drawPreview = () => preview.replaceChildren(profileCard({ ...pf, name: me.realName, image: pf.avatar === 'image' ? pf.image : null }, { compact: true }));
  // 사진 / 이모지
  const avatarRow = h('div', { class: 'pf-avatar-row' });
  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  picker.addEventListener('change', async () => {
    const f = picker.files[0]; picker.value = ''; if (!f) return;
    try {
      const blob = await squareAvatar(f);
      const res = await fetch('/api/me/avatar', { method: 'POST', headers: { 'content-type': blob.type }, body: blob, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '사진을 올리지 못했어요.');
      Object.assign(pf, { image: j.profile.image, hasImage: true, avatar: 'image' }); me.profile = j.profile; drawAvatar(); drawPreview(); toast('프로필 사진을 바꿨어요');
    } catch (e) { toast(e.message); }
  });
  const emojiGrid = h('div', { class: 'pf-emoji-grid', role: 'radiogroup', 'aria-label': '프로필 이모지' });
  function drawAvatar() {
    avatarRow.replaceChildren(
      h('div', { class: 'seg', role: 'group', 'aria-label': '프로필 사진 종류' },
        h('button', { type: 'button', 'aria-pressed': pf.avatar !== 'image' ? 'true' : 'false', onclick: () => { pf.avatar = 'emoji'; drawAvatar(); drawPreview(); } }, '이모지'),
        h('button', { type: 'button', 'aria-pressed': pf.avatar === 'image' ? 'true' : 'false', onclick: () => { if (!pf.hasImage) { picker.click(); return; } pf.avatar = 'image'; drawAvatar(); drawPreview(); } }, '내 사진')),
      pf.avatar === 'image'
        ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            h('button', { type: 'button', class: 'btn ghost sm', onclick: () => picker.click() }, '사진 바꾸기'),
            h('button', { type: 'button', class: 'link-btn', onclick: async () => {
              try { const j = await api('/me/avatar', { method: 'DELETE' }); Object.assign(pf, { image: null, hasImage: false, avatar: 'emoji' }); me.profile = j.profile; drawAvatar(); drawPreview(); } catch (e) { toast(e.message); }
            } }, '사진 지우기'))
        : emojiGrid, picker);
    emojiGrid.replaceChildren(...AVATAR_EMOJIS.map((e) => h('button', { type: 'button', role: 'radio', 'aria-checked': pf.emoji === e ? 'true' : 'false', 'aria-label': e, onclick: () => { pf.emoji = e; drawAvatar(); drawPreview(); } }, e)));
  }
  // 색
  const colors = h('div', { class: 'pf-colors', role: 'radiogroup', 'aria-label': '프로필 색' });
  const drawColors = () => colors.replaceChildren(...PROFILE_COLORS.map(([k, label]) => h('button', { type: 'button', role: 'radio', class: `pf-color pc-${k}`, 'aria-checked': pf.color === k ? 'true' : 'false', 'aria-label': label, title: label, onclick: () => { pf.color = k; drawColors(); drawPreview(); } })));
  // 소개
  const bio = h('input', { type: 'text', maxlength: '100', value: pf.bio || '', placeholder: '한 줄 소개 (예: 프론트엔드 개발자를 꿈꾸는 중 🚀)', 'aria-label': '한 줄 소개' });
  bio.addEventListener('input', () => { pf.bio = bio.value; drawPreview(); });
  // 태그
  const tagBox = h('div', { class: 'pf-tags' });
  const tagIn = h('input', { type: 'text', maxlength: '12', placeholder: '관심 분야 입력 후 Enter (최대 5개)', 'aria-label': '관심 분야 태그 추가' });
  const drawTags = () => tagBox.replaceChildren(...pf.tags.map((t, i) => h('span', { class: 'pf-tag' }, `#${t}`, h('button', { type: 'button', 'aria-label': `${t} 태그 빼기`, onclick: () => { pf.tags.splice(i, 1); drawTags(); drawPreview(); } }, svg(ICON.x, 12)))), pf.tags.length < 5 ? tagIn : null);
  tagIn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    if (e.isComposing) return;
    e.preventDefault();
    const v = tagIn.value.trim().replace(/^#/, '').replace(/,/g, '');
    if (v && !pf.tags.includes(v) && pf.tags.length < 5) { pf.tags.push(v); tagIn.value = ''; drawTags(); drawPreview(); tagBox.querySelector('input')?.focus(); }
  });
  // 링크
  const linkBox = h('div', { class: 'pf-links-edit' });
  const drawLinks = () => {
    linkBox.replaceChildren(...pf.links.map((l, i) => {
      const lab = h('input', { type: 'text', maxlength: '20', value: l.label || '', placeholder: '이름 (예: GitHub)', 'aria-label': `링크 ${i + 1} 이름` });
      const url = h('input', { type: 'url', maxlength: '200', value: l.url || '', placeholder: 'https://', 'aria-label': `링크 ${i + 1} 주소` });
      lab.addEventListener('input', () => { l.label = lab.value; drawPreview(); });
      url.addEventListener('input', () => { l.url = url.value; drawPreview(); });
      return h('div', { class: 'pf-link-row' }, lab, url, h('button', { type: 'button', class: 'link-btn', onclick: () => { pf.links.splice(i, 1); drawLinks(); drawPreview(); } }, '빼기'));
    }), pf.links.length < 3 ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { pf.links.push({ label: '', url: '' }); drawLinks(); linkBox.querySelector('.pf-link-row:last-of-type input')?.focus(); } }, '+ 링크 추가') : null);
  };
  const save = h('button', { class: 'btn', type: 'button' }, '프로필 저장');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const pending = tagIn.value.trim().replace(/^#/, '');
      if (pending && !pf.tags.includes(pending) && pf.tags.length < 5) { pf.tags.push(pending); tagIn.value = ''; drawTags(); }
      const j = await api('/me/profile', { method: 'PATCH', body: { bio: pf.bio, emoji: pf.emoji, color: pf.color, tags: pf.tags, links: pf.links.filter((l) => (l.url || '').trim()), avatar: pf.avatar } });
      me.profile = j.profile; toast('프로필을 저장했어요');
    } catch (e) { toast(e.message); }
    save.disabled = false;
  });
  drawAvatar(); drawColors(); drawTags(); drawLinks(); drawPreview();
  sec.append(
    h('div', { class: 'row' }, h('h2', { id: 'pf-h' }, '내 프로필 꾸미기'), me.profile.slug ? h('a', { class: 'link-btn', href: `#/u/${me.profile.slug}` }, '내 프로필 보기') : null),
    h('p', { class: 'sub', style: 'margin:0;font-size:13px' }, '실명으로 쓴 글과 답변에서 이름 옆에 보여요. 익명으로 쓴 글은 프로필과 연결되지 않아요.'),
    preview,
    h('div', { class: 'pf-field' }, h('b', {}, '프로필 사진'), avatarRow),
    h('div', { class: 'pf-field' }, h('b', {}, '색'), colors),
    h('label', { class: 'pf-field' }, h('b', {}, '한 줄 소개'), bio),
    h('div', { class: 'pf-field' }, h('b', {}, '관심 분야'), tagBox),
    h('div', { class: 'pf-field' }, h('b', {}, '링크 (GitHub, 블로그, 포트폴리오)'), linkBox),
    h('div', {}, save));
  return sec;
}
// 사진을 가운데 기준 정사각형 256px로 잘라 작게
async function squareAvatar(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), size = Math.min(256, side);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  for (const q of [0.88, 0.75, 0.6]) {
    const b = await new Promise((r) => c.toBlob(r, 'image/webp', q)) || await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (b && b.size <= 190 * 1024) return b;
  }
  throw new Error('사진을 줄이지 못했어요. 다른 사진을 골라주세요.');
}
// 프로필 카드 (미리보기·프로필 화면 공용)
function profileCard(pf, { compact = false, stats = null } = {}) {
  const safeLinks = (pf.links || []).filter((l) => /^https?:\/\//i.test(l.url || ''));
  return h('div', { class: `pf-card${compact ? ' compact' : ''}` },
    h('div', { class: `pf-banner pc-${pf.color}` }),
    h('div', { class: 'pf-body' },
      avatarEl(pf, compact ? 64 : 88),
      h('div', { class: 'pf-name' }, pf.name),
      pf.bio ? h('div', { class: 'pf-bio' }, pf.bio) : null,
      pf.tags?.length ? h('div', { class: 'pf-tag-list' }, ...pf.tags.map((t) => h('span', { class: `pf-tag pc-soft-${pf.color}` }, `#${t}`))) : null,
      safeLinks.length ? h('div', { class: 'pf-link-list' }, ...safeLinks.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, svg(ICON.link, 14), l.label || new URL(l.url).hostname))) : null,
      stats ? h('div', { class: 'pf-stats' }, h('span', {}, h('b', {}, stats.posts), '실명 글'), h('span', {}, h('b', {}, stats.answers), '실명 답변'), h('span', {}, h('b', {}, stats.helps), '받은 도움')) : null));
}
async function profileView(slug) {
  app.replaceChildren(shell('', [h('div', { class: 'card empty' }, '불러오는 중…')]));
  try {
    const d = await api(`/profiles/${encodeURIComponent(slug)}`);
    app.replaceChildren(shell('', [
      h('button', { type: 'button', class: 'back', onclick: () => history.length > 1 ? history.back() : (location.hash = '#/') }, svg(ICON.back), '뒤로'),
      h('section', { class: 'card pf-page edge' }, profileCard(d.profile, { stats: d.stats }),
        d.profile.me ? h('div', { style: 'padding:0 20px 16px' }, h('a', { class: 'btn ghost sm', href: '#/settings' }, '프로필 꾸미기')) : null),
      h('h2', { style: 'margin:6px 0 0;font-size:16px' }, '실명으로 쓴 글'),
      h('p', { class: 'sub', style: 'margin:0;font-size:12.5px' }, '익명으로 쓴 글은 여기에 나오지 않아요.'),
      d.posts.length
        ? h('ul', { class: 'list' }, ...d.posts.map((p) => h('li', { class: 'card item edge' }, h('div', { class: 'item-main' },
            h('div', { class: 'item-tags' }, h('span', { class: `tag c-${p.cat}` }, p.cat), h('span', { class: 'tag' }, placeName(p.cat, p.subject))),
            h('a', { class: 'item-title', href: `#/post/${p.id}` }, p.title),
            h('div', { class: 'meta' }, h('span', {}, ago(p.createdAt)), h('span', {}, `답변 ${p.answers}`), p.helps ? h('span', {}, `도움 ${p.helps}`) : null)))))
        : h('div', { class: 'card empty' }, '아직 실명으로 쓴 글이 없어요.'),
    ]));
  } catch (e) {
    app.replaceChildren(shell('', [h('a', { class: 'back', href: '#/' }, svg(ICON.back), '질문'), h('div', { class: 'card empty' }, e.message)]));
  }
}

function themeSection() {
  const opts = [['light', '라이트', ICON.sun], ['dark', '다크', ICON.moon], ['system', '기기 설정 따라가기', null]];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '화면 테마' },
    ...opts.map(([v, label, icon]) => h('button', { type: 'button', 'aria-pressed': themePref() === v ? 'true' : 'false', onclick: () => { setTheme(v); render(); } }, icon ? svg(icon, 16) : null, label)));
  return h('section', { class: 'card', style: 'padding:20px;display:flex;flex-direction:column;gap:10px' },
    h('h2', { style: 'margin:0;font-size:17px' }, '화면 테마'),
    h('p', { class: 'sub', style: 'margin:0;font-size:13.5px' }, '이 기기에만 적용돼요. 오른쪽 위 버튼으로도 바로 바꿀 수 있어요.'),
    h('div', {}, seg));
}

// 내 계정 지키기: 복구 코드 + 패스키 + 로그아웃
function accountSection() {
  const sec = h('section', { class: 'card', style: 'padding:20px;display:flex;flex-direction:column;gap:14px', 'aria-labelledby': 'acct-h' });
  const pkList = h('ul', { class: 'pk-list' });
  async function loadKeys() {
    try {
      const { passkeys } = await api('/passkeys');
      state.me.passkeys = passkeys.length;
      pkList.replaceChildren(...(passkeys.length ? passkeys.map((p, i) => h('li', {},
        svg(ICON.key, 16), h('span', {}, `패스키 ${i + 1}`, h('span', { class: 'sub', style: 'margin-left:6px;font-size:12.5px' }, `등록 ${ago(p.createdAt)}${p.lastUsedAt ? ` · 최근 사용 ${ago(p.lastUsedAt)}` : ''}`)),
        h('button', { type: 'button', class: 'link-btn', onclick: async () => {
          if (!confirm('이 패스키를 지울까요? 그 기기로는 바로 못 들어와요.')) return;
          try { await api(`/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); loadKeys(); } catch (e) { toast(e.message); }
        } }, '지우기'))) : [h('li', { class: 'sub' }, '아직 등록한 패스키가 없어요.')]));
    } catch (e) { pkList.replaceChildren(h('li', { class: 'sub' }, e.message)); }
  }
  const addPk = h('button', { class: 'btn ghost', type: 'button', disabled: passkeySupported() ? null : true, onclick: async () => {
    try { await registerPasskey(); toast('패스키를 등록했어요'); loadKeys(); } catch (e) { toast(passkeyError(e)); }
  } }, svg(ICON.key, 16), '이 기기에 패스키 등록');
  const newRc = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    if (!confirm('복구 코드를 새로 만들까요? 예전 코드는 바로 못 쓰게 돼요.')) return;
    try { const { recoveryCode } = await api('/me/recovery', { method: 'POST' }); state.me.hasRecovery = true; recoveryModal(recoveryCode); } catch (e) { toast(e.message); }
  } }, state.me.hasRecovery ? '복구 코드 새로 만들기' : '복구 코드 만들기');
  const logout = h('button', { class: 'link-btn', type: 'button', onclick: async () => {
    if (!confirm('이 기기에서 나갈까요? 다시 들어오려면 복구 코드나 패스키가 필요해요.')) return;
    try { await api('/logout', { method: 'POST' }); } catch {}
    state.me = null; location.hash = '#/join';
  } }, '이 기기에서 로그아웃');
  sec.append(...[
    h('h2', { id: 'acct-h', style: 'margin:0;font-size:17px' }, '내 계정 지키기'),
    h('p', { class: 'sub', style: 'margin:0;font-size:13.5px' }, '수강이 끝나 노트북을 반납해도 개인 휴대폰이나 집 컴퓨터에서 내 글·티어를 그대로 이어 쓸 수 있어요.'),
    state.me.hasRecovery ? null : h('div', { class: 'warn' }, '복구 코드가 없어요. 지금 만들어 두지 않으면 이 브라우저 쿠키가 지워질 때 계정을 잃어요.'),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, newRc),
    h('div', { style: 'border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:10px' },
      h('b', {}, '패스키'),
      h('p', { class: 'sub', style: 'margin:0;font-size:13px' }, passkeySupported()
        ? '지문·얼굴·PIN으로 바로 들어와요. 개인 휴대폰에 등록해 두면 가장 편해요. 팀즈 안에서는 안 될 수 있어요.'
        : '이 화면에서는 패스키를 쓸 수 없어요. 팀즈 밖 브라우저(크롬·엣지·사파리)에서 열어 주세요.'),
      pkList, h('div', {}, addPk)),
    h('div', {}, logout)].filter(Boolean));
  loadKeys();
  return sec;
}

// ---------- 운영 ----------
async function adminView() {
  if (!state.me.isAdmin) { location.hash = '#/'; return; }
  const box = h('div', { class: 'card', style: 'padding:0;overflow:hidden' }, h('p', { class: 'empty' }, '불러오는 중…'));
  app.replaceChildren(shell('admin', [
    h('h1', {}, '운영'),
    h('p', { class: 'sub' }, '사용자는 번호(#…)로만 보여요. 실명은 본인이 켰을 때만 글에 나와요.'),
    box]));
  let data;
  try { data = await api('/admin/users'); } catch (e) { box.replaceChildren(h('p', { class: 'empty' }, e.message)); return; }
  const patch = async (u, body, msg) => {
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast(msg); adminView(); } catch (e) { toast(e.message); }
  };
  const roleOf = (u) => (u.isOwner ? '소유자' : u.isAdmin ? '운영자' : '수강생');
  const rows = data.users.map((u) => h('li', { class: `urow${u.banned ? ' banned' : ''}` },
    h('div', { class: 'u-main' },
      h('a', { class: 'u-tag', href: `#/admin/user/${u.id}` }, u.tag), h('span', { class: `role r-${roleOf(u)}` }, roleOf(u)), u.me ? h('span', { class: 'sub' }, '(나)') : null,
      u.banned ? h('span', { class: 'role r-ban' }, '글쓰기 제한') : null,
      h('div', { class: 'sub', style: 'font-size:12.5px;width:100%' },
        `글 ${u.posts} · 답변 ${u.answers} · 받은 도움 ${u.helps} · 최근 ${u.lastSeenAt ? ago(u.lastSeenAt) : '기록 없음'} · ${u.hasRecovery ? '복구 코드 있음' : '복구 코드 없음'}${u.passkeys ? ` · 패스키 ${u.passkeys}` : ''}`)),
    h('div', { class: 'u-act' },
      h('a', { class: 'btn ghost sm', href: `#/admin/user/${u.id}` }, '글·답변 보기'),
      ...((u.me || u.isOwner) ? [] : [
      data.canAssignAdmins && !u.banned ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => patch(u, { admin: !u.isAdmin }, u.isAdmin ? '운영자에서 뺐어요' : '운영자로 지정했어요') }, u.isAdmin ? '운영자 해제' : '운영자 지정') : null,
      (!u.isAdmin || data.canAssignAdmins) ? h('button', { type: 'button', class: `btn ghost sm${u.banned ? '' : ' danger'}`, onclick: () => {
        if (!u.banned && !confirm(`${u.tag} 사용자의 글쓰기를 막을까요?`)) return;
        patch(u, { banned: !u.banned }, u.banned ? '제한을 풀었어요' : '글쓰기를 막았어요');
      } }, u.banned ? '제한 풀기' : '글쓰기 막기') : null]))));
  box.replaceChildren(h('ul', { class: 'ulist' }, ...rows));
}

// ---------- 알림 ----------
function paintAlerts() {
  document.querySelectorAll('.alert-badge').forEach((b) => { b.textContent = state.alerts; b.hidden = !state.alerts; });
  document.title = state.alerts ? `(${state.alerts}) 익명 라운지` : '익명 라운지';
}
async function refreshAlerts() {
  if (!state.me) return;
  try { const { unread } = await api('/notifications/count'); if (unread !== state.alerts) { state.alerts = unread; paintAlerts(); } } catch {}
  refreshNoteUnread();
}
setInterval(() => document.visibilityState === 'visible' && refreshAlerts(), 45000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshAlerts());

async function alertsView() {
  const list = h('ul', { class: 'list' }, h('li', { class: 'card empty' }, '불러오는 중…'));
  const readAll = h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
    try { await api('/notifications/read', { method: 'POST' }); state.alerts = 0; alertsView(); } catch (e) { toast(e.message); }
  } }, '모두 읽음');
  app.replaceChildren(shell('alerts', [
    h('header', { class: 'row', style: 'align-items:flex-end;flex-wrap:wrap' }, h('div', {}, h('h1', {}, '알림'), h('p', { class: 'sub' }, '내 글에 답변이, 내 답변에 대댓글이 달리거나 내 공개 정리가 고쳐지면 여기에 모여요.')), readAll),
    list]));
  let data;
  try { data = await api('/notifications'); } catch (e) { list.replaceChildren(h('li', { class: 'card empty' }, e.message)); return; }
  state.alerts = data.notifications.filter((n) => !n.read).length; paintAlerts();
  readAll.disabled = !state.alerts;
  if (!data.notifications.length) { list.replaceChildren(h('li', { class: 'card empty' }, '아직 알림이 없어요. 질문을 올리면 답변이 달릴 때 알려드려요.')); return; }
  list.replaceChildren(...data.notifications.map((n) => h('li', {},
    h('a', { class: `card item alert-item edge${n.read ? '' : ' new'}`, href: n.kind === 'note_edit' ? `#/notes/${n.postId}` : `#/post/${n.postId}` },
      h('span', { class: `unread-dot${n.read ? '' : ' on'}`, 'aria-label': n.read ? null : '안 읽음' }),
      h('div', { class: 'item-main' },
        h('div', { class: 'alert-line' }, h('b', {}, n.kind === 'note_edit' ? '내 정리를 누군가 고쳤어요' : n.kind === 'reply' ? '내 답변에 대댓글' : '내 글에 새 답변'), h('span', { class: 'sub', style: 'margin:0;font-size:13px' }, ago(n.createdAt))),
        h('div', { class: 'item-title' }, n.postTitle),
        n.snippet ? h('div', { class: 'item-ex' }, `“${n.snippet}”`) : null)))));
}

async function adminUserView(uid) {
  if (!state.me.isAdmin) { location.hash = '#/'; return; }
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:14px' }, h('div', { class: 'card empty' }, '불러오는 중…'));
  app.replaceChildren(shell('admin', [h('a', { class: 'back', href: '#/admin' }, svg(ICON.back), '운영'), box]));
  let d;
  try { d = await api(`/admin/users/${encodeURIComponent(uid)}/activity`); } catch (e) { box.replaceChildren(h('div', { class: 'card empty' }, e.message)); return; }
  const u = d.user;
  const role = u.isOwner ? '소유자' : u.isAdmin ? '운영자' : '수강생';
  let tab = 'posts';
  const body = h('div', { class: 'list' });
  const delTag = (x) => (x ? h('span', { class: 'tag del-tag' }, '지움') : null);
  const imgTag = (n) => (n ? h('span', { style: 'display:inline-flex;align-items:center;gap:3px' }, svg(ICON.img, 13), n) : null);
  const draw = () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === tab ? 'true' : 'false'));
    const items = tab === 'posts'
      ? d.posts.map((p) => h('li', { class: `card item edge${p.deleted ? ' gone' : ''}` }, h('div', { class: 'item-main' },
          h('div', { class: 'item-tags' }, h('span', { class: `tag c-${p.cat}` }, p.cat), h('span', { class: 'tag' }, placeName(p.cat, p.subject)), delTag(p.deleted)),
          p.deleted ? h('div', { class: 'item-title' }, p.title) : h('a', { class: 'item-title', href: `#/post/${p.id}` }, p.title),
          p.excerpt ? h('div', { class: 'item-ex' }, p.excerpt) : null,
          h('div', { class: 'meta' }, h('span', {}, `${p.realName ? `실명 ${p.realName} · ` : ''}${ago(p.createdAt)}`), h('span', {}, `답변 ${p.answers}`), h('span', {}, `도움 ${p.helps}`), imgTag(p.images)))))
      : d.answers.map((a) => h('li', { class: `card item edge${a.deleted ? ' gone' : ''}` }, h('div', { class: 'item-main' },
          h('div', { class: 'item-tags' }, h('span', { class: 'tag' }, a.isReply ? '대댓글' : '답변'), delTag(a.deleted), a.postDeleted ? h('span', { class: 'tag del-tag' }, '원글 지움') : null),
          h('div', { class: 'answer-body' }, a.excerpt || '(이미지만)'),
          h('div', { class: 'meta' },
            a.postDeleted ? h('span', {}, `원글: ${a.postTitle}`) : h('a', { href: `#/post/${a.postId}` }, `원글: ${a.postTitle}`),
            h('span', {}, `${a.realName ? `실명 ${a.realName} · ` : ''}${ago(a.createdAt)}`), h('span', {}, `도움 ${a.helps}`), imgTag(a.images)))));
    body.replaceChildren(...(items.length ? items : [h('div', { class: 'card empty' }, tab === 'posts' ? '쓴 글이 없어요.' : '단 답변이 없어요.')]));
  };
  const tabs = h('div', { class: 'chips', role: 'tablist', 'aria-label': '보기' },
    h('button', { type: 'button', class: 'chip', role: 'tab', 'data-t': 'posts', onclick: () => { tab = 'posts'; draw(); } }, `글 ${d.posts.length}`),
    h('button', { type: 'button', class: 'chip', role: 'tab', 'data-t': 'answers', onclick: () => { tab = 'answers'; draw(); } }, `답변 ${d.answers.length}`));
  box.replaceChildren(
    h('header', {}, h('h1', { class: 'mono-h' }, u.tag),
      h('p', { class: 'sub' }, `${role}${u.banned ? ' · 글쓰기 제한 중' : ''} · 가입 ${ago(u.createdAt)} · 최근 ${u.lastSeenAt ? ago(u.lastSeenAt) : '기록 없음'}`),
      h('p', { class: 'sub', style: 'font-size:13px' }, '지운 글·답변도 운영 확인용으로 보여요. 누가 썼는지(실명)는 본인이 실명을 켠 글에만 나와요.')),
    tabs, body);
  draw();
}

// ---------- 정리: 마크다운(안전하게 DOM으로만 그림) ----------
// 지원: # ## ### 제목(목차 자동), **굵게**, ~~취소~~, `코드`, ```코드 블록```, - 목록, 1. 목록, > 인용, ---,
//       [글자](https://주소), 주소 자동 링크, [*각주], ![](/api/note-images/번호)
function mdInline(text, ctx) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(!\[[^\]\n]*\]\((\/api\/note-images\/\d+)\))|(\[\*([^\]\n]+)\])|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>()]+[^\s<>().,!?])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('code', {}, m[1].slice(1, -1)));
    else if (m[2]) out.push(h('strong', {}, ...mdInline(m[2].slice(2, -2), ctx)));
    else if (m[3]) out.push(h('del', {}, m[3].slice(2, -2)));
    else if (m[4]) { const src = m[5]; ctx.images.push(src); const k = ctx.images.length - 1; out.push(h('img', { class: 'md-img', src, alt: '정리 이미지', loading: 'lazy', onclick: () => lightbox(ctx.images, k) })); }
    else if (m[6] && ctx.notes) {
      const n = ctx.notes.push(m[7]);
      out.push(h('sup', { class: 'fn-ref' }, h('button', { type: 'button', id: `${ctx.pre}fr${n}`, 'aria-label': `각주 ${n}`, onclick: () => document.getElementById(`${ctx.pre}fn${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, `[${n}]`)));
    }
    else if (m[8]) out.push(h('a', { href: m[10], target: '_blank', rel: 'noopener noreferrer' }, m[9]));
    else if (m[11]) out.push(h('a', { href: m[11], target: '_blank', rel: 'noopener noreferrer' }, m[11]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
let mdSeq = 0;
function renderMd(md, { withToc = true } = {}) {
  const ctx = { notes: [], images: [], pre: `m${++mdSeq}-` };
  const root = h('div', { class: 'md' });
  const toc = [];
  const counters = [0, 0, 0];
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  // 가장 큰 제목을 1단계로 (## 만 써도 1. 2. 3.)
  let minLv = 3, inCode = false;
  for (const l of lines) { if (/^```/.test(l)) inCode = !inCode; else if (!inCode) { const hm = l.match(/^(#{1,3})\s+/); if (hm) minLv = Math.min(minLv, hm[1].length); } }
  let para = [];
  const flush = () => { if (para.length) { const p = h('p', {}); para.forEach((l, i) => { if (i) p.append(h('br')); p.append(...mdInline(l, ctx)); }); root.append(p); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      flush();
      const buf = [];
      while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]);
      root.append(h('pre', {}, h('code', {}, buf.join('\n'))));
    } else if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flush();
      const lv = m[1].length - minLv + 1;
      counters[lv - 1]++; for (let k = lv; k < 3; k++) counters[k] = 0;
      const num = counters.slice(0, lv).map((c) => c || 1).join('.');
      const id = `${ctx.pre}s${toc.length + 1}`;
      toc.push({ lv, num, text: m[2].replace(/\[\*[^\]]*\]/g, ''), id });
      root.append(h(`h${m[1].length + 1}`, { id }, h('span', { class: 'h-num' }, `${num}.`), ...mdInline(m[2], ctx)));
    } else if (/^\s*([-*])\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\.\s+/.test(line);
      const list = h(ordered ? 'ol' : 'ul', {});
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        const raw = lines[i];
        const item = h('li', {}, ...mdInline(raw.replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''), ctx));
        if (/^\s{2,}/.test(raw)) item.classList.add('sub-li');
        list.append(item); i++;
      }
      i--; root.append(list);
    } else if (/^>\s?/.test(line)) {
      flush();
      const q = h('blockquote', {});
      while (i < lines.length && /^>\s?/.test(lines[i])) { if (q.childNodes.length) q.append(h('br')); q.append(...mdInline(lines[i].replace(/^>\s?/, ''), ctx)); i++; }
      i--; root.append(q);
    } else if (/^\s*-{3,}\s*$/.test(line)) { flush(); root.append(h('hr')); }
    else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  if (ctx.notes.length) {
    root.append(h('div', { class: 'fn-list' }, h('div', { class: 'fn-title' }, '각주'),
      h('ol', {}, ...ctx.notes.map((t, k) => h('li', { id: `${ctx.pre}fn${k + 1}` },
        h('button', { type: 'button', class: 'fn-back', 'aria-label': '본문으로', onclick: () => document.getElementById(`${ctx.pre}fr${k + 1}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, `[${k + 1}]`), ' ', ...mdInline(t, { ...ctx, notes: null }))))));
  }
  if (withToc && toc.length >= 2) {
    const box = h('nav', { class: 'toc', 'aria-label': '목차' }, h('div', { class: 'toc-title' }, '목차'),
      h('ol', {}, ...toc.map((t) => h('li', { class: `lv${t.lv}` }, h('button', { type: 'button', onclick: () => document.getElementById(t.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, h('span', { class: 'toc-num' }, `${t.num}.`), t.text)))));
    root.prepend(box);
  }
  return root;
}

// 줄 단위로 바뀐 부분 (고친 기록 비교용)
function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  if (A.length * B.length > 4e6) return [{ t: '-', s: '(너무 길어서 비교를 생략했어요)' }];
  const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push({ t: ' ', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: A[i++] });
    else out.push({ t: '+', s: B[j++] });
  }
  while (i < A.length) out.push({ t: '-', s: A[i++] });
  while (j < B.length) out.push({ t: '+', s: B[j++] });
  return out;
}
function diffView(prev, cur) {
  const rows = lineDiff(prev, cur);
  const changed = rows.filter((r) => r.t !== ' ').length;
  // 바뀐 줄 앞뒤 2줄만 보여주기
  const keep = rows.map((r, k) => r.t !== ' ' || rows.slice(Math.max(0, k - 2), k + 3).some((x) => x.t !== ' '));
  const el = h('div', { class: 'diff', 'aria-label': '바뀐 부분' });
  let gap = false;
  rows.forEach((r, k) => {
    if (!keep[k]) { if (!gap) { el.append(h('div', { class: 'diff-gap' }, '⋯')); gap = true; } return; }
    gap = false;
    el.append(h('div', { class: `diff-row ${r.t === '+' ? 'add' : r.t === '-' ? 'del' : ''}` }, h('span', { class: 'diff-mark', 'aria-label': r.t === '+' ? '추가' : r.t === '-' ? '삭제' : null }, r.t === ' ' ? '' : r.t), r.s || ' '));
  });
  return changed ? el : h('div', { class: 'sub' }, '내용은 그대로이고 제목만 바뀌었어요.');
}

// ---------- 정리: 목록 ----------
async function refreshNoteUnread() {
  try { const { unread } = await api('/notes/subjects'); state.noteUnread = unread; paintNoteBadge(); } catch {}
}
function paintNoteBadge() {
  const n = Object.values(state.noteUnread || {}).reduce((a, b) => a + b, 0);
  document.querySelectorAll('.note-badge').forEach((b) => { b.textContent = n; b.hidden = !n; });
}
const visTag = (v) => h('span', { class: `tag vis-${v}` }, v === 'public' ? '공개 정리' : '나만 보기');

async function notesView() {
  if (state.subject === null) state.subject = state.me.mySubject;
  state.noteScope = state.noteScope || 'public';
  const scope = state.noteScope;
  const list = h('ul', { class: 'list' }, h('li', { class: 'card empty' }, '불러오는 중…'));
  const tabs = h('div', { class: 'chips', role: 'tablist', 'aria-label': '정리 보기' },
    ...[['public', '공개 정리'], ['mine', '내 노트']].map(([k, label]) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': scope === k ? 'true' : 'false', onclick: () => { state.noteScope = k; render(); } }, label)));
  const subj = state.subject === 'all' ? state.me.mySubject : state.subject;
  const newBar = state.me.banned ? bannedNote() : h('a', { class: 'card compose-bar edge', href: `#/notes/new/${subj}` },
    h('span', { class: 'pen', 'aria-hidden': 'true' }, svg(ICON.note, 17)),
    h('span', { class: 'ph' }, `${subjName(subj)} · 배운 내용을 정리해 보세요`),
    h('span', { class: 'go', 'aria-hidden': 'true' }, '새 정리'));
  app.replaceChildren(shell('notes', [
    h('header', {}, h('h1', {}, '정리'), h('p', { class: 'sub' }, scope === 'public' ? '공개 정리는 모두가 함께 고치고 더해요. 고친 기록이 다 남아요.' : '내 노트는 나만 볼 수 있어요. 공개하면 다른 사람도 고칠 수 있어요.')),
    subjectStrip(state.noteUnread || {}), tabs, newBar, list]));
  try {
    const q = new URLSearchParams({ subject: state.subject, scope });
    const { notes } = await api(`/notes?${q}`);
    refreshNoteUnread().then(() => {
      document.querySelectorAll('.subj').forEach((btn) => {
        const k = btn.dataset.key; const u = state.noteUnread || {};
        const n = k === 'all' ? Object.values(u).reduce((a, b) => a + b, 0) : u[k] || 0;
        const node = btn.querySelector('.node'); node.querySelector('.badge')?.remove();
        if (n) node.append(h('span', { class: 'badge' }, n));
      });
    });
    if (!notes.length) {
      list.replaceChildren(h('li', { class: 'card empty' }, scope === 'public' ? '이 과목에는 아직 공개 정리가 없어요. 첫 정리를 남겨보세요!' : '아직 쓴 노트가 없어요. 수업 내용을 나만 보는 노트로 정리해 보세요.'));
      return;
    }
    list.replaceChildren(...notes.map((n) => h('li', { class: 'card item edge' },
      h('span', { class: `unread-dot${n.unread ? ' on' : ''}`, 'aria-label': n.unread ? '새로 바뀜' : null }),
      h('div', { class: 'item-main' },
        h('div', { class: 'item-tags' }, h('span', { class: 'tag' }, subjName(n.subject)), scope === 'mine' ? visTag(n.visibility) : null),
        h('a', { class: 'item-title', href: `#/notes/${n.id}` }, n.title),
        n.excerpt ? h('div', { class: 'item-ex' }, n.excerpt) : null,
        h('div', { class: 'meta' },
          h('span', {}, `${n.contributors > 1 ? `${n.contributors}명이 함께 정리` : n.mine ? '내가 정리' : '익명이 정리'} · ${ago(n.updatedAt)} 고침`),
          adminTag(n.tag),
          n.helps ? h('span', { style: 'display:inline-flex;align-items:center;gap:3px' }, svg(ICON.thumb, 13), n.helps) : null)))));
  } catch (e) { list.replaceChildren(h('li', { class: 'card empty' }, e.message)); }
}

// ---------- 정리: 보기 ----------
async function noteView(id) {
  app.replaceChildren(shell('notes', [h('div', { class: 'card empty' }, '불러오는 중…')]));
  let d;
  try { d = await api(`/notes/${id}`); } catch (e) { app.replaceChildren(shell('notes', [h('a', { class: 'back', href: '#/notes' }, svg(ICON.back), '정리'), h('div', { class: 'card empty' }, e.message)])); return; }
  const { note: n } = d;
  n.canHelp = d.note.canHelp; n.iContributed = d.note.iContributed;
  refreshAlerts();
  const act = (label, fn, cls = 'link-btn') => h('button', { type: 'button', class: cls, onclick: fn }, label);
  const setVis = async (pub) => {
    if (pub && !confirm('공개하면 다른 수강생이 이 정리를 보고 고칠 수 있어요. 고친 기록은 모두 남아요. 공개할까요?')) return;
    try { await api(`/notes/${id}/visibility`, { method: 'PATCH', body: { public: pub } }); toast(pub ? '공개 정리로 올렸어요' : '나만 보기로 바꿨어요'); noteView(id); } catch (e) { toast(e.message); }
  };
  const credited = n.contributors.filter((c) => c.credited);
  const help = h('button', { type: 'button', class: 'help', 'aria-pressed': n.helped ? 'true' : 'false', disabled: n.canHelp ? null : true,
    title: n.iContributed ? '함께 정리한 글에는 누를 수 없어요' : null,
    'aria-label': `도움됐어요 ${n.helps}. 누르면 함께 정리한 ${credited.length}명이 모두 받아요` },
    svg(ICON.thumb, 14), `도움됐어요 ${n.helps}`);
  help.addEventListener('click', async () => {
    try { const r = await api(`/notes/${id}/help`, { method: 'POST' }); help.setAttribute('aria-pressed', r.helped ? 'true' : 'false'); help.lastChild.textContent = `도움됐어요 ${r.helps}`; } catch (e) { toast(e.message); }
  });
  app.replaceChildren(shell('notes', [
    h('a', { class: 'back', href: '#/notes' }, svg(ICON.back), '정리'),
    h('article', { class: 'card post note edge' },
      h('div', { class: 'item-tags' }, h('span', { class: 'tag' }, subjName(n.subject)), visTag(n.visibility)),
      h('h2', {}, n.title),
      h('div', { class: 'meta' },
        h('span', {}, `${n.lastEditor} · ${ago(n.updatedAt)} 고침 · ${n.rev}번째 기록`), adminTag(n.tag, n.uid),
        d.canEdit ? h('a', { class: 'btn sm', href: `#/notes/${id}/edit` }, '고치기') : null,
        h('a', { class: 'link-btn', href: `#/notes/${id}/history` }, '고친 기록'),
        d.canMakePublic ? act('공개하기', () => setVis(true)) : null,
        d.canMakePrivate ? act('나만 보기로', () => setVis(false)) : null,
        d.canDelete ? act('지우기', async () => {
          if (!confirm('이 정리를 지울까요?')) return;
          try { await api(`/notes/${id}`, { method: 'DELETE' }); toast('지웠어요'); location.hash = '#/notes'; } catch (e) { toast(e.message); }
        }) : null),
      n.body ? renderMd(n.body) : h('p', { class: 'sub' }, '아직 내용이 없어요.'),
      h('div', { class: 'note-foot' },
        n.visibility === 'public' ? h('div', { class: 'contribs' }, h('span', { class: 'sub', style: 'margin:0;font-size:13px' }, '함께 정리한 사람'),
          ...n.contributors.map((c) => h('span', { class: `contrib${c.me ? ' me' : ''}${c.credited ? ' credited' : ''}`,
            title: c.credited ? '이 정리의 도움됐어요를 함께 받아요' : `글을 ${20}자 이상 더하면 도움됐어요를 함께 받아요` },
            c.credited ? h('span', { class: 'cr-mark', 'aria-label': '도움됐어요 받음' }, svg(ICON.thumb, 11)) : null,
            c.name, h('small', {}, ` ${c.edits}번`), c.tag ? adminTag(c.tag, c.uid) : null))) : null,
        n.visibility === 'public' ? h('div', { class: 'help-wrap' }, help,
          h('div', { class: 'help-note' }, n.iContributed ? '함께 정리한 글이라 누를 수 없어요' : `누르면 함께 정리한 ${credited.length}명이 모두 받아요`)) : null),
        n.visibility === 'public' ? h('p', { class: 'sub', style: 'margin:0;font-size:12.5px' }, '👍 표시가 있는 사람이 도움됐어요를 함께 받아요. 처음 쓴 사람과, 글을 20자 이상 더한 사람이에요 (오타 수정·되돌리기는 제외).') : null),
  ]));
}

// ---------- 정리: 쓰기·고치기 ----------
function noteEditor(id, newSubject) {
  const isNew = !id;
  const draftKey = `al-draft-note-${id || 'new'}`;
  let baseRev = 1, noteId = id ? Number(id) : null, dirty = false, saving = false;
  const subj = h('select', { 'aria-label': '과목' }, ...SUBJECTS.map((nm, i) => h('option', { value: i + 1 }, `${pad(i + 1)} ${nm}`)));
  subj.value = String(newSubject || (state.subject === 'all' || !state.subject ? state.me.mySubject : state.subject));
  const title = h('input', { class: 'plain title-in note-title', type: 'text', maxlength: '100', placeholder: '제목 (예: 프롬프트 플로우 배포 정리)', 'aria-label': '제목' });
  const body = h('textarea', { class: 'plain note-body', rows: '16', maxlength: '50000', 'aria-label': '내용',
    placeholder: '## 큰 제목\n배운 내용을 자유롭게 적어요.\n\n- 목록은 - 로 시작\n**굵게**, `코드`, 각주는 [*설명]\n캡처는 Ctrl + V로 붙여넣어요.' });
  const summary = h('input', { class: 'note-summary', type: 'text', maxlength: '60', placeholder: '무엇을 고쳤나요? (선택, 예: 오타 수정, 3장 예시 추가)', 'aria-label': '고친 내용 한 줄 설명' });
  let vis = 'private';
  const visBox = isNew ? h('div', { class: 'radios', role: 'radiogroup', 'aria-label': '공개 범위' },
    ...[['private', '나만 보기'], ['public', '공개 정리 (모두가 고칠 수 있어요)']].map(([v, label]) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'note-vis', value: v, checked: v === vis ? true : null, onchange: () => { vis = v; } }), label))) : null;
  const preview = h('div', { class: 'note-preview card', 'aria-label': '미리보기' });
  const drawPreview = () => preview.replaceChildren(body.value.trim() ? renderMd(body.value) : h('p', { class: 'sub' }, '여기에 미리보기가 보여요.'));
  let pvTimer;
  const markDirty = () => {
    dirty = true; clearTimeout(pvTimer);
    pvTimer = setTimeout(() => { drawPreview(); try { localStorage.setItem(draftKey, JSON.stringify({ title: title.value, body: body.value, at: Date.now(), baseRev })); } catch {} }, 300);
  };
  title.addEventListener('input', markDirty); body.addEventListener('input', markDirty);

  // 도구 막대
  const wrapSel = (before, after = before, ph = '글자') => {
    const s = body.selectionStart, e = body.selectionEnd, sel = body.value.slice(s, e) || ph;
    body.setRangeText(before + sel + after, s, e, 'end');
    body.setSelectionRange(s + before.length, s + before.length + sel.length); body.focus(); markDirty();
  };
  const prefixLines = (prefix) => {
    const s = body.value.lastIndexOf('\n', body.selectionStart - 1) + 1;
    let e = body.value.indexOf('\n', body.selectionEnd); if (e < 0) e = body.value.length;
    const block = body.value.slice(s, e).split('\n').map((l, k) => (typeof prefix === 'function' ? prefix(k) : prefix) + l.replace(/^(#{1,3}\s+|[-*]\s+|\d+\.\s+|>\s?)/, '')).join('\n');
    body.setRangeText(block, s, e, 'end'); body.focus(); markDirty();
  };
  const tb = (label, title2, fn) => h('button', { type: 'button', class: 'tb-btn', title: title2, 'aria-label': title2, onmousedown: (e) => e.preventDefault(), onclick: fn }, label);
  const toolbar = h('div', { class: 'note-toolbar', role: 'toolbar', 'aria-label': '꾸미기' },
    tb('제목', '큰 제목 (목차에 나와요)', () => prefixLines('## ')),
    tb('소제목', '작은 제목', () => prefixLines('### ')),
    tb(h('b', {}, 'B'), '굵게', () => wrapSel('**')),
    tb(h('code', {}, '<>'), '코드', () => wrapSel('`', '`', 'code')),
    tb('{ }', '코드 블록', () => wrapSel('\n```\n', '\n```\n', '코드를 붙여넣어요')),
    tb('• 목록', '글머리 목록', () => prefixLines('- ')),
    tb('1. 목록', '번호 목록', () => prefixLines((k) => `${k + 1}. `)),
    tb('❝', '인용', () => prefixLines('> ')),
    tb('각주', '각주 [*설명]', () => wrapSel('[*', ']', '설명')),
    tb('링크', '링크', () => wrapSel('[', '](https://)', '보일 글자')),
    emojiButton(body));

  // 캡처 붙여넣기 → 업로드 → 본문에 이미지 넣기 (새 정리면 먼저 저장)
  async function ensureSaved() {
    if (noteId) return noteId;
    const r = await api('/notes', { method: 'POST', body: { subject: Number(subj.value), title: title.value, body: body.value, visibility: vis } });
    noteId = r.id; baseRev = r.rev; dirty = false;
    try { localStorage.removeItem(draftKey); } catch {}
    history.replaceState(null, '', `#/notes/${noteId}/edit`);
    return noteId;
  }
  async function addImages(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      let nid;
      try { nid = await ensureSaved(); } catch (e) { toast(e.message); return; }
      const mark = `![업로드 중…]()`;
      body.setRangeText(`\n${mark}\n`, body.selectionStart, body.selectionEnd, 'end');
      try {
        const c = await compressImage(f);
        const res = await fetch(`/api/notes/${nid}/images`, { method: 'POST', headers: { 'content-type': c.mime }, body: c.blob, credentials: 'same-origin' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || '이미지를 올리지 못했어요.');
        body.value = body.value.replace(mark, `![](${j.url})`);
      } catch (e) { body.value = body.value.replace(`\n${mark}\n`, '\n'); toast(e.message); }
      markDirty();
    }
  }
  body.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); }
  });
  body.addEventListener('drop', (e) => { const files = [...(e.dataTransfer?.files || [])]; if (files.length) { e.preventDefault(); addImages(files); } });
  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  picker.addEventListener('change', () => { addImages([...picker.files]); picker.value = ''; });
  toolbar.append(tb('🖼 이미지', '이미지 넣기 (Ctrl + V도 돼요)', () => picker.click()), picker);

  // 탭: 쓰기 / 미리보기 (넓은 화면에서는 나란히)
  const pane = h('div', { class: 'note-panes' }, h('div', { class: 'note-write' }, toolbar, body), preview);
  const modeTabs = h('div', { class: 'chips mode-tabs', role: 'tablist', 'aria-label': '보기 방식' },
    ...[['write', '쓰기'], ['preview', '미리보기']].map(([k, label]) => h('button', { type: 'button', class: 'chip', role: 'tab', 'data-k': k, 'aria-selected': k === 'write' ? 'true' : 'false',
      onclick: () => { pane.dataset.mode = k; modeTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.k === k ? 'true' : 'false')); if (k === 'preview') drawPreview(); } }, label)));
  pane.dataset.mode = 'write';

  const conflictBox = h('div', { class: 'warn conflict', hidden: true });
  const save = h('button', { class: 'btn', type: 'button' }, isNew ? '저장' : '고친 내용 저장');
  async function doSave(force) {
    if (saving) return;
    if (!title.value.trim()) { title.focus(); toast('제목을 써주세요.'); return; }
    saving = true; save.disabled = true;
    try {
      if (!noteId) await ensureSaved();
      else {
        const res = await fetch(`/api/notes/${noteId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ title: title.value, body: body.value, baseRev, summary: summary.value }) });
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 && j.conflict) { showConflict(j.current); return; }
        if (!res.ok) throw new Error(j.error || '저장하지 못했어요.');
        baseRev = j.rev;
      }
      dirty = false;
      try { localStorage.removeItem(draftKey); } catch {}
      toast(isNew ? '정리를 저장했어요' : '고친 내용을 저장했어요');
      state.editorDirty = null;
      location.hash = `#/notes/${noteId}`;
    } catch (e) { toast(e.message); }
    finally { saving = false; save.disabled = false; }
  }
  function showConflict(cur) {
    conflictBox.hidden = false;
    conflictBox.replaceChildren(
      h('b', {}, '그사이 다른 사람이 이 정리를 고쳤어요.'),
      h('p', { style: 'margin:6px 0' }, '내가 쓴 내용은 아직 그대로 있어요. 어떻게 할까요?'),
      h('details', {}, h('summary', {}, '바뀐 부분 보기 (최신 ↔ 내 글)'), diffView(cur.body, body.value)),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => { baseRev = cur.rev; conflictBox.hidden = true; doSave(true); } }, '내 글로 저장 (최신 내용 덮어쓰기)'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
          try { await navigator.clipboard.writeText(body.value); toast('내 글을 복사해 뒀어요. 최신 내용에 필요한 부분만 붙여넣으세요.'); } catch { toast('내 글을 먼저 따로 복사해 두세요.'); return; }
          title.value = cur.title; body.value = cur.body; baseRev = cur.rev; conflictBox.hidden = true; drawPreview();
        } }, '최신 내용 불러오기 (내 글은 복사)')));
    conflictBox.scrollIntoView({ block: 'center' });
  }
  save.addEventListener('click', () => doSave());
  const cancel = h('a', { class: 'btn ghost', href: noteId ? `#/notes/${noteId}` : '#/notes' }, '취소');

  const form = h('section', { class: 'card note-editor edge', 'aria-label': isNew ? '새 정리' : '정리 고치기' },
    h('div', { class: 'radios' }, subj, visBox),
    title, modeTabs, pane,
    isNew ? null : summary,
    conflictBox,
    h('div', { class: 'comp-foot' }, h('span', { class: 'hint' }, isNew ? '나만 보기로 저장해도 나중에 공개할 수 있어요.' : '저장하면 고친 기록에 남아요.'), cancel, save));
  app.replaceChildren(shell('notes', [
    h('a', { class: 'back', href: noteId ? `#/notes/${noteId}` : '#/notes' }, svg(ICON.back), noteId ? '정리로' : '정리'),
    h('h1', {}, isNew ? '새 정리' : '정리 고치기'), form]));

  const offerDraft = (serverBody) => {
    let dr = null; try { dr = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch {}
    if (dr && (dr.body !== serverBody) && (dr.body || dr.title)) {
      const bar = h('div', { class: 'warn' }, `저장 안 된 글이 있어요 (${ago(dr.at)}). `,
        h('button', { type: 'button', class: 'link-btn', onclick: () => { title.value = dr.title; body.value = dr.body; if (dr.baseRev) baseRev = dr.baseRev; dirty = true; drawPreview(); bar.remove(); } }, '불러오기'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => { try { localStorage.removeItem(draftKey); } catch {} bar.remove(); } }, '버리기'));
      form.prepend(bar);
    }
  };
  if (noteId) {
    api(`/notes/${noteId}`).then((d) => {
      if (!d.canEdit) { toast('고칠 수 없는 정리예요.'); location.hash = `#/notes/${noteId}`; return; }
      title.value = d.note.title; body.value = d.note.body; baseRev = d.note.rev; subj.value = String(d.note.subject); subj.disabled = true;
      drawPreview(); offerDraft(d.note.body);
    }).catch((e) => toast(e.message));
  } else { drawPreview(); offerDraft(''); title.focus(); }
  state.editorDirty = () => dirty;
}

// ---------- 정리: 고친 기록 ----------
async function noteHistoryView(id, rev) {
  app.replaceChildren(shell('notes', [h('div', { class: 'card empty' }, '불러오는 중…')]));
  try {
    if (!rev) {
      const d = await api(`/notes/${id}/revisions`);
      app.replaceChildren(shell('notes', [
        h('a', { class: 'back', href: `#/notes/${id}` }, svg(ICON.back), '정리로'),
        h('header', {}, h('h1', {}, '고친 기록'), h('p', { class: 'sub' }, `${d.title} · 모두 ${d.revisions.length}번`)),
        h('ul', { class: 'list' }, ...d.revisions.map((r) => h('li', {}, h('a', { class: 'card item rev-item edge', href: `#/notes/${id}/history/${r.rev}` },
          h('div', { class: 'item-main' },
            h('div', { class: 'alert-line' }, h('b', {}, `${r.rev}번째`), r.rev === d.current ? h('span', { class: 'tag vis-public' }, '지금') : null, h('span', { class: 'sub', style: 'margin:0;font-size:13px' }, ago(r.createdAt))),
            h('div', {}, `${r.who}${r.me ? ' (나)' : ''}${r.summary ? ` · ${r.summary}` : ''}`),
            h('div', { class: `delta ${r.delta >= 0 ? 'plus' : 'minus'}` }, `${r.delta >= 0 ? '+' : ''}${r.delta}글자`))))))]));
      return;
    }
    const r = await api(`/notes/${id}/revisions/${rev}`);
    let showDiff = true;
    const area = h('div');
    const draw = () => area.replaceChildren(showDiff ? diffView(r.prevBody, r.body) : renderMd(r.body));
    const toggle = h('div', { class: 'chips', role: 'tablist' },
      ...[[true, '바뀐 부분'], [false, '이때 모습']].map(([v, label]) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': v ? 'true' : 'false',
        onclick: (e) => { showDiff = v; toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === e.currentTarget ? 'true' : 'false')); draw(); } }, label)));
    const revert = r.rev !== r.current && !state.me.banned ? h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
      if (!confirm(`${r.rev}번째 기록으로 되돌릴까요? 지금 내용도 기록에 남아 있어서 언제든 다시 돌아올 수 있어요.`)) return;
      try { await api(`/notes/${id}/revert`, { method: 'POST', body: { rev: r.rev } }); toast('되돌렸어요'); location.hash = `#/notes/${id}`; } catch (e) { toast(e.message); }
    } }, '이 기록으로 되돌리기') : null;
    app.replaceChildren(shell('notes', [
      h('a', { class: 'back', href: `#/notes/${id}/history` }, svg(ICON.back), '고친 기록'),
      h('article', { class: 'card post note edge' },
        h('div', { class: 'item-tags' }, h('span', { class: 'tag' }, `${r.rev}번째 기록`), r.rev === r.current ? h('span', { class: 'tag vis-public' }, '지금') : null),
        h('h2', {}, r.title),
        h('div', { class: 'meta' }, h('span', {}, `${r.who} · ${ago(r.createdAt)}${r.summary ? ` · ${r.summary}` : ''}`), revert),
        toggle, area)]));
    draw();
  } catch (e) {
    app.replaceChildren(shell('notes', [h('a', { class: 'back', href: `#/notes/${id}` }, svg(ICON.back), '정리로'), h('div', { class: 'card empty' }, e.message)]));
  }
}

// ---------- 라우팅 ----------
window.addEventListener('beforeunload', (e) => { if (state.editorDirty?.()) { e.preventDefault(); e.returnValue = ''; } });
async function render() {
  const hash = location.hash || '#/';
  // 정리를 쓰다가 저장 안 하고 나가려 하면 확인
  if (state.editorDirty && hash !== state.curHash) {
    if (state.editorDirty() && !confirm('저장하지 않은 내용이 있어요. 나갈까요? (임시 저장은 남아 있어요)')) { history.replaceState(null, '', state.curHash); return; }
    state.editorDirty = null;
  }
  state.curHash = hash;
  if (!state.me && hash !== '#/join') {
    try { state.me = await api('/me'); } catch { return; }
  }
  if (hash === '#/join') return joinView();
  refreshAlerts();
  const m = hash.match(/^#\/post\/(\d+)$/);
  if (m) return postView(m[1]);
  if (hash === '#/settings') return settingsView();
  if (hash === '#/admin') return adminView();
  if (hash === '#/alerts') return alertsView();
  const pm = hash.match(/^#\/u\/([0-9a-f]+)$/);
  if (pm) return profileView(pm[1]);
  if (hash === '#/notes') return notesView();
  let nm;
  if ((nm = hash.match(/^#\/notes\/new(?:\/(\d+))?$/))) return noteEditor(null, nm[1]);
  if ((nm = hash.match(/^#\/notes\/(\d+)\/edit$/))) return noteEditor(nm[1]);
  if ((nm = hash.match(/^#\/notes\/(\d+)\/history(?:\/(\d+))?$/))) return noteHistoryView(nm[1], nm[2]);
  if ((nm = hash.match(/^#\/notes\/(\d+)$/))) return noteView(nm[1]);
  const au = hash.match(/^#\/admin\/user\/([0-9a-f]+)$/);
  if (au) return adminUserView(au[1]);
  return listView();
}
window.addEventListener('hashchange', render);
render();
