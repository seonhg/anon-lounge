import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8788'; OUT=SHOTS.rstrip('/')
errors, results = [], []
def check(n, ok, d=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
PASTE_N = """async ([sel, n]) => {
  const dt = new DataTransfer();
  for (let k = 0; k < n; k++) {
    const c = document.createElement('canvas'); c.width = 900; c.height = 500; const g = c.getContext('2d');
    g.fillStyle = `hsl(${k*17},60%,85%)`; g.fillRect(0,0,900,500); g.fillStyle='#000'; g.font='64px sans-serif'; g.fillText('캡처 ' + (k+1), 60, 260);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); dt.items.add(new File([blob], `c${k}.png`, { type: 'image/png' }));
  }
  const t = document.querySelector(sel); t.focus();
  t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}"""
def new_user(b, w=1280, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h}, bypass_csp=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(BASE+'/'); pg.wait_for_selector('#code'); pg.fill('#code', code); pg.click('button[type=submit]')
    pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("""async ([p,m,b]) => { const r = await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined}); return [r.status, await r.json().catch(()=>null)]; }""", [path, method, body])

def openc(pg):
    if pg.locator('.compose-open').count(): pg.click('.compose-open'); pg.wait_for_selector('.title-in')

with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    O = new_user(b); join(O, 'admin-code')
    A = new_user(b); join(A, 'test-code')
    # 20장 붙여넣기 (21장 시도)
    openc(A); A.fill('.title-in', '사이트 글자가 너무 작아요'); A.fill('.body-in', '폰에서 보면 글자가 작아요')
    A.evaluate(PASTE_N, ['.body-in', 21]); A.wait_for_function("document.querySelectorAll('.composer .thumb').length >= 20", timeout=30000)
    A.wait_for_timeout(500)
    check('21장 붙여넣으면 20장까지만', A.locator('.composer .thumb').count() == 20 and A.locator('.add-img').count() == 0, str(A.locator('.composer .thumb').count()))
    A.click('.comp-foot .btn'); A.wait_for_selector('.item-title', timeout=30000); A.wait_for_timeout(800)
    post = api(A, '/posts?subject=all')[1]['posts'][0]
    check('20장 모두 올라감', post['imageCount'] == 20, str(post['imageCount']))
    pid = post['id']
    # 서버도 21장째는 거절
    st = A.evaluate(f"fetch('/api/images?type=post&id={pid}',{{method:'POST',headers:{{'content-type':'image/png'}},body:new Uint8Array([137,80,78,71])}}).then(r=>r.status)")
    check('서버도 21장째 거절', st == 400, str(st))
    # 남은 못 고침
    B = new_user(b); join(B, 'test-code')
    check('남의 글은 못 고침', api(B, f'/posts/{pid}', 'PATCH', {'title': 'x'})[0] == 403)
    # 글쓴이가 건의로 옮기고 제목 수정, 이미지 2장 빼고 1장 추가
    A.goto(BASE + f'/#/post/{pid}'); A.wait_for_selector('.post'); A.screenshot(path=f'{SHOTS}e1_post_20imgs.png', full_page=True)
    A.click('text=고치기'); A.wait_for_selector('section[aria-label="글 고치기"]')
    A.check('input[name=edit-cat][value=건의]')
    check('건의로 바꾸면 과목 선택 잠김', A.locator('section[aria-label="글 고치기"] select').is_disabled())
    A.fill('section[aria-label="글 고치기"] .title-in', '[건의] 사이트 글자가 너무 작아요')
    A.locator('section[aria-label="글 고치기"] .thumbs').first.locator('.thumb button').first.click()
    A.locator('section[aria-label="글 고치기"] .thumbs').first.locator('.thumb button').first.click()
    A.evaluate(PASTE_N, ['section[aria-label="글 고치기"] .body-in', 1]); A.wait_for_timeout(1200)
    A.screenshot(path=f'{SHOTS}e2_edit_pc.png', full_page=True)
    A.click('section[aria-label="글 고치기"] .comp-foot .btn:not(.ghost)'); A.wait_for_selector('.post', timeout=15000); A.wait_for_timeout(500)
    d = api(A, f'/posts/{pid}')[1]['post']
    check('건의로 옮겨짐 + 제목 수정 + 수정됨 표시', d['cat'] == '건의' and d['subject'] == 0 and d['title'].startswith('[건의]') and d['editedAt'] > 0 and '수정됨' in A.inner_text('.post .meta'))
    check('이미지 20 - 2 + 1 = 19', len(d['images']) == 19, str(len(d['images'])))
    # 운영자 옮기기 (말머리·과목만)
    A.wait_for_timeout(15500)
    A.goto(BASE + '/#/'); A.wait_for_selector('.compose-open'); openc(A); A.fill('.title-in', '이거 질문 아니고 잡담'); A.click('.comp-foot .btn'); A.wait_for_timeout(800)
    pid2 = api(A, '/posts?subject=all')[1]['posts'][0]['id']
    check('운영자는 남의 글 제목 못 바꿈', api(O, f'/posts/{pid2}', 'PATCH', {'title': 'x'})[0] == 403)
    O.goto(BASE + f'/#/post/{pid2}'); O.wait_for_selector('.post'); O.click('text=옮기기'); O.wait_for_selector('section[aria-label="글 옮기기"]')
    O.check('input[name=edit-cat][value=잡담]'); O.click('section[aria-label="글 옮기기"] .comp-foot .btn:not(.ghost)'); O.wait_for_selector('.post'); O.wait_for_timeout(400)
    d2 = api(A, f'/posts/{pid2}')[1]['post']
    check('운영자가 잡담으로 옮김 (수정됨 표시는 안 붙음)', d2['cat'] == '잡담' and d2['editedAt'] == 0)
    # 폰 화면 고치기
    M = A.context.browser.new_context(viewport={'width': 390, 'height': 844}, storage_state=A.context.storage_state()).new_page()
    M.goto(BASE + f'/#/post/{pid}'); M.wait_for_selector('.post'); M.click('text=고치기'); M.wait_for_selector('section[aria-label="글 고치기"]')
    M.screenshot(path=f'{SHOTS}e3_edit_phone.png')
    b.close()
print('errors:', errors or 'none'); print(f'{sum(results)}/{len(results)} passed'); sys.exit(0 if all(results) and not errors else 1)
