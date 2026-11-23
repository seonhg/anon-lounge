import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8788'
OUT = SHOTS.rstrip('/')
errors = []
results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

PASTE_JS = """async (sel) => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 700;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,1200,700);
  g.fillStyle = '#d93036'; g.fillRect(40,200,1120,120); g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText('Error 401: Unauthorized', 60, 280);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `hsl(${i % 360},70%,60%)`; g.fillRect(Math.random()*1200, 400 + Math.random()*300, 6, 6); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'capture.png', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(file);
  const target = document.querySelector(sel);
  target.focus();
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return blob.size;
}"""

def new_user(browser, w=1280, h=900):
    ctx = browser.new_context(viewport={'width': w, 'height': h})
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))
    return ctx, page

def close_modal(page):
    page.wait_for_selector('.rc-code', timeout=5000)
    code = page.inner_text('.rc-code').strip()
    page.check('#rc-ok'); page.click('.modal .btn:not(.ghost)')
    page.wait_for_selector('.subj', timeout=5000)
    return code

def join(page, code):
    page.goto(BASE + '/')
    page.wait_for_selector('#code')
    page.fill('#code', code)
    page.click('button[type=submit]')
    return close_modal(page)


def openc(pg):
    if pg.locator('.compose-open').count(): pg.click('.compose-open'); pg.wait_for_selector('.title-in')

with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])

    # 1. 잘못된 코드
    ca, A = new_user(b)
    A.goto(BASE + '/'); A.wait_for_selector('#code'); A.fill('#code', 'nope'); A.click('button[type=submit]')
    A.wait_for_timeout(400)
    check('잘못된 초대 코드는 막힘', '맞지 않아요' in A.inner_text('.err'))

    # 2. A 입장 + 캡처 붙여넣어 질문
    A.fill('#code', 'test-code'); A.click('button[type=submit]')
    A.wait_for_selector('.rc-code'); A.screenshot(path=f'{SHOTS}0_recovery_modal.png')
    check('입장하면 복구 코드 창, 체크 전엔 닫기 버튼 잠김', A.locator('.modal .btn:not(.ghost)').is_disabled())
    RC_A = close_modal(A)
    check('입장 후 질문 탭, 내 과목(10) 선택됨', A.get_attribute('.subj.now', 'aria-pressed') == 'true')
    openc(A); A.fill('.title-in', '배포할 때 키 설정에서 401이 떠요')
    A.fill('.body-in', 'Azure OpenAI 키를 넣었는데 401이 나와요.\n환경변수 이름이 틀렸을까요?')
    raw = A.evaluate(PASTE_JS, '.body-in')
    A.wait_for_selector('.thumb img', timeout=5000)
    check('캡처 붙여넣기 → 미리보기 생김', A.locator('.thumb').count() == 1, f'원본 PNG {raw//1024}KB')
    A.screenshot(path=f'{SHOTS}1_compose_pc.png')
    A.click('.comp-foot .btn'); A.wait_for_selector('.item-title', timeout=5000)
    check('질문이 목록에 올라감', '401' in A.inner_text('.list'))
    check('목록에 캡처 미리보기 표시', A.locator('.list .item-thumb img').count() == 1)
    check('내 글은 도움됐어요 못 누름', A.locator('.list .help').first.is_disabled())

    # 3. B 입장 → A가 새 글을 올리면 B에게 안 읽은 표시
    cb, B = new_user(b, 390, 844)
    join(B, 'test-code')
    A.wait_for_timeout(15500)  # 도배 방지 시간
    openc(A); A.fill('.title-in', 'Prompt Flow 연결이 자꾸 끊겨요'); A.click('.comp-foot .btn'); A.wait_for_timeout(600)
    print('   A toast:', A.inner_text('#toast'), '| B api:', B.evaluate("fetch('/api/subjects').then(r=>r.json())"))
    B.click('.subj[data-key="all"]'); B.wait_for_timeout(600)
    badge = B.locator('.subj[data-key="10"] .badge')
    check('다른 사람 새 글 → 과목 10에 빨간 숫자', badge.count() == 1 and badge.inner_text() == '1', badge.inner_text() if badge.count() else 'none')
    B.click('.subj[data-key="10"]'); B.wait_for_timeout(600)
    check('과목을 열면 새 글 점 표시', B.locator('.unread-dot.on').count() == 1)
    B.click('.subj[data-key="all"]'); B.wait_for_timeout(600)
    check('한 번 본 뒤에는 숫자가 사라짐', B.locator('.subj[data-key="10"] .badge').count() == 0)
    B.screenshot(path=f'{SHOTS}2_list_phone.png', full_page=False)

    # 4. B가 글 열고 도움 + 캡처 답변
    B.click('.subj[data-key="10"]'); B.wait_for_timeout(500)
    B.click('text=배포할 때 키 설정에서 401이 떠요'); B.wait_for_selector('.post')
    check('글 보기에 첨부 이미지 보임', B.locator('.pics img').count() == 1 and B.evaluate("document.querySelector('.pics img').naturalWidth") > 0)
    B.click('.post .help'); B.wait_for_timeout(400)
    check('도움됐어요 누르면 1', B.inner_text('.post .help').strip().endswith('1'))
    B.fill('textarea[aria-label="답변 내용"]', '환경변수 이름을 AZURE_OPENAI_API_KEY로 바꾸니까 됐어요.')
    B.evaluate(PASTE_JS, 'textarea[aria-label="답변 내용"]'); B.wait_for_selector('section[aria-label="답변 쓰기"] .thumb img')
    B.click('text=답변 올리기'); B.wait_for_selector('.answer')
    check('답변이 익명1로 보임', B.inner_text('.answer .who').startswith('익명1'))
    B.screenshot(path=f'{SHOTS}3_post_phone.png', full_page=True)

    # 5. A가 보면 답변자는 익명1, A의 답변은 익명(글쓴이), 티어 점수 1
    A.goto(BASE + '/#/'); A.wait_for_selector('.item-title'); A.click('text=배포할 때 키 설정에서 401이 떠요'); A.wait_for_selector('.post')
    A.wait_for_timeout(5200)
    A.fill('textarea[aria-label="답변 내용"]', '감사합니다! 해결됐어요.'); A.click('text=답변 올리기'); A.wait_for_timeout(700)
    whos = A.locator('.answer .who').all_inner_texts()
    check('A 화면: 익명1 → 익명(글쓴이) 순서', whos[0].startswith('익명1') and whos[1].startswith('익명(글쓴이)'), ' / '.join(w.split()[0] for w in whos))
    me = A.evaluate("fetch('/api/me').then(r=>r.json())")
    check('도움 1개 → 받은 도움 1', me['tier']['points'] == 1, str(me['tier']))
    A.screenshot(path=f'{SHOTS}4_post_pc.png', full_page=True)

    # 6. 도배 방지
    r = A.evaluate("fetch('/api/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cat:'잡담',subject:10,title:'a',body:'b'})}).then(r=>r.status)")
    check('15초 안에 또 쓰면 막힘', r == 429, str(r))

    # 7. 운영자 삭제, 일반 사용자는 남의 글 못 지움
    pid0 = A.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts.find(p=>p.title.includes('401')).id)")
    st = B.evaluate(f"fetch('/api/posts/{pid0}',{{method:'DELETE'}}).then(r=>r.status)")
    check('남의 글은 못 지움', st == 403, str(st))
    cc, C = new_user(b)
    join(C, 'admin-code')
    pid = A.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts.find(p=>p.title.includes('401')).id)")
    C.goto(BASE + f'/#/post/{pid}'); C.wait_for_selector('.answer')
    C.on('dialog', lambda d: d.accept())
    before = C.locator('.answer').count()
    C.locator('.answer .link-btn').first.click(); C.wait_for_timeout(700)
    check('운영자는 답변 지움', C.locator('.answer').count() == before - 1)

    # 8. 로그인 없이 API·이미지 접근 차단
    cd, D = new_user(b)
    D.goto(BASE + '/'); D.wait_for_selector('#code')
    st = D.evaluate("Promise.all([fetch('/api/posts?subject=10').then(r=>r.status), fetch('/api/images/1').then(r=>r.status)])")
    check('입장 안 한 사람은 글·이미지 못 봄', st == [401, 401], str(st))

    # 9. 설정: 실명 켜고 쓰면 실명, 예전 글은 익명 유지
    A.goto(BASE + '/#/settings'); A.wait_for_selector('#real-name')
    A.fill('#real-name', '김성희'); A.check('input[role=switch]'); A.click('text=저장'); A.wait_for_timeout(500)
    A.wait_for_timeout(15500)
    A.goto(BASE + '/#/'); A.wait_for_selector('.compose-open')
    openc(A); A.fill('.title-in', '실명 테스트'); A.click('.comp-foot .btn'); A.wait_for_timeout(700)
    authors = A.locator('.list .meta > span:first-child').all_inner_texts()
    check('실명 켠 뒤 새 글만 실명 (프로필 이모지 포함)', '김성희' in authors[0].split('·')[0] and all(x.startswith('익명') for x in authors[1:]), ' | '.join(authors))
    A.screenshot(path=f'{SHOTS}5_list_pc.png')

    b.close()

print('\nconsole errors:', errors or 'none')
print(f"{sum(1 for _, ok, _ in results if ok)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok, _ in results) and not errors else 1)
