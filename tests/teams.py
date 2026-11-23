# 팀즈 탭(다른 사이트 안의 iframe)에서 로그인 유지되는지
import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, subprocess, time
from playwright.sync_api import sync_playwright
res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
host = subprocess.Popen(['python3','-m','http.server','8799','--bind','127.0.0.1','--directory',os.path.join(os.path.dirname(__file__), 'teamshost')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width':1280,'height':900}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('http://127.0.0.1:8799/'); f = pg.frame_locator('#tab')
    f.locator('#code').wait_for()
    check('팀즈 탭 안: 패스키 버튼 숨김, 복구 코드 안내', f.locator('.pk-btn').count() == 0 and '복구 코드로 들어와요' in f.locator('.join').inner_text())
    f.locator('#code').fill('test-code'); f.locator('button[type=submit]').first.click()
    f.locator('.rc-code').wait_for(); rc = f.locator('.rc-code').inner_text()
    f.locator('#rc-ok').check(); f.locator('.modal .btn:not(.ghost)').click()
    f.locator('.subj').first.wait_for(timeout=5000)
    check('팀즈 탭 안에서 입장 → 질문 화면 (로그인 유지)', f.locator('.subj').count() > 0)
    f.locator('.compose-open').click(); f.locator('.title-in').fill('팀즈 탭에서 쓴 글'); f.locator('.comp-foot .btn').click()
    f.locator('.item-title').first.wait_for()
    check('팀즈 탭 안에서 글쓰기', '팀즈 탭에서 쓴 글' in f.locator('.list').inner_text())
    pg.reload(); f = pg.frame_locator('#tab'); f.locator('.item-title').first.wait_for(timeout=8000)
    check('팀즈 탭 새로고침해도 로그인 유지', '팀즈 탭에서 쓴 글' in f.locator('.list').inner_text())
    pg.screenshot(path=SHOTS + 't_teams_tab.png')
    # 일반 브라우저 탭은 따로 (복구 코드로 이어 쓰기)
    top = ctx.new_page(); top.goto('http://localhost:8788/'); top.wait_for_selector('#rc')
    check('일반 브라우저는 따로 로그인 (팀즈 안과 분리)', top.locator('#code').count() == 1)
    top.fill('#rc', rc); top.click('text=복구 코드로 들어가기'); top.wait_for_selector('.item-title')
    check('일반 브라우저에서 복구 코드로 같은 계정', top.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts.some(p=>p.mine && p.title==='팀즈 탭에서 쓴 글'))"))
    # 로그아웃
    top.evaluate("fetch('/api/logout',{method:'POST'})"); top.goto('http://localhost:8788/#/'); top.reload(); top.wait_for_selector('#code')
    check('로그아웃하면 쿠키 지워짐', top.locator('#code').count() == 1)
    # 다른 사이트(가짜 팀즈 페이지)에서 몰래 보내는 요청은 여전히 막힘
    st = pg.evaluate("fetch('http://localhost:8788/api/posts',{method:'POST',credentials:'include',headers:{'content-type':'text/plain'},body:JSON.stringify({cat:'잡담',subject:10,title:'csrf'})}).then(r=>r.status).catch(()=>'blocked')")
    check('바깥 사이트에서 보낸 글쓰기 요청은 차단', st in (403, 'blocked'), str(st))
    b.close()
finally:
  host.kill()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
