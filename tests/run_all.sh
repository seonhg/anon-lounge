#!/usr/bin/env bash
# 모든 엔드투엔드 테스트 실행 (Node 22+, Python 3, Playwright 필요)
#   pip install playwright && playwright install chromium
#   bash tests/run_all.sh            # 전부
#   bash tests/run_all.sh notes sec  # 골라서
# 크롬 경로를 직접 지정하려면 CHROME_PATH=/usr/bin/google-chrome
cd "$(dirname "$0")/.."
SUITES=${*:-"e2e acct edit sec alerts replies emoji notes credit profile media teams chat closed demo"}
pass=0; fail=0
for t in $SUITES; do
  pkill -f "node dev/server.mjs" 2>/dev/null; sleep 0.5
  if [ "$t" = media ]; then GIPHY_FAKE=1 node dev/server.mjs >/tmp/al-dev.log 2>&1 & else node dev/server.mjs >/tmp/al-dev.log 2>&1 & fi
  sleep 1.5
  echo "== $t"
  if python3 "tests/$t.py" | grep -E "^(FAIL|[0-9]+/[0-9]+ passed)"; then :; fi
  if [ "${PIPESTATUS[0]}" = 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi
done
pkill -f "node dev/server.mjs" 2>/dev/null
echo "묶음 통과 $pass / 실패 $fail"
[ "$fail" = 0 ]
