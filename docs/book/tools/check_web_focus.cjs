// 실행 중인 실습 서버에서 검사한다. 설치된 Chrome과 Node에서 읽을 수 있는 playwright 패키지가 필요하다.
// 예: node docs/book/tools/check_web_focus.cjs http://localhost:8081
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.BOOK_NODE_MODULES
  ? path.join(process.env.BOOK_NODE_MODULES, 'playwright')
  : 'playwright');

async function checkShopping(url) {
  const browser = await chromium.launch(process.env.BOOK_CHROME
    ? { executablePath: process.env.BOOK_CHROME }
    : { channel: 'chrome' });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const element = id => page.getByTestId(id);
    // 화면에 제목이 있어도 키보드 초점이 이전 버튼에 남을 수 있으므로 실제 DOM 초점을 대조한다.
    async function expectFocus(id) {
      try {
        await page.waitForFunction(target => document.activeElement?.getAttribute('data-testid') === target,
          id, { timeout: 5000 });
      } catch (error) {
        const actual = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200));
        throw new Error(id + ' 초점 확인 실패. 현재 요소: ' + actual, { cause: error });
      }
    }

    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    const samples = element('catalog-use-samples');
    await samples.waitFor({ state: 'visible', timeout: 90000 });
    await samples.focus();
    await page.keyboard.press('Enter');
    await expectFocus('market-title');
    assert.equal(await element('category-visible-count').innerText(), '12가지');

    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement?.matches('button, a[href], [tabindex="0"], input')));
    await element('budget-option-50000').click();
    await element('product-sample-apple-add').click();
    await element('product-sample-apple-add').click();
    await element('product-sample-milk-add').click();
    assert.match(await element('cart-summary').innerText(), /5,500원/);
    await element('payment-option-50000').click();

    // 다시 풀기는 사라지는 버튼에서 입력칸으로, 정답 확인은 결과 안내로 초점을 옮겨야 한다.
    await element('quiz-answer').fill('1');
    await element('quiz-check').click();
    await element('quiz-retry').click();
    await expectFocus('quiz-answer');
    await page.keyboard.type('44500');
    await element('quiz-check').click();
    await expectFocus('quiz-feedback');
    assert.match(await element('quiz-feedback').innerText(), /정답이에요/);
    await element('checkout-complete').click();
    await expectFocus('receipt-title');
    assert.match(await element('receipt-total').innerText(), /5,500원/);
    assert.match(await element('receipt-payment').getAttribute('aria-label'), /50,000원.*거스름돈 44,500원/);
    await element('receipt-new-round').click();
    await expectFocus('market-title');
    assert.match(await element('cart-summary').innerText(), /0개/);
    assert.deepEqual(errors, []);
    console.log('Chrome ' + browser.version() + ' 통과: 상품 12개, 5,500원 구매, 거스름돈 44,500원, 다시 장보기, DOM 초점과 브라우저 오류 0건.');
  } finally {
    if (errors.length) console.error('Chrome 오류:\n' + errors.join('\n'));
    await browser.close();
  }
}

async function main() {
  const url = new URL(process.argv[2] || 'http://localhost:8081');
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('실행 중인 실습 앱의 localhost 주소를 입력해 주세요.');
  }
  await checkShopping(url);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
