/* 설치기 원본에서 확인한 창 배치와 글자를 벡터로 합쳐 종이와 화면에서 함께 사용한다. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const figures = path.join(__dirname, '..', 'manuscript', 'figures');
const artwork = path.join(figures, 'vscode-setup-artwork');
const modules = process.env.BOOK_NODE_MODULES || path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules');
const { chromium } = require(path.join(modules, 'playwright'));
const stages = new Map([
  ['license', '사용권 계약'],
  ['tasks', '추가 작업 선택'],
  ['copilot', 'GitHub Copilot CLI 선택'],
  ['ready', '설치 준비 완료']
]);
const width = 3000;
const height = 2260;
const logoFile = fs.readFileSync(path.join(artwork, 'code-icon.svg'), 'utf8').trim();
const logo = logoFile.slice(logoFile.indexOf('>') + 1, logoFile.lastIndexOf('</svg>'));

function makeDiagram(name, title) {
  const body = fs.readFileSync(path.join(artwork, name + '.svgpart'), 'utf8').trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="ko" width="${width}" height="${height}" viewBox="0 0 600 452" role="img" aria-labelledby="figureTitle figureDesc" font-family="Malgun Gothic, Segoe UI, sans-serif" fill="#121212">
<title id="figureTitle">Visual Studio Code 사용자용 설치기 · ${title}</title>
<desc id="figureDesc">한국어 Windows에서 연 VS Code 1.147.0의 실제 설치 캡처를 바탕으로 재구성한 도해. 글자와 단추를 벡터로 조판했다.</desc>
<metadata>Visual Studio Code icon © Microsoft Corporation. VS Code 1.147.0, 8a14f0cc1b08d531eb83255ea3764ae22aa932b5, out/vs/workbench/browser/media/code-icon.svg. https://code.visualstudio.com/brand</metadata>
<defs><symbol id="codeIcon" viewBox="0 0 256 256" fill="none">${logo}</symbol></defs>
<rect x=".5" y=".5" width="599" height="451" fill="#fff" stroke="#8e979d"/>
<rect x="1" y="404" width="598" height="47" fill="#f0f0f0"/>
<path d="M1 404.5H599" fill="none" stroke="#aaa"/>
<use xlink:href="#codeIcon" x="8" y="6" width="16" height="16"/>
<text x="28" y="20" font-size="12.5">Microsoft Visual Studio Code (User) 설치</text>
<g fill="none" stroke-width="1">
  <path d="M476 15.5h10" stroke="#222"/>
  <rect x="522.5" y="9.5" width="9" height="9" stroke="#c4c4c4"/>
  <path d="m569.5 9.5 9 9m0-9-9 9" stroke="#282828"/>
</g>
<use xlink:href="#codeIcon" x="548" y="36" width="43" height="43"/>
${body}
</svg>
`;
}

async function render() {
  const options = {};
  if (process.env.BOOK_CHROME || process.platform === 'win32') {
    options.executablePath = process.env.BOOK_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  }
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    const diagrams = [...stages].map(([name,title]) => ({
      base: '02-vscode-setup-'+name, svg: makeDiagram(name,title), generated: true
    }));
    for (const name of ['setup-info','components','editor','path','terminal','finish']) {
      const base = '02-git-'+name;
      diagrams.push({base, svg: fs.readFileSync(path.join(figures,base+'.svg'),'utf8'), generated: false});
    }

    const outputs = [];
    for (const {base,svg,generated} of diagrams) {
      await page.goto('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));
      const viewport = await page.evaluate(() => {
        if (document.querySelector('parsererror')) throw new Error('SVG XML 오류');
        const root = document.documentElement;
        return {width:Math.round(root.width.baseVal.value),height:Math.round(root.height.baseVal.value)};
      });
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      const issues = await page.locator('text').evaluateAll(nodes => nodes.filter(el => {
        const box = el.getBoundingClientRect();
        return box.left < -0.5 || box.right > innerWidth+0.5 || box.top < -0.5 || box.bottom > innerHeight+0.5;
      }).map(el => el.textContent));
      if (issues.length) throw new Error(base+'의 글자 범위를 확인하세요. '+issues.join(', '));
      const png = await page.screenshot({type:'png'});
      if (png.readUInt32BE(16)!==viewport.width || png.readUInt32BE(20)!==viewport.height) throw new Error(base+'의 PNG 크기가 다릅니다.');
      outputs.push({base,svg,generated,png,viewport});
    }
    // 창마다 글자 경계를 모두 확인한 뒤 인쇄용 도해와 같은 화면을 PNG로 제공한다.
    for (const {base,svg,generated,png,viewport} of outputs) {
      const file = path.join(figures,base);
      if (generated) fs.writeFileSync(file+'.svg',svg);
      fs.writeFileSync(file+'.png',png);
      console.log(base, viewport.width+'×'+viewport.height);
    }
  } finally {
    await browser.close();
  }
}
render().catch(error => { console.error(error); process.exitCode = 1; });
