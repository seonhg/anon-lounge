import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
PASTE_N = open(os.path.join(os.path.dirname(__file__), 'edit.py')).read().split('PASTE_N = """')[1].split('"""')[0]
def mk(b, w=1280, h=900, touch=False):
    ctx=b.new_context(viewport={'width':w,'height':h}, has_touch=touch, bypass_csp=True); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET'):
    return pg.evaluate("([p,m])=>fetch('/api'+p,{method:m}).then(r=>r.json())", [path, method])
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    C = mk(b); join(C, 'admin-code')
    A = mk(b); join(A, 'test-code')
    Bp = mk(b); join(Bp, 'test-code')
    # A 질문 (이미지 3장)
    A.click('.compose-open'); A.fill('.title-in','슬라이드 테스트 질문'); A.evaluate(PASTE_N, ['.body-in', 3]); A.wait_for_timeout(1500); A.click('.comp-foot .btn'); A.wait_for_timeout(2500)
    pid = api(A,'/posts?subject=all')['posts'][0]['id']
    # 내 글에 내가 답변 → 알림 없음
    A.goto(B+f'/#/post/{pid}'); A.wait_for_selector('.post'); A.wait_for_timeout(5200)
    A.fill('textarea[aria-label="답변 내용"]','제가 보충할게요'); A.click('text=답변 올리기'); A.wait_for_selector('.answer')
    check('내가 내 글에 단 답변은 알림 안 옴', api(A,'/notifications/count')['unread'] == 0)
    # B가 답변
    Bp.goto(B+f'/#/post/{pid}'); Bp.wait_for_selector('.post'); Bp.fill('textarea[aria-label="답변 내용"]','환경변수 이름 확인해 보세요!'); Bp.click('text=답변 올리기'); Bp.wait_for_timeout(800)
    A.goto(B+'/#/'); A.wait_for_selector('.item-title'); A.wait_for_timeout(600)
    bell = A.locator('.top-actions .bell .badge')
    check('다른 사람이 답변 → 종에 1 표시', bell.is_visible() and bell.inner_text() == '1')
    check('탭 제목에도 (1)', A.title().startswith('(1)'), A.title())
    A.screenshot(path=O+'n1_bell_pc.png')
    A.click('.top-actions .bell'); A.wait_for_selector('.alert-item')
    check('알림 화면에 글 제목·답변 내용', '슬라이드 테스트 질문' in A.inner_text('.alert-item') and '환경변수' in A.inner_text('.alert-item'))
    A.screenshot(path=O+'n2_alerts_pc.png')
    A.click('.alert-item'); A.wait_for_selector('.post'); A.wait_for_timeout(400)
    A.goto(B+'/#/'); A.wait_for_selector('.item-title'); A.wait_for_timeout(500)
    check('글을 열면 알림 읽음 처리', not A.locator('.top-actions .bell .badge').is_visible() and api(A,'/notifications/count')['unread']==0)
    # 답변 지우면 알림도 사라짐
    Bp.wait_for_timeout(5200); Bp.fill('textarea[aria-label="답변 내용"]','두번째 답변'); Bp.click('text=답변 올리기'); Bp.wait_for_timeout(800)
    check('두 번째 답변 → 알림 1', api(A,'/notifications/count')['unread']==1)
    Bp.locator('.answer', has_text='두번째 답변').locator('.link-btn', has_text='지우기').click(); Bp.wait_for_timeout(600)
    check('답변을 지우면 알림도 사라짐', api(A,'/notifications/count')['unread']==0)
    # 폰 종
    M = b.new_context(viewport={'width':390,'height':844}, storage_state=A.context.storage_state(), has_touch=True, bypass_csp=True).new_page()
    Bp.wait_for_timeout(5200); Bp.fill('textarea[aria-label="답변 내용"]','폰 알림 테스트'); Bp.click('text=답변 올리기'); Bp.wait_for_timeout(800)
    M.goto(B+'/'); M.wait_for_selector('.item-title'); M.wait_for_timeout(600)
    check('폰에서도 오른쪽 위 종에 숫자', M.locator('.top-actions .bell .badge').is_visible())
    M.screenshot(path=O+'n3_bell_phone.png')
    # 슬라이드
    A.goto(B+f'/#/post/{pid}'); A.wait_for_selector('.pics img')
    A.locator('.post .pics img').nth(1).click(); A.wait_for_selector('.lightbox')
    cnt = lambda pg: pg.inner_text('.lb-count')
    check('2번째 이미지 누르면 2 / 3', cnt(A) == '2 / 3', cnt(A))
    A.keyboard.press('ArrowRight'); check('→ 키로 다음 (3 / 3)', cnt(A) == '3 / 3')
    A.click('.lb-nav.next'); check('끝에서 다음 누르면 처음으로 (1 / 3)', cnt(A) == '1 / 3')
    A.click('.lb-nav.prev'); check('이전 버튼 (3 / 3)', cnt(A) == '3 / 3')
    A.locator('.lb-strip button').nth(1).click(); check('아래 작은 그림 눌러 이동 (2 / 3)', cnt(A) == '2 / 3')
    A.wait_for_timeout(300); A.screenshot(path=O+'n4_lightbox_pc.png')
    A.keyboard.press('Escape'); check('Esc로 닫힘', A.locator('.lightbox').count() == 0)
    # 폰 밀기
    M.goto(B+f'/#/post/{pid}'); M.wait_for_selector('.pics img'); M.locator('.post .pics img').first.click(); M.wait_for_selector('.lightbox')
    cdp = M.context.new_cdp_session(M)
    def swipe(x0, x1, y=420):
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x0,'y':y}]})
        for k in range(1,6): cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x0+(x1-x0)*k/5,'y':y}]})
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        M.wait_for_timeout(250)
    swipe(320, 80); check('폰: 왼쪽으로 밀면 다음 (2 / 3)', cnt(M) == '2 / 3', cnt(M))
    swipe(80, 320); check('폰: 오른쪽으로 밀면 이전 (1 / 3)', cnt(M) == '1 / 3', cnt(M))
    M.screenshot(path=O+'n5_lightbox_phone.png')
    # 운영자: 사용자별 글·답변
    C.goto(B+'/#/admin'); C.wait_for_selector('.urow')
    C.locator('.urow').filter(has_text='답변 2').locator('text=글·답변 보기').click(); C.wait_for_selector('.mono-h')
    C.click('.chip[data-t=answers]'); C.wait_for_timeout(300)
    txt = C.inner_text('main')
    check('운영자: 사용자의 답변 목록(지운 답변 포함)', '두번째 답변' in txt and '지움' in txt and '폰 알림 테스트' in txt)
    C.screenshot(path=O+'n6_admin_user.png', full_page=True)
    # 글의 번호 태그 눌러서 바로 이동
    C.goto(B+f'/#/post/{pid}'); C.wait_for_selector('.post .admin-tag'); C.click('.post .meta a.admin-tag'); C.wait_for_selector('.mono-h')
    check('운영자: 글의 #번호 누르면 그 사람 활동으로', '슬라이드 테스트 질문' in C.inner_text('main'))
    st = A.evaluate("fetch('/api/admin/users/abc/activity').then(r=>r.status)")
    check('일반 사용자는 활동 보기 API 못 씀', st == 403, str(st))
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
