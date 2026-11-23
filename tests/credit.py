import os
SHOTS = os.path.join(os.path.dirname(__file__), 'shots') + '/'
os.makedirs(SHOTS, exist_ok=True)
CHROME = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}

import sys, subprocess, json
B='http://localhost:8788/api'; res=[]
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(f'  [{d}]' if d else ''))
def call(cj, path, method='GET', body=None):
    a=['curl','-s','-b',cj,'-c',cj,'-X',method,'-H','content-type: application/json']
    if body is not None: a+=['-d',json.dumps(body)]
    out=subprocess.run(a+[B+path],capture_output=True,text=True).stdout
    try: return json.loads(out)
    except: return out
def join(name):
    cj=f'/tmp/cr-{name}.cj'; open(cj,'w').close(); call(cj,'/join','POST',{'code':'test-code'}); return cj
def pts(cj): return call(cj,'/me')['tier']['points']
import time
A,Bb,Cc,D,E=[join(x) for x in 'abcde']
r=call(A,'/notes','POST',{'subject':10,'title':'함께 정리','body':'## 개념\n처음 쓴 사람이 적은 내용입니다.','visibility':'public'}); nid=r['id']
# B: 의미 있는 내용 추가 (20자 이상)
call(Bb,f'/notes/{nid}','PUT',{'title':'함께 정리','body':'## 개념\n처음 쓴 사람이 적은 내용입니다.\n## 예시\nB가 더한 예시 코드와 설명이 여기에 들어갑니다.','baseRev':1})
time.sleep(3.2)
# C: 오타만 고침
cur=call(A,f'/notes/{nid}')['note']
call(Cc,f'/notes/{nid}','PUT',{'title':'함께 정리','body':cur['body'].replace('내용입니다.','내용입니다!'),'baseRev':cur['rev']})
note=call(A,f'/notes/{nid}')['note']
cr={c['name']:c['credited'] for c in note['contributors']}
check('작성자·20자 이상 더한 사람은 받음, 오타만 고친 사람은 안 받음', cr.get('익명(작성자)') and cr.get('익명1') and cr.get('익명2') is False, str(cr))
# D(구경꾼)가 도움됐어요
r=call(D,f'/notes/{nid}/help','POST'); check('구경꾼이 도움됐어요', r.get('helped') is True, str(r))
check('작성자 +1', pts(A)==1, str(pts(A)))
check('글을 더한 사람(B)도 +1', pts(Bb)==1, str(pts(Bb)))
check('오타만 고친 사람(C)은 0', pts(Cc)==0, str(pts(Cc)))
# 함께 정리한 사람은 못 누름
r=call(Bb,f'/notes/{nid}/help','POST'); check('함께 정리한 사람은 도움됐어요 못 누름', isinstance(r,dict) and '함께 정리한' in r.get('error',''), str(r))
check('보기 화면 정보: 함께 정리한 사람은 canHelp 거짓', call(Bb,f'/notes/{nid}')['note']['canHelp'] is False and call(E,f'/notes/{nid}')['note']['canHelp'] is True)
# E가 눌렀다 취소
call(E,f'/notes/{nid}/help','POST'); check('E도 누르면 작성자 2', pts(A)==2)
call(E,f'/notes/{nid}/help','POST'); check('취소하면 다시 1', pts(A)==1 and pts(Bb)==1)
# 구경꾼이 누른 뒤에 글을 더해도 자기 도움은 자기에게 안 감
time.sleep(3.2)
cur=call(A,f'/notes/{nid}')['note']
call(D,f'/notes/{nid}','PUT',{'title':'함께 정리','body':cur['body']+'\n## 정리\nD가 나중에 와서 더한 마무리 문단입니다. 충분히 길어요.','baseRev':cur['rev']})
check('도움 누른 사람이 나중에 글을 더해도 자기 도움은 자기 점수에 안 들어감', pts(D)==0, str(pts(D)))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
