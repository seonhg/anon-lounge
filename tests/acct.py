# 복구 코드 · 운영자 관리 · 패스키 테스트 (새 서버에서 실행)
import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, re
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8788'
OUT = SHOTS.rstrip('/')
errors, results = [], []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

def new_user(browser, w=1280, h=900):
    ctx = browser.new_context(viewport={'width': w, 'height': h})
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and not 'Failed to load resource' in m.text and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    return ctx, page

def close_modal(page, wait='.subj'):
    page.wait_for_selector('.rc-code', timeout=5000)
    code = page.inner_text('.rc-code').strip()
    page.check('#rc-ok'); page.click('.modal .btn:not(.ghost)')
    if wait: page.wait_for_selector(wait, timeout=5000)
    return code

def join(page, code):
    page.goto(BASE + '/'); page.wait_for_selector('#code')
    page.fill('#code', code); page.click('button[type=submit]')
    return close_modal(page)

def api(page, path, method='GET', body=None):
    js = """async ([p, m, b]) => { const r = await fetch('/api' + p, { method: m, headers: b ? {'content-type':'application/json'} : {}, body: b ? JSON.stringify(b) : undefined }); return [r.status, await r.json().catch(() => null)]; }"""
    return page.evaluate(js, [path, method, body])


def openc(pg):
    if pg.locator('.compose-open').count(): pg.click('.compose-open'); pg.wait_for_selector('.title-in')

with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])

    # 1. 소유자 등록, 운영자 코드는 한 번만
    co, O = new_user(b)
    join(O, 'admin-code')
    me = api(O, '/me')[1]
    check('운영자 코드로 처음 들어온 사람 = 소유자', me['isOwner'] and me['isAdmin'] and me['hasRecovery'])
    cx, X = new_user(b)
    owner_id = [u for u in api(O, '/admin/users')[1]['users'] if u['isOwner']][0]['id']
    X.goto(BASE + '/'); X.wait_for_selector('#code'); X.fill('#code', 'admin-code'); X.click('button[type=submit]')
    rc_new = close_modal(X)
    xm = api(X, '/me')[1]; users = api(X, '/admin/users')[1]['users']
    check('소유자가 있으면 운영자 코드로 기존 소유자 계정 되찾기 (새 계정 안 생김)', xm['isOwner'] and len(users) == 1 and users[0]['id'] == owner_id and users[0]['me'])
    check('되찾을 때 새 복구 코드를 보여줌', re.fullmatch(r'[A-Z2-9]{4}(-[A-Z2-9]{4}){3}', rc_new) is not None)
    cy, Y = new_user(b); Y.goto(BASE + '/')
    check('새 복구 코드로도 소유자 계정', api(Y, '/recover', 'POST', {'code': rc_new})[0] == 200 and api(Y, '/me')[1]['isOwner'])
    st = api(Y, '/join', 'POST', {'code': 'admin-cod'})[0]
    check('틀린 운영자 코드는 일반 초대 코드처럼 거절', st == 403, str(st))

    # 2. 학생 S 입장 → 글 → 노트북 반납(새 기기)에서 복구 코드로
    cs, S = new_user(b)
    rc = join(S, 'test-code')
    check('복구 코드 형식 XXXX-XXXX-XXXX-XXXX', re.fullmatch(r'[A-Z2-9]{4}(-[A-Z2-9]{4}){3}', rc) is not None, rc)
    openc(S); S.fill('.title-in', '반납 전에 쓴 글'); S.click('.comp-foot .btn'); S.wait_for_selector('.item-title')
    cs.close()
    cp, P = new_user(b, 390, 844)
    P.goto(BASE + '/'); P.wait_for_selector('#rc')
    P.fill('#rc', 'AAAA-BBBB-CCCC-DDDD'); P.click('text=복구 코드로 들어가기'); P.wait_for_timeout(400)
    check('틀린 복구 코드는 막힘', '맞지 않아요' in P.inner_text('form:nth-of-type(2) .err'))
    P.fill('#rc', rc.lower().replace('-', ' ')); P.click('text=복구 코드로 들어가기'); P.wait_for_selector('.subj')
    st, posts = api(P, '/posts?subject=all')
    check('새 기기(폰)에서 복구 코드 → 내 글 그대로 내 것', any(x['title'] == '반납 전에 쓴 글' and x['mine'] for x in posts['posts']))
    P.screenshot(path=f'{SHOTS}a1_recovered_phone.png')

    # 3. 복구 코드 새로 만들면 예전 코드는 못 씀
    P.goto(BASE + '/#/settings'); P.wait_for_selector('text=복구 코드 새로 만들기')
    P.screenshot(path=f'{SHOTS}a2_settings_phone.png', full_page=True)
    P.click('text=복구 코드 새로 만들기'); rc2 = close_modal(P, wait=None)
    cq, Q = new_user(b); Q.goto(BASE + '/')
    st = api(Q, '/recover', 'POST', {'code': rc})[0]
    st2 = api(Q, '/recover', 'POST', {'code': rc2})[0]
    check('새 복구 코드만 통함', st == 403 and st2 == 200, f'{st},{st2}')

    # 4. 로그아웃은 그 기기만
    st = api(Q, '/logout', 'POST')[0]; st_after = api(Q, '/me')[0]; st_p = api(P, '/me')[0]
    check('로그아웃: 그 기기만 나가고 다른 기기는 유지', st == 200 and st_after == 401 and st_p == 200, f'{st},{st_after},{st_p}')

    # 5. 운영 화면: 번호 태그, 운영자 지정, 차단
    O.goto(BASE + '/#/admin'); O.wait_for_selector('.urow')
    O.screenshot(path=f'{SHOTS}a3_admin_pc.png')
    check('운영 화면에 사용자 2명', O.locator('.urow').count() == 2)
    O.goto(BASE + '/#/'); O.wait_for_selector('.item-title')
    O.click('.subj[data-key="all"]'); O.wait_for_selector('.admin-tag')
    check('운영자에게만 작성자 번호 보임', O.locator('.admin-tag').count() >= 1 and P.evaluate("fetch('/api/posts?subject=all').then(r=>r.json()).then(j=>j.posts[0].tag)") is None)
    O.goto(BASE + '/#/admin'); O.wait_for_selector('.urow')
    O.click('text=운영자 지정'); O.wait_for_selector('text=운영자 해제')
    pm = api(P, '/me')[1]
    check('소유자가 학생을 운영자로 지정', pm['isAdmin'] and not pm['isOwner'])
    # 일반 운영자는 다른 운영자 지정 못 함
    sid_owner = [u for u in api(P, '/admin/users')[1]['users'] if u['isOwner']][0]['id']
    st = api(P, f'/admin/users/{sid_owner}', 'PATCH', {'banned': True})[0]
    check('운영자는 소유자를 못 막음', st == 403, str(st))
    O.click('text=운영자 해제'); O.wait_for_selector('text=운영자 지정')
    O.click('text=글쓰기 막기'); O.wait_for_selector('.urow.banned')
    st = api(P, '/posts', 'POST', {'cat': '잡담', 'subject': 10, 'title': '차단 후 글'})[0]
    check('차단된 사용자는 글 못 씀(403)', st == 403, str(st))
    P.goto(BASE + '/#/'); P.wait_for_selector('.list'); P.wait_for_timeout(800)
    P.screenshot(path=f'{SHOTS}a6_banned_phone.png')
    check('차단되면 글쓰기 칸 대신 안내', P.locator('.compose-open, .title-in').count() == 0 and '제한' in P.inner_text('main'))
    check('차단돼도 읽기는 됨', api(P, '/posts?subject=all')[0] == 200)
    O.click('text=제한 풀기'); O.wait_for_selector('text=글쓰기 막기')
    P.wait_for_timeout(15500)
    st = api(P, '/posts', 'POST', {'cat': '잡담', 'subject': 10, 'title': '풀린 뒤 글'})[0]
    check('제한 풀면 다시 글쓰기', st == 201, str(st))
    P.reload(); P.wait_for_selector('.compose-open')
    check('제한 풀리면 글쓰기 칸 돌아옴', P.locator('.compose-open').count() == 1)

    # 6. 패스키: 가상 인증기로 등록 → 새 기기에서 지문 로그인
    cdp = O.context.new_cdp_session(O)
    cdp.send('WebAuthn.enable')
    auth = cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': True, 'hasUserVerification': True, 'isUserVerified': True, 'automaticPresenceSimulation': True}})
    O.goto(BASE + '/#/settings'); O.wait_for_selector('text=이 기기에 패스키 등록')
    O.click('text=이 기기에 패스키 등록'); O.wait_for_selector('.pk-list li .link-btn', timeout=8000)
    check('패스키 등록됨', api(O, '/me')[1]['passkeys'] == 1)
    O.screenshot(path=f'{SHOTS}a4_passkey_settings.png', full_page=True)
    creds = cdp.send('WebAuthn.getCredentials', {'authenticatorId': auth['authenticatorId']})['credentials']
    # 같은 가상 인증기(=같은 폰)를 쓰는 "새 브라우저"
    co.clear_cookies()
    O.goto(BASE + '/#/join'); O.reload(); O.wait_for_selector('.pk-btn')
    O.click('.pk-btn'); O.wait_for_selector('.subj', timeout=8000)
    me2 = api(O, '/me')[1]
    check('쿠키 지운 뒤 패스키로 소유자 계정 복귀', me2['isOwner'], str(me2.get('isOwner')))
    # 다른 사람 인증기 없이 서명 위조 시도 → 실패
    opts = api(X, '/passkey/login/options', 'POST')[1]
    bad = api(X, '/passkey/login/verify', 'POST', {'challengeId': opts['challengeId'], 'rawId': creds[0]['credentialId'].replace('+','-').replace('/','_').rstrip('='),
              'clientDataJSON': 'e30', 'authenticatorData': 'AAAA', 'signature': 'AAAA'})
    check('가짜 서명은 거절', bad[0] == 403, str(bad))
    # 패스키 지우기
    O.goto(BASE + '/#/settings'); O.wait_for_selector('.pk-list li .link-btn'); O.click('.pk-list li .link-btn'); O.wait_for_timeout(600)
    check('패스키 지우기', api(O, '/me')[1]['passkeys'] == 0)

    # 7. 입장 화면 모습
    cz, Z = new_user(b, 390, 844)
    Z.goto(BASE + '/'); Z.wait_for_selector('#code'); Z.screenshot(path=f'{SHOTS}a5_join_phone.png', full_page=True)
    b.close()

print('\nconsole errors:', errors or 'none')
print(f"{sum(1 for _, ok, _ in results if ok)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok, _ in results) and not errors else 1)
