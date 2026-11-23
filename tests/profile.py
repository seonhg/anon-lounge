import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, json
from playwright.sync_api import sync_playwright
B='http://localhost:8788'; O=SHOTS; res=[]; errs=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
def mk(b, w=1280, h=900):
    pg=b.new_context(viewport={'width':w,'height':h}, bypass_csp=True, device_scale_factor=2 if w < 500 else 1).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); return pg
def join(pg, code):
    pg.goto(B+'/'); pg.wait_for_selector('#code'); pg.fill('#code',code); pg.click('button[type=submit]'); pg.wait_for_selector('.rc-code'); pg.check('#rc-ok'); pg.click('.modal .btn:not(.ghost)'); pg.wait_for_selector('.subj')
def api(pg, path, method='GET', body=None):
    return pg.evaluate("async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return [r.status, await r.json().catch(()=>null)]}", [path, method, body])
def go(pg, hsh):
    pg.goto(B+'/#/alerts'); pg.wait_for_selector('h1'); pg.goto(B+'/'+hsh)
PNG = "(async()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='#7c4dff';g.fillRect(0,0,400,300);g.fillStyle='#fff';g.font='120px sans-serif';g.fillText('홍',130,200);return await new Promise(r=>c.toBlob(r,'image/png'))})()"
with sync_playwright() as p:
    b = p.chromium.launch(**CHROME, args=['--no-sandbox'])
    A = mk(b); join(A, 'test-code'); Bq = mk(b); join(Bq, 'test-code')
    # 익명 글 먼저
    A.click('.compose-open'); A.fill('.title-in','익명으로 쓴 비밀 질문'); A.click('.comp-foot .btn'); A.wait_for_selector('.item-title'); A.wait_for_timeout(15500)
    go(A, '#/settings'); A.wait_for_selector('.profile-edit')
    check('실명 꺼져 있으면 프로필 꾸미기 잠김', '실명으로 활동하기"를 켜면' in A.inner_text('.profile-edit') and api(A,'/me/profile','PATCH',{'bio':'x'})[0] == 403)
    # 실명 켜기
    A.fill('#real-name','홍길동'); A.click('.switch input'); A.click('section.card .btn >> nth=0'); A.wait_for_selector('.pf-emoji-grid')
    check('실명 켜면 꾸미기 화면 + 미리보기', A.locator('.pf-preview-wrap .pf-name').inner_text() == '홍길동')
    A.click('.pf-emoji-grid button[aria-label="🦊"]'); A.click('.pf-color.pc-mint')
    A.fill('.pf-field input[aria-label="한 줄 소개"]', 'AI 개발자를 꿈꾸는 중 🚀 <b>x</b>')
    for t in ['Python','Azure','프롬프트']:
        A.fill('.pf-tags input', t); A.keyboard.press('Enter')
    A.click('text=+ 링크 추가'); A.fill('.pf-link-row input[type=text]','GitHub'); A.fill('.pf-link-row input[type=url]','https://github.com/hong')
    A.wait_for_timeout(200)
    check('미리보기에 바로 반영 (이모지·소개·태그·링크)', '🦊' in A.inner_text('.pf-preview-wrap') and '#Azure' in A.inner_text('.pf-preview-wrap') and 'GitHub' in A.inner_text('.pf-preview-wrap'))
    A.click('text=프로필 저장'); A.wait_for_timeout(600)
    me = api(A,'/me')[1]['profile']
    check('프로필 저장', me['emoji']=='🦊' and me['color']=='mint' and me['tags']==['Python','Azure','프롬프트'] and me['links'][0]['url']=='https://github.com/hong', json.dumps(me, ensure_ascii=False)[:200])
    st = api(A,'/me/profile','PATCH',{'links':[{'label':'x','url':'javascript:alert(1)'}]})[0]
    check('javascript: 링크 거절', st == 400, str(st))
    A.screenshot(path=O+'p1_settings_pc.png', full_page=True)
    # 사진 올리기
    with A.expect_file_chooser() as fc: A.click('.seg button:has-text("내 사진")')
    A.evaluate(f"async()=>{{const b=await {PNG}; window.__f=new File([b],'me.png',{{type:'image/png'}});}}")
    data = A.evaluate("async()=>{const b=await (async()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='#7c4dff';g.fillRect(0,0,400,300);return await new Promise(r=>c.toBlob(r,'image/png'))})(); return Array.from(new Uint8Array(await b.arrayBuffer()))}")
    import tempfile, os
    fp = '/tmp/avatar_test.png'; open(fp,'wb').write(bytes(data))
    fc.value.set_files(fp); A.wait_for_selector('.pf-preview-wrap .avatar img', timeout=8000)
    check('프로필 사진 올리기 (정사각형으로 잘라서)', api(A,'/me')[1]['profile']['hasImage'])
    # 실명 글
    go(A, '#/'); A.wait_for_selector('.compose-open'); A.click('.compose-open'); A.fill('.title-in','실명으로 쓴 질문'); A.click('.comp-foot .btn'); A.wait_for_selector('.item-title'); A.wait_for_timeout(500)
    go(Bq, '#/'); Bq.wait_for_selector('.item-title'); Bq.click('.subj[data-key="all"]'); Bq.wait_for_timeout(700)
    real = Bq.locator('.item', has_text='실명으로 쓴 질문'); anon = Bq.locator('.item', has_text='익명으로 쓴 비밀 질문')
    check('실명 글: 이름 옆에 프로필 사진 + 프로필 링크', real.locator('.author-link .avatar img').count() == 1 and '홍길동' in real.inner_text())
    check('익명 글에는 프로필 링크 없음', anon.locator('.author-link').count() == 0)
    lst = api(Bq,'/posts?subject=all')[1]['posts']
    an = [x for x in lst if x['title']=='익명으로 쓴 비밀 질문'][0]
    check('익명 글 응답에 프로필·주소 정보가 아예 없음', an['profile'] is None and 'slug' not in json.dumps(an))
    Bq.screenshot(path=O+'p2_list_pc.png')
    real.locator('.author-link').click(); Bq.wait_for_selector('.pf-page')
    txt = Bq.inner_text('main')
    check('프로필 화면: 이름·소개·태그·링크', '홍길동' in txt and 'AI 개발자를 꿈꾸는 중' in txt and '#Python' in txt and Bq.locator('.pf-link-list a[href="https://github.com/hong"]').count() == 1)
    check('프로필에는 실명 글만 (익명 글 안 나옴)', '실명으로 쓴 질문' in txt and '익명으로 쓴 비밀 질문' not in txt)
    check('프로필에 티어 없음, 실명 활동 수만', '브론즈' not in Bq.inner_text('.pf-page') and '실명 글' in Bq.inner_text('.pf-stats'))
    check('소개의 HTML은 글자로', Bq.locator('.pf-bio b').count() == 0 and '<b>x</b>' in Bq.inner_text('.pf-bio'))
    Bq.screenshot(path=O+'p3_profile_pc.png', full_page=True)
    # 실명 답변에도
    pid = [x for x in lst if x['title']=='실명으로 쓴 질문'][0]['id']
    Bq.goto(B+f'/#/post/{pid}'); Bq.wait_for_selector('.post'); Bq.fill('textarea[aria-label="답변 내용"]','좋은 질문!'); Bq.click('text=답변 올리기'); Bq.wait_for_timeout(600)
    A.wait_for_timeout(5200); go(A, f'#/post/{pid}'); A.wait_for_selector('.post'); A.fill('textarea[aria-label="답변 내용"]','감사해요'); A.click('text=답변 올리기'); A.wait_for_selector('.answer .author-link')
    check('실명 답변에 프로필, 익명 답변엔 없음', A.locator('.answer', has_text='감사해요').locator('.author-link').count() == 1 and A.locator('.answer', has_text='좋은 질문!').locator('.author-link').count() == 0)
    slug = api(A,'/me')[1]['profile']['slug']; img = api(A,'/me')[1]['profile']['image']
    # 실명 끄면 프로필 닫힘
    go(A, '#/settings'); A.wait_for_selector('.switch input'); A.click('.switch input'); A.click('section.card .btn >> nth=0'); A.wait_for_timeout(700)
    check('실명 끄면 프로필 화면 닫힘', api(Bq, f'/profiles/{slug}')[0] == 404)
    check('실명 끄면 프로필 사진도 남에게 안 보임', Bq.evaluate(f"fetch('{img}',{{cache:'no-store'}}).then(r=>r.status)") == 404)
    lst = api(Bq,'/posts?subject=all')[1]['posts']
    check('실명 끈 뒤 예전 실명 글은 이름만 (프로필 링크 없음)', [x for x in lst if x['title']=='실명으로 쓴 질문'][0]['profile'] is None)
    # 다시 켜면 그대로
    A.click('.switch input'); A.click('section.card .btn >> nth=0'); A.wait_for_timeout(700)
    check('다시 켜면 꾸민 프로필 그대로', api(Bq, f'/profiles/{slug}')[1]['profile']['emoji'] == '🦊')
    # 쓴 글 기록 비공개
    go(A, '#/settings'); A.wait_for_selector('.profile-edit .switch input')
    A.locator('.profile-edit .switch input').click(); A.click('text=프로필 저장'); A.wait_for_timeout(600)
    st, d = api(Bq, f'/profiles/{slug}')
    check('글 기록 비공개: 남에게 글 목록·숫자 안 보냄', st == 200 and d['postsHidden'] and d['posts'] == [] and d['stats'] is None)
    check('글 기록 비공개여도 이름·소개는 보임', d['profile']['name'] == '홍길동' and 'AI 개발자' in d['profile']['bio'])
    go(Bq, f'#/u/{slug}'); Bq.wait_for_selector('.pf-page')
    check('남이 보면 "비공개" 안내, 글 제목 없음', '비공개로 해뒀어요' in Bq.inner_text('main') and '실명으로 쓴 질문' not in Bq.inner_text('main') and Bq.locator('.pf-stats').count() == 0)
    Bq.screenshot(path=O+'p6_private_pc.png')
    st, d = api(A, f'/profiles/{slug}')
    check('본인은 비공개여도 자기 글 기록 보임', len(d['posts']) == 1 and d['privateToOthers'])
    A.locator('.profile-edit .switch input').click(); A.click('text=프로필 저장'); A.wait_for_timeout(600)
    check('다시 켜면 공개', len(api(Bq, f'/profiles/{slug}')[1]['posts']) == 1)
    # 폰
    M = b.new_context(viewport={'width':390,'height':844}, storage_state=Bq.context.storage_state(), bypass_csp=True, device_scale_factor=2).new_page()
    M.goto(B+f'/#/u/{slug}'); M.wait_for_selector('.pf-page'); M.wait_for_timeout(400); M.screenshot(path=O+'p4_profile_phone.png', full_page=True)
    MA = b.new_context(viewport={'width':390,'height':844}, storage_state=A.context.storage_state(), bypass_csp=True, device_scale_factor=2).new_page()
    MA.goto(B+'/#/settings'); MA.wait_for_selector('.pf-emoji-grid, .pf-preview-wrap'); MA.wait_for_timeout(400); MA.locator('.profile-edit').screenshot(path=O+'p5_settings_phone.png')
    b.close()
print('errors:', errs or 'none'); print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) and not errs else 1)
