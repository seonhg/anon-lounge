# 보안 점검 테스트
import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, json, subprocess
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; results=[]; csp=[]
def check(n, ok, d=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
def curl(*args):
    out = subprocess.run(['curl','-s','-o','/dev/null','-w','%{http_code}',*args], capture_output=True, text=True).stdout
    return int(out)
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width':1280,'height':900}); A = ctx.new_page()
    dialogs=[]; A.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
    A.on('console', lambda m: 'Content Security Policy' in m.text and csp.append(m.text))
    A.goto(B+'/'); A.wait_for_selector('#code')
    # 보안 헤더
    r = A.request.get(B+'/')
    h = r.headers
    check('보안 헤더(CSP·nosniff) 붙음', "script-src 'self'" in h.get('content-security-policy','') and h.get('x-content-type-options')=='nosniff')
    A.fill('#code','admin-code'); A.click('button[type=submit]'); A.wait_for_selector('.rc-code'); A.check('#rc-ok'); A.click('.modal .btn:not(.ghost)'); A.wait_for_selector('.subj')
    cookie = [c for c in ctx.cookies() if c['name']=='al_token'][0]
    check('로그인 쿠키는 HttpOnly (스크립트로 못 읽음)', cookie['httpOnly'] and A.evaluate('document.cookie').find('al_token') == -1)
    ck = f"al_token={cookie['value']}"
    # CSRF
    st = curl('-X','POST','-H','content-type: application/json','-H','Origin: https://evil.example','-H',f'Cookie: {ck}','-d','{"cat":"잡담","subject":10,"title":"csrf"}', B+'/api/posts')
    check('다른 사이트에서 보낸 글쓰기 요청 차단', st == 403, str(st))
    st = curl('-X','POST','-H','Sec-Fetch-Site: cross-site','-H',f'Cookie: {ck}', B+'/api/logout')
    check('다른 사이트에서 보낸 로그아웃 요청 차단', st == 403, str(st))
    # XSS
    A.click('.compose-open'); A.wait_for_selector('.title-in')
    A.fill('.title-in', '<img src=x onerror=alert(1)><script>alert(2)</script>')
    A.fill('.body-in', '<svg onload=alert(3)>'); A.click('.comp-foot .btn'); A.wait_for_selector('.item-title'); A.wait_for_timeout(600)
    pid = A.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts[0].id)")
    A.goto(B+f'/#/post/{pid}'); A.wait_for_selector('.post'); A.wait_for_timeout(600)
    check('글 제목·내용의 HTML은 글자로만 보임 (XSS 없음)', not dialogs and '<img src=x' in A.inner_text('.post h2') and A.locator('.post img[src=x]').count()==0, str(dialogs))
    # 가짜 이미지
    st = A.evaluate(f"""fetch('/api/images?type=post&id={pid}',{{method:'POST',headers:{{'content-type':'image/png'}},body:'<html><script>alert(1)</script>'}}).then(r=>r.status)""")
    check('이미지인 척한 HTML 파일 거절', st == 400, str(st))
    st = A.evaluate(f"""fetch('/api/images?type=post&id={pid}',{{method:'POST',headers:{{'content-type':'image/svg+xml'}},body:'<svg/>'}}).then(r=>r.status)""")
    check('SVG 업로드 거절', st == 400, str(st))
    # 진짜 이미지 올리고, 글 지우면 이미지도 못 봄
    iid = A.evaluate(f"""(async()=>{{const c=document.createElement('canvas');c.width=20;c.height=20;const bl=await new Promise(r=>c.toBlob(r,'image/png'));const r=await fetch('/api/images?type=post&id={pid}',{{method:'POST',headers:{{'content-type':'image/png'}},body:bl}});return (await r.json()).id}})()""")
    st1 = A.evaluate(f"fetch('/api/images/{iid}').then(r=>r.status)")
    A.evaluate(f"fetch('/api/posts/{pid}',{{method:'DELETE'}})")
    st2 = A.evaluate(f"fetch('/api/images/{iid}',{{cache:'no-store'}}).then(r=>r.status)")
    check('지운 글의 이미지는 주소를 알아도 못 봄', st1 == 200 and st2 == 404, f'{st1}->{st2}')
    hd = A.request.get(B+f'/api/images/{iid}')
    # 비로그인
    check('로그인 안 하면 이미지 못 봄', curl(B+f'/api/images/{iid}') == 401)
    # 일반 사용자는 운영 API 못 씀
    S = b.new_context().new_page(); S.goto(B+'/'); 
    st = curl('-X','POST','-H','content-type: application/json','-d','{"code":"test-code"}','-c','/tmp/sec-s.cj', B+'/api/join')
    check('일반 사용자: 운영 화면 API 차단', curl('-b','/tmp/sec-s.cj', B+'/api/admin/users') == 403)
    st = curl('-X','PATCH','-b','/tmp/sec-s.cj','-H','content-type: application/json','-d','{"admin":true}', B+'/api/admin/users/x')
    check('일반 사용자: 스스로 운영자 되기 차단', st == 403, str(st))
    # 일반 목록에 사용자 ID 안 나옴
    body = subprocess.run(['curl','-s','-b','/tmp/sec-s.cj', B+'/api/posts?subject=all'], capture_output=True, text=True).stdout
    check('일반 사용자 목록에 사용자 ID·번호 없음', 'user_id' not in body and '"tag"' not in body)
    # 무차별 대입
    codes = [curl('-X','POST','-H','content-type: application/json','-d','{"code":"guess%d"}'%i, B+'/api/join') for i in range(31)]
    check('초대 코드 30번 틀리면 잠깐 막힘', codes[:30] == [403]*30 and codes[30] == 429, f'{codes[-2:]}')
    rc = [curl('-X','POST','-H','content-type: application/json','-d','{"code":"AAAA-BBBB-CCCC-%04d"}'%i, B+'/api/recover') for i in range(31)]
    check('복구 코드 30번 틀리면 잠깐 막힘', rc[30] == 429, f'{rc[-2:]}')
    # 전체 화면 돌아다녀도 CSP 위반 없음
    for hsh in ['#/', '#/settings', '#/admin']:
        A.goto(B+'/'+hsh); A.wait_for_timeout(700)
    A.goto(B+'/#/'); A.click('.top-actions button'); A.wait_for_timeout(400)
    check('화면에서 보안 정책(CSP) 위반 없음', not csp, '; '.join(csp)[:200])
    b.close()
print(f'{sum(results)}/{len(results)} passed'); sys.exit(0 if all(results) else 1)
