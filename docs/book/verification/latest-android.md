# Android 정식 앱 번들 실기기 검증 기록

- 실행 시각 2026-11-22 01:57:25 (Asia/Seoul)
- 결과 **PASS**
- 실행 ID `20261121T164742116Z-6d282827`
- 기기 SM-X710 / Android 14
- 검사 시작 HEAD `0e25731d1370a38c015e00cab1f0ceb639828d36`
- 검사 소스 SHA-256 `55ea965a84fc6e76137cc8d43527a179be9bbae4ab3af09f4d95d44824cf78dd`

## 빌드와 설치 파일

- 정식 앱 꼬마 시장 (`com.ungjo.storeprice`), 버전 1.0.0 (2)
- EAS 빌드 ID `887ad9d4-f4a5-4a12-98f6-db7e400ddd7a`
- 빌드 소스 SHA-256 `7ca4069a0ad9ef1986f3924df06d184cca94e5b7c1400299a2e4c93cd2f0615a`
- 업로드용 AAB SHA-256 `3cf580609627a1fd9ca5154ec9ed57874f6a7a0200e46258adbcdb2ee3a0a56f`
- AAB 업로드 서명 인증서 SHA-256 `282ede849b8ffb886840bafd0b0e76ec5fa74c399e4dfd702a722219881368e7`
- 앱 정보 화면에서 정식 아이콘을 확인했다. 화면 SHA-256 `6b739d5772ba4d772a11d892285137be9f81426c2ea1d257d6e50c31c6875d53`
- 콜드 시작 영상 SHA-256 `639dc11b46e35d71f42b42627ad37ece9b55b5b4f6ca8bc38d1991c0718c00c1`. 시작 화면을 확인한 프레임 `frame-0000450ms.jpg` SHA-256 `cc49bd18c33b981a9fbade5f3887d8dc8132e6b724f4df92f46065612b0b4267`
- 기기 사양 SHA-256 `5cb0a922afa2f6f8fc26f46fb6756be4ae1d605af146b4f2b77e3429ecaf673d`
- bundletool 기기용 APK 묶음 SHA-256 `674d3aadac21e8465851d7dd8f2d20f8c068a28521c9fb00c07374317e79806c`
- 로컬 설치용 임시 서명 인증서 SHA-256 `75320814f3bfa8d7cfeec41dca021c80f70fbde66f6a4f9cdbb8610c526a84e5`
- 설치 방식 `reused-exact`. 놀이 전후 현재 Android 사용자의 설치 버전과 APK 4개 지문이 일치했다.

## 검사 명령과 결과

```bash
node scripts/device/verify.mjs --production-aab .artifacts/build/production-010161b494026288/provenance.json
maestro --device <기기> test -e APP_ID=com.ungjo.storeprice --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/production-play.yaml
```

- Expo Go에서 상품 로딩 중 예시 선택을 별도로 확인했다. JUnit 1건 통과.
- 정식 앱에서 예시 상품 12개와 “실제 마트 판매 가격이 아니에요.”를 확인하고 개인정보처리방침을 열어 내용을 읽은 뒤 닫았다. TalkBack 설정 버튼으로 Android 접근성 설정에 들어갔다가 장보기 화면으로 돌아왔다.
- 50,000원 예산에서 사과 2개와 우유 1개(5,500원)를 골라 50,000원권으로 지불했다. 거스름돈 44,500원을 맞히고 영수증의 지불액·거스름돈·남은 놀이돈을 확인한 뒤 다시 장보기를 시작했다. JUnit 1건 통과.
- 검사 전후 공개 예시 상품 지문 `d8c79583dff9fc97e15e342b9834c7627c73020d07c54418e31af7a25f16536b`
- 충전 중 화면 유지 설정의 최종 처리 `restored`
- `privacy-page` 종료 코드 0
- `maestro-syntax-production` 종료 코드 0
- `production-tests` 종료 코드 0
- `database-tests` 종료 코드 0
- `unit-tests` 종료 코드 0
- `typecheck` 종료 코드 0
- `lint` 종료 코드 0
- `export` 종료 코드 0
- `catalog-http-before` 종료 코드 0
- `maestro-loading-choice` 종료 코드 0
- `production-play` 종료 코드 0
- `catalog-http-after` 종료 코드 0

Google Play에 제출하기 전에 업로드용 AAB를 기기 사양에 맞는 APK로 변환하고 로컬 검사 키로 서명해 설치했다. Play 배포와 Play 앱 서명 검증은 이후 단계다.

원본 로그와 JUnit은 `.artifacts/device/20261121T164742116Z-6d282827/`에 저장한다.
