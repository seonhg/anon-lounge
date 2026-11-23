import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, subprocess, json, sqlite3, os, time
res=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
B='http://localhost:8788/api'
def call(cj, path, method='GET', body=None):
    a=['curl','-s','-b',cj,'-c',cj,'-X',method,'-H','content-type: application/json']
    if body is not None: a+=['-d',json.dumps(body)]
    o=subprocess.run(a+[B+path],capture_output=True,text=True).stdout
    try: return json.loads(o)
    except: return o
A='/tmp/ch-a.cj'; open(A,'w').close(); call(A,'/join','POST',{'code':'test-code'})
r=call(A,'/posts','POST',{'cat':'잡담','subject':5,'title':'오늘 점심 뭐 먹지','body':''})
d=call(A,f"/posts/{r['id']}")['post']
check('잡담은 과목을 골라도 전체(0)로 저장', d['subject']==0, str(d['subject']))
for s in (1,10,16):
    titles=[p['title'] for p in call(A,f'/posts?subject={s}')['posts']]
    check(f'{s}번 과목 화면에도 잡담이 보임', '오늘 점심 뭐 먹지' in titles)
time.sleep(15.5)
q=call(A,'/posts','POST',{'cat':'질문','subject':3,'title':'3과목 질문','body':''})
check('질문은 그 과목에만', '3과목 질문' in [p['title'] for p in call(A,'/posts?subject=3')['posts']] and '3과목 질문' not in [p['title'] for p in call(A,'/posts?subject=4')['posts']])
time.sleep(3.1)
st=call(A,f"/posts/{q['id']}",'PATCH',{'cat':'잡담'})
check('질문을 잡담으로 옮기면 전체로', call(A,f"/posts/{q['id']}")['post']['subject']==0)
st=call(A,f"/posts/{q['id']}",'PATCH',{'cat':'질문','subject':7})
check('잡담을 질문으로 옮기면 고른 과목으로', call(A,f"/posts/{q['id']}")['post']['subject']==7)
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
