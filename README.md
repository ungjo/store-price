# 시장놀이 — store-price

초등학교 1~3학년 아이들이 상품을 고르고 놀이돈으로 계산하며 거스름돈을 배우는 Android·iOS 앱입니다.

실제 가격의 목표 출처는 **SSG.COM 이마트 온라인 상품 가격**입니다. 오프라인 이마트 점포의 현재 가격을 의미하지 않습니다. 데이터 이용 범위가 확인되기 전에는 일반 사용자에게 직접 만든 **연습용 예시 가격**만 공개합니다. 실제 페이지에서 확인한 비공개 관측은 본인 갤럭시의 개발용 읽기 전용 미리보기로 살펴봅니다. 이마트·SSG 공식 앱 또는 제휴 앱이 아닙니다.

## 개발 방식

- 앱: Expo + React Native + TypeScript
- DB: Supabase PostgreSQL·공개 카탈로그 읽기, 로컬 SQL 검사는 PGlite
- 출시 빌드 계획: Expo EAS Build / Submit
- 기록: 기능 단계별 Git 커밋 + 책 원고
- 저장소: https://github.com/ungjo/store-price

## 먼저 읽기

1. [필요한 프로그램과 환경 준비](docs/01-setup.md)
2. [앱 범위와 개발 순서](docs/02-roadmap.md)
3. [실제 가격 데이터 확보 계획](docs/03-price-data.md)
4. [책 원고와 커밋 읽는 법](docs/book/README.md)
5. [갤럭시 자동 검사·기록·커밋](docs/04-device-automation.md)
6. [상품 DB와 Supabase 연결 안내](docs/05-catalog-database.md)

## 현재 진행

- [x] 사용자 연령과 가격 기준 확정
- [x] 개발 환경 확인, 저장소 연결, 기획 기록
- [x] Expo 앱 생성, 코드 검사, 플랫폼별 번들·브라우저 확인
- [x] 갤럭시 Expo Go 첫 실행 확인 (2026-11-09 사용자 확인)
- [x] 갤럭시에서 예시 상품 6개 표시 확인 (2026-11-10 사용자 확인)
- [x] 장바구니 코드·자동 검사·브라우저 검증 (2026-11-10)
- [x] 갤럭시 장바구니 기본 동작 검증 (2026-11-11 사용자 확인)
- [x] 놀이돈 예산·잔액 코드와 자동 검사·브라우저 검증 (2026-11-11)
- [x] 갤럭시 놀이돈 예산 기본 동작 검증 (2026-11-11 사용자 확인)
- [x] 지불할 놀이돈 선택 코드·자동 검사·브라우저 검증 (2026-11-11)
- [x] 갤럭시 지불할 놀이돈 선택·재실행 초기화 자동 검증 (`8309377`, 2026-11-12)
- [x] 거스름돈 금액·계산식 구현 — [검증 기록 확인](docs/book/verification/latest-android.md)
- [x] 거스름돈 답 입력·채점·다시 풀기 구현 — [검증 기록 확인](docs/book/verification/latest-android.md)
- [x] 계산 완료·놀이 영수증·다시 장보기 구현 — [검증 기록 확인](docs/book/verification/latest-android.md)
- [x] 상품 DB 스키마·예시 데이터·로컬 SQL 권한 검사 — [개발 기록](docs/book/chapters/04-catalog-database.md)
- [x] 새 Supabase 프로젝트에 예시 6개 적용, 공개 키 HTTP 조회 확인 (2026-11-12)
- [x] 앱의 원격 카탈로그 읽기·오류 처리·실기기 검증 (`1f994f3`) — [개발 기록](docs/book/chapters/04a-supabase-catalog.md)
- [x] 실제 가격 3개의 비공개 관측 적재·DB 검증 — [개발 기록](docs/book/chapters/04b-real-price-intake.md)
- [x] 실제 가격 개발용 미리보기·USB 전송 구현 (`f6f4ccb`) — [개발 기록과 검증 범위 확인](docs/book/chapters/04c-real-price-preview.md)
- [x] 상품 조회 중 내장 예시로 바로 시작 구현 — [코드 검사와 실기기 검증 기록](docs/book/chapters/05-offline-sample-play.md)
- [ ] 허용된 실제 가격의 앱 공개·자동 갱신
- [ ] Android·iPhone 실기기 검증
- [ ] 스토어 제출

개발용 미리보기와 일반 사용자에게 실제 가격을 공개하는 단계는 구분합니다. 2026-11-13의 즉시 예시 선택 변경은 코드 검사를 통과했고 사용자가 갤럭시 USB 디버깅을 허용했습니다. 전체 실기기 결과는 이 변경과 함께 남기는 [검증 기록](docs/book/verification/latest-android.md)에서 확인하며, 검사 시작 HEAD가 `f6f4ccb`인지 구분합니다. 이전 커밋에 포함된 성공 기록을 이번 변경의 결과로 사용하지 않습니다.

## 첫 화면 실행

[모바일 앱 실행 안내](apps/mobile/README.md)를 따라 갤럭시에서 확인할 수 있습니다. 예시 상품 6개와 담기·수량 조절·장바구니 합계, 놀이돈 10,000원을 기준으로 남을 돈과 부족한 돈 표시를 구현했습니다. 낼 놀이돈 1,000원·5,000원·10,000원 중 하나를 선택하고 물건값에 충분한지 알려주는 기능도 구현했습니다. 충분한 돈을 고르면 거스름돈을 입력해 맞히는 문제가 나옵니다. 정답을 맞히면 받을 거스름돈과 계산식을 공개하고, 딱 맞게 낸 경우에도 0원을 답으로 입력합니다. 예산 잔액과 거스름돈은 서로 다른 기준으로 계산합니다. 정답 후 계산 완료를 누르면 상품별 내역·총액·낸 돈·거스름돈·남은 돈을 영수증으로 보여 줍니다. 다시 장보기는 새 놀이돈 10,000원으로 시작합니다. 장바구니·돈 선택·영수증은 메모리에만 보관하므로 새로고침하면 초기화됩니다. 상품 DB 기반은 `06cb47c`, Supabase의 공개 예시 6개를 읽는 앱 연결·오류 처리·갤럭시 검증은 `1f994f3`에 포함했습니다. 현재 비공개로 기록하는 실제 가격은 공개 앱 목록과 구분하며, 실제 가격의 앱 공개는 후속 단계입니다.

```bash
cd apps/mobile
npm ci
npm start
```

[1장: 첫 앱과 검증 결과](docs/book/chapters/01-first-app.md) · [2장: 장바구니](docs/book/chapters/02-shopping-cart.md) · [3장: 놀이돈 예산](docs/book/chapters/03-play-money.md) · [3장 보충: 낼 놀이돈 선택](docs/book/chapters/03a-payment-selection.md) · [3장 보충: 거스름돈 계산](docs/book/chapters/03c-change-calculation.md) · [3장 보충: 거스름돈 맞히기](docs/book/chapters/03d-change-quiz.md) · [3장 보충: 계산 완료와 영수증](docs/book/chapters/03e-checkout-receipt.md) · [4장: 상품 DB 구조와 권한](docs/book/chapters/04-catalog-database.md) · [4장 보충: Supabase 상품 읽기](docs/book/chapters/04a-supabase-catalog.md) · [4장 보충: 실제 가격 비공개 관측](docs/book/chapters/04b-real-price-intake.md)

## 실제 가격을 개발 중인 갤럭시에서 보기

실제 가격 미리보기는 컴퓨터와 USB로 연결한 갤럭시에서만 사용하는 별도 개발 기능입니다. DB에서 읽어 둔 자료의 상품명·규격·확인 당시 가격·출처·확인 시각·재고 상태를 표시합니다. 미리보기 상품을 장바구니에 넣지는 않으며, 기존 시장놀이는 예시 6개로 유지합니다.

실제 자료와 원격 조회 결과는 Git에서 제외합니다. 미리보기를 열었다고 DB의 공개 상태나 이용 범위를 승인된 것으로 변경하지 않습니다. [실행 방법](apps/mobile/README.md) · [구현과 검증 기록](docs/book/chapters/04c-real-price-preview.md)

## 연결을 기다리지 않고 예시로 시작하기

상품을 불러오는 화면에서 **예시 상품으로 바로 놀이하기**를 선택하는 흐름을 추가했습니다. 서버 응답이나 연결 오류를 기다리지 않고 앱에 포함된 예시 6개로 시작하며, 뒤늦게 도착한 원격 목록이 진행 중인 놀이를 바꾸지 않도록 했습니다. 실제 가격 저장이나 영구 캐시를 추가하는 단계는 아닙니다. [개발 기록과 검사 상태](docs/book/chapters/05-offline-sample-play.md)

현재 프로젝트는 Expo SDK 58입니다. [Expo Go 호환 오류 해결 기록](docs/book/chapters/01a-expo-go-sdk58.md)에 업데이트와 검증 내용을 남겼습니다.
