import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { privacyContactEmail, privacyPolicy } from '../../apps/mobile/src/features/privacy/privacy-policy.ts';

const outputDirectory = new URL('../../docs/privacy/', import.meta.url);
const outputFile = new URL('index.html', outputDirectory);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('사용법: node scripts/build/privacy-page.mjs [--check]');
}

const escapeText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sections = privacyPolicy.sections.map(({ heading, paragraphs }) => [
  '    <section>',
  '      <h2>' + escapeText(heading) + '</h2>',
  ...paragraphs.map((paragraph) => {
    const content = paragraph === privacyContactEmail
      ? '<a href="mailto:' + encodeURI(privacyContactEmail) + '">' + escapeText(paragraph) + '</a>'
      : escapeText(paragraph);
    return '      <p>' + content + '</p>';
  }),
  '    </section>',
].join('\n'));

// 별도 분석 도구나 외부 글꼴 없이 문서 하나로 앱과 같은 방침을 제공합니다.
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeText(privacyPolicy.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fcfbf7; color: #293d31; font-family: system-ui, sans-serif; }
    main { max-width: 45rem; margin: 0 auto; padding: 1rem clamp(1rem, 5vw, 2.5rem) 3rem; }
    h1 { font-size: clamp(1.8rem, 6vw, 2.5rem); line-height: 1.3; }
    h2 { margin: 2rem 0 .5rem; font-size: 1.35rem; }
    p { margin: .5rem 0; line-height: 1.75; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeText(privacyPolicy.title)}</h1>
    <p>시행일 <time datetime="${privacyPolicy.effectiveDate}">${privacyPolicy.effectiveDate}</time></p>
${sections.join('\n')}
  </main>
</body>
</html>
`;

if (args[0] === '--check') {
  const published = await readFile(outputFile, 'utf8');
  if (published.replaceAll('\r\n', '\n') !== html) {
    throw new Error('앱 방침과 웹페이지가 다릅니다. node scripts/build/privacy-page.mjs로 다시 생성하세요.');
  }
  console.log('앱 개인정보처리방침과 웹페이지가 일치합니다.');
} else {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, html, 'utf8');
}
