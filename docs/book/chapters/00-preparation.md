# 00장. 만들 앱과 개발 순서를 정하다

날짜: 2026-11-09

코드 기준: `afb4784` — docs: 프로젝트 기본 설정과 개발 계획 추가 (2026-11-10 사용자 직접 커밋). 기존 자동 생성 태그는 제거했다.

## 목표

SSG.COM 이마트 온라인 상품 가격을 활용하는 초등 1~3학년용 시장놀이 앱을 만들고, Android와 iOS 스토어에 출시한다. 개발 과정은 기능별 커밋과 책 원고로 함께 남긴다.

## 실제로 확인한 환경

Windows PowerShell에서 시작했다. 작업 폴더와 resources 폴더는 비어 있었고, 상위 폴더에서 적용할 AGENTS.md는 발견되지 않았다.

```text
node --version     → v26.1.0
npm.cmd --version  → 11.13.0
git --version      → 2.55.0.windows.3
```

VS Code 사용자 설치 폴더가 존재한다. Android Studio·Android SDK는 일반 설치 경로에서 발견되지 않았다. 이 확인만으로 다른 경로에 설치되어 있지 않다고 단정하지 않는다.

## 선택한 구성

앱에는 Expo·React Native·TypeScript를 사용한다. Windows에 있는 Node 환경을 활용할 수 있고, EAS 클라우드 빌드로 iOS 배포도 준비할 수 있기 때문이다. 상품과 가격 이력은 Supabase PostgreSQL에 저장할 계획이다.

## 첫 번째 발견

온라인에서 보이는 상품 페이지와 앱에서 재사용할 수 있는 데이터는 구분해야 했다. 공식 SSG 판매자 API는 찾았지만 이 앱 용도의 이용허락은 확인하지 못했다. 먼저 자체 예시 가격으로 기능을 만들고, 실제 가격은 허용된 공급 경로를 확보한 뒤 연결하기로 했다.

구체적인 사실과 공식 출처는 [가격 데이터 확보 계획](../../03-price-data.md)에 기록했다.

## 저장소 연결

사용자가 제공한 저장소: https://github.com/ungjo/store-price.git

```powershell
git ls-remote --symref https://github.com/ungjo/store-price.git HEAD refs/heads/main refs/heads/master
git clone https://github.com/ungjo/store-price.git .
```

원격에 커밋이 없는 저장소임을 확인한 후 빈 작업 폴더에 복제했다. 기존 코드를 덮어쓰거나 이력을 재작성하지 않았다.

## 이번 단계 결과

- 대상 연령과 가격 기준을 사용자와 확정했다.
- 필요한 프로그램·진행 순서·데이터 확보 계획을 작성했다.
- 자격증명·실제 원본 데이터·빌드 산출물을 제외하는 .gitignore를 준비했다.
- 책 원고 폴더와 장별 코드 기준을 정했다.
- 실제 가격 수집·DB 생성·앱스토어 등록은 아직 수행하지 않았다.

## 다음 단계

Expo TypeScript 프로젝트를 생성하고, 한국어 안내가 있는 첫 화면과 연습용 상품을 준비한다. TypeScript와 번들 검증 결과, 실제 휴대전화 확인 여부를 구분해 기록한다.
