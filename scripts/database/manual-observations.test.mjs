import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildManualImportSql, MANUAL_REVIEW_WINDOW_MS, MAX_MANUAL_OBSERVATIONS, prepareManualObservations,
} from './manual-observations.mjs';

// 실제 판매 상품이나 가격을 복사하지 않은 자체 검증 자료입니다.
const now = '2026-11-12T10:01:00.000Z';
const example = {
  sourceProductId: '9999999999991',
  sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?itemId=9999999999991&siteNo=6001&salestrNo=9999',
  name: '테스트 전용 가상 상품', unitLabel: '가상 1봉', priceKrw: 1234,
  observedAt: '2026-11-12T10:00:00.000Z', availability: 'available', promotionType: 'none',
  priceBasis: 'displayed_item_total', notes: '실제 판매 자료가 아닌 자체 작성 검증 자료',
  loginContext: '로그인하지 않음', deliveryContext: '배송지를 선택하지 않음',
};
const prepare = (overrides = {}, options = { now }) => prepareManualObservations([{ ...example, ...overrides }], options);

test('실제 자료 구분과 비공개 검토 상태를 강제하고 원본 가격을 그대로 보존한다', () => {
  const { products: [product], observations: [observation] } = prepare();
  assert.equal(product.id, 'ssg-emart-9999999999991');
  assert.equal(product.is_sample, false);
  assert.equal(product.is_active, false);
  assert.equal(observation.product_id, product.id);
  assert.equal(observation.is_sample, false);
  assert.equal(observation.source_kind, 'manual_observation');
  assert.equal(observation.sales_channel, 'ssg_emart_online');
  assert.equal(observation.rights_status, 'unknown');
  assert.equal(observation.publication_state, 'draft');
  assert.equal(observation.store_id, null);
  assert.equal(observation.source_price_krw, 1234);
  assert.equal(observation.play_price_krw, 1234);
  assert.equal(observation.play_price_rule, 'exact');
  assert.equal(observation.promotion_conditions, null);
  assert.match(observation.approval_notes, /로그인하지 않음/u);
  assert.match(observation.approval_notes, /배송지를 선택하지 않음/u);
});

test('내부 24시간 기한을 관측 시각에서 계산하고 판매처 행사 기간은 추측하지 않는다', () => {
  const { observations: [observation] } = prepare();
  assert.equal(observation.valid_from, null);
  assert.equal(observation.valid_until, null);
  assert.equal(Date.parse(observation.display_until) - Date.parse(observation.observed_at), MANUAL_REVIEW_WINDOW_MS);
  assert.match(observation.approval_notes, /판매자의 행사 종료일이 아닙니다/u);
});

test('같은 사실의 재입력은 주소 순서와 UTC 표기 차이에도 같은 UUID를 만든다', () => {
  const first = prepare().observations[0];
  const repeated = prepare({
    sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?salestrNo=9999&siteNo=6001&itemId=9999999999991',
    observedAt: '2026-11-12T10:00:00Z',
  }, { now: '2026-11-12T11:00:00.000Z' }).observations[0];
  assert.deepEqual(repeated, first);
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
});

test('새 관측 시각·가격·상품 규격·조건은 이전 이력을 덮어쓰지 않는 새 ID가 된다', () => {
  const originalId = prepare().observations[0].id;
  for (const changed of [
    { priceKrw: 1235 }, { observedAt: '2026-11-12T10:00:01.000Z' },
    { unitLabel: '가상 2봉' }, { availability: 'out_of_stock' }, { promotionType: 'unknown' },
    { notes: '추가로 확인한 자체 검증 메모' },
  ]) assert.notEqual(prepare(changed).observations[0].id, originalId);
});

test('계산 가능한 원 단위 정수만 받으며 저장 범위와 앱 놀이돈 범위를 혼동하지 않는다', () => {
  for (const value of [1, 10001, 2147483647]) assert.equal(prepare({ priceKrw: value }).observations[0].source_price_krw, value);
  for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, '1234', null]) {
    assert.throws(() => prepare({ priceKrw: value }), /priceKrw/u);
  }
});

test('미래·24시간 경과·불가능한 날짜·시차 있는 날짜를 현재 관측으로 받지 않는다', () => {
  for (const observedAt of [
    '2026-11-12T10:01:00.001Z', '2026-11-11T10:01:00.000Z',
    '2026-11-11T09:00:00.000Z', '2026-02-30T10:00:00.000Z',
    '2026-11-12T19:00:00+09:00', '2026-11-12', '2026-11-12T10:00:00.1Z', '', null,
  ]) assert.throws(() => prepare({ observedAt }), /observedAt/u);
  assert.doesNotThrow(() => prepare({ observedAt: now }));
  assert.doesNotThrow(() => prepare({ observedAt: '2026-11-11T10:01:00.001Z' }));
});

test('잘못된 기준 시각을 거절하며 Date 입력도 별도로 복사한다', () => {
  for (const invalid of [new Date(NaN), '', null, 0, '2026-11-12']) {
    assert.throws(() => prepare({}, { now: invalid }), /now/u);
  }
  const current = new Date(now);
  const prepared = prepare({}, { now: current });
  current.setTime(0);
  assert.equal(prepared.observations[0].observed_at, example.observedAt);
});

test('URL과 상품 번호가 일치해야 하며 타 사이트·채널·추적·인증 조건을 받지 않는다', () => {
  for (const url of [
    example.sourceUrl.replace('https:', 'http:'),
    example.sourceUrl.replace('emart.ssg.com', 'emart.ssg.com.invalid'),
    example.sourceUrl.replace('emart.ssg.com', 'account@emart.ssg.com'),
    example.sourceUrl.replace('emart.ssg.com', 'emart.ssg.com:443'),
    example.sourceUrl.replace('itemView.ssg', 'other.ssg'),
    example.sourceUrl.replace('9999999999991', '9999999999992'),
    example.sourceUrl.replace('siteNo=6001', 'siteNo=7009'),
    example.sourceUrl.replace('&siteNo=6001', ''),
    example.sourceUrl + '&token=never-store-this',
    example.sourceUrl + '&itemId=9999999999991',
    example.sourceUrl + '#', example.sourceUrl + '#fragment',
    example.sourceUrl.replace('salestrNo=9999', 'salestrNo=unknown'),
    example.sourceUrl.replace('salestrNo=9999', 'salestrNo='),
  ]) assert.throws(() => prepare({ sourceUrl: url }), /sourceUrl/u);
  assert.doesNotThrow(() => prepare({ sourceUrl: example.sourceUrl.replace('&salestrNo=9999', '') }));
});

test('상품 번호는 숫자 문자열 13자리로만 받아 선행 0을 보존한다', () => {
  for (const sourceProductId of ['123', '99999999999999', 'ABCDEFGHIJKLM', 9999999999991, null]) {
    assert.throws(() => prepare({ sourceProductId }), /sourceProductId/u);
  }
  const { observations: [observation] } = prepare({
    sourceProductId: '0000000000001', sourceUrl: example.sourceUrl.replace('9999999999991', '0000000000001'),
  });
  assert.equal(observation.source_product_id, '0000000000001');
});

test('문자열과 관측 맥락은 필수이고 제어문자·잘린 유니코드·과도한 길이를 거절한다', () => {
  const limits = { name: 120, unitLabel: 120, notes: 1000, loginContext: 240, deliveryContext: 240 };
  for (const [field, limit] of Object.entries(limits)) {
    for (const value of ['', ' ', ' 앞공백', '뒤공백 ', '줄\n바꿈', '제어\u0000문자', '\ud800', '가'.repeat(limit + 1), null]) {
      assert.throws(() => prepare({ [field]: value }), new RegExp(field));
    }
  }
});

test('관측 자료에 승인·활성·가격 규칙을 삽입하거나 정의되지 않은 필드를 넣을 수 없다', () => {
  for (const field of ['rights_status', 'rightsStatus', 'is_active', 'isSample', 'publication_state', 'storeId', 'validUntil', 'playPriceKrw']) {
    assert.throws(() => prepare({ [field]: 'injected' }), /입력 필드/u);
  }
  assert.throws(() => prepareManualObservations([new Date()], { now }), /입력 필드/u);
  assert.throws(() => prepareManualObservations([null], { now }), /입력 필드/u);
});

test('판매 상태는 보수적으로 보존하고 카드·회원·묶음 할인 및 불명확한 가격 기준을 거절한다', () => {
  for (const availability of ['available', 'unknown', 'out_of_stock']) {
    assert.equal(prepare({ availability }).observations[0].availability, availability);
  }
  for (const promotionType of ['none', 'unknown']) {
    assert.equal(prepare({ promotionType }).observations[0].promotion_type, promotionType);
  }
  for (const availability of ['in_stock', '', null]) assert.throws(() => prepare({ availability }), /availability/u);
  for (const promotionType of ['member', 'card', 'bundle', 'other', null]) assert.throws(() => prepare({ promotionType }), /promotionType/u);
  for (const priceBasis of ['card', 'coupon', 'unit_price', '', null]) assert.throws(() => prepare({ priceBasis }), /priceBasis/u);
});

test('묶음 크기를 제한하고 동일 상품을 중복 입력한 모호한 묶음을 거절한다', () => {
  assert.throws(() => prepareManualObservations([], { now }), /1~20/u);
  assert.throws(() => prepareManualObservations(Array(21).fill(example), { now }), /1~20/u);
  assert.throws(() => prepareManualObservations({ ...example }, { now }), /1~20/u);
  assert.throws(() => prepareManualObservations([example, { ...example, priceKrw: 999 }], { now }), /상품별/u);
  const entries = Array.from({ length: MAX_MANUAL_OBSERVATIONS }, (_, index) => {
    const id = String(9999999999000 + index);
    return { ...example, sourceProductId: id, sourceUrl: example.sourceUrl.replace(example.sourceProductId, id) };
  });
  assert.equal(prepareManualObservations(entries, { now }).observations.length, 20);
});

test('검증 후 결과를 변경할 수 없고 원본 객체의 뒤늦은 수정도 결과에 영향을 주지 않는다', () => {
  const input = [{ ...example }];
  const prepared = prepareManualObservations(input, { now });
  input[0].priceKrw = 42;
  assert.equal(prepared.observations[0].source_price_krw, 1234);
  assert.throws(() => { prepared.products[0].is_active = true; }, TypeError);
  assert.throws(() => { prepared.observations[0].rights_status = 'app_approved'; }, TypeError);
  assert.throws(() => prepared.observations.push({}), TypeError);
});

test('SQL 조각과 따옴표는 실행 문자열이 아닌 UTF-8 JSON 데이터로만 포함된다', () => {
  const notes = "따옴표 ' 와 역슬래시 \\; $manual_price_import$; DROP TABLE public.play_catalog; -- 가상 입력";
  const sql = buildManualImportSql([{ ...example, notes }], { now });
  assert.equal(sql.includes(notes), false);
  assert.equal(sql.includes('DROP TABLE public.play_catalog'), false);
  const [, hex] = sql.match(/decode\('([0-9a-f]+)', 'hex'\)/u);
  const decoded = JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
  assert.ok(decoded.observations[0].approval_notes.includes(notes));
  assert.match(sql, /^BEGIN;\nSET LOCAL search_path = pg_catalog;\nDO \$manual_price_import\$/u);
  assert.match(sql, /COMMIT;\n$/u);
  assert.throws(() => buildManualImportSql([{ ...example, priceKrw: -1 }], { now }), /priceKrw/u);
});
