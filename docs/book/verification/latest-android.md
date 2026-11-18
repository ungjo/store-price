# Android 정식 앱 번들 실기기 검증 기록

- 실행 시각 2026-11-18 20:18:07 (Asia/Seoul)
- 결과 **PASS**
- 실행 ID `20261118T110934582Z-be68d2a1`
- 기기 SM-X710 / Android 14
- 검사 시작 HEAD `807d295e1a15d6e668b706bd07d19ff0ea24cda5`
- 검사 소스 SHA-256 `ea8f4c4b0312198a450b89158f5dc737d1add6d9e57bf71705979e8714c36b01`

## 빌드와 설치 파일

- 정식 앱 꼬마 시장 (`com.ungjo.storeprice`), 버전 1.0.0 (2)
- EAS 빌드 ID `8c6e0a43-45ae-48c8-941e-f60447e9397d`
- 빌드 소스 SHA-256 `1bbf73aeeb2820ec74c3bb3b7ae5b818266c5fbf814fda53d5ba00bc4643b357`
- 업로드용 AAB SHA-256 `1ef00c83dd376d82eee0a5a87c09331f693621e898ad2850a2cd07f61090cf03`
- AAB 업로드 서명 인증서 SHA-256 `282ede849b8ffb886840bafd0b0e76ec5fa74c399e4dfd702a722219881368e7`
- 앱 정보 화면에서 정식 아이콘을 확인했다. 화면 SHA-256 `b33903f719da4e68aee32043ba8c45b8780beb2f8c70d9113456ff0602c9ad1c`
- 콜드 시작 영상 SHA-256 `43e61e783ab2bcf60a022a9661eedd3a722983af8c382ab7aae2ff55c7a20c8e`. 시작 화면을 확인한 프레임 `frame-0000450ms.jpg` SHA-256 `6c7a4c73a8158202eb0a403d72fc2e50f036726596a6d549bde01de90206bb27`
- 기기 사양 SHA-256 `96fcd83ca205379b6bb8ccf3c05ecea74d5fc6b65015370feed113ddbb008553`
- bundletool 기기용 APK 묶음 SHA-256 `0c7ce63b6254d75e220478fda49ae793969468c3adb6b844afd56c72047fdd9a`
- 로컬 설치용 임시 서명 인증서 SHA-256 `9c71c14f126b510d3ed6525d4e0d37dca1f5d43185c52383490c9bcb9cee7608`
- 설치 방식 `reused-exact`. 놀이 전후 현재 Android 사용자의 설치 버전과 APK 4개 지문이 일치했다.

## 검사 명령과 결과

```bash
node scripts/device/verify.mjs --production-aab .artifacts/build/production-74c1de1567c4b0a6/provenance.json
maestro --device <기기> test -e APP_ID=com.ungjo.storeprice --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/production-play.yaml
```

- Expo Go에서 상품 로딩 중 예시 선택을 별도로 확인했다. JUnit 1건 통과.
- 정식 앱에 예시 상품 12개가 표시됐다. 사과 2개와 우유 1개(5,500원)를 골라 10,000원을 지불하고, 거스름돈 4,500원과 영수증을 확인한 뒤 다시 장보기를 시작했다. JUnit 1건 통과.
- 검사 전후 공개 예시 상품 지문 `d8c79583dff9fc97e15e342b9834c7627c73020d07c54418e31af7a25f16536b`
- 충전 중 화면 유지 설정의 최종 처리 `restored`
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

원본 로그와 JUnit은 `.artifacts/device/20261118T110934582Z-be68d2a1/`에 저장한다.
