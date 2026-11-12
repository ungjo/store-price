import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { capturePrivatePreview, assertPrivatePreviewUnchanged, parsePrivateSnapshot,
  startPrivatePreviewServer, checkPrivatePreviewHttp, privatePreviewData, previewEnvironment,
  scanReleaseForPrivateData, writePreviewExpectations, PREVIEW_FLAG, PREVIEW_TOKEN } from './private-price-preview.mjs';

function snapshot() {
  const now = Date.now();
  return { schemaVersion: 1, projectRef: 'fixture-project', fetchedAt: new Date(now - 1000).toISOString(), rows: [{
    id: 'ssg-emart-9990000000001', name: '직접 만든 검사용 상품', unit_label: '검사용 1봉',
    is_sample: false, is_active: false, price_observation_id: '99900000-0000-8000-8000-000000000001',
    source_kind: 'manual_observation', source_product_id: '9990000000001',
    source_url: 'https://emart.ssg.com/item/itemView.ssg?itemId=9990000000001&siteNo=6001',
    sales_channel: 'ssg_emart_online', store_id: null, source_price_krw: 1234, play_price_krw: 1234,
    play_price_rule: 'exact', observed_at: new Date(now - 3600000).toISOString(),
    display_until: new Date(now + 86400000 - 3600000).toISOString(), valid_from: null, valid_until: null,
    promotion_type: 'none', promotion_conditions: null, availability: 'unknown',
    rights_status: 'unknown', publication_state: 'draft',
  }] };
}
function fixture(t) {
  const temp = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'store-price-preview-test-'));
  t.after(() => { assert.equal(path.dirname(root), temp); assert.ok(path.basename(root).startsWith('store-price-preview-test-')); fs.rmSync(root, { recursive: true, force: true }); });
  const file = path.join(root, '.artifacts/catalog/private-preview.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const input = snapshot(); fs.writeFileSync(file, JSON.stringify(input));
  return { root, file, input, state: capturePrivatePreview(root, file, input.projectRef) };
}

test('비공개 DB 행에서 화면 필드만 복사하고 다른 프로젝트·관리 필드는 거절한다', () => {
  const input = snapshot(); const parsed = parsePrivateSnapshot(input, 'fixture-project');
  assert.equal(parsed.products[0].priceKrw, 1234);
  assert.equal(Object.hasOwn(parsed.products[0], 'rights_status'), false);
  assert.equal(Object.hasOwn(parsed.products[0], 'price_observation_id'), false);
  assert.throws(() => parsePrivateSnapshot(input, 'another-project'));
  assert.throws(() => parsePrivateSnapshot({ ...input, secret: 'hidden' }, 'fixture-project'));
  input.rows[0].approval_notes = '비공개 관리자 메모';
  assert.throws(() => parsePrivateSnapshot(input, 'fixture-project'));
});

test('최근 DB 조회와 과거 가격 관측을 구분하며 미래·오래된 조회는 거절한다', () => {
  const input = snapshot(); input.rows[0].observed_at = '2020-01-01T00:00:00.000Z';
  input.rows[0].display_until = '2020-01-02T00:00:00.000Z';
  assert.equal(parsePrivateSnapshot(input, 'fixture-project').products[0].observedAt, input.rows[0].observed_at);
  for (const fetchedAt of ['2020-01-01T00:00:00.000Z', new Date(Date.now() + 60000).toISOString(), 'not-a-date']) {
    assert.throws(() => parsePrivateSnapshot({ ...input, fetchedAt }, 'fixture-project'));
  }
});

test('공개 상태·가격 불일치·잘못된 출처·중복 행을 거절한다', () => {
  const cases = [{ is_active: true }, { is_sample: true }, { rights_status: 'app_approved' },
    { publication_state: 'published' }, { source_kind: 'approved_file' }, { sales_channel: 'offline_store' },
    { source_price_krw: 1234.5 }, { play_price_krw: 1235 }, { source_url: 'https://example.invalid/' },
    { source_product_id: '9990000000002' }, { availability: 'yes' }, { observed_at: '2999-01-01T00:00:00.000Z' }];
  for (const change of cases) { const input = snapshot(); Object.assign(input.rows[0], change); assert.throws(() => parsePrivateSnapshot(input, input.projectRef)); }
  const input = snapshot(); input.rows.push({ ...input.rows[0] });
  assert.throws(() => parsePrivateSnapshot(input, input.projectRef));
});

test('허용 폴더 밖·큰 파일·원본 변경은 거절한다', (t) => {
  const f = fixture(t); assertPrivatePreviewUnchanged(f.state);
  assert.throws(() => capturePrivatePreview(f.root, '../other.json', 'fixture-project'));
  fs.writeFileSync(f.file, JSON.stringify({ ...f.input, fetchedAt: new Date().toISOString() }));
  assert.throws(() => assertPrivatePreviewUnchanged(f.state));
  fs.writeFileSync(f.file, ' '.repeat(131073)); assert.throws(() => capturePrivatePreview(f.root, f.file, 'fixture-project'));
});

test('localhost 서버는 실행 토큰이 있는 정확한 GET만 제공한다', async (t) => {
  const f = fixture(t); const session = await startPrivatePreviewServer(f.state, { sessionId: 'test-run', port: 0 });
  t.after(() => session.close());
  const url = 'http://127.0.0.1:' + session.port;
  for (const [suffix, options] of [
    ['/preview', {}], ['/preview', { headers: { Authorization: 'Bearer wrong' } }],
    ['/preview', { headers: { Authorization: 'Bearer ' + session.token, Origin: 'https://example.invalid' } }],
    ['/preview', { headers: { Authorization: 'Bearer ' + session.token, Host: 'evil.example' } }],
    ['/preview', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } }],
    ['/preview?anything=1', { headers: { Authorization: 'Bearer ' + session.token } }],
  ]) {
    // fetch는 Host를 다시 쓸 수 있어 원시 HTTP 요청으로 실제 Host 검사를 확인합니다.
    const result = await new Promise((resolve, reject) => {
      const request = http.request(url + suffix, options, (response) => {
        let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(result.status, 403); assert.equal(result.body.includes(f.input.rows[0].name), false);
  }
  const checked = await checkPrivatePreviewHttp(session); assert.equal(checked.productCount, 1);
  assert.equal(privatePreviewData(session).sessionId, 'test-run');
  assert.equal(JSON.stringify(checked).includes(session.token), false);
});

test('서버는 읽은 자료를 고정하고 검사 중 원본 변경을 감지한다', async (t) => {
  const f = fixture(t); const session = await startPrivatePreviewServer(f.state, { sessionId: 'stable', port: 0 });
  t.after(() => session.close());
  f.input.rows[0].name = '변경된 이름'; fs.writeFileSync(f.file, JSON.stringify(f.input));
  await assert.rejects(checkPrivatePreviewHttp(session));
  const response = await fetch('http://127.0.0.1:' + session.port + '/preview', { headers: { Authorization: 'Bearer ' + session.token } });
  assert.equal((await response.json()).products[0].name, '직접 만든 검사용 상품');
});

test('일반·배포 환경은 미리보기 설정을 제거하고 개발 실행에만 일회용 토큰을 넣는다', async (t) => {
  const f = fixture(t); const session = await startPrivatePreviewServer(f.state, { sessionId: 'env-run', port: 0 });
  t.after(() => session.close());
  const base = { KEEP: 'ok', [PREVIEW_FLAG]: '1', [PREVIEW_TOKEN]: 'old' };
  assert.deepEqual(previewEnvironment(base), { KEEP: 'ok' });
  assert.equal(previewEnvironment(base, session)[PREVIEW_TOKEN], session.token);
  assert.equal(base[PREVIEW_TOKEN], 'old');
});

test('배포 결과 전체에서 비공개 상품·임시 토큰의 UTF-8와 UTF-16 유출을 찾는다', (t) => {
  const f = fixture(t); const dist = path.join(f.root, 'dist'); fs.mkdirSync(dist);
  const token = 'a'.repeat(64); const asset = path.join(dist, 'bundle.bin'); fs.writeFileSync(asset, 'generic public app');
  assert.equal(scanReleaseForPrivateData(dist, f.state, token).privateValuesAbsent, true);
  for (const value of [token, f.input.rows[0].name, f.input.rows[0].source_product_id]) {
    for (const encoding of ['utf8', 'utf16le']) { fs.writeFileSync(asset, Buffer.from(value, encoding)); assert.throws(() => scanReleaseForPrivateData(dist, f.state, token)); }
  }
});

test('기대값 스크립트는 자료를 실행하지 않고 정규식 문자와 변경을 처리한다', async (t) => {
  const f = fixture(t); f.input.rows[0].name = '\"; throw new Error(\'injection\'); [';
  fs.writeFileSync(f.file, JSON.stringify(f.input)); const state = capturePrivatePreview(f.root, f.file, f.input.projectRef);
  const session = await startPrivatePreviewServer(state, { sessionId: 'script-test', port: 0 }); t.after(() => session.close());
  const file = path.join(f.root, 'expected.js'); const check = writePreviewExpectations(file, session);
  const context = { output: {} }; vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  assert.equal(new RegExp(context.output.privatePreview.products[0].name).test(f.input.rows[0].name), true);
  check(); fs.appendFileSync(file, '\n'); assert.throws(check);
});
