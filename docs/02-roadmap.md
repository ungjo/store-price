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
| 04 | DB 설계·앱 연결 | 상품·가격 이력·공개 읽기·관리자 쓰기, 원격 목록·실패 처리 검증 | feat: add catalog database and access rules |
| 05 | 실제 가격 연결 | 이용 범위 확인, 수집·검증·갱신·실패 기록 | feat: import approved price data |
| 06 | 아동 사용성 | 실기기·큰 글자·접근성·오프라인 확인 | feat: improve child-friendly play flow |
| 07 | 출시 테스트 | 개발 빌드·TestFlight·Play 테스트 | test: prepare mobile release candidate |
| 08 | 스토어 제출·책 편집 | 심사 자료·개인정보 고지·원고 정리 | release: prepare store submissions |

각 단계에서 목표 → 구현 → 검증 → 기록 → 커밋 → GitHub 업로드 순서로 진행합니다. 소규모 커밋을 보존하며, 책의 장 끝에는 해당 단계 태그와 실제 커밋을 연결합니다.

## 현재 단계 (2026-11-13)

장바구니는 `6009317`, 놀이돈 예산·잔액은 `281a5e9`, 돈 선택과 갤럭시 검사·기록·커밋 자동화는 `8309377`에서 구현하고 검증했습니다.

거스름돈 금액과 계산식은 `85415bb`에 포함했습니다. 앱 테스트 34개, 커밋 보호 테스트 9개, 타입·ESLint·세 플랫폼 번들과 갤럭시 화면·상태 조건 101개가 통과했고 사용자가 GitHub 업로드를 확인했습니다. [거스름돈 계산 기록](book/chapters/03c-change-calculation.md)

거스름돈 맞히기는 `843ec07`, 계산 완료·영수증은 `5d7321b`, 상품 DB 기반은 `06cb47c`에 포함했습니다. 로컬 PostgreSQL 검사 34개를 통과한 구조와 자체 예시를 새 Supabase 프로젝트에 적용했습니다. SQL Editor의 6행과 공개 키를 사용한 실제 HTTP 200 응답을 확인했습니다. [상품 DB 개발 기록](book/chapters/04-catalog-database.md)

앱의 원격 목록 읽기·실패 시 재시도·내장 예시 선택과 갤럭시 전체 검증은 `1f994f3`에 포함했습니다. 받은 가격은 한 번의 놀이 동안 유지하고 원격 영수증의 다시 장보기에서 새로 조회합니다. 사용자가 원격 출처 문구·상품 6개와 GitHub 업로드를 확인했습니다. [Supabase 상품 읽기 기록](book/chapters/04a-supabase-catalog.md)

공식 이마트몰 상세 페이지에서 직접 확인한 실제 가격 3개를 비공개 검토용 이력으로 저장하고 입력과 재조회 결과를 비교했습니다. 실제 자료를 예시나 승인된 API 자료라고 표시하지 않도록 manual_observation 출처를 추가하고, unknown·draft 상태와 원본 이력 보존을 검사했습니다. 로컬 DB 통합·입력 검사 63개가 통과했고 같은 SQL의 재실행에도 중복 자료가 생기지 않았습니다. 이 단계는 `0184ef9`로 커밋했고 사용자가 GitHub 업로드를 확인했습니다. 실제 입력과 적재 SQL은 공개 저장소에서 제외합니다. [실제 가격 비공개 관측 기록](book/chapters/04b-real-price-intake.md)

사용자는 실제 가격을 본인 갤럭시의 개발용 미리보기부터 확인하기로 했습니다. 비공개 DB 기록을 새로 읽어 USB로 연결한 기기에만 전달하고, 상품명·규격·확인 당시 가격·출처·시각·재고 상태를 읽기 전용으로 표시합니다. 기존 놀이의 예시 6개와 장바구니는 유지합니다. 이 단계는 `f6f4ccb`로 로컬 커밋했습니다. 실제 가격을 일반 사용자에게 공개하거나 시장놀이의 가격을 바꾸는 작업과 구분합니다. [개발용 미리보기 기록과 검증](book/chapters/04c-real-price-preview.md)

상품을 불러오는 동안에도 내장 예시를 직접 선택해 바로 놀이를 시작하는 흐름을 구현했습니다. 12초의 조회 제한 시간이나 오류를 기다리지 않고 선택할 수 있게 하고, 취소 후 늦게 도착한 응답이 놀이 목록·장바구니를 바꾸지 않게 했습니다. 새 검사 18개를 포함한 앱 검사 125개와 타입·ESLint·세 플랫폼 번들이 통과했습니다. DB 수정·실제 가격 공개·영구 캐시는 추가하지 않습니다. Expo Go의 오프라인 첫 실행은 이번 검증 범위에 포함하지 않습니다. [예시로 바로 시작하기의 개발 기록](book/chapters/05-offline-sample-play.md)

사용자는 이 개선을 다음 단계로 선택했고 갤럭시의 USB 디버깅을 허용했습니다. 연결과 잠금 해제를 확인한 뒤 전체 자동 검사 단계로 진행합니다. [실기기 검증 기록](book/verification/latest-android.md)에서 검사 시작 HEAD가 `f6f4ccb`인지와 예시 선택·기존 전체 놀이의 결과를 함께 확인합니다. 검사한 소스가 그대로 유지되고 모든 검사에 통과해야 로컬 커밋합니다. GitHub 업로드는 별도 요청에 따라 진행합니다. 놀이 영수증은 메모리에만 남습니다. 로컬 SQL 검사, 비공개 DB 적재·재조회, 공개 HTTP 조회, 앱·실기기 검증은 각각의 실행 근거로 구분합니다. iPhone 실기기 검증과 허용된 실제 가격의 앱 공개·자동 갱신은 후속 단계입니다.

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
