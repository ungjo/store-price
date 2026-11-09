# 01장. 휴대전화에서 볼 첫 화면 만들기

> 아래는 최초 SDK 57 개발 기록입니다. 현재 프로젝트는 SDK 58이며, [호환 오류 해결 보충 기록](01a-expo-go-sdk58.md)에 변경 내역과 재검증 결과를 남겼습니다.

날짜: 2026-11-09

현재 앱 코드 기준: `adcfaab` — feat: Expo SDK 58 기반 상품 목록 화면 구현 (2026-11-10 사용자 직접 커밋). 이 커밋은 SDK 58 상태이며, 아래 SDK 57 내용은 최초 개발 당시의 과정 기록이다.

이전 단계: 00장 준비와 기획

## 목표와 실행 명령

실행 기반과 한국어 상품 화면을 준비한다. 작은 단계를 완료할 때마다 코드와 원고를 함께 남긴다.

저장소 루트에서 실행했다.

```powershell
npx.cmd --yes create-expo-app@5.0.0 apps/mobile --template expo-template-blank-typescript@57.0.34 --no-install --yes
cd apps/mobile
npm.cmd install
npx.cmd expo install react-native-safe-area-context react-dom react-native-web
npx.cmd expo install --dev eslint eslint-config-expo
```

2026-11-09에 읽은 [Expo 프로젝트 생성 안내](https://docs.expo.dev/get-started/create-a-project/)는 SDK 58 전환 중 휴대전화 Expo Go 사용 시 SDK 57을 안내했다. npm registry의 템플릿 버전을 확인한 후 57.0.34로 고정했다. 재현할 때는 lockfile과 npm ci를 사용한다.

## 실제 설치 버전

| 항목 | 버전 |
| --- | --- |
| Node.js / npm | 26.1.0 / 11.13.0 |
| Expo | 57.0.32 |
| React / React DOM | 19.2.3 |
| React Native | 0.86.3 |
| TypeScript | 6.0.3 |
| react-native-safe-area-context | 5.7.0 |
| ESLint / eslint-config-expo | 9.39.5 / 57.0.2 |

## 만든 내용

- App.tsx: 한국어 첫 화면, 예시 가격 안내, 상품 목록
- src/data/sample-products.ts: 자체 상품명·규격·예시 가격 6개
- app.json: 앱 가제 꼬마 시장, 버전 0.1.0
- eslint.config.js / package.json: 검사 명령
- package-lock.json: 의존성 고정
- README.md: 기기별 실행 안내

아직 화면 이동이 없으므로 Router를 추가하지 않았다. 화면 분리 단계에 Expo Router를 도입한다.

사과·우유·당근·식빵·바나나·달걀은 자체 예시이며 모두 isSample: true로 구분한다. 실제 이마트에서 관측한 상품·가격이라는 뜻이 아니다.

너비가 360px 미만이거나 글자 배율이 1.4보다 크면 상품을 한 줄에 하나씩 표시한다. 가격은 원 단위 정수이며, 접근성 라벨에 상품·규격·예시 가격을 포함했다.

## 문제와 해결

JSX의 줄바꿈 이스케이프가 실제 개행으로 저장되어 TypeScript·ESLint에서 Unterminated string literal 오류가 발생했다. 네 곳을 올바른 이스케이프 문자열로 고친 뒤 두 검사를 통과했다.

이전 기획 문서 커밋에서는 Markdown 줄 끝 공백을 git diff --check가 발견했다. 날짜와 코드 기준을 빈 줄로 분리해 해결했다.

## 검증 결과

| 확인 | 결과 |
| --- | --- |
| npm.cmd run typecheck | 통과 |
| npm.cmd run lint | 통과 |
| npx.cmd expo-doctor | 21/21 통과 |
| npx.cmd expo export --platform all | Android·iOS·웹 번들 생성 성공 |
| 브라우저 390px / 320px | 화면 표시, 가로 넘침 없음, 320px에서 1열 확인 |
| 브라우저 console error | 관찰 시점에 없음 |
| npm.cmd audit --json | moderate 11건, 아래 설명 참조 |
| Android 실기기 | 미확인 — 사용자는 갤럭시 선택 |
| iPhone 실기기 | 미확인 |
| AAB / IPA 서명 빌드 | 미수행 |
| 앱스토어 심사·배포 | 미수행 |

번들 생성은 JavaScript를 플랫폼별로 묶는 검사다. 실제 기기 설치나 앱스토어 승인을 뜻하지 않는다. 글자 배율 확대와 스크린리더 동작은 실기기 검증 단계에서 확인한다.

## 남아 있는 의존성 경고

npm audit는 moderate 11건을 보고했다. 주된 원인은 아래 2개 advisory가 상위 의존성까지 전파된 집계다.

- glob: 취소 후 파일 탐색이 지속될 수 있는 자원 소모 문제. [공식 advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- minimatch: 특정 패턴·optimizationLevel 조건에서 과도한 자원을 사용할 수 있는 문제. [공식 advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

fingerprint 경로의 glob 13.0.7, fingerprint·TypeScript ESLint 경로의 minimatch 10.2.6에 경고가 남아 있다. 최초 수정 버전 glob 14.0.2와 minimatch 11.0.1은 상위 패키지의 허용 major 범위를 벗어난다. 현재 앱 사용자 입력을 이 패턴 도구에 전달하는 경로는 없지만 취약성이 해소된 것은 아니다.

npm audit fix --force는 Expo SDK 52 등 호환되지 않는 하향 변경을 제안해 실행하지 않았다. 호환 가능한 상위 패키지 패치와 출시 전 재점검이 필요하다. 설치 중 표시된 ESLint 9 지원 종료 안내도 기록한다.

## 다음 실행과 개발

[갤럭시 실행 안내](../../../apps/mobile/README.md)에 따라 Expo Go를 설치하고 첫 화면을 확인한다. 실제 기기 결과는 확인 후 기록한다.

다음 개발 단계는 장바구니 담기·수량 변경·합계 계산이다. 현재 화면은 완성된 시장놀이 앱이 아니다.
