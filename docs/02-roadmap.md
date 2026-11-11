# 2. 앱 범위와 단계별 개발

## 확정한 범위

- 주 사용자: 초등학교 1~3학년
- 플랫폼: Google Play와 Apple App Store에 배포할 모바일 앱
- 가격 기준: SSG.COM 이마트 온라인 상품 가격
- 학습 목표: 상품 가격 읽기, 덧셈, 예산 관리, 거스름돈 계산
- 기본 진행: 큰 버튼, 원 단위 정수 계산, 짧은 안내, 반복할 수 있는 놀이
- 최초 버전: 로그인·광고·실제 결제·채팅 없이 사용

## 첫 완성 버전(MVP)

1. 자체 예시 상품 10~20개를 분류별로 살펴본다.
2. 장바구니에 담고 수량을 바꾼다.
3. 놀이돈 예산 안에서 장을 본다.
4. 합계를 확인하고 지불할 놀이돈을 고른다.
5. 거스름돈을 맞히고 다시 시도한다.
6. 출처·가격 확인일·조건을 확인할 수 있다.
7. 인터넷이 없어도 예시 데이터 또는 마지막 검증된 자료로 놀이한다.

아이의 이름·학교·생년월일을 수집할 필요가 없는 구조부터 시작합니다. 실제 가격을 교육용으로 반올림하는 모드를 추가한다면 원래 가격과 놀이 가격을 분리해서 표시합니다.

## 개발 순서와 완료 기준

| 단계 | 구현 | 완료 기준 | 커밋 예시 |
| --- | --- | --- | --- |
| 00 | 기획·도구·기록 체계 | 대상·출처·진행 순서를 문서화 | docs: define market-play scope and development journal |
| 01 | Expo 앱 뼈대 | TypeScript·번들 확인, 기기 실행 방법 제공 | chore: scaffold Expo TypeScript app |
| 02 | 상품과 장바구니 | 담기·빼기·수량·합계 동작 | feat: add sample catalog and shopping cart |
| 03 | 계산·거스름돈 놀이 | 예산·지불·정답 로직 검증 | feat: add checkout and change practice |
| 04 | DB 설계 | 상품·가격 이력·공개 읽기·관리자 쓰기 검증 | feat: add catalog database and access rules |
| 05 | 실제 가격 연결 | 이용 범위 확인, 수집·검증·갱신·실패 기록 | feat: import approved price data |
| 06 | 아동 사용성 | 실기기·큰 글자·접근성·오프라인 확인 | feat: improve child-friendly play flow |
| 07 | 출시 테스트 | 개발 빌드·TestFlight·Play 테스트 | test: prepare mobile release candidate |
| 08 | 스토어 제출·책 편집 | 심사 자료·개인정보 고지·원고 정리 | release: prepare store submissions |

각 단계에서 목표 → 구현 → 검증 → 기록 → 커밋 → GitHub 업로드 순서로 진행합니다. 소규모 커밋을 보존하며, 책의 장 끝에는 해당 단계 태그와 실제 커밋을 연결합니다.

## 현재 단계 (2026-11-12)

사용자가 장바구니 작업을 네 번째 커밋 `6009317`로 만들고 GitHub에 업로드했습니다. 02단계의 갤럭시 기본 동작 확인도 마쳤습니다. [장바구니 개발 기록](book/chapters/02-shopping-cart.md)

03단계는 작은 단위로 나누어 진행합니다. 놀이돈 10,000원과 남을 돈·부족한 돈 표시의 자동 검사·브라우저·갤럭시 기본 동작 확인을 마쳤고, 2026-11-11에 사용자가 `281a5e9`로 직접 커밋해 GitHub 업로드를 완료했습니다. [놀이돈 예산 개발 기록](book/chapters/03-play-money.md)

현재는 지불할 놀이돈 1,000원·5,000원·10,000원 중 하나를 고르는 단계입니다. 선택이 물건값보다 적으면 부족한 금액을 안내하며, 상품이 바뀌면 다시 선택하게 합니다. 돈 선택은 예산 잔액을 바꾸지 않습니다. 돈 선택 15개를 포함한 전체 테스트 32개·타입·ESLint·세 플랫폼 번들과 390px·320px 브라우저 검증을 마쳤습니다. 2026-11-12에 사용자가 갤럭시에서 5,000원 선택됨·500원 부족 안내·예산 잔액 4,500원 유지를 확인했습니다. 같은 날 10,000원으로 선택 교체·이전 선택 해제·충분하다는 안내와 3개·5,500원·남을 돈 4,500원 유지도 확인했습니다. 선택 취소 후 미선택 안내·금액 버튼 복원·선택 취소 버튼 사라짐과 장바구니·예산 잔액 유지도 확인했습니다. 10,000원을 고른 뒤 사과를 한 개 더 담으면 4개·7,000원·남을 돈 3,000원으로 바뀌고 돈 선택이 초기화되는 것도 확인했습니다. 식빵 한 봉 추가 후 총 5개·10,000원에 10,000원을 선택하면 남을 돈 0원과 예산에 딱 맞음·지불할 돈이 충분하다는 안내가 함께 표시되는 것도 확인했습니다. 당근 한 개를 더 담아 6개·11,000원·부족한 돈 1,000원이 되면 돈 선택이 초기화되고 금액 버튼이 비활성화되어 10,000원을 눌러도 선택되지 않는 것도 확인했습니다. 당근을 제거하면 5개·10,000원·남을 돈 0원으로 돌아오고 금액 버튼이 다시 활성화되어 10,000원을 선택할 수 있는 것도 확인했습니다. 전체 비우기 후 0개·0원·남을 돈 10,000원과 미선택 상태로 돌아오고, 빈 장바구니에서는 금액 버튼이 비활성화되어 선택되지 않는 것도 확인했습니다. 2026-11-12 사용자가 반복 검증·기록·커밋의 자동화를 요청해 [갤럭시 자동 검사](04-device-automation.md) 구성으로 전환했습니다. PC 도구 설치와 승인된 갤럭시 연결의 사전 검사를 마쳤습니다. 실제 자동 검사 결과는 실행기가 생성하는 docs/book/verification/latest-android.md에 남깁니다. 새로고침 후 초기화와 iPhone 실기기·화면 읽기는 미확인이고 자동 커밋 전입니다. 실제 결제 완료·거스름돈 맞히기는 후속 단계입니다. [낼 놀이돈 선택 개발 기록](book/chapters/03a-payment-selection.md)

## 구성

```text
허용된 가격 자료
    → 서버의 수집·검증
    → Supabase PostgreSQL (상품과 가격 이력)
    → 공개가 허용된 읽기 전용 상품 데이터
    → Expo 앱의 시장놀이
```

휴대전화에 수집 계정·DB 관리자 키를 넣지 않습니다. DB 단계에서 RLS와 테이블 권한을 함께 검증합니다. 놀이 진행 상태는 우선 기기에만 둡니다.

[Supabase Expo 연동](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native) · [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 출시 전에 준비할 것

- Android·iPhone 실제 기기의 화면, 터치, 읽기 쉬운 크기와 네트워크 오류 확인
- 개인정보처리방침, 실제 SDK 동작에 맞는 Apple 개인정보 / Google Data safety 신고
- 대상 연령과 Google Families 정책 검토
- Apple Kids Category의 외부 링크·구매 등 보호자 게이트 적용
- 앱 아이콘·스크린샷·소개·연락처·이용권한 자료 준비

2023-11-13 이후 생성된 개인 Google Play 개발자 계정에는 최소 12명이 연속 14일 참여하는 비공개 테스트 요건이 있습니다. 대상 계정과 최신 요건은 출시 시 다시 확인하며, 테스트 조건 충족이 자동 승인을 뜻하지는 않습니다.

[Google 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) · [Families 정책](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) · [Apple Kids 지침](https://developer.apple.com/app-store/review/guidelines/#kids-category)
