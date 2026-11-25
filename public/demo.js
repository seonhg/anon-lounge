// 익명 라운지 체험판: 진짜 서버 대신 브라우저 안에서 예시 데이터로 대답하는 가짜 서버.
// 실제 사이트의 데이터와는 완전히 분리돼 있고, 써 본 내용은 새로고침하면 사라져요.
(function () {
  'use strict';
  window.AL_DEMO = true;
  const now = Date.now();
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const realFetch = window.fetch.bind(window);

  // ---------- 예시 그림 (가짜 화면 캡처, SVG) ----------
  const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const shot = (title, lines, accent) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="460" viewBox="0 0 800 460">
<rect width="800" height="460" rx="14" fill="#1E1B2E"/><rect width="800" height="40" rx="14" fill="#2B2742"/><rect y="26" width="800" height="14" fill="#2B2742"/>
<circle cx="24" cy="20" r="7" fill="#FF5F57"/><circle cx="46" cy="20" r="7" fill="#FEBC2E"/><circle cx="68" cy="20" r="7" fill="#28C840"/>
<text x="400" y="26" fill="#B9B4D6" font-family="Consolas,monospace" font-size="15" text-anchor="middle">${title}</text>
${lines.map((l, i) => `<text x="28" y="${84 + i * 32}" fill="${l[1] || '#E8E6F5'}" font-family="Consolas,Menlo,monospace" font-size="19">${l[0].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('')}
<rect x="20" y="${70 + lines.length * 32}" width="10" height="22" fill="${accent}"/></svg>`);
  const IMG = {
    e429: shot('python — chat.py', [['$ python chat.py', '#9AE6B4'], ['Traceback (most recent call last):'], ['  File "chat.py", line 18, in <module>'], ['    resp = client.chat.completions.create('], ['openai.RateLimitError: Error code: 429', '#FF8FA3'], ["  {'error': {'code': '429', 'message':", '#FF8FA3'], ["   'Requests to the ChatCompletions_Create", '#FF8FA3'], ["    Operation ... have exceeded token rate", '#FF8FA3'], ["    limit of your current OpenAI S0 tier.'}}", '#FF8FA3']], '#FF8FA3'),
    deploy: shot('Azure AI Foundry — 배포', [['배포 이름          모델            상태', '#B9B4D6'], ['─────────────────────────────────────', '#4B4470'], ['gpt-4o-mini-lab   gpt-4o-mini     ✔ 성공', '#9AE6B4'], ['embed-small       text-embedding  ✔ 성공', '#9AE6B4'], [''], ['엔드포인트: https://my-lab.openai.azure.com/', '#C4B5FD'], ['키: ••••••••••••••••••••', '#C4B5FD']], '#9AE6B4'),
    git: shot('git — terminal', [['$ git pull origin main', '#9AE6B4'], ['Auto-merging app.py'], ['CONFLICT (content): Merge conflict in app.py', '#FF8FA3'], ['Automatic merge failed; fix conflicts and', '#FF8FA3'], ['then commit the result.', '#FF8FA3'], [''], ['<<<<<<< HEAD', '#FEBC2E'], ['model = "gpt-4o-mini"'], ['=======', '#FEBC2E'], ['model = "gpt-4o"'], ['>>>>>>> origin/main', '#FEBC2E']], '#FEBC2E'),
    cuda: shot('jupyter — train.ipynb', [['In [7]: model.to("cuda")', '#9AE6B4'], [''], ['RuntimeError: CUDA out of memory.', '#FF8FA3'], ['Tried to allocate 2.00 GiB (GPU 0;', '#FF8FA3'], ['15.77 GiB total capacity; 13.20 GiB', '#FF8FA3'], ['already allocated)', '#FF8FA3'], [''], ['batch_size = 64', '#C4B5FD']], '#FF8FA3'),
  };

  // ---------- 사람들 ----------
  const U = (id, o = {}) => ({ id, is_admin: 0, is_owner: 0, banned: 0, real_name: null, show_real: 0, created_at: now - 60 * DAY, last_seen_at: now - Math.random() * 3 * DAY, has_recovery: 1, profile: null, ...o });
  const users = [
    U('d0me00000001', { is_admin: 1, is_owner: 1, created_at: now - 75 * DAY, last_seen_at: now }),
    U('a1b2c3000002'), U('7f3e9a000003'), U('c0ffee000004'), U('5d6e7f000005'),
    U('9a8b7c000006', { real_name: '박하늘', show_real: 1, profile: { bio: '데이터 분석가를 꿈꾸는 중 📊 질문 환영해요', emoji: '🦉', color: 'blue', tags: ['Python', 'Pandas', '시각화'], links: [{ label: 'GitHub', url: 'https://github.com/' }], avatar: 'emoji', showPosts: true, slug: 'b1a2c3d4e5f6' } }),
    U('4e5f6a000007', { real_name: '이도윤', show_real: 1, profile: { bio: '프론트엔드 + AI 서비스 만들기 🚀', emoji: '🦊', color: 'pink', tags: ['React', 'Azure', 'UX'], links: [{ label: '블로그', url: 'https://example.com/' }], avatar: 'emoji', showPosts: true, slug: 'f6e5d4c3b2a1' } }),
    U('3c4d5e000008', { banned: 0 }),
  ];
  const ME = users[0];
  const me = { mySubject: 10, realName: '', showReal: false, profile: { bio: '', emoji: '🙂', color: 'violet', tags: [], links: [], avatar: 'emoji', showPosts: true, slug: 'deadbeef0001', image: null } };
  const byId = (id) => users.find((u) => u.id === id);
  const tagOf = (id) => '#' + id.slice(0, 6);

  // ---------- 글·답변 ----------
  let seq = 100;
  const posts = [];
  const answers = [];
  const images = {}; // id → url
  const P = (o) => { const p = { id: ++seq, deleted: 0, help_count: 0, helps: new Set(), media: [], images: [], edited_at: 0, author_name: null, body: '', ...o }; posts.push(p); return p; };
  const A = (post, o) => { const a = { id: ++seq, post_id: post.id, deleted: 0, help_count: 0, helps: new Set(), media: [], images: [], author_name: null, parent_id: null, ...o }; answers.push(a); return a; };
  const addImg = (url) => { const id = ++seq; images[id] = url; return id; };
  const nameOf = (uid) => { const u = byId(uid); return u && u.show_real && u.real_name ? u.real_name : null; };

  const p1 = P({ user_id: 'a1b2c3000002', cat: '질문', subject: 10, title: '실습하다가 429 에러가 계속 나요 ㅠㅠ', body: '채팅 예제 돌리면 몇 번은 되다가 갑자기 429가 떠요.\n토큰 한도 같은 걸 어디서 늘리나요?', created_at: now - 3 * HOUR, help_count: 4, images: [addImg(IMG.e429)] });
  const a11 = A(p1, { user_id: '9a8b7c000006', author_name: '박하늘', body: '배포 화면에서 "분당 토큰 수(TPM)"를 올리면 돼요! 무료 구독은 한도가 낮아서, 요청 사이에 time.sleep(1) 넣는 것도 방법이에요.', created_at: now - 2.5 * HOUR, help_count: 6 });
  A(p1, { user_id: 'a1b2c3000002', body: '헐 배포 설정에 있었네요. 올리니까 됩니다! 감사해요 🙏', created_at: now - 2.2 * HOUR, parent_id: a11.id, media: [{ type: 'sticker', id: 'thanks' }] });
  A(p1, { user_id: 'c0ffee000004', body: '저도 같은 문제였는데 실패하면 1초, 2초, 4초… 늘려가며 다시 보내는 재시도 코드(exponential backoff)를 넣으니 안정적이었어요. 정리 탭에 예시 코드 올려둘게요!', created_at: now - 2 * HOUR, help_count: 2 });

  const p2 = P({ user_id: '7f3e9a000003', cat: '질문', subject: 10, title: '배포 이름이랑 모델 이름이 다른 거죠?', body: '코드에 model="gpt-4o-mini" 라고 썼는데 DeploymentNotFound가 떠요. 배포 이름을 넣어야 하는 건가요?', created_at: now - 7 * HOUR, help_count: 3, images: [addImg(IMG.deploy)] });
  A(p2, { user_id: '4e5f6a000007', author_name: '이도윤', body: '네! Azure에서는 model 자리에 "배포 이름"을 넣어야 해요. 캡처 기준이면 gpt-4o-mini-lab 이요.', created_at: now - 6.5 * HOUR, help_count: 5 });
  A(p2, { user_id: '7f3e9a000003', body: '와 바로 해결됐어요. 감사합니다!!', created_at: now - 6 * HOUR, media: [{ type: 'sticker', id: 'gotit' }] });

  const p3 = P({ user_id: '5d6e7f000005', cat: '질문', subject: 9, title: '깃 충돌 났는데 어떻게 고치나요', body: '팀원이랑 같은 파일 고쳤더니 이렇게 나와요.', created_at: now - 2 * DAY, help_count: 2, images: [addImg(IMG.git)] });
  A(p3, { user_id: 'd0me00000001', body: '<<<<<<< 부터 >>>>>>> 까지 중에 남길 줄만 남기고 표시 줄은 지운 다음 git add → git commit 하면 돼요. VS Code에서 "Accept Current/Incoming" 버튼 누르는 게 제일 편해요!', created_at: now - 2 * DAY + 40 * MIN, help_count: 3 });

  P({ user_id: 'c0ffee000004', cat: '질문', subject: 8, title: 'CUDA out of memory 해결법 있을까요', body: 'batch_size 64로 돌리면 메모리 부족이 떠요. 줄이는 것 말고 방법이 있나요?', created_at: now - 4 * DAY, help_count: 1, images: [addImg(IMG.cuda)] });

  const p5 = P({ user_id: '3c4d5e000008', cat: '잡담', subject: 0, title: '오늘 실습 다들 몇 시에 끝났어요? 😂', body: '저는 9시까지 붙잡고 있었네요…', created_at: now - 50 * MIN, media: [{ type: 'sticker', id: 'sleepy' }] });
  A(p5, { user_id: 'a1b2c3000002', body: '저도요 ㅋㅋ 내일 커피 필수', created_at: now - 40 * MIN, media: [{ type: 'sticker', id: 'coffee' }] });
  P({ user_id: '9a8b7c000006', author_name: '박하늘', cat: '잡담', subject: 0, title: '주말에 같이 복습 스터디 하실 분!', body: '토요일 오후에 온라인으로 LLM 활용 복습해요. 편하게 오세요 📚', created_at: now - 1.2 * DAY, help_count: 2 });
  P({ user_id: '4e5f6a000007', author_name: '이도윤', cat: '건의', subject: 0, title: '다크 모드 너무 좋아요 + 정리에 표 기능도 있으면', body: '정리 쓸 때 표도 넣을 수 있으면 좋겠어요!', created_at: now - 3 * DAY, help_count: 1 });

  // ---------- 정리 ----------
  const notes = [];
  const N = (o, revs) => {
    const n = { id: ++seq, deleted: 0, visibility: 'public', help_count: 0, helps: new Set(), created_at: revs[0].at, ...o };
    n.revisions = revs.map((r, i) => ({ rev: i + 1, user_id: r.by, title: r.title || o.title, body: r.body, summary: r.summary || null, created_at: r.at, added: r.added ?? 40 }));
    const last = n.revisions[n.revisions.length - 1];
    Object.assign(n, { rev: last.rev, title: last.title, body: last.body, updated_at: last.created_at, last_editor: last.user_id });
    notes.push(n); return n;
  };
  const NOTE1_V1 = `## Azure OpenAI 시작하기
Azure OpenAI는 **배포**를 먼저 만들어야 쓸 수 있어요.[*Azure AI Foundry → 배포 메뉴]

### 준비물
- 엔드포인트 주소
- API 키
- 배포 이름

## 코드로 부르기
\`\`\`
from openai import AzureOpenAI
client = AzureOpenAI(api_version="2024-10-21")
resp = client.chat.completions.create(model="배포 이름", messages=[...])
\`\`\``;
  const NOTE1_V2 = NOTE1_V1 + `

## 자주 하는 실수
> model 자리에는 모델 이름이 아니라 **배포 이름**을 넣어요!
- \`DeploymentNotFound\` → 배포 이름 오타
- \`429\` → 분당 토큰 한도(TPM) 초과[*배포 설정에서 올리거나, 재시도 코드를 넣어요]`;
  const NOTE1_V3 = NOTE1_V2 + `

## 비용 아끼기
- 실습 끝나면 안 쓰는 배포는 지우기
- 긴 대화는 요약해서 토큰 줄이기`;
  const n1 = N({ user_id: 'a1b2c3000002', subject: 10, title: 'Azure OpenAI 핵심 정리', help_count: 7 }, [
    { by: 'a1b2c3000002', body: NOTE1_V1, at: now - 3 * DAY, summary: '처음 작성', added: 300 },
    { by: '4e5f6a000007', body: NOTE1_V2, at: now - 2 * DAY, summary: '자주 하는 실수 추가', added: 120 },
    { by: 'c0ffee000004', body: NOTE1_V3, at: now - 5 * HOUR, summary: '비용 아끼기 추가', added: 45 },
  ]);
  n1.helps = new Set(['5d6e7f000005', '3c4d5e000008']);
  N({ user_id: '9a8b7c000006', subject: 9, title: 'Git 협업 치트시트', help_count: 3 }, [
    { by: '9a8b7c000006', at: now - 6 * DAY, summary: '처음 작성', body: `## 매일 쓰는 명령
1. \`git pull\` — 받아오기
2. \`git add .\` → \`git commit -m "메시지"\`
3. \`git push\`

## 충돌 났을 때
<<<<<<< 와 >>>>>>> 사이에서 남길 줄만 남기고 표시는 지워요.[*VS Code의 Accept 버튼이 편해요]` },
  ]);
  N({ user_id: 'd0me00000001', subject: 10, title: '내 노트: 프롬프트 플로우 메모', visibility: 'private' }, [
    { by: 'd0me00000001', at: now - DAY, summary: '처음 작성', body: `## 오늘 배운 것
- 프롬프트 플로우 = 노드를 이어서 LLM 앱 만들기
- **변수**는 {{ }} 로 넘김

## 내일 다시 볼 것
- 평가(Evaluation) 플로우` },
  ]);


  // ---------- 해결 기록 ----------
  const fixes = [];
  const F = (o) => { const f = { id: ++seq, deleted: 0, env: '', cause: '', solution: '', metoo: new Set(), author_name: null, solved_name: null, from_post_id: null, ...o }; f.updated_at = f.updated_at || f.created_at; fixes.push(f); return f; };
  F({ user_id: 'a1b2c3000002', subject: 10, title: '채팅 실습 중 429 RateLimitError', created_at: now - 2 * HOUR, from_post_id: p1.id,
    symptom: "openai.RateLimitError: Error code: 429\n{'error': {'code': '429', 'message': 'Requests to the ChatCompletions_Create Operation ... have exceeded token rate limit of your current OpenAI S0 tier.'}}",
    env: 'Azure OpenAI · gpt-4o-mini · 무료 체험 구독', cause: '배포의 **분당 토큰 수(TPM)** 한도가 낮게 잡혀 있어서, 연속으로 요청하면 한도를 넘어요.',
    solution: '1. Azure AI Foundry → 배포 → 해당 배포 편집 → **TPM**을 올려요.\n2. 그래도 나면 실패할 때 1초, 2초, 4초… 늘려가며 다시 보내요.\n```python\nfor i in range(5):\n    try:\n        return client.chat.completions.create(...)\n    except RateLimitError:\n        time.sleep(2 ** i)\n```',
    solved_name: '박하늘', metoo: new Set(['7f3e9a000003', 'c0ffee000004', '5d6e7f000005', '3c4d5e000008']) });
  F({ user_id: '7f3e9a000003', subject: 10, title: 'DeploymentNotFound — 모델 이름을 넣었는데 안 돼요', created_at: now - 6 * HOUR,
    symptom: 'openai.NotFoundError: Error code: 404 - {\'error\': {\'code\': \'DeploymentNotFound\', \'message\': \'The API deployment for this resource does not exist.\'}}',
    env: 'Python 3.11 · openai 1.x · AzureOpenAI 클라이언트', cause: 'Azure에서는 `model=` 자리에 **모델 이름이 아니라 배포 이름**을 넣어야 해요.',
    solution: '배포 화면에서 배포 이름(예: `gpt-4o-mini-lab`)을 확인해서 `model="gpt-4o-mini-lab"`으로 바꿔요.', author_name: null, metoo: new Set(['a1b2c3000002', 'c0ffee000004']) });
  F({ user_id: 'c0ffee000004', subject: 8, title: '학습 중 CUDA out of memory', created_at: now - 20 * HOUR,
    symptom: 'RuntimeError: CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; 15.77 GiB total capacity; 13.20 GiB already allocated)',
    env: 'Colab T4 · PyTorch 2.3 · batch_size 64', metoo: new Set(['5d6e7f000005']) });
  F({ user_id: '5d6e7f000005', subject: 9, title: 'git pull 하니까 Merge conflict', created_at: now - 2 * DAY, from_post_id: p3.id,
    symptom: 'CONFLICT (content): Merge conflict in app.py\nAutomatic merge failed; fix conflicts and then commit the result.',
    env: 'VS Code · Git 2.45', cause: '팀원과 같은 파일의 같은 줄을 동시에 고쳤어요.',
    solution: '`<<<<<<<` ~ `>>>>>>>` 사이에서 남길 줄만 남기고 표시 줄은 지운 뒤 `git add` → `git commit` 해요. VS Code의 **Accept Current / Incoming** 버튼이 편해요.', metoo: new Set(['a1b2c3000002']) });
  F({ user_id: '4e5f6a000007', author_name: '이도윤', subject: 4, title: 'Codespaces에서 포트 열었는데 페이지가 안 떠요', created_at: now - 3 * DAY,
    symptom: '브라우저에서 "This site can’t be reached" — 포트 탭에는 5000이 보이는데 접속이 안 돼요.',
    env: 'GitHub Codespaces · Flask', cause: 'Flask가 기본으로 127.0.0.1에서만 들어요.', solution: '`app.run(host="0.0.0.0", port=5000)`으로 실행하고, 포트 탭에서 공개 범위를 확인해요.', solved_name: '이도윤' });

  // ---------- 알림 ----------
  const notifs = [
    { id: ++seq, user_id: ME.id, kind: 'answer', post_id: p3.id, answer_id: null, created_at: now - 2 * DAY + 50 * MIN, read_at: now - DAY },
  ];
  const myQ = P({ user_id: ME.id, cat: '질문', subject: 10, title: '임베딩 모델은 어떤 걸 쓰는 게 좋아요?', body: 'RAG 실습할 때 text-embedding-3-small이랑 large 중에 고민돼요.', created_at: now - 30 * MIN });
  const ra = A(myQ, { user_id: '4e5f6a000007', author_name: '이도윤', body: '실습이면 small로 충분해요! 비용도 훨씬 싸고 한국어도 잘 돼요.', created_at: now - 12 * MIN, help_count: 1 });
  notifs.push({ id: ++seq, user_id: ME.id, kind: 'answer', post_id: myQ.id, answer_id: ra.id, created_at: now - 12 * MIN, read_at: 0 });
  notifs.push({ id: ++seq, user_id: ME.id, kind: 'note_edit', post_id: n1.id, answer_id: null, created_at: now - 5 * HOUR, read_at: 0 });
  const reads = {}; // subject → seen_at

  // ---------- 도구 ----------
  const TIERS = [['브론즈', 0], ['실버', 20], ['골드', 60], ['플래티넘', 150], ['다이아', 300]];
  const tierOf = (pts) => { let t = 0; TIERS.forEach((x, i) => { if (pts >= x[1]) t = i; }); const nx = TIERS[t + 1]; return { name: TIERS[t][0], points: pts, next: nx ? { name: nx[0], need: nx[1] - pts } : null }; };
  const credited = (n, uid) => n.user_id === uid || n.revisions.filter((r) => r.user_id === uid).reduce((s, r) => s + r.added, 0) >= 20;
  const helpsOf = (uid) => posts.filter((p) => p.user_id === uid && !p.deleted).reduce((s, p) => s + p.help_count, 0)
    + answers.filter((a) => a.user_id === uid && !a.deleted).reduce((s, a) => s + a.help_count, 0)
    + notes.filter((n) => !n.deleted && n.visibility === 'public' && credited(n, uid)).reduce((s, n) => s + [...n.helps].filter((h) => h !== uid).length, 0);
  const profCard = (u) => {
    if (u.id === ME.id) { if (!me.showReal || !me.realName) return null; return { slug: me.profile.slug, name: me.realName, emoji: me.profile.emoji, color: me.profile.color, image: me.profile.avatar === 'image' ? me.profile.image : null }; }
    if (!u.show_real || !u.real_name || !u.profile) return null;
    return { slug: u.profile.slug, name: u.real_name, emoji: u.profile.emoji, color: u.profile.color, image: null };
  };
  const meView = () => ({
    mySubject: me.mySubject, isAdmin: true, isOwner: true, banned: false, hasRecovery: true, passkeys: 0,
    realName: me.realName, showReal: me.showReal, tier: tierOf(helpsOf(ME.id)),
    profile: { ...me.profile, public: me.showReal && !!me.realName, hasImage: !!me.profile.image },
  });
  const LOCAL = { thanks: '감사합니다', fighting: '화이팅', wow: '대박', question: '질문있어요', gotit: '이해 완료', huh: '헐', lol: 'ㅋㅋㅋ', goodjob: '수고했어요', help: '도와주세요', best: '최고', error: '오류났어요', coffee: '커피 한잔', sleepy: '졸려요', congrats: '축하해요', ok: '알겠어요', deploy: '배포 성공' };
  const viewMedia = (list) => (list || []).map((m) => (m.type === 'sticker' ? { type: 'sticker', src: `/stickers/${m.id}.svg`, label: LOCAL[m.id] || '스티커', w: 200, h: 200 } : { ...m, label: 'GIF' }));
  const plain = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[\*[^\]]*\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#{1,4}\s+/gm, '').replace(/^\s*(?:[-*]|\d+\.|>)\s+/gm, '').replace(/[*`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const addedChars = (a, b) => { const old = new Set(String(a).split('\n').map((l) => l.trim())); let n = 0; for (const l of String(b).split('\n')) { const t = l.trim(); if (t && !old.has(t)) n += t.length; } return n; };
  const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const err = (status, msg) => ok({ error: msg }, status);
  const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
  const isGlobal = (c) => c === '잡담' || c === '건의';
  const postView = (p) => ({
    id: p.id, cat: p.cat, subject: p.subject, title: p.title, excerpt: p.body.slice(0, 120), author: p.author_name || '익명',
    answers: answers.filter((a) => a.post_id === p.id && !a.deleted).length, helps: p.help_count, createdAt: p.created_at,
    mine: p.user_id === ME.id, helped: p.helps.has(ME.id), hasImage: !!p.images.length, imageCount: p.images.length,
    thumb: p.images.length ? images[p.images[0]] : null, media: viewMedia(p.media),
    unread: false, tag: tagOf(p.user_id), uid: p.user_id, profile: p.author_name ? profCard(byId(p.user_id)) : null,
  });

  // ---------- 가짜 서버 ----------
  async function handle(method, path, query, body) {
    const parts = path.split('/').filter(Boolean);
    const [a0, a1, a2, a3] = parts;
    if (a0 === 'status') return ok({ closed: false });
    if (a0 === 'me' && !a1) {
      if (method === 'PATCH') {
        if (Number.isInteger(body.mySubject)) me.mySubject = body.mySubject;
        if (body.realName !== undefined) me.realName = clean(body.realName, 20);
        if (body.showReal !== undefined) me.showReal = !!body.showReal && !!me.realName;
        ME.real_name = me.realName || null; ME.show_real = me.showReal ? 1 : 0;
      }
      return ok(meView());
    }
    if (a0 === 'join' || a0 === 'recover') return ok({ ...meView(), recoveryCode: 'DEMO-ABCD-EFGH-JKLM' });
    if (a0 === 'logout') return ok({ ok: true });
    if (a0 === 'me' && a1 === 'recovery') return ok({ recoveryCode: 'DEMO-WXYZ-2345-6789' });
    if (a0 === 'me' && a1 === 'profile') {
      if (!me.showReal) return err(403, '실명으로 활동하기를 켜야 프로필을 꾸밀 수 있어요.');
      const p = me.profile;
      if (body.bio !== undefined) p.bio = clean(body.bio, 100);
      if (body.emoji) p.emoji = body.emoji;
      if (body.color) p.color = body.color;
      if (Array.isArray(body.tags)) p.tags = body.tags.slice(0, 5);
      if (Array.isArray(body.links)) { if (body.links.some((l) => l.url && !/^https?:\/\//.test(l.url))) return err(400, '링크는 https:// 로 시작하는 주소만 넣을 수 있어요.'); p.links = body.links.slice(0, 3); }
      if (body.avatar) p.avatar = body.avatar === 'image' && p.image ? 'image' : 'emoji';
      if (body.showPosts !== undefined) p.showPosts = !!body.showPosts;
      return ok({ profile: meView().profile });
    }
    if (a0 === 'me' && a1 === 'avatar') {
      if (method === 'DELETE') { me.profile.image = null; me.profile.avatar = 'emoji'; }
      else { me.profile.image = URL.createObjectURL(body); me.profile.avatar = 'image'; }
      return ok({ profile: meView().profile });
    }
    if (a0 === 'passkeys') return ok({ passkeys: [] });
    if (a0 === 'passkey') return err(400, '체험판에서는 패스키를 쓸 수 없어요.');
    if (a0 === 'gifs') {
      const local = Object.entries(LOCAL).map(([id, label]) => ({ type: 'sticker', id, label, src: `/stickers/${id}.svg`, w: 200, h: 200 }));
      return ok({ enabled: false, items: [], local: query.get('kind') === 'stickers' ? local : undefined });
    }
    if (a0 === 'notifications') {
      const mine = notifs.filter((n) => n.user_id === ME.id);
      const alive = (n) => (n.kind === 'note_edit' ? notes.some((t) => t.id === n.post_id && !t.deleted) : posts.some((p) => p.id === n.post_id && !p.deleted));
      if (a1 === 'count') return ok({ unread: mine.filter((n) => !n.read_at && alive(n)).length });
      if (a1 === 'read') { mine.forEach((n) => { n.read_at = n.read_at || Date.now(); }); return ok({ ok: true }); }
      return ok({ notifications: mine.filter(alive).sort((x, y) => y.created_at - x.created_at).map((n) => {
        const t = n.kind === 'note_edit' ? notes.find((x) => x.id === n.post_id) : posts.find((x) => x.id === n.post_id);
        const an = answers.find((x) => x.id === n.answer_id);
        return { id: n.id, kind: n.kind, postId: n.post_id, postTitle: t.title, cat: t.cat, subject: t.subject, snippet: an ? an.body.slice(0, 80) : '', createdAt: n.created_at, read: !!n.read_at };
      }) });
    }
    if (a0 === 'subjects') {
      const unread = {};
      posts.filter((p) => !p.deleted && p.user_id !== ME.id && p.subject >= 1 && p.created_at > (reads[p.subject] ?? now - 9 * HOUR)).forEach((p) => { unread[p.subject] = (unread[p.subject] || 0) + 1; });
      return ok({ unread });
    }
    // 글
    if (a0 === 'posts' && !a1) {
      if (method === 'GET') {
        const sp = query.get('subject') || 'all'; const subject = sp === 'all' ? null : Number(sp); const cat = query.get('cat') || '전체';
        const seen = subject ? reads[subject] ?? now - 9 * HOUR : null;
        const list = posts.filter((p) => !p.deleted && (!subject || p.subject === subject || isGlobal(p.cat)) && (cat === '전체' || p.cat === cat))
          .sort((x, y) => y.created_at - x.created_at).map((p) => ({ ...postView(p), unread: seen !== null && p.user_id !== ME.id && p.created_at > seen }));
        if (subject) reads[subject] = Date.now();
        return ok({ posts: list });
      }
      const title = clean(body.title, 100); if (!title) return err(400, '제목을 써주세요.');
      const p = P({ user_id: ME.id, cat: body.cat, subject: isGlobal(body.cat) ? 0 : Number(body.subject), title, body: clean(body.body, 5000), author_name: nameOf(ME.id), created_at: Date.now(), media: body.media || [] });
      return ok({ id: p.id }, 201);
    }
    if (a0 === 'posts' && a1) {
      const p = posts.find((x) => x.id === Number(a1) && !x.deleted);
      if (!p) return err(404, '글을 찾을 수 없어요.');
      if (!a2 && method === 'GET') {
        notifs.forEach((n) => { if (n.post_id === p.id && n.kind !== 'note_edit') n.read_at = n.read_at || Date.now(); });
        const list = answers.filter((x) => x.post_id === p.id && (!x.deleted || (!x.parent_id && answers.some((c) => c.parent_id === x.id && !c.deleted)))).sort((x, y) => x.created_at - y.created_at);
        const nums = new Map();
        const label = (uid, nm) => { if (nm) return nm; if (uid === p.user_id) return '익명(글쓴이)'; if (!nums.has(uid)) nums.set(uid, nums.size + 1); return `익명${nums.get(uid)}`; };
        return ok({
          post: { id: p.id, cat: p.cat, subject: p.subject, title: p.title, body: p.body, author: p.author_name || '익명', createdAt: p.created_at, helps: p.help_count, helped: p.helps.has(ME.id), mine: p.user_id === ME.id, images: p.images.map((i) => images[i]), tag: tagOf(p.user_id), uid: p.user_id, editedAt: p.edited_at, media: viewMedia(p.media), profile: p.author_name ? profCard(byId(p.user_id)) : null },
          answers: list.map((x) => (x.deleted ? { id: x.id, parentId: null, deleted: true, body: '', author: '', createdAt: x.created_at, helps: 0, helped: false, mine: false, images: [] }
            : { id: x.id, parentId: x.parent_id, body: x.body, author: label(x.user_id, x.author_name), createdAt: x.created_at, helps: x.help_count, helped: x.helps.has(ME.id), mine: x.user_id === ME.id, images: x.images.map((i) => images[i]), tag: tagOf(x.user_id), uid: x.user_id, media: viewMedia(x.media), profile: x.author_name ? profCard(byId(x.user_id)) : null })),
          canModerate: true, banned: false,
        });
      }
      if (!a2 && method === 'PATCH') {
        if (body.cat) { p.cat = body.cat; p.subject = isGlobal(body.cat) ? 0 : Number(body.subject ?? p.subject) || me.mySubject; }
        if (p.user_id === ME.id) { if (body.title !== undefined) p.title = clean(body.title, 100); if (body.body !== undefined) p.body = clean(body.body, 5000); p.edited_at = Date.now(); }
        return ok({ ok: true });
      }
      if (!a2 && method === 'DELETE') { p.deleted = 1; return ok({ ok: true }); }
      if (a2 === 'answers' && method === 'POST') {
        let parent = body.parentId ? answers.find((x) => x.id === Number(body.parentId)) : null;
        if (parent && parent.parent_id) parent = answers.find((x) => x.id === parent.parent_id);
        const x = A(p, { user_id: ME.id, body: clean(body.body, 5000), author_name: nameOf(ME.id), created_at: Date.now(), parent_id: parent ? parent.id : null, media: body.media || [] });
        return ok({ id: x.id }, 201);
      }
    }
    if (a0 === 'answers' && a1 && method === 'DELETE') { const x = answers.find((y) => y.id === Number(a1)); if (x) x.deleted = 1; return ok({ ok: true }); }
    if (a0 === 'help') {
      const t = (body.type === 'post' ? posts : answers).find((x) => x.id === Number(body.id));
      if (!t) return err(404, '대상을 찾을 수 없어요.');
      if (t.user_id === ME.id) return err(400, '내 글에는 누를 수 없어요.');
      if (t.helps.has(ME.id)) { t.helps.delete(ME.id); t.help_count--; } else { t.helps.add(ME.id); t.help_count++; }
      return ok({ helped: t.helps.has(ME.id), helps: t.help_count });
    }
    if (a0 === 'images' && !a1 && method === 'POST') {
      const id = addImg(URL.createObjectURL(body));
      const t = (query.get('type') === 'post' ? posts : answers).find((x) => x.id === Number(query.get('id')));
      if (t) t.images.push(id);
      return ok({ id, url: images[id] }, 201);
    }
    if (a0 === 'images' && a1 && method === 'DELETE') {
      [...posts, ...answers].forEach((t) => { t.images = t.images.filter((i) => i !== Number(a1)); });
      return ok({ ok: true });
    }
    // 정리
    if (a0 === 'notes') {
      if (a1 === 'subjects') return ok({ unread: { 10: 1 } });
      if (!a1 && method === 'GET') {
        const scope = query.get('scope') === 'mine' ? 'mine' : 'public';
        const sp = query.get('subject') || 'all'; const subject = sp === 'all' ? null : Number(sp);
        const list = notes.filter((n) => !n.deleted && (scope === 'public' ? n.visibility === 'public' : n.user_id === ME.id) && (!subject || n.subject === subject))
          .sort((x, y) => y.updated_at - x.updated_at)
          .map((n) => ({ id: n.id, subject: n.subject, title: n.title, excerpt: plain(n.body), visibility: n.visibility, rev: n.rev, helps: n.helps.size || n.help_count, updatedAt: n.updated_at, createdAt: n.created_at, mine: n.user_id === ME.id, contributors: new Set(n.revisions.map((r) => r.user_id)).size, unread: n.last_editor !== ME.id && n.updated_at > now - 6 * HOUR, tag: tagOf(n.last_editor) }));
        return ok({ notes: list });
      }
      if (!a1 && method === 'POST') {
        const t = Date.now();
        const n = N({ user_id: ME.id, subject: Number(body.subject), title: clean(body.title, 100) || '제목 없음', visibility: body.visibility === 'public' ? 'public' : 'private' }, [{ by: ME.id, body: clean(body.body, 50000), at: t, summary: '처음 작성', added: addedChars('', body.body || '') }]);
        return ok({ id: n.id, rev: 1 }, 201);
      }
      const n = notes.find((x) => x.id === Number(a1) && !x.deleted);
      if (!n || (n.visibility !== 'public' && n.user_id !== ME.id)) return err(404, '정리를 찾을 수 없어요.');
      const mine = n.user_id === ME.id;
      const labels = () => { const m = new Map(); let k = 0; for (const r of n.revisions) if (!m.has(r.user_id)) m.set(r.user_id, nameOf(r.user_id) || (r.user_id === n.user_id ? '익명(작성자)' : `익명${++k}`)); return m; };
      const others = n.revisions.some((r) => r.user_id !== n.user_id);
      if (!a2 && method === 'GET') {
        notifs.forEach((x) => { if (x.kind === 'note_edit' && x.post_id === n.id) x.read_at = x.read_at || Date.now(); });
        const lab = labels(); const iContributed = n.revisions.some((r) => r.user_id === ME.id);
        return ok({
          note: { id: n.id, subject: n.subject, title: n.title, body: n.body, visibility: n.visibility, rev: n.rev, helps: n.helps.size || n.help_count, helped: n.helps.has(ME.id), createdAt: n.created_at, updatedAt: n.updated_at, mine, lastEditor: lab.get(n.last_editor),
            contributors: [...lab.entries()].map(([uid, name]) => ({ name, edits: n.revisions.filter((r) => r.user_id === uid).length, added: 0, credited: credited(n, uid), author: uid === n.user_id, me: uid === ME.id, tag: tagOf(uid), uid })),
            canHelp: n.visibility === 'public' && !iContributed, iContributed, tag: tagOf(n.user_id), uid: n.user_id },
          canEdit: true, canMakePrivate: mine && n.visibility === 'public' && !others, canMakePublic: mine && n.visibility !== 'public', canDelete: (mine && !others) || true,
        });
      }
      if (!a2 && method === 'PUT') {
        if (Number(body.baseRev) !== n.rev) return ok({ error: '그사이 다른 사람이 이 정리를 고쳤어요.', conflict: true, current: { rev: n.rev, title: n.title, body: n.body } }, 409);
        const title = clean(body.title, 100) || '제목 없음', b = clean(body.body, 50000);
        n.revisions.push({ rev: n.rev + 1, user_id: ME.id, title, body: b, summary: clean(body.summary, 60) || null, created_at: Date.now(), added: addedChars(n.body, b) });
        Object.assign(n, { rev: n.rev + 1, title, body: b, updated_at: Date.now(), last_editor: ME.id });
        return ok({ id: n.id, rev: n.rev });
      }
      if (!a2 && method === 'DELETE') { n.deleted = 1; return ok({ ok: true }); }
      if (a2 === 'visibility') { n.visibility = body.public ? 'public' : 'private'; return ok({ ok: true }); }
      if (a2 === 'help') {
        if (mine) return err(400, '내 정리에는 누를 수 없어요.');
        if (n.revisions.some((r) => r.user_id === ME.id)) return err(400, '함께 정리한 글에는 누를 수 없어요.');
        if (n.helps.has(ME.id)) n.helps.delete(ME.id); else n.helps.add(ME.id);
        return ok({ helped: n.helps.has(ME.id), helps: n.helps.size });
      }
      if (a2 === 'images' && method === 'POST') { const id = addImg(URL.createObjectURL(body)); return ok({ id, url: images[id] }, 201); }
      if (a2 === 'revisions') {
        const lab = labels();
        if (!a3) return ok({ current: n.rev, title: n.title, revisions: [...n.revisions].reverse().map((r) => { const prev = n.revisions[r.rev - 2]; return { rev: r.rev, who: lab.get(r.user_id), summary: r.summary || '', createdAt: r.created_at, size: r.body.length, delta: r.body.length - (prev ? prev.body.length : 0), me: r.user_id === ME.id }; }) });
        const r = n.revisions[Number(a3) - 1]; if (!r) return err(404, '그 기록이 없어요.');
        return ok({ rev: r.rev, title: r.title, body: r.body, prevBody: r.rev > 1 ? n.revisions[r.rev - 2].body : '', who: lab.get(r.user_id), summary: r.summary || '', createdAt: r.created_at, current: n.rev });
      }
      if (a2 === 'revert') {
        const r = n.revisions[Number(body.rev) - 1];
        n.revisions.push({ rev: n.rev + 1, user_id: ME.id, title: r.title, body: r.body, summary: `${r.rev}번 기록으로 되돌림`, created_at: Date.now(), added: 0 });
        Object.assign(n, { rev: n.rev + 1, title: r.title, body: r.body, updated_at: Date.now(), last_editor: ME.id });
        return ok({ id: n.id, rev: n.rev });
      }
    }
    // 프로필
    if (a0 === 'profiles') {
      const u = a1 === me.profile.slug ? ME : users.find((x) => x.profile && x.profile.slug === a1);
      const card = u && profCard(u);
      if (!card) return err(404, '프로필을 볼 수 없어요. 실명 활동을 끈 사용자예요.');
      const pf = u === ME ? me.profile : u.profile;
      const isMe = u === ME;
      const own = posts.filter((p) => p.user_id === u.id && p.author_name && !p.deleted);
      const ans = answers.filter((x) => x.user_id === u.id && x.author_name && !x.deleted);
      const profile = { ...card, bio: pf.bio, tags: pf.tags, links: pf.links, me: isMe };
      if (!pf.showPosts && !isMe) return ok({ profile, postsHidden: true, stats: null, posts: [] });
      return ok({ profile, postsHidden: false, privateToOthers: !pf.showPosts,
        stats: { posts: own.length, answers: ans.length, helps: own.reduce((s, p) => s + p.help_count, 0) + ans.reduce((s, x) => s + x.help_count, 0) },
        posts: own.sort((x, y) => y.created_at - x.created_at).map((p) => ({ id: p.id, cat: p.cat, subject: p.subject, title: p.title, answers: answers.filter((x) => x.post_id === p.id && !x.deleted).length, helps: p.help_count, createdAt: p.created_at })) });
    }
    // 해결
    if (a0 === 'fixes') {
      const fview = (f) => ({ id: f.id, subject: f.subject, title: f.title, symptom: f.symptom.slice(0, 200), env: f.env, solved: !!f.solution, metoo: f.metoo.size, iMetoo: f.metoo.has(ME.id),
        mine: f.user_id === ME.id, author: f.author_name || '익명', createdAt: f.created_at, updatedAt: f.updated_at, tag: tagOf(f.user_id), uid: f.user_id });
      if (!a1 && method === 'GET') {
        const sp = query.get('subject') || 'all', st = query.get('status') || 'all', q = (query.get('q') || '').trim().toLowerCase();
        let list = fixes.filter((f) => !f.deleted && (sp === 'all' || f.subject === Number(sp)) && (st === 'all' || (st === 'solved') === !!f.solution)
          && (!q || [f.title, f.symptom, f.env, f.cause, f.solution].some((t) => t.toLowerCase().includes(q))));
        list = list.sort((x, y) => (query.get('sort') === 'metoo' ? y.metoo.size - x.metoo.size : 0) || y.updated_at - x.updated_at);
        return ok({ fixes: list.map(fview) });
      }
      if (!a1 && method === 'POST') {
        const title = clean(body.title, 100), symptom = clean(body.symptom, 5000);
        if (!title) return err(400, '제목을 써주세요.');
        if (!symptom) return err(400, '증상(에러 메시지나 막힌 상황)을 써주세요.');
        const solution = clean(body.solution, 10000);
        const f = F({ user_id: ME.id, author_name: me.showReal ? me.realName : null, subject: Number(body.subject) || me.mySubject, title, symptom, env: clean(body.env, 300), cause: clean(body.cause, 5000), solution,
          solved_name: solution && me.showReal ? me.realName : null, from_post_id: body.fromPost || null, created_at: Date.now() });
        return ok({ id: f.id });
      }
      const f = fixes.find((x) => x.id === Number(a1) && !x.deleted);
      if (!f) return err(404, '지워졌거나 없는 기록이에요.');
      if (a2 === 'metoo') { f.metoo.has(ME.id) ? f.metoo.delete(ME.id) : f.metoo.add(ME.id); return ok({ metoo: f.metoo.size, iMetoo: f.metoo.has(ME.id) }); }
      if (method === 'GET') {
        const fp = f.from_post_id && posts.find((p) => p.id === f.from_post_id && !p.deleted);
        return ok({ fix: { ...fview(f), symptom: f.symptom, cause: f.cause, solution: f.solution, solvedBy: f.solution ? (f.solved_name || f.author_name || '익명') : null, fromPost: fp ? { id: fp.id, title: fp.title } : null },
          canEdit: true, canEditAll: true, canDelete: true });
      }
      if (method === 'PATCH') {
        for (const [k, m] of [['title', 100], ['symptom', 5000], ['env', 300], ['cause', 5000], ['solution', 10000]]) if (k in body) f[k] = clean(body[k], m);
        if ('subject' in body) f.subject = Number(body.subject);
        f.updated_at = Date.now();
        return ok({ ok: true, solved: !!f.solution });
      }
      if (method === 'DELETE') { f.deleted = 1; return ok({ ok: true }); }
    }
    // 운영
    if (a0 === 'admin') {
      if (a1 === 'settings') return method === 'PATCH' ? err(400, '체험판에서는 사이트를 닫을 수 없어요.') : ok({ closed: false, canChange: true });
      if (a1 === 'users' && !a2) return ok({ canAssignAdmins: true, users: users.map((u) => ({ id: u.id, tag: tagOf(u.id), isAdmin: !!u.is_admin, isOwner: !!u.is_owner, banned: !!u.banned, me: u === ME, createdAt: u.created_at, lastSeenAt: u.last_seen_at,
        posts: posts.filter((p) => p.user_id === u.id && !p.deleted).length, answers: answers.filter((x) => x.user_id === u.id && !x.deleted).length, helps: helpsOf(u.id), hasRecovery: true, passkeys: 0 })) });
      if (a1 === 'users' && a2 && a3 === 'activity') {
        const u = byId(a2); if (!u) return err(404, '사용자를 찾을 수 없어요.');
        return ok({ user: { id: u.id, tag: tagOf(u.id), isAdmin: !!u.is_admin, isOwner: !!u.is_owner, banned: !!u.banned, createdAt: u.created_at, lastSeenAt: u.last_seen_at, me: u === ME },
          posts: posts.filter((p) => p.user_id === u.id).map((p) => ({ id: p.id, cat: p.cat, subject: p.subject, title: p.title, excerpt: p.body.slice(0, 120), realName: p.author_name, answers: answers.filter((x) => x.post_id === p.id).length, helps: p.help_count, images: p.images.length, deleted: !!p.deleted, createdAt: p.created_at })),
          answers: answers.filter((x) => x.user_id === u.id).map((x) => { const p = posts.find((y) => y.id === x.post_id); return { id: x.id, isReply: !!x.parent_id, postId: x.post_id, postTitle: p.title, postDeleted: !!p.deleted, excerpt: x.body.slice(0, 160), realName: x.author_name, helps: x.help_count, images: x.images.length, deleted: !!x.deleted, createdAt: x.created_at }; }) });
      }
      if (a1 === 'users' && a2 && method === 'PATCH') {
        const u = byId(a2); if (!u || u === ME || u.is_owner) return err(400, '바꿀 수 없어요.');
        if (body.admin !== undefined) u.is_admin = body.admin ? 1 : 0;
        if (body.banned !== undefined) { u.banned = body.banned ? 1 : 0; if (u.banned) u.is_admin = 0; }
        return ok({ ok: true });
      }
    }
    return err(404, '체험판에서는 지원하지 않는 기능이에요.');
  }

  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (body === undefined || body === null) body = {};
    await new Promise((r) => setTimeout(r, 60)); // 진짜 서버처럼 아주 살짝 기다림
    try { return await handle(method, url.pathname.replace(/^\/api/, ''), url.searchParams, body); }
    catch (e) { console.warn('체험판 가짜 서버 오류', e); return err(500, '체험판에서 문제가 생겼어요.'); }
  };
})();
