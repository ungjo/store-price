// 종이책 본문 쪽 표식을 기준으로 화면의 현재 위치와 쪽 이동을 연결한다.
(() => {
  const pages = [...document.querySelectorAll('.print-page-anchor[data-page]')];
  if (!pages.length) return;

  const total = Number(pages[pages.length - 1].dataset.page);
  const toolbar = document.createElement('form');
  toolbar.className = 'book-page-nav';
  toolbar.setAttribute('aria-label', '종이책 본문 쪽 이동');
  toolbar.innerHTML = `<span class="book-page-position">본문 <strong>1</strong> / ${total}쪽</span>
    <label class="book-page-input"><span>이동할 본문 쪽</span><input type="number" min="1" max="${total}" step="1" required inputmode="numeric" placeholder="쪽 번호"></label>
    <button type="submit">이동</button>`;
  document.body.prepend(toolbar);
  const current = toolbar.querySelector('strong');
  const input = toolbar.querySelector('input');

  for (const marker of pages) {
    marker.tabIndex = -1;
    marker.setAttribute('role', 'doc-pagebreak');
    marker.setAttribute('aria-label', '본문 ' + marker.dataset.page + '쪽');
  }

  let frame = 0;
  function showCurrentPage() {
    frame = 0;
    // 화면 너비와 그림 크기에 따라 쪽 시작점이 바뀐다. 현재 배치에서 읽기 시작선을 찾는다.
    const line = toolbar.getBoundingClientRect().bottom + 20;
    let lo = 0;
    let hi = pages.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (pages[mid].getBoundingClientRect().top <= line) lo = mid + 1;
      else hi = mid;
    }
    const bottom = Math.ceil(window.scrollY + document.documentElement.clientHeight);
    const index = bottom >= document.documentElement.scrollHeight ? pages.length - 1 : Math.max(0, lo - 1);
    const number = pages[index].dataset.page;
    if (current.textContent !== number) current.textContent = number;
  }
  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(showCurrentPage);
  }
  function measureToolbar() {
    document.documentElement.style.setProperty('--book-page-nav-height', toolbar.offsetHeight + 'px');
    scheduleUpdate();
  }

  toolbar.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.reportValidity()) return;
    const target = document.getElementById('book-page-' + input.valueAsNumber);
    if (!target) return;
    if (window.location.hash !== '#' + target.id) window.location.hash = target.id;
    target.scrollIntoView({ block: 'start' });
    // 다음 Tab은 새 위치의 링크나 조작 요소로 이어진다.
    target.focus({ preventScroll: true });
    input.value = '';
    scheduleUpdate();
  });

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', measureToolbar);
  window.addEventListener('pageshow', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measureToolbar);
    observer.observe(toolbar);
    observer.observe(document.body);
  }
  measureToolbar();
  showCurrentPage();
})();
