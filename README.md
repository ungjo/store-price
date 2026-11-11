# 시장놀이 — store-price

초등학교 1~3학년 아이들이 상품을 고르고 놀이돈으로 계산하며 거스름돈을 배우는 Android·iOS 앱입니다.

실제 가격의 목표 출처는 **SSG.COM 이마트 온라인 상품 가격**입니다. 오프라인 이마트 점포의 현재 가격을 의미하지 않습니다. 데이터 이용 범위가 확인되기 전에는 직접 만든 **연습용 예시 가격**만 사용합니다. 이마트·SSG 공식 앱 또는 제휴 앱이 아닙니다.

## 개발 방식

- 앱: Expo + React Native + TypeScript
- DB 계획: Supabase의 PostgreSQL
- 출시 빌드 계획: Expo EAS Build / Submit
- 기록: 기능 단계별 Git 커밋 + 책 원고
- 저장소: https://github.com/ungjo/store-price

## 먼저 읽기

1. [필요한 프로그램과 환경 준비](docs/01-setup.md)
2. [앱 범위와 개발 순서](docs/02-roadmap.md)
3. [실제 가격 데이터 확보 계획](docs/03-price-data.md)
4. [책 원고와 커밋 읽는 법](docs/book/README.md)
5. [갤럭시 자동 검사·기록·커밋](docs/04-device-automation.md)

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
- [ ] DB 구성과 허용된 실제 가격 연동
- [ ] Android·iPhone 실기기 검증
- [ ] 스토어 제출

완료되지 않은 항목은 구현·검증 완료를 의미하지 않습니다.

## 첫 화면 실행

[모바일 앱 실행 안내](apps/mobile/README.md)를 따라 갤럭시에서 확인할 수 있습니다. 예시 상품 6개와 담기·수량 조절·장바구니 합계, 놀이돈 10,000원을 기준으로 남을 돈과 부족한 돈 표시를 구현했습니다. 낼 놀이돈 1,000원·5,000원·10,000원 중 하나를 선택하고 물건값에 충분한지 알려주는 기능도 구현했습니다. 충분한 돈을 고르면 거스름돈을 입력해 맞히는 문제가 나옵니다. 정답을 맞히면 받을 거스름돈과 계산식을 공개하고, 딱 맞게 낸 경우에도 0원을 답으로 입력합니다. 예산 잔액과 거스름돈은 서로 다른 기준으로 계산합니다. 정답 후 계산 완료를 누르면 상품별 내역·총액·낸 돈·거스름돈·남은 돈을 영수증으로 보여 줍니다. 다시 장보기는 새 놀이돈 10,000원으로 시작합니다. 장바구니·돈 선택·영수증은 메모리에만 보관하므로 새로고침하면 초기화됩니다. DB와 실제 가격은 이후 단계입니다.

```bash
cd apps/mobile
npm ci
npm start
```

[1장: 첫 앱과 검증 결과](docs/book/chapters/01-first-app.md) · [2장: 장바구니](docs/book/chapters/02-shopping-cart.md) · [3장: 놀이돈 예산](docs/book/chapters/03-play-money.md) · [3장 보충: 낼 놀이돈 선택](docs/book/chapters/03a-payment-selection.md) · [3장 보충: 거스름돈 계산](docs/book/chapters/03c-change-calculation.md) · [3장 보충: 거스름돈 맞히기](docs/book/chapters/03d-change-quiz.md) · [3장 보충: 계산 완료와 영수증](docs/book/chapters/03e-checkout-receipt.md)

현재 프로젝트는 Expo SDK 58입니다. [Expo Go 호환 오류 해결 기록](docs/book/chapters/01a-expo-go-sdk58.md)에 업데이트와 검증 내용을 남겼습니다.
