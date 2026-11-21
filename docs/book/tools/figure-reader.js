// 단행본 HTML 안에 포함된 그림을 재사용해 오프라인에서도 원본 픽셀을 살펴볼 수 있게 한다.
(() => {
  // 독자가 긴 파일을 한 번에 붙여 넣을 수 있게 코드 원문만 복사한다.
  for (const listing of document.querySelectorAll('.file-listing')) {
    const code = listing.querySelector('pre > code');
    const bar = document.createElement('div');
    bar.className = 'file-copy-bar';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '파일 전체 코드 복사';
    const message = document.createElement('span');
    message.setAttribute('role', 'status');
    bar.append(button, message);
    listing.prepend(bar);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        message.textContent = '복사했습니다. VS Code 편집기에 붙여 넣으세요.';
      } catch {
        // 파일로 연 브라우저가 클립보드 접근을 막으면 원문을 선택해 직접 복사하도록 한다.
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        message.textContent = '코드가 선택되었습니다. Ctrl+C로 복사하세요.';
      }
    });
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'image-reader';
  dialog.setAttribute('aria-label', '책 그림 확대');
  dialog.innerHTML = `<div class="reader-bar"><span class="reader-title"></span>
    <button type="button" class="reader-size">화면에 맞춤</button>
    <button type="button" class="reader-close" autofocus>닫기</button></div>
    <div class="reader-scroll" tabindex="0" aria-label="확대한 그림"><img alt=""></div>`;
  document.body.append(dialog);
  const photo = dialog.querySelector('img');
  const size = dialog.querySelector('.reader-size');
  const area = dialog.querySelector('.reader-scroll');
  let trigger;
  function fit(on) {
    dialog.classList.toggle('reader-fit', on);
    size.textContent = on ? '원본 크기' : '화면에 맞춤';
    area.scrollTo(0, 0);
  }
  for (const original of document.querySelectorAll('figure img')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'open-figure';
    button.setAttribute('aria-label', original.alt + ' 원본 크기로 보기');
    button.title = '원본 크기로 보기';
    original.replaceWith(button);
    button.append(original);
    button.addEventListener('click', () => {
      trigger = button;
      photo.alt = original.alt;
      photo.src = original.currentSrc || original.src;
      dialog.querySelector('.reader-title').textContent = original.alt;
      fit(false);
      dialog.showModal();
    });
  }
  size.addEventListener('click', () => fit(!dialog.classList.contains('reader-fit')));
  dialog.querySelector('.reader-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    photo.removeAttribute('src');
    trigger?.focus({preventScroll: true});
  });
})();
