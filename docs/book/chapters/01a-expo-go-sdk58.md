# 1장 보충. Expo Go와 프로젝트 SDK 버전 맞추기

날짜: 2026-11-09 (SDK 업데이트), 2026-11-10 (상품 목록 확인·사용자 직접 커밋)

현재 앱 코드 기준: `adcfaab` — feat: Expo SDK 58 기반 상품 목록 화면 구현

상태: PC 검증 완료. 사용자가 갤럭시에서 꼬마 시장과 상품 목록 표시를 확인함. 개발 도구는 이 수정 과정에서 커밋·태그·푸시를 실행하지 않음.

## 실제 발생한 오류

갤럭시에서 QR을 읽자 아래 오류가 표시되었다.

```text
Project is incompatible with this version of Expo Go
The installed version of Expo Go is for SDK 58.
The project you opened uses SDK 57.
```

처음에는 공식 생성 안내의 전환기 설명에 따라 SDK 57을 선택했다. 그러나 사용자 휴대전화에 실제 설치된 Expo Go는 SDK 58용이었다. 이번에는 휴대전화의 실제 오류와 SDK 58 공식 안내를 기준으로 프로젝트를 업데이트했다.

[Expo SDK 업그레이드 안내](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/) · [SDK 58 변경사항](https://expo.dev/changelog/sdk-58)

## 해결 과정

package.json과 package-lock.json을 Git에서 제외되는 .expo/sdk57-before-upgrade에 로컬 백업한 뒤, apps/mobile에서 실행했다.

```powershell
npx.cmd expo install expo@~58.0.23
npx.cmd expo install --fix
```

설치 도구가 SDK 58에 맞는 패키지를 선택했고 app.json에 expo-status-bar 설정 플러그인을 추가했다. android·ios 네이티브 폴더는 생성되어 있지 않아 별도 삭제·재생성이 필요하지 않았다.

| 패키지 | 업데이트 전 | 업데이트 후 |
| --- | --- | --- |
| expo | 57.0.32 | 58.0.23 |
| react / react-dom | 19.2.3 | 19.3.0 |
| react-native | 0.86.3 | 0.88.1 |
| expo-status-bar | 57.0.1 | 58.0.4 |
| react-native-safe-area-context | 5.7.0 | 5.11.1 |
| @types/react | 19.2.18 | 19.3.0 |
| eslint-config-expo | 57.0.2 | 58.0.4 |

Node.js 26.1.0은 SDK 58 요구사항을 충족했다. TypeScript는 6.0.3을 유지했다.

## 코드와 기록

- 가격 표시, 작은 화면의 열 수 선택, FlatList 재생성, 예시 데이터 구분에 한국어 주석을 추가했다.
- 루트 AGENTS.md에 단계별 진행, 사용자 직접 커밋, 한국어 핵심 주석 원칙을 기록했다.
- 현재 실행 안내는 SDK 58 기준으로 갱신했다. 1장 본문의 SDK 57 결과는 최초 개발 당시 기록이다.
- 기능 추가나 실제 가격·DB 연동은 하지 않았다.

## 실행한 검증

| 명령 | 결과 |
| --- | --- |
| npm.cmd run typecheck | 통과 |
| npm.cmd run lint | 통과 |
| npx.cmd --yes expo-doctor | 20/20 통과 |
| npm.cmd run export:check | Android·iOS·웹 번들 생성 성공 |
| npm.cmd audit --json | moderate 12건, high/critical 0건 |

의존성 경고는 glob·minimatch advisory가 Expo CLI·fingerprint·TypeScript ESLint로 전파된 항목이다. 기존 1장의 경고가 해결된 것은 아니며, 강제 수정 제안에는 SDK 하향 변경이 포함되어 실행하지 않았다. 출시 전 호환 업데이트와 사용 경로를 재검토한다.

[glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## 갤럭시에서 이어서 확인할 단계

실행 중인 예전 Metro 서버는 기존 패키지를 메모리에 유지할 수 있으므로 사용자 터미널에서 Ctrl+C로 멈춘 뒤, 같은 apps/mobile 폴더에서 캐시를 비우고 재시작한다.

```powershell
npm.cmd start -- --lan --port 8082 --clear
```

사용자가 새 QR로 Expo Go를 열어 갤럭시에서 꼬마 시장 제목과 상품 목록이 보인다고 확인했다(2026-11-09). SDK 버전 불일치로 막혔던 첫 실행이 사용자 확인으로 해결되었다.

2026-11-10에는 사용자가 목록 확인 후 “6개 모두 잘 보여”라고 답했다. 따라서 갤럭시 첫 실행과 예시 상품 6개 표시는 사용자 확인을 마쳤다. 글자 배율 확대·스크린리더·iPhone 등 추가 검증은 아직 수행하지 않았다.

2026-11-10에 사용자가 기획 커밋 `afb4784`, 앱 코드 커밋 `adcfaab`를 직접 생성했다. 다음은 실행 기록과 원고 목차를 별도 문서 커밋으로 저장하는 단계다. 앱 커밋에는 현재 SDK 58 소스를 저장했으며, 과거 SDK 57 소스를 복원한 것처럼 커밋을 재구성하지 않았다.
