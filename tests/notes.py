import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
PASTE_N = open(os.path.join(os.path.dirname(__file__), 'edit.py')).read().split('PASTE_N = """')[1].split('"""')[0]
def mk(b, w=1280, h=900):
    pg=b.new_context(viewport={'width':w,'height':h}, bypass_csp=True).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json().catch(()=>null)]}", [path, method, body])
def go(pg, hsh):
    pg.goto(B+'/#/settings'); pg.wait_for_selector('.seg'); pg.goto(B+'/'+hsh)
BODY = """## 배포하기
Azure AI Foundry에서 **배포** 메뉴를 열어요.[*왼쪽 메뉴 아래쪽에 있어요]

### 환경 변수
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`

```
az login
```

## 자주 하는 실수
> 키 이름 오타가 제일 많아요
자세한 건 https://learn.microsoft.com 참고"""
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    C = mk(b); join(C, 'admin-code')
    A = mk(b); join(A, 'test-code'); Bq = mk(b); join(Bq, 'test-code')
    # 사이드바 정리 탭 열림
    A.click('.side a[href="#/notes"]'); A.wait_for_selector('h1:has-text("정리")')
    check('정리 탭이 열림 (준비 중 아님)', A.locator('h1', has_text='정리').count() == 1)
    # 새 정리 (나만 보기)
    A.click('a.compose-bar'); A.wait_for_selector('.note-body')
    A.fill('.note-title', '클라우드 OpenAI 배포 정리'); A.fill('.note-body', BODY)
    A.wait_for_timeout(500)
    check('쓰는 동안 오른쪽에 미리보기 (목차 포함)', A.locator('.note-preview .toc li').count() == 3, str(A.locator('.note-preview .toc li').count()))
    # 도구 막대: 굵게
    A.evaluate("()=>{const t=document.querySelector('.note-body'); t.focus(); t.setSelectionRange(t.value.length,t.value.length)}")
    A.keyboard.type('\n중요한 말'); A.evaluate("()=>{const t=document.querySelector('.note-body'); t.setSelectionRange(t.value.length-5,t.value.length)}")
    A.click('.tb-btn[aria-label="굵게"]')
    check('도구 막대 "굵게"로 **글자** 감싸기', A.input_value('.note-body').endswith('**중요한 말**'))
    # 캡처 붙여넣기 → 이미지 들어감 (새 정리면 먼저 저장)
    A.evaluate(PASTE_N, ['.note-body', 1]); A.wait_for_function("document.querySelector('.note-body').value.includes('/api/note-images/')", timeout=10000)
    check('캡처 붙여넣기 → 본문에 이미지', '![](/api/note-images/' in A.input_value('.note-body'))
    A.screenshot(path=O+'w1_editor_pc.png')
    A.click('.note-editor .comp-foot .btn:not(.ghost)'); A.wait_for_selector('article.note')
    nid = int(A.evaluate('location.hash').split('/')[2])
    check('저장 후 보기 화면, 나만 보기', '나만 보기' in A.inner_text('article.note .item-tags'))
    check('목차 3개 + 번호 매김', A.locator('article .toc li').count() == 3 and '1.1.' in A.inner_text('article .toc') and A.inner_text('article .toc li >> nth=0').strip().startswith('1.'))
    check('각주 [1] + 아래 각주 목록', A.locator('article .fn-ref').count() == 1 and '왼쪽 메뉴 아래쪽' in A.inner_text('article .fn-list'))
    check('코드 블록·인용·링크·이미지 그려짐', A.locator('article .md pre').count() == 1 and A.locator('article .md blockquote').count() == 1 and A.locator('article .md a[href^="https://learn"]').count() == 1 and A.locator('article .md img.md-img').count() == 1)
    A.screenshot(path=O+'w2_view_pc.png', full_page=True)
    # 나만 보기는 다른 사람·운영자에게 안 보임
    check('나만 보기 노트: 다른 사람 접근 불가', api(Bq, f'/notes/{nid}')[0] == 404 and api(C, f'/notes/{nid}')[0] == 404)
    img_id = int(A.input_value('.note-body') if False else A.evaluate("document.querySelector('article .md-img').getAttribute('src').split('/').pop()"))
    check('나만 보기 노트 이미지도 다른 사람 접근 불가', api(Bq, f'/note-images/{img_id}')[0] == 404 if False else Bq.evaluate(f"fetch('/api/note-images/{img_id}').then(r=>r.status)") == 404)
    # XSS
    st, r = api(A, '/notes', 'POST', {'subject':10, 'title':'<img src=x onerror=alert(1)>', 'body':'<script>alert(1)</script> [a](javascript:alert(1)) ![](https://evil/x.png)', 'visibility':'private'})
    go(A, f'#/notes/{r["id"]}'); A.wait_for_selector('article.note')
    check('정리 본문 HTML·자바스크립트 링크·외부 이미지 막힘', A.locator('article script, article a[href^="javascript"], article img[src^="https://evil"]').count() == 0 and '<script>' in A.inner_text('article .md'))
    # 공개하기
    go(A, f'#/notes/{nid}'); A.wait_for_selector('article.note'); A.click('text=공개하기'); A.wait_for_timeout(600)
    check('공개 정리로 바뀜', '공개 정리' in A.inner_text('article .item-tags'))
    # 다른 사람(B) 과목 막대에 새 정리 숫자
    go(Bq, '#/'); Bq.wait_for_selector('.subj'); Bq.wait_for_timeout(800)
    check('다른 사람 사이드바 정리 탭에 새 정리 숫자', Bq.locator('.side .note-badge').is_visible() and Bq.inner_text('.side .note-badge') == '1')
    Bq.click('.side a[href="#/notes"]'); Bq.wait_for_selector('.item-title')
    check('정리 목록에 새로 바뀐 점 표시', Bq.locator('.unread-dot.on').count() == 1)
    Bq.click('.subj[data-key="all"]'); Bq.wait_for_timeout(700)
    check('한 번 본 뒤에는 숫자가 사라짐', Bq.locator('.subj[data-key="10"] .badge').count() == 0 and not Bq.locator('.side .note-badge').is_visible())
    # B가 위키처럼 고침
    go(Bq, f'#/notes/{nid}'); Bq.wait_for_selector('article.note'); Bq.click('article a.btn', timeout=5000); Bq.wait_for_function("document.querySelector('.note-body') && document.querySelector('.note-body').value.length > 10")
    Bq.evaluate("()=>{const t=document.querySelector('.note-body'); t.focus(); t.setSelectionRange(t.value.length,t.value.length)}")
    Bq.keyboard.type('\n\n## 비용 아끼기\n안 쓰는 배포는 꼭 지워요.')
    Bq.fill('.note-summary', '비용 내용 추가'); Bq.click('.note-editor .comp-foot .btn:not(.ghost)'); Bq.wait_for_selector('article.note')
    check('다른 사람이 공개 정리를 고침', '비용 아끼기' in Bq.inner_text('article .md') and '2명이' not in '' )
    n = api(A, '/notifications')[1]['notifications']
    check('작성자에게 "내 정리를 누군가 고쳤어요" 알림', any(x['kind']=='note_edit' for x in n))
    lst = api(A, '/notes?scope=public&subject=10')[1]['notes']
    check('목록에 함께 정리한 사람 수 2', lst[0]['contributors'] == 2)
    # 동시에 고치기 → 충돌
    go(A, f'#/notes/{nid}/edit'); A.wait_for_function("document.querySelector('.note-body') && document.querySelector('.note-body').value.includes('비용 아끼기')")
    go(Bq, f'#/notes/{nid}/edit'); Bq.wait_for_function("document.querySelector('.note-body') && document.querySelector('.note-body').value.includes('비용 아끼기')")
    Bq.fill('.note-title', '클라우드 OpenAI 배포 정리 (B 수정)'); Bq.wait_for_timeout(3200); Bq.click('.note-editor .comp-foot .btn:not(.ghost)'); Bq.wait_for_selector('article.note')
    A.fill('.note-title', 'A가 동시에 고친 제목'); A.click('.note-editor .comp-foot .btn:not(.ghost)'); A.wait_for_selector('.conflict:not([hidden])')
    check('동시에 고치면 충돌 안내 + 내 글은 그대로', 'A가 동시에 고친 제목' == A.input_value('.note-title') and '다른 사람이' in A.inner_text('.conflict'))
    A.screenshot(path=O+'w3_conflict.png')
    A.click('text=내 글로 저장 (최신 내용 덮어쓰기)'); A.wait_for_selector('article.note')
    check('충돌 후 내 글로 저장 가능', 'A가 동시에 고친 제목' in A.inner_text('article h2'))
    # 고친 기록 + 되돌리기
    go(A, f'#/notes/{nid}/history'); A.wait_for_selector('.rev-item')
    revs = A.locator('.rev-item').count()
    check('고친 기록 목록 (5번: 붙여넣기 자동 저장 포함)', revs == 5, str(revs))
    A.locator('.rev-item').nth(2).click(); A.wait_for_selector('.diff')
    check('기록 보기: 바뀐 부분(+ 줄)', A.locator('.diff-row.add').count() >= 1 and '비용 아끼기' in A.inner_text('.diff'))
    A.screenshot(path=O+'w4_history.png', full_page=True)
    A.goto(B+f'/#/notes/{nid}/history/1'); A.wait_for_selector('.diff, .sub'); A.click('text=이 기록으로 되돌리기'); A.wait_for_selector('article.note')
    check('1번 기록으로 되돌리기 (새 기록으로 남음)', '비용 아끼기' not in A.inner_text('article .md') and api(A, f'/notes/{nid}/revisions')[1]['current'] == 6)
    # 다른 사람이 고친 정리는 작성자 혼자 못 지움, 나만 보기로도 못 돌림
    d = api(A, f'/notes/{nid}')[1]
    check('함께 고친 정리는 작성자가 지우기·비공개 불가', not d['canDelete'] and not d['canMakePrivate'])
    st = api(A, f'/notes/{nid}', 'DELETE')[0]
    check('API로도 지우기 거절', st == 403, str(st))
    # 도움됐어요 → 작성자 티어
    Dd = mk(b); join(Dd, 'test-code')
    st, r = api(Dd, f'/notes/{nid}/help', 'POST')
    check('도움됐어요 → 작성자 +1, 내용을 더한 B도 +1', r['helped'] and api(A, '/me')[1]['tier']['points'] == 1 and api(Bq, '/me')[1]['tier']['points'] == 1)
    check('함께 정리한 B는 도움됐어요 못 누름', api(Bq, f'/notes/{nid}/help', 'POST')[0] == 400)
    check('내 정리엔 도움됐어요 못 누름', api(A, f'/notes/{nid}/help', 'POST')[0] == 400)
    # 임시 저장 복구
    go(A, f'#/notes/{nid}/edit'); A.wait_for_function("document.querySelector('.note-body') && document.querySelector('.note-body').value.length > 10")
    A.fill('.note-body', '임시 저장 테스트 내용'); A.wait_for_timeout(600)
    A.evaluate("()=>{ window.onbeforeunload = null; }")
    A.context.pages[0].evaluate("()=>{}")
    A2 = A.context.new_page(); A2.on('dialog', lambda d: d.accept()); A2.goto(B+f'/#/notes/{nid}/edit'); A2.wait_for_selector('.note-editor .warn', timeout=6000)
    A2.click('.note-editor .warn .link-btn >> nth=0'); A2.wait_for_timeout(200)
    check('저장 안 한 글 → 다시 열면 불러오기', A2.input_value('.note-body') == '임시 저장 테스트 내용')
    A2.close()
    # 저장 안 하고 나가면 확인
    dialogs = []
    A.remove_listener('dialog', A.listeners('dialog')[0]) if hasattr(A, 'listeners') else None
    # 운영자: 공개 정리 지우기 가능, 차단된 사람은 못 고침
    check('운영자는 함께 쓴 정리도 지우기 가능', api(C, f'/notes/{nid}')[1]['canDelete'])
    # 폰 화면
    M = b.new_context(viewport={'width':390,'height':844}, storage_state=Bq.context.storage_state(), bypass_csp=True).new_page()
    M.goto(B+f'/#/notes/{nid}'); M.wait_for_selector('article.note'); M.wait_for_timeout(300); M.screenshot(path=O+'w5_view_phone.png', full_page=True)
    M.goto(B+f'/#/notes/new/10'); M.wait_for_selector('.mode-tabs'); M.fill('.note-title','폰 정리'); M.fill('.note-body','## 하나\n내용\n## 둘\n내용'); M.click('.mode-tabs button[data-k=preview]'); M.wait_for_timeout(500)
    check('폰: 쓰기/미리보기 탭 전환', M.locator('.note-preview').is_visible() and not M.locator('.note-body').is_visible())
    M.screenshot(path=O+'w6_editor_phone.png')
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
