# 1. 필요한 프로그램과 환경 준비

초기 확인: 2026-11-09. DB 준비·연결 상태 갱신: 2026-11-12. 개발 범위 갱신: 2026-11-17 (한국 시간).

2026-11-17 사용자 요청으로 iOS 개발을 중단하고 Android·Google Play에 집중합니다. 현재 준비 목록과 앞으로의 계정·기기 검사는 이 범위를 따릅니다. 과거 iOS 빌드 안내와 검사 이력은 당시 커밋·책 원문에 보존합니다.

## 준비 목록

| 프로그램 / 서비스 | 하는 일 | 준비 시점 | 현재 확인 |
| --- | --- | --- | --- |
| VS Code | 앱 코드와 책 원고 편집 | 지금 | 사용자 설치 폴더 존재, 실행은 미확인 |
| Node.js + npm | 앱 개발 도구 실행과 패키지 설치 | 지금 | Node 26.1.0, npm 11.13.0 |
| Git | 단계별 변경 이력 저장 | 지금 | 2.55.0.windows.3 |
| GitHub | 코드와 원고 원격 저장 | 지금 | 사용자가 store-price 저장소 지정 |
| Expo / React Native / TypeScript | Android 앱 개발 | 앱 생성 시 | SDK 58 업데이트·코드·번들 검사 완료 |
| Expo Go | 휴대전화에서 첫 예제 실행 | 첫 화면 확인 시 | 갤럭시에 SDK 58용 Expo Go 설치 확인 |
| Supabase | PostgreSQL DB와 API | DB 개발 단계 | 사용자 계정·기존 프로젝트 있음. 호환성·연결 확인 대기 |
| PGlite | 로컬 PostgreSQL SQL·권한 검사 | DB 개발 단계 | 0.5.16 / PostgreSQL 18.6, Windows·Node 26에서 34개 검사 통과 |
| Expo 계정 / EAS CLI | Android 개발용·출시용 클라우드 빌드 | 실기기 개발 빌드 단계 | 계정·프로젝트 연결 완료, APK 검증 `97b00ff` |
| Android Studio | Android 에뮬레이터·로컬 네이티브 빌드 | 필요할 때 | 일반 설치 경로에서 미발견 |
| Google Play 개발자 계정 | Android 스토어 테스트와 출시 | 배포 준비 단계 | 확인 전 |

Expo는 Windows와 Node.js LTS를 지원합니다. 현재 Node 26 계열은 공식 릴리스 표에 LTS로 표시되지만 설치된 26.1.0은 오래된 패치입니다. 이 프로젝트의 의존성 검증 결과를 기록하고, 안정화 단계에서 지원되는 최신 LTS 패치로 맞춥니다. 다른 프로젝트에 영향을 주는 전역 도구 변경은 별도 작업으로 다룹니다.

- [Expo 시작 요구사항](https://docs.expo.dev/get-started/create-a-project/)
- [Node.js 지원 버전](https://nodejs.org/en/about/previous-releases)
- [VS Code 설치](https://code.visualstudio.com/docs/setup/windows)

## Windows에서 Android 앱 개발하기

현재 Windows PC에서 Expo 개발 서버와 Android 실기기 검사를 실행하고, EAS 클라우드에서 APK를 빌드하는 구성을 사용합니다. Google Play 제출용 빌드와 스토어 테스트는 배포 준비 단계에서 진행합니다.

Expo Go는 첫 화면과 기초 기능 학습에 사용합니다. 설치형 APK로 실제 앱을 검사하고 Google Play 배포 준비 단계에서 스토어 테스트를 진행합니다. 웹은 PC 개발용 미리보기·검사용으로 유지합니다.

- [Expo 클라우드 빌드](https://docs.expo.dev/build/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)

## 비용과 계정

- 코드 작성에 사용하는 VS Code·Git·Node.js·Expo 프레임워크는 무료입니다.
- Supabase와 Expo의 호스팅·클라우드 빌드는 이용량과 선택 요금제에 따라 비용이 발생할 수 있습니다. 유료 가입은 해당 단계에서 판단합니다.
- Google Play 개발자 등록: US$25 일회성. [공식 안내](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)

실제 결제금액과 정책은 가입·출시 시점에 다시 확인합니다. 비밀번호·인증코드·서명 키를 원고나 Git 저장소에 남기지 않습니다.
