// 사이트 설정 — 다른 반·스터디에서 쓸 때는 이 파일만 고치면 돼요.
// 코드를 고치지 않고 Cloudflare 환경 변수로 바꿀 수도 있어요 (환경 변수가 있으면 그게 우선):
//   SITE_NAME          사이트 이름
//   SITE_SUBJECTS      과목 목록. 한 줄에 하나씩 (또는 JSON 배열)
//   SITE_START_SUBJECT 새로 들어온 사람의 시작 과목 번호
// 또는 DB의 settings 표에 key='site', value='{"name":…,"subjects":[…],"startSubject":…}' 로 넣어도 돼요.
// 우선순위: 환경 변수 > DB 설정 > 이 파일
// name: 화면 왼쪽 위와 탭 제목에 보이는 이름
// subjects: 과목(또는 주차·단원) 목록. 순서대로 01, 02… 번호가 붙어요. 1~40개.
// 이미 운영 중인 사이트에서 과목을 지우거나 순서를 바꾸면, 기존 글의 과목 번호가 어긋나요. 끝에 덧붙이는 건 괜찮아요.
export const SITE = {
  name: '익명 라운지',
  // 새로 들어온 사람의 '내 과목' 처음 값 (지금 반이 듣고 있는 과목 번호). 각자 설정에서 바꿀 수 있어요.
  // 아래 과목 목록은 예시예요. 우리 반 커리큘럼으로 바꿔 쓰세요.
  startSubject: 10,
  subjects: [
    '오리엔테이션', 'Git·GitHub', '파이썬 기초', '개발 환경', '데이터 수집', '데이터 전처리', '데이터 시각화', '딥러닝 기초', '팀 프로젝트 1', 'LLM 활용', 'RAG·에이전트', '웹 프론트엔드', '백엔드 API', '배포·운영', '팀 프로젝트 2', '마무리',
  ],
};
export let SUBJECT_COUNT = SITE.subjects.length;

const DEFAULTS = { ...SITE, subjects: [...SITE.subjects] };
let appliedFrom = null;
// 요청마다 부름. 환경 변수가 바뀌었을 때만 다시 계산
export function applyEnvConfig(env = {}, dbSite = null) {
  const db = dbSite && typeof dbSite === 'object' ? dbSite : {};
  const key = [env.SITE_NAME, env.SITE_SUBJECTS, env.SITE_START_SUBJECT, JSON.stringify(db)].join('\u0000');
  if (key === appliedFrom) return;
  appliedFrom = key;
  let subjects = DEFAULTS.subjects;
  const raw = String(env.SITE_SUBJECTS || '').trim();
  if (raw || Array.isArray(db.subjects)) {
    let list = raw ? null : db.subjects;
    if (raw.startsWith('[')) { try { list = JSON.parse(raw); } catch {} }
    if (!Array.isArray(list)) list = raw.split(/\r?\n/);
    list = list.map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 40);
    if (list.length) subjects = list;
  }
  SITE.name = String(env.SITE_NAME || db.name || '').trim().slice(0, 30) || DEFAULTS.name;
  SITE.subjects = subjects;
  SITE.startSubject = Number(env.SITE_START_SUBJECT) || Number(db.startSubject) || DEFAULTS.startSubject;
  SUBJECT_COUNT = subjects.length;
}
