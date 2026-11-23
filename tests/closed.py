import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
def mk(b, w=1280, h=900):
    pg=b.new_context(viewport={'width':w,'height':h}, device_scale_factor=2 if w<500 else 1).new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json().catch(()=>null)]}", [path, method, body])
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    O1 = mk(b); join(O1, 'admin-code')
    S = mk(b); join(S, 'test-code'); S.click('.compose-open'); S.fill('.title-in','수강생 글'); S.click('.comp-foot .btn'); S.wait_for_selector('.item-title')
    A2 = mk(b); join(A2, 'test-code')
    uid = [u for u in api(O1,'/admin/users')[1]['users'] if not u['isOwner'] and u['posts']==0][0]['id']
    api(O1, f'/admin/users/{uid}', 'PATCH', {'admin': True})
    check('운영자(소유자 아님)는 사이트 닫기 못 함', api(A2,'/admin/settings','PATCH',{'closed':True})[0] == 403)
    O1.goto(B+'/#/admin'); O1.wait_for_selector('.site-settings .switch input')
    check('운영 화면에 사이트 운영 카드', '사이트 운영 중' in O1.inner_text('.site-settings'))
    O1.locator('.site-settings .switch input').click(); O1.wait_for_selector('text=사이트가 닫혀 있어요')
    O1.screenshot(path=O+'c1_admin_closed.png')
    check('닫힌 상태 확인', api(O1,'/admin/settings')[1]['closed'])
    # 수강생
    S.reload(); S.wait_for_selector('.closed-card', timeout=8000)
    check('수강생: 새로고침하면 종료 안내', '운영을 종료했어요' in S.inner_text('.closed-card'))
    st, d = api(S, '/posts?subject=all')
    check('수강생: API로도 글 못 봄', st == 403 and d.get('closed') and 'posts' not in d)
    S.screenshot(path=O+'c2_closed_page.png')
    N = mk(b, 390, 844); N.goto(B+'/'); N.wait_for_selector('.closed-card')
    check('처음 온 사람: 입장 화면 대신 종료 안내 + 체험판 버튼', N.locator('.closed-card a[href="/demo"]').count() == 1 and N.locator('#code').count() == 0)
    N.screenshot(path=O+'c3_closed_phone.png')
    st = api(N, '/join', 'POST', {'code':'test-code'})
    check('초대 코드로 새로 들어오기 막힘', st[0] == 403 and st[1].get('closed'))
    # 운영자 문
    N.click('.admin-door summary'); N.fill('#admin-code','admin-code'); N.click('text=운영자 입장'); N.wait_for_selector('.rc-code'); N.check('#rc-ok'); N.click('.modal .btn:not(.ghost)'); N.wait_for_selector('.urow', timeout=8000)
    check('닫혀도 운영자 코드로 소유자 입장 → 운영 화면', api(N,'/me')[1]['isOwner'])
    check('닫혀도 운영자는 글 볼 수 있음', any(x['title']=='수강생 글' for x in api(O1,'/posts?subject=all')[1]['posts']))
    check('닫혀도 다른 운영자도 들어옴', api(A2,'/posts?subject=all')[0] == 200)
    # 다시 열기
    O1.goto(B+'/#/admin'); O1.wait_for_selector('.site-settings .switch input'); O1.locator('.site-settings .switch input').click(); O1.wait_for_selector('text=사이트 운영 중')
    S.goto(B+'/'); S.reload(); S.wait_for_selector('.item-title', timeout=8000)
    check('다시 열면 수강생 그대로 이어서', '수강생 글' in S.inner_text('.list'))
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
