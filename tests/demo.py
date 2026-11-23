import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]; calls=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width':1280,'height':860}, bypass_csp=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: m.type in ('error','warning') and 'Failed to load resource' not in m.text and errs.append(m.text))
    pg.on('request', lambda r: '/api/' in r.url and calls.append(r.url))
    pg.goto(B+'/demo'); pg.wait_for_selector('.item-title', timeout=8000); pg.wait_for_timeout(500)
    check('체험판: 코드 없이 바로 질문 목록', pg.locator('.item-title').count() >= 4 and pg.locator('.demo-bar').is_visible())
    pg.screenshot(path=O+'d1_list.png')
    pg.locator('.item-title', has_text='429').click(); pg.wait_for_selector('.post .pics img'); pg.wait_for_timeout(400)
    check('글 보기: 캡처·실명 프로필·대댓글·스티커', pg.locator('.answer .author-link').count() >= 1 and pg.locator('.answers.replies').count() == 1 and pg.locator('.media-item.sticker').count() >= 1)
    pg.screenshot(path=O+'d2_post.png', full_page=True)
    pg.click('.post .help'); pg.wait_for_timeout(200)
    pg.fill('textarea[aria-label="답변 내용"]','체험판에서 단 답변'); pg.click('text=답변 올리기'); pg.wait_for_timeout(500)
    check('답변 쓰기 (브라우저 안에서만)', '체험판에서 단 답변' in pg.inner_text('.answers'))
    pg.goto(B+'/demo#/'); pg.wait_for_selector('.compose-open'); pg.click('.compose-open'); pg.fill('.title-in','체험판 첫 글'); pg.click('.composer .emoji-btn'); pg.click('.pk-tabs button:has-text("스티커")'); pg.locator('.pk-sec').first.locator('.pk-md').nth(2).click(); pg.click('.comp-foot .btn'); pg.wait_for_timeout(600)
    check('글쓰기 + 스티커', pg.locator('.item', has_text='체험판 첫 글').locator('.media-thumb').count() == 1)
    pg.click('.side a[href="#/notes"]'); pg.wait_for_selector('.item-title'); pg.locator('.item-title', has_text='클라우드 OpenAI').click(); pg.wait_for_selector('article .toc'); pg.wait_for_timeout(300)
    check('정리: 목차·각주·함께 정리한 사람', pg.locator('article .toc li').count() >= 3 and pg.locator('.fn-ref').count() >= 1 and pg.locator('.contrib').count() == 3)
    pg.screenshot(path=O+'d3_note.png', full_page=True)
    pg.click('text=고친 기록'); pg.wait_for_selector('.rev-item'); pg.locator('.rev-item').nth(0).click(); pg.wait_for_selector('.diff'); pg.wait_for_timeout(200)
    pg.screenshot(path=O+'d4_history.png', full_page=True)
    check('고친 기록 비교', pg.locator('.diff-row.add').count() >= 1)
    pg.goto(B+'/demo#/notes'); pg.wait_for_selector('.item-title'); pg.locator('.item-title').first.click(); pg.wait_for_selector('article'); pg.click('article a.btn'); pg.wait_for_selector('.note-body'); pg.wait_for_function("document.querySelector('.note-body').value.length>10")
    pg.wait_for_timeout(300); pg.screenshot(path=O+'d5_editor.png')
    pg.evaluate("()=>{const t=document.querySelector('.note-body'); t.value += '\\n\\n## 체험판에서 추가\\n- 내가 쓴 줄'; t.dispatchEvent(new Event('input'))}")
    pg.click('.note-editor .comp-foot .btn:not(.ghost)'); pg.wait_for_selector('article .md'); pg.wait_for_timeout(300)
    check('정리 고치기 저장', '체험판에서 추가' in pg.inner_text('article .md'))
    pg.click('.top-actions .bell'); pg.wait_for_selector('.alert-item'); check('알림', pg.locator('.alert-item').count() >= 2)
    pg.screenshot(path=O+'d6_alerts.png')
    pg.goto(B+'/demo#/u/b1a2c3d4e5f6'); pg.wait_for_selector('.pf-page'); pg.wait_for_timeout(300)
    check('실명 사용자 프로필', '박하늘' in pg.inner_text('.pf-page'))
    pg.screenshot(path=O+'d7_profile.png', full_page=True)
    pg.goto(B+'/demo#/admin'); pg.wait_for_selector('.urow'); pg.wait_for_timeout(300)
    check('운영 화면', pg.locator('.urow').count() == 8 and '사이트 운영 중' in pg.inner_text('.site-settings'))
    pg.screenshot(path=O+'d8_admin.png', full_page=True)
    pg.goto(B+'/demo#/settings'); pg.wait_for_selector('.seg'); pg.fill('#real-name','체험 사용자'); pg.click('.switch input'); pg.click('section.card .btn >> nth=0'); pg.wait_for_selector('.pf-emoji-grid'); pg.click('.pf-emoji-grid button[aria-label="🐼"]'); pg.click('text=프로필 저장'); pg.wait_for_timeout(300)
    check('설정: 실명·프로필 꾸미기', '🐼' in pg.inner_text('.pf-preview-wrap'))
    pg.screenshot(path=O+'d9_settings.png', full_page=True)
    # 다크 모드 목록
    pg.goto(B+'/demo#/'); pg.wait_for_selector('.item-title'); pg.click('.top-actions button:has-text("다크")'); pg.wait_for_timeout(600); pg.screenshot(path=O+'d10_dark.png')
    pg.click('.top-actions button:has-text("라이트")')
    # 진짜 서버에는 한 번도 안 감
    real = [c for c in calls]
    check('진짜 서버(/api)로는 요청이 하나도 안 나감', len(real) == 0, str(real[:3]))
    # 새로고침하면 처음으로
    pg.reload(); pg.wait_for_selector('.item-title'); pg.wait_for_timeout(300)
    check('새로고침하면 써 본 글 사라짐', '체험판 첫 글' not in pg.inner_text('.list'))
    # 폰
    m = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2).new_page(); m.on('pageerror', lambda e: errs.append(str(e)))
    m.goto(B+'/demo'); m.wait_for_selector('.item-title'); m.wait_for_timeout(500); m.screenshot(path=O+'d11_phone.png')
    m.goto(B+'/demo#/notes'); m.wait_for_selector('.item-title'); m.locator('.item-title').first.click(); m.wait_for_selector('article .toc'); m.wait_for_timeout(300); m.screenshot(path=O+'d12_phone_note.png')
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
