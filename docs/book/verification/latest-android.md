# Android 정식 앱 번들 실기기 검증 기록

- 실행 시각 2026-11-29 00:55:43 (Asia/Seoul)
- 결과 **PASS**
- 실행 ID `20261128T154946747Z-9cb8e3cc`
- 기기 SM-S948N / Android 17
- 검사 시작 HEAD `69dd63ab5868169580b1f98809bf8956ede23977`
- 검사 소스 SHA-256 `8761264e844bda8e0c30e16ddbb73d7ba45792c5bdd4c8f8a6f273498a4dfdf1`

## 빌드와 설치 파일

- 정식 앱 꼬마 시장 (`com.ungjo.storeprice`), 버전 1.0.0 (3)
- EAS 빌드 ID `d773aeab-7ee7-4e58-8d52-c891c118b465`
- 빌드 소스 SHA-256 `3ce769ead7b91fdd0159e70e83207b036562b52f5063318f966d1e5e8fec7521`
- 업로드용 AAB SHA-256 `284971ef5745bee5ca9b79af1344b1e590c9aa10ad9333fc8e168e57e7168cf8`
- AAB 업로드 서명 인증서 SHA-256 `282ede849b8ffb886840bafd0b0e76ec5fa74c399e4dfd702a722219881368e7`
- 앱 정보 화면에서 정식 아이콘을 확인했다. 화면 SHA-256 `1881c1ee72299afe0f0e53e450ad4c54d4af2d45f9785cd673dd7e8f7cf35d60`
- 콜드 시작 영상 SHA-256 `55fa19af88e3a1205438c9beeeda2a2e7e2ebbc3506dffccb5a7f43b4b075836`. 시작 화면을 확인한 프레임 `frame-0000450ms.jpg` SHA-256 `63bcebd8cbd80b8f9bcdb1247e00ac71fbd5f526611790eb73d835c1797bac0e`
- 기기 사양 SHA-256 `1ee52426cdcf3a3d6cae8e11b7d26ba63254c9f3b0cbdcf1bd7be918e8164a61`
- bundletool 기기용 APK 묶음 SHA-256 `d833c0dbad39d0a8bc2f4ac2ba9ab6e7d0b6c948592e15acf92a9069e023ea88`
- 로컬 설치용 임시 서명 인증서 SHA-256 `c9ceb6e93a2f094595940323467b9d1cb859129665b371b54e1d720dc9619259`
- 설치 방식 `reused-exact`. 놀이 전후 현재 Android 사용자의 설치 버전과 APK 4개 지문이 일치했다.

## 검사 명령과 결과

```bash
node scripts/device/verify.mjs --production-aab .artifacts/build/production-f1cf026064021860/provenance.json
maestro --device <기기> test -e APP_ID=com.ungjo.storeprice --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/production-play.yaml
```

- 장보기 전후 Android가 기본 인터넷 연결을 검증했고 정식 앱 설치본에 INTERNET 권한이 없음을 확인했다.
- 정식 앱에서 예시 상품 12개와 “실제 마트 판매 가격이 아니에요.”를 확인하고 개인정보처리방침을 열어 내용을 읽은 뒤 닫았다. TalkBack 설정 버튼으로 Android 접근성 설정에 들어갔다가 장보기 화면으로 돌아왔다.
- 50,000원 예산에서 사과 2개와 우유 1개(5,500원)를 골라 50,000원권으로 지불했다. 거스름돈 44,500원을 맞히고 영수증의 지불액·거스름돈·남은 놀이돈을 확인한 뒤 다시 장보기를 시작했다. JUnit 1건 통과.
- 장보기 시작 전 2026-11-28T15:52:33.858Z부터 영수증·다시 장보기를 마친 2026-11-28T15:55:03.983Z까지 정식 앱 UID의 Android 네트워크 통계 증가량은 수신 0바이트, 송신 0바이트였다. 이 구간의 상품 서버 요청은 0건이었다.
- 충전 중 화면 유지 설정의 최종 처리 `restored`
- `privacy-page` 종료 코드 0
- `maestro-syntax-production` 종료 코드 0
- `production-tests` 종료 코드 0
- `database-tests` 종료 코드 0
- `unit-tests` 종료 코드 0
- `typecheck` 종료 코드 0
- `lint` 종료 코드 0
- `export` 종료 코드 0
- `production-play` 종료 코드 0

Google Play에 제출하기 전에 업로드용 AAB를 기기 사양에 맞는 APK로 변환하고 로컬 검사 키로 서명해 설치했다. Play 배포와 Play 앱 서명 검증은 이후 단계다.

원본 로그와 JUnit은 `.artifacts/device/20261128T154946747Z-9cb8e3cc/`에 저장한다.
