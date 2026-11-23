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
    pg=b.new_context(viewport={'width':w,'height':h}, bypass_csp=True).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json()]}", [path, method, body])
def answer(pg, pid, text):
    pg.goto(B+'/#/'); pg.wait_for_selector('.subj'); pg.goto(B+f'/#/post/{pid}'); pg.wait_for_selector('.post'); pg.fill('textarea[aria-label="답변 내용"]', text); pg.click('text=답변 올리기'); pg.wait_for_timeout(700)
def reply(pg, pid, target_text, text):
    pg.goto(B+'/#/'); pg.wait_for_selector('.subj'); pg.goto(B+f'/#/post/{pid}'); pg.wait_for_selector('.post')
    pg.locator('.answer', has_text=target_text).locator('.reply-btn').click(); pg.wait_for_selector('.reply-box textarea')
    pg.fill('.reply-box textarea', text); pg.click('.reply-box .btn'); pg.wait_for_timeout(700)
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    C = mk(b); join(C, 'admin-code')
    A = mk(b); join(A, 'test-code'); Bq = mk(b); join(Bq, 'test-code'); D = mk(b); join(D, 'test-code')
    A.click('.compose-open'); A.fill('.title-in','대댓글 테스트'); A.click('.comp-foot .btn'); A.wait_for_timeout(800)
    pid = api(A,'/posts?subject=all')[1]['posts'][0]['id']
    answer(Bq, pid, 'B의 답변입니다')
    A.wait_for_timeout(5200); api(A,'/notifications/read','POST')
    reply(D, pid, 'B의 답변입니다', 'D의 대댓글')
    na = api(A, '/notifications')[1]['notifications']
    d = api(A, f'/posts/{pid}')[1]['answers']
    top = [a for a in d if a['body']=='B의 답변입니다'][0]; rp = [a for a in d if a['body']=='D의 대댓글'][0]
    check('대댓글이 답변 아래에 붙음', rp['parentId'] == top['id'])
    check('대댓글 화면: 들여쓰기 줄 안에 보임', D.locator('.answers.replies .answer.reply', has_text='D의 대댓글').count() == 1)
    nb = api(Bq, '/notifications')[1]['notifications']
    check('답변 쓴 사람(B)에게 "대댓글" 알림', len(nb) == 1 and nb[0]['kind'] == 'reply', str([n['kind'] for n in nb]))
    check('글쓴이(A)에게도 알림', any(n['kind']=='answer' and not n['read'] for n in na))
    # 대댓글에 다시 답글 → 같은 줄기
    Bq.wait_for_timeout(5200); reply(Bq, pid, 'D의 대댓글', 'B가 D에게 다시')
    d = api(A, f'/posts/{pid}')[1]['answers']
    again = [a for a in d if a['body']=='B가 D에게 다시'][0]
    check('대댓글에 답글 → 같은 답변 아래(한 단계)', again['parentId'] == top['id'])
    nd = api(D, '/notifications')[1]['notifications']
    check('본인 답변 줄기에 본인이 단 답글은 B에게 알림 안 감', len(api(Bq,'/notifications')[1]['notifications']) == 1)
    # 익명 번호 유지
    whos = {a['body']: a['author'] for a in d}
    check('대댓글에서도 같은 사람은 같은 익명 번호', whos['B의 답변입니다'] == whos['B가 D에게 다시'] and whos['D의 대댓글'] != whos['B의 답변입니다'], str(whos))
    # 글쓴이가 대댓글 → 익명(글쓴이)
    A.wait_for_timeout(200); reply(A, pid, 'B의 답변입니다', '글쓴이 답글')
    d = api(A, f'/posts/{pid}')[1]['answers']
    check('글쓴이 대댓글은 익명(글쓴이)', [a for a in d if a['body']=='글쓴이 답글'][0]['author'] == '익명(글쓴이)')
    A.goto(B+f'/#/post/{pid}'); A.wait_for_selector('.replies'); A.wait_for_timeout(300); A.screenshot(path=O+'r1_thread_pc.png', full_page=True)
    # 원 답변을 지워도 대댓글은 남음
    Bq.goto(B+'/#/'); Bq.wait_for_selector('.subj'); Bq.goto(B+f'/#/post/{pid}'); Bq.wait_for_selector('.post')
    Bq.locator('.thread > .answers > .answer', has_text='B의 답변입니다').locator('.link-btn', has_text='지우기').click(); Bq.wait_for_timeout(700)
    Bq.reload(); Bq.wait_for_selector('.post'); Bq.wait_for_timeout(300)
    check('원 답변을 지우면 "삭제된 답변" 자리 + 대댓글 유지', '삭제된 답변이에요' in Bq.inner_text('.post') and 'D의 대댓글' in Bq.inner_text('.post'))
    check('지운 답변 아래에는 새 답글 못 담', Bq.locator('.answer.reply .reply-btn').count() == 0)
    st = api(D, f'/posts/{pid}/answers', 'POST', {'body':'x','parentId': top['id']})[0]
    check('API로도 지운 답변엔 답글 거절', st == 404, str(st))
    # 다른 글의 답변을 부모로 지정 못 함
    D.wait_for_timeout(15500)
    api(D, '/posts', 'POST', {'cat':'잡담','subject':10,'title':'다른 글'})
    D.wait_for_timeout(5200)
    pid2 = api(D,'/posts?subject=all')[1]['posts'][0]['id']
    st = api(D, f'/posts/{pid2}/answers', 'POST', {'body':'x','parentId': rp['id']})[0]
    check('다른 글의 답변엔 답글 못 붙임', st == 404, str(st))
    # 폰 화면
    M = b.new_context(viewport={'width':390,'height':844}, storage_state=A.context.storage_state(), bypass_csp=True).new_page()
    M.goto(B+f'/#/post/{pid2}'); M.wait_for_selector('.post'); M.fill('textarea[aria-label="답변 내용"]','폰에서 단 답변'); M.click('text=답변 올리기'); M.wait_for_timeout(900)
    M.goto(B+'/#/'); M.wait_for_selector('.subj'); M.goto(B+f'/#/post/{pid}'); M.wait_for_selector('.replies'); M.wait_for_timeout(300)
    M.screenshot(path=O+'r3_deleted_phone.png', full_page=True)
    M.goto(B+'/#/'); M.wait_for_selector('.subj'); M.goto(B+f'/#/post/{pid2}'); M.wait_for_selector('.reply-btn'); M.click('.reply-btn'); M.wait_for_selector('.reply-box'); M.wait_for_timeout(300)
    M.screenshot(path=O+'r2_thread_phone.png', full_page=True)
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
