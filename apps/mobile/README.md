# 꼬마 시장 — 모바일 앱

Expo SDK 58 / React Native / TypeScript로 만든 첫 단계 앱입니다. 현재는 자체 예시 상품 6개를 살펴보는 화면이며, 장바구니·계산 놀이·DB·실제 가격 연동은 다음 단계입니다.

## Windows PowerShell에서 실행

저장소 루트에서:

```powershell
cd apps/mobile
npm.cmd ci
npm.cmd start
```

이미 설치를 마친 작업 폴더에서는 npm.cmd ci를 매번 실행할 필요가 없습니다. npm.cmd 표기는 PowerShell의 npm.ps1 실행 정책 문제를 피합니다.

## 갤럭시 / Android에서 보기

1. [Expo 공식 설치 안내](https://docs.expo.dev/get-started/set-up-your-environment/)에서 Expo Go를 설치합니다.
2. PC와 휴대전화를 같은 Wi-Fi에 연결합니다.
3. 위 명령으로 개발 서버를 실행합니다.
4. Expo Go에서 QR 스캔을 열고 PC 터미널의 QR을 읽습니다.
5. 꼬마 시장, 연습용 예시 가격 안내, 상품 6개가 표시되는지 확인합니다.
6. 종료할 때 서버 터미널에서 Ctrl+C를 누릅니다.

다른 미리보기 서버가 이미 8081 포트를 사용한다면 기존 서버를 종료하거나 npm.cmd start -- --port 8082로 다른 포트를 사용합니다. 휴대전화 실행에는 --localhost 옵션을 사용하지 않습니다.

연결 실패 시 같은 네트워크인지, VPN·공용 Wi-Fi의 기기 간 연결 제한이 있는지 확인합니다. SDK 호환 오류가 있으면 [공식 Expo Go 다운로드 페이지](https://expo.dev/go)에서 SDK 58 지원 여부를 확인하고 프로젝트와 앱 버전을 맞춥니다.

## iPhone에서 보기

PC와 같은 Wi-Fi에서 iPhone 카메라로 QR을 읽습니다. 현재 공식 안내에 따르면 iPhone 실기기는 Expo CLI와 Expo Go에 같은 Expo 계정으로 로그인해야 합니다.

```powershell
npx.cmd expo login
```

로그인은 사용자가 직접 수행합니다. [공식 iPhone 로그인 안내](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/)

## PC 브라우저와 코드 검사

```powershell
npm.cmd run web
```

브라우저 미리보기는 실제 Android·iPhone 테스트를 대신하지 않습니다.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run export:check
npx.cmd expo-doctor
```

export:check는 Android·iOS·웹의 JavaScript 번들을 생성합니다. APK/AAB/IPA 생성이나 스토어 제출은 아닙니다.

## 개발 기준

- 최초 SDK 57 템플릿에서 시작했으나, 갤럭시에 설치된 Expo Go가 SDK 58용임을 확인해 프로젝트를 SDK 58로 올렸습니다.
- 설치 버전은 package-lock.json으로 재현합니다.
- 추가 패키지는 npx.cmd expo install을 통해 SDK에 맞춥니다.
- 현재 화면 이동은 없습니다. 여러 화면을 도입할 때 Expo Router를 사용합니다.
- 실제 가격·로고·사진을 임의 수집한 데이터는 포함하지 않습니다.
- 아이콘은 Expo 템플릿 자산입니다. 출시 단계에서 전용 아이콘과 스토어 식별자를 정합니다.

검증 결과와 의존성 경고는 [책 1장](../../docs/book/chapters/01-first-app.md)에 기록했습니다.

SDK 58 업데이트 과정과 최신 검증 결과는 [Expo Go 호환 오류 해결 기록](../../docs/book/chapters/01a-expo-go-sdk58.md)에 있습니다.
