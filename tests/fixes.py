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
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json().catch(()=>null)]}", [path, method, body])
ERR = "openai.RateLimitError: Error code: 429\n{'error': {'code': '429'}}"
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    C = mk(b); join(C, 'admin-code')
    A = mk(b); join(A, 'test-code'); Bq = mk(b); join(Bq, 'test-code')

    # 설정에서 사이트 이름·과목 목록이 내려옴
    st, d = api(A, '/status')
    check('/api/status 가 사이트 설정(이름·과목)을 줌', st == 200 and d['site']['name'] and len(d['site']['subjects']) >= 1, str(d.get('site', {}).get('name')))
    nsub = len(d['site']['subjects'])

    # 탭 열기
    A.click('.side a[href="#/fixes"]'); A.wait_for_selector('h1:has-text("해결")')
    check('사이드바에 해결 탭, 목록 열림', A.locator('.fx-search').count() == 1)
    check('빈 목록 안내', '아직 기록이 없어요' in A.inner_text('.list'))

    # 새 기록 (해결 방법 없이 → 미해결)
    A.click('a.compose-bar'); A.wait_for_selector('#fx-symptom')
    A.fill('.fx-form .title-in', '채팅 실습 429 에러'); A.fill('#fx-symptom', ERR); A.fill('#fx-env', 'Azure OpenAI · gpt-4o-mini')
    A.click('.fx-form .comp-foot .btn'); A.wait_for_selector('article.fx')
    fid = int(A.evaluate('location.hash').split('/')[2])
    check('저장 후 보기, 미해결 표시', '미해결' in A.inner_text('article.fx .item-tags'))
    check('증상은 코드 블록 그대로 (줄바꿈 유지)', "{'error'" in A.inner_text('article.fx .fx-pre') and A.evaluate("document.querySelector('.fx-pre').textContent.includes('\\n')"))
    A.screenshot(path=O+'fx1_view_open.png')

    # 다른 사람이 해결 방법 보태기 (제목·증상은 못 고침)
    Bq.goto(B+f'/#/fixes/{fid}'); Bq.wait_for_selector('article.fx')
    Bq.click('article.fx a.btn'); Bq.wait_for_selector('#fx-solution')
    check('남의 기록: 제목·증상은 읽기 전용', Bq.get_attribute('.fx-form .title-in', 'readonly') is not None and Bq.get_attribute('#fx-symptom', 'readonly') is not None)
    Bq.fill('#fx-cause', '배포의 TPM 한도가 낮음'); Bq.fill('#fx-solution', '배포 편집에서 **TPM**을 올려요.\n\n```\ntime.sleep(2 ** i)\n```')
    Bq.click('.fx-form .comp-foot .btn'); Bq.wait_for_selector('article.fx')
    check('보태면 해결됨으로 바뀜', '해결됨' in Bq.inner_text('article.fx .item-tags'))
    check('해결 방법은 마크다운으로 (굵게·코드)', Bq.locator('article.fx .fx-sec strong').count() >= 1 and Bq.locator('article.fx .fx-sec pre').count() >= 1)
    st, _ = api(Bq, f'/fixes/{fid}', 'PATCH', {'title': '바꿔치기'})
    check('남이 제목 바꾸기 → 403', st == 403, str(st))
    st, _ = api(Bq, f'/fixes/{fid}', 'DELETE')
    check('남이 지우기 → 403', st == 403, str(st))

    # 나도 겪었어요
    Bq.click('.metoo'); Bq.wait_for_timeout(300)
    check('나도 겪었어요 +1', Bq.get_attribute('.metoo', 'aria-pressed') == 'true' and '1' in Bq.inner_text('.metoo'))
    Bq.click('.metoo'); Bq.wait_for_timeout(300)
    check('다시 누르면 취소', Bq.get_attribute('.metoo', 'aria-pressed') == 'false' and Bq.inner_text('.metoo').strip().endswith('0'))
    Bq.click('.metoo'); Bq.wait_for_timeout(300)

    # 두 번째 기록 (미해결) + 검색·필터·정렬
    A.wait_for_timeout(5200)
    st, d2 = api(A, '/fixes', 'POST', {'subject': 1, 'title': 'Codespaces 포트 안 열림', 'symptom': "This site can't be reached 50%_done"})
    check('API로 새 기록', st == 200, str(st))
    st, l = api(A, '/fixes?subject=all&q=RateLimit')
    check('에러 문구 검색', st == 200 and [f['id'] for f in l['fixes']] == [fid])
    st, l = api(A, '/fixes?subject=all&q=50%25_')
    check('검색어의 % _ 는 글자 그대로', len(l['fixes']) == 1 and l['fixes'][0]['id'] == d2['id'])
    st, l = api(A, '/fixes?subject=all&q=%25')
    check('% 하나로 전부 나오지 않음', len(l['fixes']) == 1)
    st, l = api(A, '/fixes?subject=all&status=open')
    check('미해결만 보기', [f['id'] for f in l['fixes']] == [d2['id']])
    st, l = api(A, '/fixes?subject=all&sort=metoo')
    check('많이 겪은 순', l['fixes'][0]['id'] == fid and l['fixes'][0]['metoo'] == 1)
    A.goto(B+'/#/fixes'); A.wait_for_selector('.fx-search')
    A.click('.subj[data-key="all"]'); A.wait_for_selector('.list .item-title')
    A.fill('.fx-search', 'TPM'); A.wait_for_timeout(700)
    check('화면 검색: 해결 방법 안의 단어로도 찾음', A.locator('.list .item-title').count() == 1 and '429' in A.inner_text('.list'))
    A.fill('.fx-search', ''); A.wait_for_timeout(700)
    A.click('.fx-filters .chip:has-text("미해결")'); A.wait_for_timeout(500)
    check('화면 필터: 미해결', A.locator('.list .item-title').count() == 1 and 'Codespaces' in A.inner_text('.list'))
    A.screenshot(path=O+'fx2_list.png')

    # 입력 검사
    st, _ = api(A, '/fixes', 'POST', {'subject': nsub + 1, 'title': 'x', 'symptom': 'y'})
    check('없는 과목 번호 → 400', st == 400, str(st))
    st, _ = api(A, '/fixes', 'POST', {'subject': 1, 'title': 'x', 'symptom': ''})
    check('증상 비우면 → 400', st == 400, str(st))

    # 질문 → 해결 기록으로 (글쓰기 간격 15초)
    A.wait_for_timeout(15500)
    st, q = api(A, '/posts', 'POST', {'cat': '질문', 'subject': 10, 'title': 'DeploymentNotFound 떠요', 'body': "NotFoundError: DeploymentNotFound"})
    st, _ = api(Bq, f"/posts/{q['id']}/answers", 'POST', {'body': 'model 자리에 배포 이름을 넣어요'})
    A.goto(B+f"/#/post/{q['id']}"); A.wait_for_selector('.fx-move')
    check('답변 달린 질문에 "해결 기록으로 남기기"', A.locator('.fx-move').count() == 1)
    A.click('.fx-move'); A.wait_for_selector('#fx-symptom')
    check('질문 내용·답변이 미리 채워짐', 'DeploymentNotFound' in A.input_value('#fx-symptom') and '배포 이름' in A.input_value('#fx-solution') and A.input_value('.fx-form .title-in') == 'DeploymentNotFound 떠요')
    A.wait_for_timeout(5200)
    A.click('.fx-form .comp-foot .btn'); A.wait_for_selector('article.fx')
    check('원래 질문 링크가 남음', A.locator(f'article.fx a[href="#/post/{q["id"]}"]').count() == 1)

    # 운영자: 작성자 번호 보이고 지울 수 있음
    C.goto(B+f'/#/fixes/{fid}'); C.wait_for_selector('article.fx')
    check('운영자에게만 작성자 번호', C.locator('article.fx .admin-tag').count() == 1 and A.locator('.admin-tag').count() == 0)
    st, _ = api(C, f'/fixes/{fid}', 'DELETE')
    st2, _ = api(A, f'/fixes/{fid}')
    check('운영자가 지우면 안 보임', st == 200 and st2 == 404, f'{st} {st2}')

    # 휴대폰 화면
    P = mk(b, 390, 844); join(P, 'test-code')
    P.goto(B+'/#/fixes'); P.wait_for_selector('.fx-search')
    check('휴대폰 아래 탭에 해결', P.locator('.side a[href="#/fixes"]').is_visible())
    over = P.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    check('휴대폰에서 가로로 넘치지 않음', not over)
    P.screenshot(path=O+'fx3_phone.png', full_page=True)

    check('페이지 오류 없음', not errs, '; '.join(errs[:3]))
    b.close()
print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
