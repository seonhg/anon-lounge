// 화면 테마를 그리기 전에 정해서 깜빡임 없애기 (기본: 라이트)
(function () {
  var t = 'light';
  try { t = localStorage.getItem('al-theme') || 'light'; } catch (e) {}
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = t === 'dark' ? '#0A0920' : '#F5F3FF';
})();
