# 08b. 홈 아이콘에서 TalkBack 설정을 여는 검사 APK

갤럭시 탭에서 홈 아이콘으로 열 수 있도록, TalkBack 설정 버튼이 들어간 커밋 `3487654`로 고정 검사 앱을 빌드했다. 앱 이름은 **꼬마 시장 검사**, 패키지는 `com.ungjo.storeprice.inspection`, 버전은 `1.0.0`(코드 2)이다. 앱 파일과 홈 아이콘을 구분할 때는 같은 버전 번호를 쓰는 이전 APK와 혼동하지 않도록 빌드 표시와 파일 지문을 함께 비교한다.

## 빌드와 다운로드

1. 원본 앱 파일이 `3487654`와 일치하는 작업 폴더에서 `node scripts/build/inspection.mjs prepare`를 실행했다. 44개 앱 입력 파일 안에 TalkBack 설정 버튼이 포함되었다. 빌드 표시는 `inspection-d9fea202791a8c41`, 소스 지문은 `8d37a993b61fc4de34120ecef12ba0a8813d18d2031add78aace8b345f219b37`이다.
2. 생성된 `project` 폴더에서 `npm ci --prefer-offline --no-audit --no-fund`를 실행했다. EAS 아카이브를 점검하고 `eas build -p android --profile inspection --message inspection-d9fea202791a8c41 --non-interactive --no-wait`로 기존 검사 앱의 서명을 사용했다. [Expo 빌드 기록](https://expo.dev/accounts/juj_chroma/projects/store-price/builds/1c7eab93-f166-4a0b-8e75-06d25b86d7f4)
3. 완료된 EAS 기록을 `build.json`에 저장한 뒤 저장소 루트에서 `node scripts/build/inspection.mjs download .artifacts/build/inspection-d9fea202791a8c41`로 APK를 받는다. 검사기는 앱 이름·패키지·서명, 파일 지문, 앱에 내장된 빌드 표시와 공개 상품 조회 설정을 대조한다.

EAS 빌드는 2026-11-21 21:03 KST에 완료됐다. 보관한 APK는 67,967,134바이트이고 SHA-256은 `fa12cdba9946b862bb3221815dbcf08a55655e2c5cf1c405bc38f2f05a1ff5ab`이다.

## 태블릿에 설치하고 홈에서 확인하는 방법

SM-X710 태블릿의 두 홈 페이지에 검사 앱 바로가기가 없어, 앱스에서 **꼬마 시장 검사** 아이콘을 길게 누르고 **홈 화면에 추가**를 선택했다. 홈 두 번째 페이지에 같은 이름의 바로가기가 생겼다. 일반 **꼬마 시장** 아이콘과 구분할 수 있게 검사 아이콘의 바구니에는 ‘검사’ 표시가 있다.

첫 검사에서 현재와 이전 빌드의 상품 연결 설정을 대조하는 단계가 중단됐다. 두 작업 폴더의 설정 파일은 바이트 단위 지문이 달랐지만, 실제 프로젝트 주소와 공용 키는 각각 일치했다. 새 빌드의 원본 입력 검사는 그대로 두고, 과거 APK는 당시 업로드 복사본의 지문과 그 안에 고정된 실제 연결값을 대조하도록 보완했다. 이전 서명과 파일 지문도 함께 확인한다.

이전 APK의 검증 커밋은 `807d295`이고 빌드 표시는 `inspection-79c7e8590dc610f0`이다. 아래 검사는 현재 사용자에 설치된 이전 APK와 새 APK 서명을 대조해 데이터를 보존하는 업데이트를 수행한다. 이미 설치를 마쳤다면 새 APK와 일치하는지 다시 확인한다.

```sh
node scripts/device/verify.mjs --inspection-apk .artifacts/build/inspection-d9fea202791a8c41/provenance.json --inspection-update-from .artifacts/build/inspection-79c7e8590dc610f0/provenance.json --inspection-update-commit 807d295 --inspection-from-home --message "test: 홈 화면에서 검사 APK의 TalkBack 설정 전환 검증"
```

업데이트를 처음 요청했을 때 태블릿에 Play 프로텍트의 전송 선택 창이 열렸다. 기기 소유자의 선택을 기다리는 동안 180초가 지나 검사기가 멈췄고, 그 시점의 설치 파일 지문은 이전 APK와 같았다. 자동화는 전송 여부를 대신 선택하지 않는다. 선택을 마친 후 위 명령을 다시 실행하면 기기에 실제 설치된 APK를 대조하고 이어서 검사한다.

태블릿에서 ‘이번에만 전송’을 선택한 후 설치된 APK의 SHA-256이 위의 새 빌드와 일치하는 것을 확인했다. 재검사에서는 이 설치본을 그대로 사용한다.

이 태블릿의 가로 방향 접근성 설정은 두 패널로 열렸다. 자동 검사에서 뒤로가기를 한 번 눌렀을 때 설정 화면이 남아 복귀 확인이 실패했다. 설정이 전면인 것을 확인하고 뒤로가기를 한 번 더 보내니 검사 앱의 ‘화면 읽기 꺼짐’과 장바구니 3개·5,500원, 남을 돈 4,500원이 다시 보였다. 검사 도구도 설정 화면이 계속 전면인 경우에만 뒤로가기를 추가로 보내도록 수정했다.

전체 검사를 다시 시작하기 전, 설치된 같은 검사 앱에서 상태 전환만 먼저 확인했다. ‘화면 읽기 꺼짐’인 버튼으로 접근성 설정을 열고 삼성 TalkBack 서비스와 터치 탐색을 켜니 앱 복귀 후 ‘화면 읽기 켜짐’이 표시됐다. 원래 설정을 복원하자 같은 앱 프로세스에서 다시 ‘화면 읽기 꺼짐’으로 바뀌었다.

검사에서는 홈 아이콘을 직접 누른 뒤 화면에 뜬 빌드 표시를 대조한다. 사과 2개와 우유 1개를 담고 TalkBack 설정을 다녀와 장바구니 3개·5,500원이 유지되는지 확인한다. 화면 읽기를 실제로 켰다가 끄는 단계에서는 접근성 상태가 원래 값으로 복구되어야 통과한다. 설치 방식, APK 지문, 놀이 및 설정 복구의 최종 판정은 같은 커밋의 [Android 검사 결과](../verification/latest-android.md)에 남긴다.
