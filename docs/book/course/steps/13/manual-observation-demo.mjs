import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { prepareManualObservations } = await import(pathToFileURL(path.join(root, 'scripts/database/manual-observations.mjs')));
// 존재하는 상품을 조회하지 않는 가상 입력입니다. 웹 요청·파일 저장·DB 적재를 하지 않습니다.
const input = [{
  sourceProductId: '9999999999991',
  sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?itemId=9999999999991&siteNo=6001',
  name: '검사용 가상 상품',
  unitLabel: '가상 1봉',
  priceKrw: 1234,
  observedAt: '2026-11-12T10:00:00.000Z',
  availability: 'unknown',
  promotionType: 'none',
  priceBasis: 'displayed_item_total',
  notes: '책의 로컬 입력 검사만을 위한 가상 자료',
  loginContext: '로그인하지 않음',
  deliveryContext: '배송지를 선택하지 않음',
}];
// 날짜가 바뀌어도 같은 실습이 되도록 가상 관측과 검사 시계를 함께 고정합니다.
const options = { now: '2026-11-12T10:01:00.000Z' };
const result = prepareManualObservations(input, options);
const observation = result.observations[0];
assert.equal(result.products[0].is_active, false);
assert.equal(observation.rights_status, 'unknown');
assert.equal(observation.publication_state, 'draft');
console.table([{
  name: result.products[0].name, price: observation.play_price_krw,
  source: observation.source_kind, rights: observation.rights_status,
  publication: observation.publication_state,
}]);
assert.throws(() => prepareManualObservations([{ ...input[0], priceKrw: 12.34 }], options), /정수/);
console.log('소수 가격: 거절');
assert.throws(() => prepareManualObservations([{ ...input[0], observedAt: '2026-11-12T11:00:00.000Z' }], options), /최근 24시간/);
console.log('미래 관측: 거절');
assert.throws(() => prepareManualObservations([{ ...input[0], rights_status: 'app_approved' }], options), /정해진 입력 필드/);
console.log('입력으로 공개 승인 추가: 거절');
console.log('네트워크 요청·DB 적재·파일 저장: 수행하지 않음');
