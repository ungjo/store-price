/* 장별 원고를 검색 가능한 PDF와 오프라인 HTML로 함께 조판한다. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const book = path.resolve(__dirname, '..');
const manuscript = path.join(book, 'manuscript');
const out = path.join(book, 'output');
const partial = process.argv.includes('--proof');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'market-print-'));
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
const modules = process.env.BOOK_NODE_MODULES || path.join(runtime, 'node/node_modules');
const python = process.env.BOOK_PYTHON || path.join(runtime, 'python/python.exe');
const chromeFile = process.env.BOOK_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chromium } = require(path.join(modules, 'playwright'));
const read = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const groups = [
  ['1부 개발을 시작할 준비',1,3],['2부 첫 앱과 장바구니',4,6],
  ['3부 놀이돈과 거스름돈',7,10],['4부 상품 데이터와 데이터베이스',11,13],
  ['5부 인터넷과 화면 크기에 대응하기',14,15],['6부 접근성과 자동 검사',16,17],
  ['7부 내 Android 기기에 설치하고 장보기',18,20],['부록',21,24]
];
const pdfName = partial ? path.join(scratch,'proof.pdf') : path.join(out,'pdf/market-play-book.pdf');
const htmlName = partial ? path.join(scratch,'proof.html') : path.join(out,'market-play-book.html');

function readLicenses() {
  const dir = path.join(manuscript, 'figures', 'licenses');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir, {withFileTypes:true})
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map(entry => entry.name).sort();
  const titles = {'supabase-Apache-2.0.txt':'Supabase · Apache License 2.0'};
  return names.map(name => ({
    name, title: titles[name] || path.basename(name, '.txt').replaceAll('_',' '),
    encoded: fs.readFileSync(path.join(dir,name)).toString('base64')
  }));
}

async function main() {
  const { marked } = await import(pathToFileURL(path.join(modules,'marked/lib/marked.esm.js')).href);
  // 쪽·장 범위를 나타내는 한 개의 물결표를 취소선으로 해석하지 않는다.
  marked.use({tokenizer:{del(){ return undefined; }}});
  const files = fs.readdirSync(manuscript);
  const licenses = readLicenses();
  const courseName = 'market-lab.zip';
  const courseArchive = {
    name: courseName, type: 'application/zip',
    encoded: fs.readFileSync(path.join(out,courseName)).toString('base64')
  };
  const installers = [
    { folder:'vscode-setup-originals', capture:'VSCode-Setup-', figure:'02-vscode-setup-', stages:['license','tasks','copilot','ready'] },
    { folder:'git-setup-originals', capture:'Git-for-Windows-', figure:'02-git-', stages:['setup-info','components','editor','path','terminal','finish'] }
  ];
  // 각 도해와 그 바탕이 된 실제 창을 연결해 HTML과 PDF에서 같은 촬영본을 연다.
  const setupCaptures = {};
  for (const {folder,capture,figure,stages} of installers) {
    for (const stage of stages) {
      const name = capture+stage+'.png';
      const original = path.join(manuscript,'figures',folder,name);
      setupCaptures['figures/'+figure+stage+'.svg'] = {
        name, type:'image/png', encoded:fs.readFileSync(original).toString('base64')
      };
    }
  }
  const sections = [];
  function add(n, id, src) {
    let raw = src.split('\n## 집필 근거와 검증 기록')[0];
    const html = marked.parse(raw);
    sections.push({ n, id, html });
  }
  add(0,'preface',read(path.join(manuscript,'front-matter.md')));
  for (let n = 1; n <= 20; n++) {
    const key = String(n).padStart(2,'0');
    const name = files.find(s => s.startsWith(key+'-') && s.endsWith('.md'));
    if (!name && partial) continue;
    if (!name) throw Error('장 원고 누락 '+key);
    add(n,'ch'+key,read(path.join(manuscript,name)));
  }
  const appendixFile = path.join(manuscript,'back-matter.md');
  if (fs.existsSync(appendixFile)) {
    const segments = read(appendixFile).trim().split(/\n(?=# 부록 [A-D] )/);
    segments.forEach((s,i) => add(21+i,'app'+'ABCD'[i],s));
  } else if (!partial) throw Error('부록 누락');
  const css = read(path.join(__dirname,'book.css'));
  let source = sections.map(s => {
    const group = groups.find(([,lo,hi]) => lo<=s.n && s.n<=hi);
    return '<article class="'+(s.n?'chapter':'preface')+'" id="'+s.id+'" data-position="'+s.n+'">'+(group ? '<p class="partname">'+esc(group[0])+'</p>' : '')+s.html+'</article>';
  }).join('\n');
  // 화면을 파일에 내장하여 인터넷이 끊겨도 HTML 한 개로 읽을 수 있다.
  source = source.replace(/<img src="([^"]+)"/g,(_,name) => {
    if (!name.startsWith('figures/')) throw Error('지원하지 않는 그림 경로 '+name);
    const file = path.join(manuscript,name);
    if (partial && !fs.existsSync(file)) return '<img src="data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="';
    const type = {'.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)];
    if (!type) throw Error('지원하지 않는 그림 형식 '+name);
    return '<img data-name="'+esc(name)+'" src="data:'+type+';base64,'+fs.readFileSync(file).toString('base64')+'"';
  });
  const title = '처음부터 따라 만드는 꼬마 시장 Android 앱';
  const browser = await chromium.launch({executablePath:chromeFile,headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(title)+'</title><style>'+css+'</style></head><body>'+source+'</body></html>',{waitUntil:'load',timeout:90000});
    const targets = await page.evaluate(({groups,licenses,setupCaptures,courseArchive}) => {
      const nodes = [];
      for (const a of document.querySelectorAll('article')) {
        const n = Number(a.dataset.position);
        const h = a.querySelector('h1');
        const title = h.textContent.trim();
        if (n) nodes.push({n,id:a.id,title,level:1});
        let count = 0;
        for (const s of a.querySelectorAll('h2')) {
          const title = s.textContent.trim();
          if (!/^(\d+|[A-D])\.\d+\s/.test(title)) continue;
          s.id = a.id+'-s'+(++count);
          nodes.push({n,id:s.id,title,level:2});
        }
        for (const code of a.querySelectorAll('pre code')) {
          code.textContent = code.textContent.replace(/\n+$/,'');
          const kind = code.className.replace(/^language-/,'');
          const kinds = {bash:'Git Bash',sh:'셸',shell:'셸',sql:'SQL',typescript:'TypeScript',ts:'TypeScript',tsx:'TSX',javascript:'JavaScript',js:'JavaScript',jsx:'JSX',mjs:'JavaScript',json:'JSON',yaml:'YAML',yml:'YAML',xml:'XML',text:'텍스트',plaintext:'텍스트',powershell:'PowerShell',terminal:'PowerShell · Git Bash',diff:'변경 비교'};
          if (kinds[kind]) code.parentElement.dataset.language = kinds[kind];
          // 한 파일 전체를 싣는 예제는 인쇄 지면에서 원본의 줄 경계를 표시한다.
          if (code.closest('.file-listing')) {
            const rows = code.textContent.split('\n');
            code.replaceChildren();
            rows.forEach((text, index) => {
              if (index) code.append('\n');
              const line = document.createElement('span');
              line.className = 'source-line';
              line.dataset.line = String(index + 1).padStart(2, '0');
              line.textContent = text;
              code.append(line);
            });
          }
        }
        for (const pic of a.querySelectorAll('p > img:only-child')) {
          const old = pic.parentElement;
          if (old.textContent.trim()) continue;
          const next = old.nextElementSibling;
          const figure = document.createElement('figure');
          old.replaceWith(figure);
          figure.append(pic);
          // 짧은 터미널 발췌가 지면 전체 폭으로 늘어나 글자가 흐려지는 것을 막는다.
          if ([2,3,4,12].includes(n) && pic.naturalWidth) {
            pic.style.setProperty('--print-image-width', (pic.naturalWidth / 310)+'in');
          }
          if (/18-(market|inspection)-icon/.test(pic.dataset.name || '')) figure.className='icon';
          const cap = document.createElement('figcaption');
          if (next?.tagName==='P' && /^(그림|화면)\s*\d+[-–.]\d+[. ·\s]/.test(next.textContent) && next.textContent.length<260) {
            cap.innerHTML=next.innerHTML; next.remove();
          } else cap.textContent=pic.alt;
          const capture = setupCaptures[pic.dataset.name];
          if (capture) {
            figure.classList.add('setup-artwork');
            const link = document.createElement('a');
            link.className = 'capture-original';
            link.href = 'data:image/png;base64,'+capture.encoded;
            link.download = capture.name;
            link.textContent = '실제 촬영본 PNG 저장';
            cap.append(' ',link);
          }
          figure.append(cap);
        }
        for (const link of a.querySelectorAll('a[href]')) {
          const href=link.getAttribute('href');
          if (link.classList.contains('capture-original') || /^(https?:|mailto:|#)/i.test(href)) continue;
          if (href.startsWith('../chapters/')) link.href='https://github.com/ungjo/store-price/blob/35b12e4/docs/book/chapters/'+href.slice('../chapters/'.length);
          else if (/^\d\d-[^/]+\.md/.test(href)) link.setAttribute('href','#ch'+href.slice(0,2));
          else if (href.split('/').pop() === courseArchive.name) {
            // 인쇄본은 첨부 패널을 사용하고, HTML은 파일 하나만 복사해도 예제를 저장할 수 있다.
            link.classList.add('license-screen');
            link.download = courseArchive.name;
            link.href = 'data:'+courseArchive.type+';base64,'+courseArchive.encoded;
          }
          else {const span=document.createElement('span');span.textContent=link.textContent;link.replaceWith(span);}
        }
        if (n) {const top=document.createElement('a');top.className='toc-top';top.href='#contents';top.textContent='목차로 돌아가기';a.append(top);}
      }
      if (licenses.length) {
        const appendix = document.getElementById('appD') || document.querySelector('article:last-of-type');
        const section = document.createElement('section');
        section.className = 'figure-licenses';
        const title = document.createElement('h3');title.textContent = '화면 자료의 라이선스';
        section.append(title);
        const print = document.createElement('p');print.className = 'license-print';
        print.textContent = 'PDF 리더의 첨부 파일(클립) 패널에서 다음 라이선스 전문을 열 수 있다.';
        section.append(print);
        const screen = document.createElement('p');screen.className = 'license-screen';
        screen.textContent = '아래 이름을 누르면 라이선스 전문을 텍스트 파일로 저장할 수 있다.';
        section.append(screen);
        const list = document.createElement('ul');
        for (const {name,title,encoded} of licenses) {
          const line = document.createElement('li');
          const link = document.createElement('a');link.className = 'license-screen';
          link.download = name;link.href = 'data:text/plain;charset=utf-8;base64,'+encoded;link.textContent = title;
          const label = document.createElement('span');label.className = 'license-print';label.textContent = title+' ('+name+')';
          line.append(link,label);list.append(line);
        }
        section.append(list);
        appendix.querySelector('.toc-top')?.before(section);
      }
      const toc=document.createElement('nav');toc.className='contents';toc.id='contents';
      toc.innerHTML='<h1>목차</h1><p class="toc-subtitle">장과 절 제목을 누르면 해당 본문으로 이동합니다. 숫자는 PDF의 쪽 번호입니다.</p>';
      for (const [group,lo,hi] of groups) {
        const list=nodes.filter(x=>lo<=x.n && x.n<=hi);
        if (!list.length) continue;
        const div=document.createElement('section');div.className='toc-part';
        const part=document.createElement('h2');part.textContent=group;div.append(part);
        for (const {id,title,level} of list) {
          const row=document.createElement('a'); row.className='toc-row '+(level===1?'toc-ch':'toc-sec');row.setAttribute('href','#'+id);
          for (const [cl,val] of [['toc-name',title],['toc-fill',''],['toc-num','000']]) {const span=document.createElement('span');span.className=cl;span.textContent=val;row.append(span);}
          div.append(row);
        }
        toc.append(div);
      }
      document.querySelector('.preface').after(toc);
      // 종이책에서 머리말의 실습 안내만 보고도 해당 절을 펼칠 수 있게 쪽수를 함께 인쇄한다.
      for (const link of document.querySelectorAll('.preface a[href^="#ch"], .preface a[href^="#app"]')) {
        const pageRef = document.createElement('span');
        pageRef.className = 'preface-page';
        pageRef.textContent = '(000쪽)';
        link.append(pageRef);
      }
      return nodes;
    },{groups,licenses,setupCaptures,courseArchive});
    const broken = await page.locator('img').evaluateAll(imgs => imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt));
    if (broken.length) throw Error(broken.join(', '));
    fs.mkdirSync(path.dirname(pdfName),{recursive:true});
    const options = {preferCSSPageSize:true,printBackground:true,outline:true,tagged:true,displayHeaderFooter:true,
      headerTemplate:'<span></span>',footerTemplate:'<div style="box-sizing:border-box;width:100%;margin:0 15mm 0 16mm;border-top:1px solid #b7cbc0;padding-top:2mm;display:flex;justify-content:space-between;font:8px Malgun Gothic,sans-serif;color:#4c675a"><span>꼬마 시장 Android 앱 개발 실습서</span><span class="pageNumber"></span></div>'};
    const probe = path.join(scratch,'first.pdf');
    await page.pdf({...options,path:probe,timeout:240000});
    const pagesFor = p => JSON.parse(execFileSync(python,[path.join(__dirname,'outline_pages.py'),p],{encoding:'utf8'}));
    const initial = pagesFor(probe);
    const numbers = {};
    for (const {id,title} of targets) {
      const key=title.replace(/\s+/g,'');
      const p=Object.entries(initial.pages).find(([name])=>name.replace(/\s+/g,'')===key)?.[1];
      if (!p) throw Error('PDF 책갈피 누락 '+id+' '+title);
      numbers[id]=p;
    }
    await page.locator('.contents').evaluate((toc, nums) => {
      for (const a of toc.querySelectorAll('a')) a.querySelector('.toc-num').textContent=String(nums[a.hash.slice(1)]);
    },numbers);
    await page.locator('.preface-page').evaluateAll((references, nums) => {
      for (const ref of references) {
        const id = ref.parentElement.hash.slice(1);
        if (!nums[id]) throw Error('머리말의 절 링크를 찾을 수 없습니다. ' + id);
        ref.textContent = '(' + nums[id] + '쪽)';
      }
    },numbers);
    const reader = read(path.join(__dirname,'figure-reader.js'));
    const html = (await page.content()).replace('</body>', () => '<script>'+reader+'</script></body>');
    const printed = path.join(scratch,'paged.pdf');
    await page.pdf({...options,path:printed,timeout:240000});
    let verified = printed;
    const attachments = [courseArchive,...licenses,...Object.values(setupCaptures)];
    if (attachments.length) {
      // 두 판본의 예제 ZIP, 촬영본, 라이선스 원문을 같은 바이트로 제공한다.
      const manifest = path.join(scratch,'attachments.json');
      fs.writeFileSync(manifest,JSON.stringify(attachments),'utf8');
      verified = path.join(scratch,'with-licenses.pdf');
      execFileSync(python,[path.join(__dirname,'attach_licenses.py'),printed,verified,manifest]);
    }
    const final=pagesFor(verified);
    if (final.count!==initial.count || targets.some(t=>Object.entries(final.pages).find(([name])=>name.replace(/\s+/g,'')===t.title.replace(/\s+/g,''))?.[1]!==numbers[t.id])) throw Error('목차와 실제 쪽이 서로 달라졌습니다.');
    fs.writeFileSync(htmlName,html,'utf8');
    fs.copyFileSync(verified,pdfName);
    const summary={licenses:licenses.map(f=>f.name),pages:final.count,pdf:pdfName,outline:targets.filter(t=>t.level===1).map(t=>({title:t.title,page:numbers[t.id]})),destinations:targets.length};
    fs.writeFileSync(path.join(scratch,'summary.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary)); console.log(scratch);
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
