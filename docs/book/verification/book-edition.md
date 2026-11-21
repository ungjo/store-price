# 꼬마 시장 Android 앱 실습서 편집·실행 기록

2026-11-21. 앱의 과거 개발 기록을 7부 20장과 부록 A~D의 독자용 순서로 재구성했다. 앞·뒤 표지는 후속 작업이다. 지금의 완성 기준은 독자 소유의 Android 기기에 검사 APK를 설치하고, 개발 서버를 끈 뒤 영수증까지 확인하는 것이다.

## 예제와 실행

- 3장 두 모듈을 `node docs/book/course/steps/03/checkout.mts`로 실행한 결과는 `총 3개 / 5,500원`이다. TypeScript 6.0.3으로 사과 가격에 문자열을 넣으면 TS2322가 한 건 발생하고, 숫자로 돌리면 사라지는 것을 확인했다.
- 4장의 앱 기준은 `adcfaab`다. 5~10장은 이 소스 위에 교육용 파일을 장 순서대로 누적 적용했다. 같은 격리 폴더에서 각 단계별 TypeScript 검사와 Expo 웹 내보내기를 통과했다. `npm test`가 추가된 6~10장은 각 테스트를 통과했다. 10장 최종본은 린트와 Android 번들 내보내기도 통과했다.
- 각 웹 번들을 PC 브라우저에서 따로 열어 상품 분류, 장바구니 수량, 지불과 퀴즈 상태를 확인했다. 사과 2개와 우유 1팩의 합계 5,500원, 낼 돈 10,000원과 정답 4,500원, 최종 영수증과 빈 장바구니로 돌아오는 동작을 확인했다. 그림 6-2, 8-2, 9-2에는 수량 한도·지불 부족·퀴즈 오답을 실제로 재현했다.
- 11장의 PGlite 검사는 69개를 통과했다. 독자 ZIP을 푼 사본에서 `scripts/database`의 `npm ci` 후 `work/ch11`의 `node ../../steps/11/catalog-query.mjs`로 12개 공개 → 11개 → 롤백 후 12개를 다시 확인했다. `GROUP BY category_id`의 분류 개수는 빵·간식, 유제품·달걀, 과일·채소 순으로 2·4·6이다. 사과의 공개를 철회한 동안에만 2·4·5로 바뀐다.
- 12장의 선택 실습은 10장 사본에 데이터 로더를 실제로 이식해 타입 검사·린트·24개 테스트·웹 번들 내보내기를 통과했다. 연결값을 비운 로컬 브라우저에서 내장 예시 12개 선택, 5,500원 장바구니, 4,500원 정답, 영수증과 새 놀이까지 확인했다. 서버 접속 성공을 대신하는 검사는 아니다.
- 13장의 가상 관측 형식과 미리보기 입력을 동봉 실행기로 확인했다. 14장의 `race-demo.mjs`는 연결 선택 뒤 도착한 원격 1개 응답이 내장 예시 12개를 바꾸지 않는 것을 확인한다. 데이터 세션과 접근성 관련 검사 32개를 통과했다.
- 17~20장과 부록의 Bash 명령 블록 62개, 설정 예제와 YAML의 문법, APK 앱 설정과 당시 코드의 버튼 이름을 대조했다. 당시 실기기 촬영본은 출처와 함께 사용했다. 이번 편집에서 독자 계정으로 EAS 빌드를 요청하거나 새 APK를 기기에 설치하지 않았다.

## 배포 파일 재생성과 확인

저장소 루트에서 `python docs/book/tools/package_course.py`를 실행하면 Git에 보존된 장별 기준과 `docs/book/course/steps`의 교육용 파일로 ZIP을 만든다. ZIP을 새 폴더에 풀어 `node start.mjs 03`부터 `node start.mjs 20`까지 18개 장을 실제로 복원하고, 생성한 각 파일의 SHA-256을 목록과 대조했다. 이미 있는 장을 다시 만들 때 개인 작업을 덮어쓰지 않고 종료하는 것도 확인했다.

조판에는 `node docs/book/tools/render_book.cjs`를 사용한다. Node에서 Playwright와 marked가 들어 있는 라이브러리 폴더(`BOOK_NODE_MODULES`), pypdf가 있는 Python(`BOOK_PYTHON`), Chrome 실행 파일(`BOOK_CHROME`)을 지정할 수 있다. 첫 번째 PDF에서 실제 책갈피 쪽 번호를 읽어 목차를 채우고 두 번째 PDF의 모든 장·절 번호와 대조한다. 그림은 HTML 파일에 내장되어 오프라인에서 보인다.

최초 조판본은 180 × 240 mm, 330쪽이었다. 인쇄본의 목차 항목 194개와 PDF 내부 링크 194개가 일치한다. HTML에는 코드·명령·예상 출력 상자 271개와 그림 30회(서로 다른 그림 25개)가 있다. Poppler로 330쪽을 모두 렌더링해 빈 쪽이 없음을 확인했고, 전 페이지 축소 이미지와 머리말·목차·코드 및 실제 화면의 배치를 살펴봤다.

- [전체 책 PDF](../output/pdf/market-play-book.pdf)
- [오프라인 HTML](../output/market-play-book.html)
- [실습 예제 ZIP](../output/market-lab.zip)

## Windows·Supabase 따라 하기 보강판

사용자 요청에 따라 2~4장과 12장에 화면 읽기와 실제 입력 방법을 보강했다. 인쇄판은 362쪽이다. PDF와 HTML의 목차 194개, 그림 63회(서로 다른 그림 58개), 그림 경로와 라이선스 첨부 파일의 내용을 확인했다. Poppler로 362쪽 전부를 렌더링해 빈 쪽과 배치 이상도 점검했다.

Windows 파일 탐색기와 VS Code 설치 마법사는 예제 화면을 직접 촬영했다. Git 설치 마법사는 직접 촬영한 버전 표시가 있는 화면과 출처가 표시된 설치 예시를 함께 사용했다. 기존 프로그램을 다시 설치하지 않았다. 독립 Git Bash에서 실제 버전 명령을 실행했고, VS Code의 통합 Git Bash에서는 사과 1,500원과 장바구니 5,500원 결과를 확인했다. 3장에서는 타입 오류를 의도적으로 만든 뒤 오류 행과 Problems 패널을 직접 촬영했다.

4장에서는 첫 앱 기준 소스로 만든 사본에서 `npm ci --offline`을 실행하고 Expo를 로컬에서 열었다. `App.tsx`에서 인사말만 바꿔 저장한 파일을 대조했으며 웹 미리보기에서 화면 갱신을 확인했다. 서버를 멈춘 뒤 셸 입력 표시가 돌아오는 모습도 촬영했다. Android 홈의 `Development servers → Scan QR` 위치는 Expo SDK 58 공식 화면 소스로 대조했다.

12장에는 Supabase가 공개한 실제 Studio 프로젝트 생성·SQL Editor·프로젝트 URL·Publishable key 화면을 사용하고 식별값을 가렸다. 프로젝트의 마이그레이션과 seed를 로컬 PGlite에 적용해 자체 예시 상품 12개·사과 1,500원을 확인했다. 운영 계정 로그인이나 독자 원격 DB 변경은 수행하지 않았다. 각 그림의 출처·원본 관계는 [그림 폴더](../manuscript/figures/)에 보존한다.


## 실습 화면 고해상도 교체

2~4장과 12장의 그림 39개를 교체했다. VS Code와 Git Bash를 함께 보여 주는 화면을 3배 픽셀 밀도로 다시 촬영하고, 독립 Git Bash 창에서는 글꼴을 25pt로 키워 버전 명령을 실행했다. VS Code와 Git의 공식 다운로드 페이지를 각각 6배와 3배 밀도로 렌더링했다. 기존 앱 예제의 정적 웹 내보내기 세 곳을 같은 화면 크기에서 5배 밀도로 다시 촬영했다. 버전 출력 발췌는 보관한 명령 결과로 다시 조판했다.

원본이 작은 설치 마법사와 파일 탐색기, 터미널 프로필 메뉴는 실제 화면 옆에 해당 선택지와 파일명을 큰 글자로 병기했다. Supabase Studio의 공개 원본 네 장에서 작업할 영역 16곳을 발췌해 2,176픽셀 폭으로 배치했다.

저장소 루트에서 `node docs/book/tools/render_book.cjs`로 HTML과 PDF를 생성했다. 최종 인쇄본은 359쪽이며, 목차 링크 194개와 본문 그림 63곳을 확인했다. 새 그림 39개의 PNG를 HTML과 대조하고, PDF 내장 그림을 RGB 픽셀 단위로 비교해 모두 일치함을 확인했다. 수정한 그림의 지면상 해상도는 309~1004ppi다. 이 수치는 지면에 배치한 최종 이미지의 픽셀 밀도이며, 기존 설치 캡처의 원본 해상도는 각 그림의 출처 기록에 남겼다.

Poppler로 전 페이지를 렌더링하고 설치·편집기·SQL 대표 그림의 실제 인쇄 영역을 점검했다. 인터넷 연결을 차단한 Chrome에서 1,200px 및 390px 화면 너비로 그림 원본 크기 보기, 화면 맞춤, Escape와 닫기 단추를 검증했다.

## VS Code 설치 창의 약관과 선택지

이전 그림에서 실제 설치 창의 촬영 해상도는 598×451픽셀이었다. 한국어 VS Code 1.147.0의 해당 촬영본 네 장과 같은 빌드의 약관 파일을 대조해 사용권 계약, 추가 작업, Copilot CLI, 설치 준비 화면을 벡터로 다시 그렸다. Copilot 도해에는 실제 설치 준비 요약에서 확인한 세 번째 선택을 표시했다. 원본 캡처는 PDF 첨부 파일과 HTML 그림 아래의 다운로드 링크에서 확인할 수 있다.

저장소 루트에서 `node docs/book/tools/render_setup_figures.cjs`로 SVG와 3000×2260 PNG를 만들고 `node docs/book/tools/render_book.cjs`로 PDF와 오프라인 HTML을 생성했다. 새 책은 361쪽이다. 그림 2-2~2-5는 22~25쪽에 들어갔다. 실제 PDF에서 한국어 약관 제목, 약관 링크, PATH 선택지와 Copilot 설정 문구가 텍스트로 검색되고 복사되는지 검사했다. 첨부된 촬영본 네 장의 바이트와 HTML의 원본·벡터 이미지가 저장소 파일과 일치했다. 전 페이지를 렌더링하고 목차 링크 194개를 확인했다.

## Git 설치 창의 설명과 선택지

2.4절의 실제 Git for Windows 설치 창 여섯 장을 바탕으로 Information, 구성 요소, 편집기, PATH, 터미널, 완료 화면의 글자와 조작 요소를 벡터로 조판했다. 각 그림은 원본 설치 버전의 선택 상태를 보여 준다. 완료 화면은 View Release Notes에만 체크되어 있고, 글에서는 Git Bash를 바로 열고 싶을 때 Launch Git Bash를 선택하도록 설명한다. 원본은 PDF 첨부 파일과 오프라인 HTML의 그림별 다운로드 링크에 보존했다.

저장소 루트에서 `node docs/book/tools/render_setup_figures.cjs`와 `node docs/book/tools/render_book.cjs`를 실행했다. 최종 PDF 363쪽을 렌더링하고 목차 194개, Git 설치 그림 여섯 장의 검색 가능한 글자와 첨부 원본 바이트를 확인했다. 책에서 그림 2-11~2-16은 33~38쪽이다. 오프라인 HTML의 벡터 확대와 실제 촬영본 저장 동작을 검사했다.

3.1절(시작 49쪽)의 두 언어 비교는 51쪽에 이미 있었다. 숫자 1500과 문자열 "1500"에 2를 곱하는 예제로 Node v26.1.0에서 실행값 3000을 확인했다. TypeScript 검사기는 `price: number`에 문자열을 할당할 때 TS2322를 표시했다. 3.1절 원문은 유지했다.

## 종이책에서 실습 파일과 상품 데이터 열기

첫 자료 안내판의 머리말 QR은 당시 공개된 35b12e4의 소스 ZIP으로 연결했다. 공개 저장소 ZIP에는 start.mjs가 없다. 이 판을 조판할 당시에는 장별 예제 ZIP과 상품 CSV를 제공하는 정적 자료실을 output/reader-site에 준비했다. 부록 QR은 고정한 공개 커밋의 supabase/seed.sql로 연결한다. 전자책에서는 같은 market-lab.zip을 HTML에서 내려받거나 PDF 첨부에서 저장할 수 있다. 자료실 CSV의 상품 12개를 ZIP 안의 11장 SQL 및 앱 데이터와 대조했고, ZIP을 풀어 node start.mjs 03과 node checkout.mts를 실행해 총 3개, 5,500원을 확인했다.

node docs/book/tools/render_book.cjs 실행 후 PDF 365쪽의 목차 링크 194개를 확인했다. 2쪽과 356쪽 QR을 150·250dpi 렌더링에서 디코딩했다. PDF와 HTML의 내장 ZIP은 배포 파일과 바이트가 같았다.

## GitHub Pages 독자 자료실 게시 (2026-11-21)

사용자의 공개 승인 후 gh-pages의 기존 커밋 148cfdc에 자료실을 추가했다. 공개 커밋은 3b96cd140acd47a1a7f922531237442102e9a0e8이며, 변경한 경로는 book/index.html, book/market-lab.zip, book/product-samples.csv 세 개다. 별도 배포 사본에서 `git push origin HEAD:refs/heads/gh-pages`를 실행했다. [공개 자료실](https://ungjo.github.io/store-price/book/)

익명 브라우저에서 두 단추로 받은 파일을 원본과 비교했다. market-lab.zip은 4,532,522바이트(SHA-256 b7e1b921a442219377d779af27c9cb4e860547361b1658d3d3c730f0e6fe96c7), product-samples.csv는 상품 12행과 헤더를 포함한 305바이트(SHA-256 a71ffdf45999ef1d63d53b158977ee383ee042a9dd849b9d37a79788dd8f2fd5)였다.

저장소 루트에서 `node docs/book/tools/render_book.cjs`를 실행해 PDF와 HTML을 생성했다. 최종 PDF는 365쪽이다. 2쪽에 인쇄된 주소와 PDF 링크, 150dpi와 250dpi 지면을 디코딩한 QR이 모두 공개 자료실 주소와 일치했다. 전자판 내장 ZIP도 공개 ZIP과 일치했다.

## ZIP 다운로드부터 4장 첫 실행까지 · 2026-11-21

2.6절에 독자 자료실에서 ZIP 받기, Windows 파일 탐색기로 압축 풀기, VS Code에서 폴더 선택하기, 통합 터미널 열기를 추가했다. 4.2~4.4절에 장 파일 생성, 설치 전 밑줄, 설치 위치와 PowerShell·Git Bash 명령, PC 브라우저에서 확인할 여섯 상품을 실었다. 새 그림 네 장의 촬영 출처와 발췌 범위는 `manuscript/figures/02-04-reader-workflow-sources.json`에 기록했다.

별도 실습 폴더에 배포 ZIP을 `Expand-Archive`로 풀었다. `node start.mjs 04`를 실행한 뒤 `cd work/ch04/apps/mobile`, `npm.cmd ci --offline --no-audit --no-fund`, `npm.cmd run typecheck`를 실행했다. 캐시에서 패키지 741개를 설치하고 타입 검사를 통과했다. PC 점검에서는 `npm.cmd start -- --localhost --port 18743`을 사용했다. Expo의 기본 안내에 Web 주소가, `?`로 펼친 목록에 웹 미리보기 키 `w`가 표시됐다. Chrome에서 꼬마 시장과 사과·우유·당근·식빵·바나나·달걀 여섯 상품을 확인하고 서버를 종료했다. 이번 실행 범위는 PC 웹 미리보기다.

`node docs/book/tools/render_book.cjs`로 PDF와 단독 HTML을 생성했다. 최종 PDF 368쪽 전체를 렌더링해 빈 쪽 검사와 목차 링크 194개 검사를 통과했다. 2쪽에 표시한 44·66·70·74쪽과 해당 절의 인쇄 위치를 대조했다. 새 그림과 명령 상자의 지면 배치를 확인했고, 2쪽 자료실 QR을 150dpi와 250dpi에서 읽었다. PDF·HTML에 포함된 ZIP은 자료실 배포본과 바이트가 같았다. 오프라인 Chrome에서 2쪽에 해당하는 절 링크 네 개와 새 그림 네 장의 확대 동작을 확인했다.

## 20장 완성본 바로 열기와 장별 폴더 전환 · 2026-11-21

배포용 ZIP을 빈 검증 폴더에 풀고 PowerShell에서 `node start.mjs 20`을 가장 먼저 실행했다. `work/ch20`에 161개 파일이 생겼고, `apps/mobile/App.tsx`, 장바구니·퀴즈 로직과 `src/components/shopping-receipt.tsx`를 확인했다. 같은 예제 최상위 폴더에서 4장을 꺼내 검증 사본의 App.tsx를 수정했다. 앱 폴더에서 최상위 폴더로 돌아와 Git Bash의 `ls start.mjs`, `node start.mjs 05`를 실행하자 별도 5장 폴더가 생겼다. 4장을 다시 꺼내려 했을 때 기존 폴더 안내와 함께 종료됐고 수정한 파일의 지문이 유지됐다. 이번 검증은 ZIP에서 예제를 꺼내 코드 파일을 여는 범위다.

`node docs/book/tools/render_book.cjs`로 PDF와 HTML을 다시 조판했다. 370쪽의 인쇄본에서 머리말 2쪽, 2장 47~48쪽, 4장 끝 90쪽, 20장 337쪽, 부록 359~360쪽을 확인했다. 전체 지면 렌더링과 목차 링크 194개 검사를 통과했다. 2쪽의 자료실 QR은 150·250dpi에서 읽혔고 PDF와 HTML의 ZIP은 배포본과 바이트가 같았다. 오프라인 브라우저에서 머리말 링크 다섯 개가 각각 해당 절을 여는 것도 확인했다.

## 20장 완성 앱 웹 실행과 실제 화면 · 2026-11-21

배포용 ZIP을 비어 있는 폴더에 풀었다. Windows PowerShell 5.1과 PowerShell 7에서 부록의 `cmd /c "node start.mjs 20 && cd work\ch20\apps\mobile && npm ci && npm run web"`을 각각 실행했다. 20장 준비와 742개 패키지 설치, Expo 웹 서버 시작을 확인했다. 설치에는 검증 PC의 npm 캐시를 이용했다. 두 서버는 검증용 포트 18852·18853을 사용했다. 재실행 검사에서는 별도 Chrome 프로필을 지정한 뒤 `npm.cmd run web`만으로 앱 탭이 열리는지 확인했다. 앱 서버 시작 후 수동으로 주소를 열지 않고 이미 열린 탭에 접속해 내용을 검사했다.

환경 설정 파일이 없는 상태에서 첫 화면의 ‘예시 상품으로 바로 놀이하기’를 눌러 10,000원 예산, 상품 12개, 사과 1개를 담은 합계 1,500원을 확인했다. Android용 초점 함수 `sendAccessibilityEvent`의 오류가 브라우저 콘솔에 기록됐다. 해당 상태에서도 화면이 가려지지 않았고 상품 담기가 동작했다. 이 실행 결과는 PC 웹에 해당한다. 브라우저 화면 세 장과 실제 Git Bash의 명령·웹 주소를 인쇄용으로 발췌했다. 촬영 환경은 `manuscript/figures/02-final-browser-sources.json`과 `manuscript/figures/02-final-web-terminal-source.json`에 기록했다.

`node docs/book/tools/render_book.cjs`로 PDF와 단독 HTML을 생성했다. 최종 376쪽 전체를 렌더링해 빈 지면과 목차 링크 194개를 검사했다. 최종본 48~51쪽에서 웹 실행 절차와 그림 2-23~2-26을, 364쪽에서 복사 가능한 한 줄 명령을 확인했다. 2쪽 QR을 150·250dpi에서 읽었고 두 판에 포함된 ZIP이 배포본과 일치했다. 오프라인 HTML에서 부록 링크와 사진 네 장의 확대, 명령 한 줄의 텍스트를 검사했다.

## 16.6절 TalkBack 켜기·끄기 확인 · 2026-11-21

PDF 280쪽의 16.6절에서 Android 접근성 설정 경로와 한 번 탭해 선택하고 두 번 탭해 실행하는 안내를 확인했다. 본문에는 실습 후 원래 상태로 복원한다는 안내가 있고, 끌 때 표시되는 확인 버튼의 조작 순서는 생략돼 있다.

USB로 연결한 갤럭시 탭 SM-X710의 현재 사용자 0에서 ADB로 확인했다. 시작 시 `adb shell settings --user 0 get secure enabled_accessibility_services`는 `null`, `accessibility_enabled`는 `0`이었다. Samsung TalkBack 서비스를 잠시 켜고 `adb shell dumpsys accessibility`에서 서비스 연결, `FEEDBACK_SPOKEN`, `touchExplorationEnabled=true`를 확인했다. 종료 시 서비스 연결 해제와 `touchExplorationEnabled=false`, 원래의 설정값 두 개를 다시 확인했다. 이 검사는 서비스 전환을 대상으로 했으며 물리 볼륨 버튼이나 스피커 출력은 시험하지 않았다.

## 앱에서 TalkBack 설정 열기 · 2026-11-21

앱 기능 커밋 3487654와 검사 커밋 b5915cf를 대조했다. Android에서 상품 준비 화면, 장보기 화면 상단, 영수증 하단의 ‘TalkBack 설정 열기’가 기기 접근성 설정을 연다. SM-X710(Android 14) 검사 APK의 기존 실행 20261121T124743991Z-c166394d에서 전환 뒤 화면 읽기 상태와 장바구니 3개·5,500원을 확인했다. 이번 교정에서는 실제 Expo Go 검사 이미지 두 장에서 버튼을 발췌하고, 같은 기종의 Android 설정에서 TalkBack 상세 스위치를 직접 촬영했다. 각 이미지의 출처와 발췌 영역은 manuscript/figures/16-settings-figure-sources.json에 기록했다.

python docs/book/tools/package_course.py 실행 후 3~15장 매니페스트가 이전 ZIP과 일치하는지 확인했다. 16~20장은 각 장의 기존 소스를 유지하고 Android 설정을 연결하는 네 파일만 변경했다. 새 ZIP을 독자와 같은 방법으로 풀고 node start.mjs 16과 node start.mjs 20을 실행해 생성된 파일의 SHA-256을 대조했다. 20장의 apps/mobile에서 npm.cmd ci --offline, npm.cmd run typecheck, npm.cmd run lint가 모두 성공했다. ZIP으로 새 APK를 빌드하는 검사는 이번 교정 범위에 포함하지 않았다.

node docs/book/tools/render_book.cjs로 PDF와 HTML을 생성했다. 전체 378쪽과 목차 링크 194개, 그림 76개, 인쇄용 2쪽 QR, PDF·HTML의 내장 ZIP을 확인했다. 그림 16-2~16-4는 280~281쪽, 20장 장바구니 확인은 347쪽, 이전 ZIP 독자를 위한 공개 Git 소스 안내는 370쪽이다.

개정판의 내장 ZIP과 output/reader-site의 배포 준비본은 a8aaba5f5df39b23aa1225d2025b6e83858ff8091e255bacc9f6f440ee9799f3이다. 확인 당시 공개 GitHub Pages의 이전 ZIP은 b7e1b921a442219377d779af27c9cb4e860547361b1658d3d3c730f0e6fe96c7이었다. 부록 C.2에서 쓰는 공개 GitHub의 기능 커밋을 인증 없이 조회해 HTTP 200 응답을 확인했다.

## 종이책 QR로 TalkBack 개정 ZIP 내려받기 · 2026-11-21

GitHub Pages의 gh-pages 커밋 38b9552664ff8ee25ada218fc202e73bb290d8a0에 book/market-lab.zip과 book/index.html을 배포했다. 378쪽 PDF의 2쪽을 150dpi와 250dpi로 각각 렌더링해 QR을 읽었고, 두 이미지에서 https://ungjo.github.io/store-price/book/ 를 얻었다.

로그인하지 않은 새 Chrome 세션에서 그 주소를 열어 ‘장별 실습 예제 ZIP 받기’를 눌렀다. 내려받은 ZIP은 4,537,416바이트이며 SHA-256은 a8aaba5f5df39b23aa1225d2025b6e83858ff8091e255bacc9f6f440ee9799f3이었다. PDF·HTML에 포함한 개정 ZIP과 바이트가 일치했다. 실제 내려받은 파일을 새 폴더에 풀고 node start.mjs 16부터 node start.mjs 20까지 실행했다. 다섯 장 각각의 상품 준비·장보기·영수증 화면에서 Android 전용 버튼 연결, ‘TalkBack 설정 열기’ 라벨, Android 접근성 설정 요청과 화면 읽기 상태 표시 코드를 확인했다. 자료실의 상품 CSV도 내려받아 12개 상품과 원본 파일 지문을 대조했다.

## 16.6절에서 TalkBack 설정 버튼 파일 전체 입력하기 · 2026-11-21

VS Code에서 work/ch16/apps/mobile을 열어 src/components/talkback-settings-button.tsx를 편집하는 순서와 App.tsx 연결 위치를 추가했다. 화면 읽기 켜짐·꺼짐은 기기 설정을 다녀와서 확인하도록 구성했다. 기존 갤럭시 탭 사진 세 장을 사용하고, 편집할 파일은 ZIP의 폴더 트리로 표시했다.

새 16장 폴더에서 npm.cmd ci --offline으로 잠금 파일의 패키지 741개를 설치했다. 원고의 61줄을 추출해 저장한 뒤 npm.cmd run typecheck, npm.cmd run lint 및 node node_modules/expo/bin/cli export --platform android --output-dir <임시 폴더>가 모두 종료 코드 0으로 끝났다. Android 번들 검사 당시 646개 모듈이 포함되었다. 원고와 ZIP의 버튼 소스 SHA-256은 5f373a7c226bb114c35e71e560700cab03a5a0be4d05d5cf3848240c97f177fe이다. 기기 화면과 실제 설정 복귀 결과는 이전 실기기 검사 기록을 사용했다.

node docs/book/tools/render_book.cjs로 생성한 383쪽 전체를 렌더링했다. 281~283쪽에서 각 인쇄 줄의 코드와 번호 01~61, HTML의 원문 전체를 ZIP과 대조했다. 오프라인 Chrome에서 파일 전체 코드 복사 동작의 전달값과 권한 거부 시 선택 영역이 원문과 일치했다. 목차 링크 194개와 그림 76개를 점검했고, 2쪽 QR을 150·250dpi에서 읽었다. PDF와 HTML의 첨부 ZIP은 배포 개정판(a8aaba5f5df39b23aa1225d2025b6e83858ff8091e255bacc9f6f440ee9799f3)과 일치했다.

## 16.6절에 독자 예제를 연 VS Code 화면 수록 (2026-11-21)

독자용 `market-lab.zip`에서 `node start.mjs 16`으로 만든 `work/ch16/apps/mobile`을 Windows 데스크톱용 Visual Studio Code Insiders 1.148.0-insider에서 열었다. 그림 16-2는 탐색기의 `src/components/talkback-settings-button.tsx`와 편집기의 `openSettings`를 함께 촬영했다. 그림 16-3은 `App.tsx`의 207~214행 중 211행을 선택해 촬영했다. ZIP을 직접 읽어 버튼을 불러오는 6행과 장보기 화면 배지 아래의 211행을 대조했다. PNG 원본은 각각 2388×1119, 2871×801픽셀이다.

`node docs/book/tools/render_book.cjs`로 조판한 384쪽 PDF에서 그림 16-2(281쪽)와 16-3(285쪽)의 내장 이미지 픽셀이 원본과 일치했다. 두 쪽을 렌더해 파일명, 줄 번호, 선택된 코드와 캡션을 눈으로 읽었다. 본문 폭 148mm에서 각각 약 410ppi와 493ppi다. 6행의 설명과 실제 import 문은 같은 쪽에 있다. 목차 링크 194개와 그림 78개를 확인했고, 오프라인 HTML에서 두 편집기 화면을 각각 확대했다. PDF와 HTML에 첨부한 ZIP을 원본과 대조하고 2쪽 QR을 150dpi와 250dpi로 읽었다.

## 16.6절에서 App.tsx의 6행에 버튼 불러오기 (2026-11-22)

Windows용 Visual Studio Code Insiders에서 독자용 16장 예제의 `work/ch16/apps/mobile/App.tsx`를 열고 6행의 import 문 전체를 선택해 촬영했다. 그림 16-3에 사용한 원본은 2889×864픽셀이다. ZIP에서 4행의 SafeAreaProvider, 빈 5행, 6행의 전체 import 문 및 7행의 CategorySelector를 대조했다.

`node docs/book/tools/render_book.cjs`로 재생성한 385쪽 PDF의 285쪽에서 6행 설명·코드·캡션을 확인했다. PDF에 들어 있는 화면은 PNG 원본과 해상도 및 픽셀이 일치했다. 286쪽의 그림 16-4는 장보기 화면에 버튼을 넣는 211행이다. 오프라인 HTML에서 실제 편집기 화면 세 장의 확대를 확인했다. 전체 목차 링크 194개와 그림 79개를 검증했다.

## 16.6절 상품 준비 화면과 영수증의 VS Code 실습 (2026-11-22)

독자용 16장 예제의 `src/components/catalog-loader.tsx`와 `src/components/shopping-receipt.tsx`를 Windows용 Visual Studio Code Insiders에서 열어 각 파일의 import 문과 버튼 표시 줄을 촬영했다. ZIP의 파일과 대조한 줄 번호는 각각 6·84행, 4·99행이다. 그림 16-5~16-8 원본의 해상도는 순서대로 2514×711, 2514×789, 2514×867, 2514×867픽셀이다.

`node docs/book/tools/render_book.cjs`로 PDF와 HTML을 생성했다. 종이책 전체 389쪽에서 목차 링크 194개와 그림 83개를 확인했다. 그림 네 장은 각각 287쪽, 288쪽, 289쪽, 290쪽에 실렸다. 인쇄본의 내장 이미지 픽셀을 원본과 대조하고 해당 쪽을 렌더해 파일명·줄 번호·전체 선택 줄과 캡션을 눈으로 읽었다. 오프라인 HTML에서도 그림 네 장이 각각 확대되었다. 상품 준비 화면이 나타나는 조건과 영수증으로 가는 순서는 배포 예제 코드에서 확인했다.

## 50,000원 예산과 지폐를 고르는 20장 완성본 (2026-11-22)

7~10장은 해당 장의 예제를 따라 한 뒤 20.7절로 넘어가도록 연결했다. 20장 옛 APK 실습과 새 완성 앱 실습의 실행 위치를 구별하고, 2장의 완성 앱 첫 화면과 부록 C·D를 갱신했다.

apps/mobile의 기능 변경은 `0e25731`, 20장 배포 소스는 `9f5fd1318294b2bc5a7cfd700952f3512835febd`이다. 출력한 장별 ZIP에서 3~19장의 파일 목록·내용 지문은 종전 판과 같고, 20장의 176개 파일은 배포 소스와 바이트 단위로 일치했다. 새 폴더에 ZIP을 풀어 `node start.mjs 20`을 실행하고 `work/ch20/apps/mobile`에서 `npm.cmd ci --offline`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`를 실행했다. 테스트 153개가 통과했고 Expo 웹 내보내기로 259개 모듈을 묶었다.

별도 Chrome 창에서 예산 10,000원일 때 50,000원권을 고를 수 없는 상태, 50,000원으로 예산을 바꿨을 때의 장바구니 수량, 사과 두 개와 우유 한 팩 합계 5,500원, 50,000원권을 냈을 때의 정답 입력·영수증·다시 장보기 초기화를 확인했다. 그림 2-25와 20-3·20-4는 실행 중인 PC 웹 앱을 촬영했다. 그림 20-5는 기존 Android 14 갤럭시 탭 SM-X710 설치 앱 검사 `20261121T164742116Z-6d282827`의 실제 영수증에서 금액 영역을 잘랐다. 캡처 출처와 범위는 [화면 기록](../manuscript/figures/20-money-figure-sources.json)에 남겼다. 그림 20-6·20-7은 Windows의 실제 VS Code에서 ZIP과 일치하는 `budget.ts` 2행과 `payment.ts` 7행을 촬영했다.

`node docs/book/tools/render_book.cjs`로 생성한 PDF는 397쪽, 그림 89개, 목차 연결 195개다. 20.7절은 367~373쪽, 그림 20-3~20-7은 368~372쪽이다. PDF에 삽입한 사진의 원본 픽셀, 오프라인 HTML의 그림 확대 및 코드 복사, PDF·HTML 첨부 ZIP과 로컬 자료실 ZIP의 SHA-256 `3b2b75531685615384543906d12e6543cb98360e560b86aaed86a0c1b243a89a`을 대조했다. 2쪽의 기존 독자 자료실 QR과 389쪽의 완성 소스 QR을 인쇄 해상도 150·250dpi에서 각각 판독했다.

개정 당시 GitHub Pages 자료실은 직전 판의 ZIP을 제공했다. 새 장별 예제는 개정 PDF·HTML의 첨부로 받을 수 있다. 부록 C.2의 QR은 커밋으로 고정된 공개 소스 ZIP에 연결되며, 해당 ZIP의 `apps/mobile`에서 완성본을 실행하는 절차를 실었다.

## 20.7절에서 두 파일에 50,000원을 직접 입력하는 실습 (2026-11-22)

기존 코드 읽기 단계를 직접 편집하는 절차로 보강했다. 개정 ZIP에서 `node start.mjs 20`으로 연습용 20장을 꺼내고, 앱 폴더에서 `npm.cmd run web`으로 실행하는 순서를 따랐다. 별도 사본에서 예산 파일 2행과 지폐 파일 7행의 50,000원을 잠시 빼고 각 줄을 차례로 완성했다. 세 단계별로 타입 검사와 Expo 웹 내보내기를 수행하고 Chrome에서 확인했다. 처음에는 50,000원 버튼이 두 곳 모두 없고, 예산에 입력했을 때 첫 버튼이, 지폐에도 입력했을 때 둘째 버튼이 나타났다. 사과 두 개와 우유 한 팩을 담아 5,500원어치를 50,000원권으로 계산하고 영수증의 거스름돈과 잔액 44,500원을 확인했다. 최종 상태에서 `npm.cmd test` 153개가 통과했고 두 파일은 독자용 ZIP의 완성 코드와 바이트 단위로 일치했다.

`node docs/book/tools/render_book.cjs`로 생성한 책은 398쪽이다. 코딩 실습은 370~374쪽, VS Code 사진은 각각 372쪽과 373쪽이다. PDF·HTML에서 시작용 두 줄과 완성 코드, 첨부 ZIP을 대조하고 목차 링크 195개와 그림 89개를 검사했다.
