# 11. 어린이용 첫 출시판에서 상품 서버 연결 없애기

2026년 11월 29일, Google Play용 **꼬마 시장**을 내장 예시 상품 12개로 장보기부터 영수증까지 마칠 수 있게 변경했다. Android 패키지는 `com.ungjo.storeprice`, 버전은 `1.0.0`, 버전 코드는 `3`이다.

## 상품 목록을 앱에 넣은 이유

이전 내부 테스트판은 앱을 열 때 Supabase에서 예시 상품을 읽었다. 장바구니나 이름을 보내지 않아도 서버가 요청을 받으면 연결한 기기의 IP 주소와 요청 시각 등이 접속 로그에 남을 수 있다. 어린이 대상 앱은 실제로 사용하는 API와 SDK의 데이터 처리까지 확인해야 한다. 가격이 고정된 장보기 연습에는 서버에서 매번 목록을 가져올 이유가 없어 첫 출시판에서 이 요청을 없앴다. [Google Play 가족 정책](https://support.google.com/googleplay/android-developer/answer/9893335?hl=ko)

정식 Android 번들을 만들 때 Metro가 상품 서버 로더 대신 내장 상품 로더를 선택한다. 첫 화면은 곧바로 상품 12개를 보여 주고, 장바구니·놀이돈·거스름돈 답·영수증은 기기 메모리에서 처리한다. 정식 앱 설정은 Android의 `INTERNET` 권한을 차단한다. 개발용 웹과 별도 검사판은 기존 상품 서버를 실습할 수 있다.

## 코드 검사와 정식 빌드

저장소 루트에서 다음 명령으로 검사와 빌드 준비를 재현할 수 있다.

```powershell
npm.cmd --prefix apps/mobile test
npm.cmd --prefix apps/mobile run typecheck
npm.cmd --prefix apps/mobile run lint
node --test scripts/device/production-device.test.mjs
node --experimental-strip-types scripts/build/privacy-page.mjs --check
node scripts/build/production.mjs prepare
```

앱 단위 검사 154개와 TypeScript·ESLint 검사가 통과했다. 단위 검사에서는 실제 출시용 로더로 시작해 영수증을 만들고 다시 장보기를 시작할 때까지 `fetch` 호출 횟수가 0인지 확인했다. 기기 검사기 테스트 10개가 통과했다. 기기가 오프라인이거나 앱에 인터넷 권한이 있거나 송수신 바이트가 달라지면 실패하는 경우도 포함한다.

이번 빌드 준비 폴더는 `.artifacts/build/production-f1cf026064021860`이다. EAS에 보낼 파일 48개의 이름과 내용이 준비한 소스와 일치했다. Android 스토어용 `production` 프로필로 빌드를 요청했다. [정식 EAS 빌드 d773aeab](https://expo.dev/accounts/juj_chroma/projects/store-price/builds/d773aeab-7ee7-4e58-8d52-c891c118b465)

## 온라인 휴대전화에서 확인하는 방법

아래 명령은 이번 빌드 ID에 해당하는 AAB를 받아 패키지·서명·권한을 검사하고, 연결된 기기 사양에 맞는 APK로 동일한 출시 코드를 검증한다.

```powershell
$buildDir = '.artifacts/build/production-f1cf026064021860'
node scripts/build/production.mjs download $buildDir d773aeab-7ee7-4e58-8d52-c891c118b465
node scripts/build/production.mjs verify $buildDir
node scripts/build/production-apks.mjs $buildDir
node scripts/device/verify.mjs --production-aab "$buildDir/provenance.json"
```

실기기 검사는 Android가 기본 인터넷 연결을 검증했는지 확인한 뒤, 설치된 정식 앱의 UID에 해당하는 커널 송수신 바이트를 읽는다. 사과 2개와 우유 1개를 담아 합계 **5,500원**을 확인하고 **50,000원권**을 선택한다. 영수증에 거스름돈 **44,500원**이 표시되고 다시 장보기가 시작되어야 한다. 검사 전후에 해당 UID의 송신·수신 증가량이 각각 **0바이트**여야 통과한다. 자동 보고서의 버전 코드와 실행 시각으로 어느 빌드를 검사했는지 식별할 수 있다. [Android 실기기 검증 기록](../verification/latest-android.md)

## 방침과 Play Console

앱과 GitHub Pages의 개인정보처리방침에 상품 12개와 놀이 기록을 기기에서 처리한다는 내용을 반영했다. 공개 문서는 `gh-pages` 커밋 `5e36492`로 게시했다. 데이터 보안 양식에는 버전 코드 3을 기준으로 사용자 데이터 수집·공유 여부를 **아니요**로 정리했다. 기존 온라인 버전의 배포 트랙도 함께 확인할 수 있도록 적용 범위를 명시했다. [공개 개인정보처리방침](https://ungjo.github.io/store-price/privacy/) · [Play 데이터 보안 항목별 답변](../../07-play-data-safety.md)
