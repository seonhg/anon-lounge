import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, json, re, base64
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
# GIPHY 이미지 주소는 가짜 그림으로 응답
COLORS=['#FF6FD8','#A66BFF','#5B8CFF','#4BE3A6','#FFB020','#FF5C8A']
def fake_img(route):
    u=route.request.url; m=re.search(r'/media/v1\.Y2lk/([A-Za-z0-9]+)/', u); k=sum(map(ord, m.group(1))) if m else 0
    c=COLORS[k%len(COLORS)]; sticker='/S' in u
    body=(f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" rx="{40 if sticker else 0}" fill="{c}"/>'
          f'<text x="100" y="88" font-size="34" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="900">{"STICKER" if sticker else "GIF"}</text></svg>')
    route.fulfill(status=200, content_type='image/svg+xml', body=body)
def mk(b, w=1280, h=900):
    ctx=b.new_context(viewport={'width':w,'height':h}, device_scale_factor=2 if w<500 else 1); ctx.route('https://*.giphy.com/**', fake_img); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errs.append(m.text)); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json().catch(()=>null)]}", [path, method, body])
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    A = mk(b); join(A, 'test-code'); Bq = mk(b); join(Bq, 'test-code')
    A.click('.compose-open'); A.fill('.title-in','배포 드디어 성공!!')
    A.click('.composer .emoji-btn'); A.wait_for_selector('.emoji-panel .pk-tabs')
    tabs = A.locator('.pk-tabs button').all_inner_texts()
    check('탭: 모두·이모지·GIF·스티커', tabs == ['모두','이모지','GIF','스티커'], str(tabs))
    A.wait_for_selector('.pk-gif-row .pk-md'); A.wait_for_timeout(400)
    check('모두 탭: 이모지 줄 + GIF 3개 + 스티커 4개', A.locator('.pk-row.emoji-grid .em').count() == 8 and A.locator('.pk-gif-row .pk-md').count() == 3 and A.locator('.pk-sticker-row .pk-md').count() == 4)
    check('GIPHY 출처 표시', 'GIPHY' in A.inner_text('.pk-attr'))
    A.screenshot(path=O+'m1_picker_all.png')
    # 이모지는 글에 들어가고 창 유지
    A.click('.body-in'); A.locator('.pk-row.emoji-grid .em').first.click()
    check('이모지는 글에 바로, 창 유지', A.input_value('.body-in') != '' and A.locator('.emoji-panel').count() == 1)
    # 스티커 붙이기 → 창 닫힘, 칸에 붙음
    A.locator('.pk-sticker-row .pk-md').nth(1).click()
    check('스티커 고르면 글쓰기 칸에 붙고 창 닫힘', A.locator('.media-tray .media-chip').count() == 1 and A.locator('.emoji-panel').count() == 0)
    # GIF 탭 검색
    A.click('.composer .emoji-btn'); A.click('.pk-tabs button:has-text("GIF")'); A.fill('.pk-search','축하'); A.keyboard.press('Enter'); A.wait_for_timeout(600)
    check('GIF 검색 결과', A.locator('.pk-gif-grid .pk-md').count() == 24 and '축하' in A.locator('.pk-gif-grid .pk-md').first.get_attribute('title'))
    A.click('.pk-gif-grid .pk-load'); A.wait_for_timeout(500)
    check('GIF 더 보기', A.locator('.pk-gif-grid .pk-md').count() == 48)
    A.screenshot(path=O+'m2_picker_gif.png')
    A.locator('.pk-gif-grid .pk-md').nth(2).click()
    check('GIF 붙이기 (GIF 표시)', A.locator('.media-tray .media-chip.gif .gif-badge').count() == 1)
    # 이모지 탭 한글 검색
    A.click('.composer .emoji-btn'); A.click('.pk-tabs button:has-text("이모지")'); A.fill('.pk-search','박수'); A.wait_for_timeout(200)
    check('이모지 한글 검색 (박수 → 👏)', '👏' in A.inner_text('.emoji-panel .emoji-grid'))
    A.click('.pk-tabs button:has-text("스티커")'); A.fill('.pk-search',''); A.wait_for_timeout(600)
    check('스티커 탭: 라운지 스티커 16개 + GIPHY 스티커', A.locator('.pk-sec').first.locator('.pk-md').count() == 16 and A.locator('.pk-sec').nth(1).locator('.pk-md.gsticker').count() >= 1)
    A.screenshot(path=O+'m3_picker_sticker.png')
    A.keyboard.press('Escape')
    A.click('.comp-foot .btn'); A.wait_for_selector('.item-title'); A.wait_for_timeout(600)
    lst = api(Bq,'/posts?subject=all')[1]['posts'][0]
    check('글에 GIF·스티커 저장', [m['type'] for m in lst['media']] == ['sticker','gif'], str(lst['media']))
    go = lambda pg, hs: (pg.goto(B+'/#/alerts'), pg.wait_for_selector('h1'), pg.goto(B+'/'+hs))
    go(Bq, '#/'); Bq.wait_for_selector('.item-title'); Bq.click('.subj[data-key="all"]'); Bq.wait_for_timeout(600)
    check('목록: 사진 없으면 스티커가 미리보기', Bq.locator('.item-thumb.media-thumb img').count() == 1)
    Bq.locator('.item-title').first.click(); Bq.wait_for_selector('.post .media-list')
    check('글 보기: 스티커·GIF 보임', Bq.locator('.post .media-item.sticker').count() == 1 and Bq.locator('.post .media-item.gif').count() == 1)
    # 답변을 스티커만으로
    Bq.click('section[aria-label="답변 쓰기"] .emoji-btn'); Bq.click('.pk-tabs button:has-text("스티커")'); Bq.locator('.pk-sec').first.locator('.pk-md').nth(13).click()
    Bq.click('text=답변 올리기'); Bq.wait_for_selector('.answer .media-item.sticker')
    check('글자 없이 스티커만 답변', Bq.locator('.answer .media-item.sticker').count() == 1)
    Bq.screenshot(path=O+'m4_post_media.png', full_page=True)
    # 서버 검사
    A.wait_for_timeout(15500)
    st = api(A,'/posts','POST',{'cat':'잡담','subject':10,'title':'x','media':[{'type':'gif','src':'https://evil.example/x.gif'}]})[0]
    check('GIPHY가 아닌 주소는 거절', st == 400, str(st))
    st = api(A,'/posts','POST',{'cat':'잡담','subject':10,'title':'x','media':[{'type':'sticker','id':'../../etc'}]})[0]
    check('없는 스티커는 거절', st == 400, str(st))
    st = api(A,'/posts','POST',{'cat':'잡담','subject':10,'title':'x','media':[{'type':'sticker','id':'ok'}]*5})[0]
    check('5개 이상 거절', st == 400, str(st))
    # 폰
    M = mk(b, 390, 844); M.context.add_cookies(Bq.context.cookies()); M.goto(B+'/'); M.wait_for_selector('.compose-open'); M.click('.compose-open'); M.click('.composer .emoji-btn'); M.wait_for_selector('.pk-gif-row .pk-md'); M.wait_for_timeout(500)
    M.locator('.composer').screenshot(path=O+'m5_picker_phone.png')
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
