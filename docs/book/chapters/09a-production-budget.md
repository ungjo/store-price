# 09a. 5만 원권 결제를 정식 Android 번들에서 확인하기

2026년 11월 22일, 앱 소스를 `0e25731`에 고정하고 Google Play용 **꼬마 시장**을 다시 빌드했다. 패키지는 `com.ungjo.storeprice`, 버전은 `1.0.0`, 버전 코드는 `2`다. 앱에 이미 들어 있는 기능을 정식 패키지에서도 검증하도록 Maestro 검사와 결과 보고서를 갱신했다.

## 어떤 화면을 확인하는가

- 가격 안내에서 ‘연습용 예시 가격이에요’와 ‘실제 마트 판매 가격이 아니에요.’를 확인한다.
- 앱 안에서 개인정보처리방침을 열어 제목, 시행일, 문의 부분을 읽고 닫는다.
- ‘TalkBack 설정 열기’를 눌러 Android 접근성 설정으로 들어갔다가 앱의 화면 읽기 상태 표시로 복귀한다. 삼성 태블릿의 두 패널 설정이 남으면 그 설정이 전면일 때만 뒤로가기를 한 번 더 보낸다.
- 예시 상품 12개 중 사과 2개와 우유 1개를 담고 물건값 5,500원을 확인한다. 50,000원 예산과 50,000원권을 고른 뒤 `44500`을 입력한다. 영수증의 수량·품목·합계·낸 돈·거스름돈·남은 예산을 대조하고 스크린샷을 저장한다.

## 빌드와 기기 설치

[정식 EAS 빌드](https://expo.dev/accounts/juj_chroma/projects/store-price/builds/887ad9d4-f4a5-4a12-98f6-db7e400ddd7a)에 제출한 파일 45개를 준비된 복사본과 대조했다. EAS에서는 기존 업로드 키를 사용한다. 태블릿에서는 이 AAB에서 추출한 기기별 APK를 로컬 테스트용 서명으로 설치한다.

빌드가 완료된 후 AAB의 크기 46,073,853바이트와 SHA-256 `3cf580609627a1fd9ca5154ec9ed57874f6a7a0200e46258adbcdb2ee3a0a56f`을 확인했다. 업로드 인증서는 이전 출시 번들의 `282ede849b8ffb886840bafd0b0e76ec5fa74c399e4dfd702a722219881368e7`과 일치했다. 연결된 SM-X710 사양으로 APK 네 개를 생성해 각 파일의 패키지, 버전, 서명을 확인했다. 앱 단위 검사 153개, 정식 빌드·설치·시작 화면 검사기 테스트 18개, TypeScript와 ESLint 검사가 통과했다.

이전에 설치한 정식 앱의 분할 APK 네 개는 `35b12e4`의 기록과 일치했다. 당시 APK를 만든 일회용 로컬 설치 서명 키는 생성 직후 삭제됐다. 이번 빌드의 설치 절차에서는 태블릿의 기존 앱 처리와 Google Play 업로드용 서명을 구분했다.

기기 소유자가 이전 정식 앱과 로컬 데이터 삭제를 승인했다. 삭제 직전에 대상 기종과 사용자, 기존 APK 네 개의 지문, 다른 프로필의 설치 여부를 다시 확인했다. 현재 Android 사용자(0)에서만 `adb shell pm uninstall --user 0 com.ungjo.storeprice`를 실행해 성공했고 별도의 검사 앱이 남아 있음을 확인했다. 새 AAB에서 추출한 분할 APK 네 개로 `adb install-multiple -R --user 0 <분할 APK 네 개>`를 실행해 `Success`를 받았다. 설치 직후 버전 1.0.0과 네 파일의 SHA-256이 준비한 파일과 모두 일치했다. 이어지는 자동 검사는 같은 설치본을 다시 대조해 사용한다.

```bash
node scripts/build/production.mjs prepare
# 격리된 project 폴더에서 production 프로필로 빌드한 뒤 저장소 루트에서 실행한다.
build_dir=.artifacts/build/production-010161b494026288
node scripts/build/production.mjs download "$build_dir" 887ad9d4-f4a5-4a12-98f6-db7e400ddd7a
node scripts/build/production.mjs verify "$build_dir"
node scripts/build/production-apks.mjs "$build_dir"
node scripts/device/verify.mjs --production-aab "$build_dir/provenance.json" --message "test: 정식 AAB에서 가격 안내와 오만 원권 영수증 검증"
```

[정식 앱 실기기 검사 보고서](../verification/latest-android.md)에 AAB 및 설치된 APK의 지문, 기종, JUnit 판정, 아이콘·시작 화면의 검토 결과가 기록된다. 영수증 캡처 파일 이름은 `production-50000-receipt.png`다.
