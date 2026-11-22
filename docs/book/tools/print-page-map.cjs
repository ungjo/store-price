const path = require('node:path');
const { execFileSync } = require('node:child_process');

function collectPrintedText() {
  const pieces = [];
  const parts = [];
  let size = 0;
  function add(node, text, generated = false) {
    const normalized = [];
    const offsets = [];
    let index = 0;
    for (const glyph of text) {
      for (const ch of glyph.normalize('NFKC')) {
        if (/[\s\u00ad\u200b\ufeff]/u.test(ch)) continue;
        normalized.push(ch);
        offsets.push(index);
      }
      index += glyph.length;
    }
    if (!offsets.length) return;
    parts.push(normalized.join(''));
    pieces.push({ node, from: size, to: size + offsets.length, offsets, generated });
    size += offsets.length;
  }
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      add(node, node.nodeValue);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches('script, style, dialog, .license-screen, .capture-original, .toc-top, .file-copy-bar')) return;
    // 인쇄용 CSS가 만드는 글자도 대조하되 HTML에서는 그 글자가 붙는 요소를 가리킨다.
    if (node.matches('pre[data-language]')) add(node, node.dataset.language, true);
    if (node.matches('.source-line')) add(node, node.dataset.line, true);
    if (node.matches('ol > li')) {
      const position = Array.prototype.indexOf.call(node.parentNode.children, node);
      add(node, String((node.parentNode.start || 1) + position) + '.', true);
    }
    if (node.tagName === 'IMG' && node.getAttribute('src')?.startsWith('data:image/svg+xml;base64,')) {
      const bytes = Uint8Array.from(atob(node.src.split(',')[1]), c => c.charCodeAt(0));
      const svg = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
      for (const t of svg.querySelectorAll('text')) add(node, t.textContent, true);
      return;
    }
    for (const child of node.childNodes) visit(child);
  }
  for (const part of document.querySelectorAll('body > article, body > .contents')) visit(part);
  return { text: parts.join(''), pieces };
}

function insertPageMarkers({ model, matches }) {
  let index = 0;
  const starts = [];
  for (const [i, {offset, printPrefix}] of matches.entries()) {
    while (index < model.pieces.length && model.pieces[index].to <= offset) index++;
    const piece = model.pieces[index];
    if (!piece || offset < piece.from) throw Error('인쇄본 문자 위치를 찾을 수 없습니다.');
    const { node, generated } = piece;
    const parent = generated ? node : node.parentElement;
    if (printPrefix) {
      // 인쇄에서만 반복되는 표 머리글·코드 행 번호 외의 문장이 누락되면 빌드를 멈춘다.
      const prefix = printPrefix;
      const header = parent.closest('table')?.tHead?.textContent || '';
      const line = parent.closest('.source-line');
      if (line && /^\d+$/.test(prefix)) {
        const label = line.parentElement.querySelector('[data-line="' + prefix + '"]');
        if (label && (label === line || (label.nextElementSibling === line && !label.textContent.trim()))) {
          starts.push({element: label});
          continue;
        }
      }
      if (header.normalize('NFKC').replace(/[\s\u00ad\u200b\ufeff]/gu, '') !== prefix) {
        throw Error((i+1) + '쪽 시작 위치를 확인할 수 없습니다: ' + prefix);
      }
    }
    const element = parent.closest('figure, .license-print, .toc-row');
    let at = piece.offsets[offset - piece.from];
    // 코드 줄이나 문단을 중간에서 나누는 쪽은 실제 첫 문자 위치를 보존한다.
    // 그림은 PDF의 첫 텍스트가 캡션일 수 있어서 그림의 시작에 둔다.
    if (element) starts.push({ element });
    else if (generated) starts.push({ element: node });
    else {
      if (!node.data.slice(0, at).trim()) at = 0;
      starts.push({ node, at });
    }
  }
  for (let n = starts.length; n > 0; n--) {
    const { node, at, element } = starts[n-1];
    const marker = document.createElement('span');
    marker.className = 'print-page-anchor';
    marker.id = 'book-page-' + n;
    marker.dataset.page = String(n);
    marker.setAttribute('role', 'doc-pagebreak');
    marker.setAttribute('aria-label', '종이책 ' + n + '쪽');
    if (element) {
      if (element.matches('.license-print, .toc-row, img')) element.before(marker);
      else element.prepend(marker);
    } else {
      const range = document.createRange();
      range.setStart(node, at);
      range.collapse(true);
      range.insertNode(marker);
    }
  }
  return Array.from(document.querySelectorAll('.print-page-anchor'), (node, i) => {
    if (Number(node.dataset.page) !== i+1) throw Error('HTML 안에서 쪽 순서가 달라졌습니다: ' + node.id);
    return {page: i+1, id: node.id};
  });
}

async function markPrintPages(page, { pdf, python, count }) {
  const model = await page.evaluateHandle(collectPrintedText);
  try {
    const text = await model.evaluate(x => x.text);
    const output = execFileSync(python, [path.join(__dirname, 'print_page_offsets.py'), pdf], {
      input: JSON.stringify(text), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const matches = JSON.parse(output);
    if (matches.length !== count) throw Error('PDF와 HTML의 쪽수가 다릅니다.');
    return await page.evaluate(insertPageMarkers, {model, matches});
  } finally {
    await model.dispose();
  }
}

module.exports = { markPrintPages };
