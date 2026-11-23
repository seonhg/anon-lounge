import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    A = b.new_context(viewport={'width':1280,'height':900}).new_page(); A.on('pageerror', lambda e: errs.append(str(e)))
    A.goto(B+'/'); A.wait_for_selector('#code'); A.fill('#code','test-code'); A.click('button[type=submit]'); A.wait_for_selector('.rc-code'); A.check('#rc-ok'); A.click('.modal .btn:not(.ghost)'); A.wait_for_selector('.subj')
    A.click('.compose-open'); A.fill('.title-in','오늘 실습'); A.fill('.body-in','배포 성공했어요 끝!')
    # 커서를 "성공했어요" 뒤로
    A.evaluate("()=>{const t=document.querySelector('.body-in'); t.focus(); t.setSelectionRange(9,9)}")
    A.click('.composer .emoji-btn'); A.wait_for_selector('.emoji-panel'); A.click('.pk-tabs button:has-text("이모지")')
    n = A.locator('.emoji-tabs button').count()
    check('이모지 종류 7가지', n == 7, str(n))
    total = A.evaluate("()=>[...document.querySelectorAll('.emoji-tabs button')].length")
    A.locator('.emoji-grid button', has_text='😂').click()
    A.locator('.emoji-grid button', has_text='👍').first.click() if False else None
    A.click('.emoji-tabs button[aria-label="손"]'); A.locator('.emoji-grid button').first.click()
    A.click('.emoji-tabs button[aria-label="공부·코딩"]'); A.locator('.emoji-grid button', has_text='🚀').click()
    check('창이 안 닫히고 여러 개 연달아 넣기', A.locator('.emoji-panel').count() == 1)
    tb = A.locator('.body-in').bounding_box(); pb = A.locator('.emoji-panel').bounding_box()
    check('이모티콘 창이 글 칸을 가리지 않음 (글 칸 아래에 열림)', pb['y'] >= tb['y'] + tb['height'], f"글칸 아래끝 {tb['y']+tb['height']:.0f}, 창 위 {pb['y']:.0f}")
    # 글 칸을 눌러 커서를 옮겨도 창은 그대로
    A.evaluate("()=>{const t=document.querySelector('.body-in'); t.focus(); t.setSelectionRange(0,0)}"); A.click('.body-in', position={'x': 5, 'y': 5})
    A.evaluate("()=>{const t=document.querySelector('.body-in'); t.setSelectionRange(0,0)}")
    check('글 칸을 눌러도 이모티콘 창 유지', A.locator('.emoji-panel').count() == 1)
    A.locator('.emoji-grid button').first.click()
    v0 = A.input_value('.body-in')
    check('옮긴 커서(맨 앞)에 들어감', v0.startswith('💻배포'), v0)
    A.keyboard.press('Control+z') if False else None
    A.evaluate("()=>{const t=document.querySelector('.body-in'); t.value=t.value.slice(2); }")
    v = A.input_value('.body-in')
    check('커서 자리에 순서대로 들어감', v == '배포 성공했어요 😂👍🚀끝!', v)
    A.screenshot(path=O+'e1_emoji_pc.png')
    A.keyboard.press('Escape'); check('Esc로 닫힘', A.locator('.emoji-panel').count() == 0)
    # 제목 칸에 넣기
    A.click('.title-in'); A.click('.composer .emoji-btn'); A.click('.pk-tabs button:has-text("이모지")'); A.locator('.emoji-grid button').first.click(); A.mouse.click(5, 5)
    check('마지막으로 누른 칸(제목)에 들어감', A.input_value('.title-in') != '오늘 실습' and A.input_value('.title-in').startswith('오늘 실습'), A.input_value('.title-in'))
    check('바깥 누르면 닫힘', A.locator('.emoji-panel').count() == 0)
    A.click('.composer .emoji-btn'); A.wait_for_selector('.emoji-panel'); A.click('.pk-tabs button:has-text("이모지")')
    check('최근 쓴 이모티콘 탭 생김', A.locator('.emoji-tabs button[aria-label="최근"]').count() == 1 and '🚀' in A.inner_text('.emoji-grid'))
    A.keyboard.press('Escape')
    A.click('.comp-foot .btn'); A.wait_for_selector('.item-title'); A.wait_for_timeout(500)
    check('이모티콘 넣은 글이 그대로 올라감', '😂👍🚀' in A.inner_text('.list'))
    pid = A.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts[0].id)")
    A.goto(B+f'/#/post/{pid}'); A.wait_for_selector('.post'); A.wait_for_timeout(5200)
    A.fill('textarea[aria-label="답변 내용"]','감사합니다'); A.click('section[aria-label="답변 쓰기"] .emoji-btn'); A.click('.pk-tabs button:has-text("이모지")'); A.click('.emoji-tabs button[aria-label="마음"]'); A.locator('.emoji-grid button').first.click(); A.locator('.emoji-grid button').first.click()
    check('답변 칸에도 이모티콘', A.input_value('textarea[aria-label="답변 내용"]') == '감사합니다❤️❤️')
    A.keyboard.press('Escape')
    M = b.new_context(viewport={'width':390,'height':844}, storage_state=A.context.storage_state()).new_page()
    M.goto(B+'/'); M.wait_for_selector('.compose-open'); M.click('.compose-open'); M.click('.composer .emoji-btn'); M.wait_for_selector('.emoji-panel'); M.click('.pk-tabs button:has-text("이모지")'); M.wait_for_timeout(200)
    box = M.locator('.emoji-panel').bounding_box()
    tb = M.locator('.body-in').bounding_box()
    check('폰에서도 창이 화면 안에 들어옴', box['x'] >= 0 and box['x'] + box['width'] <= 390, str(box))
    check('폰에서도 글 칸을 가리지 않음', box['y'] >= tb['y'] + tb['height'])
    M.screenshot(path=O+'e2_emoji_phone.png')
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
