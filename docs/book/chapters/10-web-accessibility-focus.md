# PC 실습판에서 상품 화면과 영수증으로 초점 옮기기

2026-11-22 · Chrome에서 실습 ZIP의 20장 완성 앱으로 확인했다.

## 오류 재현과 수정

기존 ZIP에서 키보드로 예시 상품을 선택하면 상품 12개가 표시됐지만 초점은 문서 본문(`BODY`)에 머물렀다. Chrome은 `AccessibilityInfo.default.sendAccessibilityEvent is not a function` 오류를 기록했다. 상품 화면의 제목으로 초점을 옮기는 코드가 브라우저에서 제공하지 않는 Android 접근성 함수를 호출하고 있었다.

웹 전용 `use-accessibility-focus.web.ts`는 다음 렌더링 프레임에서 화면에 연결된 요소에 DOM 초점을 준다. 제목과 결과 안내는 `tabIndex=-1`로 지정해 코드로 초점을 줄 수 있게 하고, Tab을 누르면 다음 조작 요소로 이동하게 했다. 빠르게 다른 화면으로 넘어가거나 화면이 닫히면 대기 중인 요청을 취소한다. 실습 ZIP을 만들 때 기존 초점 코드가 있는 16~20장에만 이 파일을 추가한다.

## Chrome에서 검사하는 방법

1. 실습 ZIP을 새 폴더에 풀고 그 폴더의 터미널에서 아래 명령을 순서대로 실행한다. 이미 20장을 준비했다면 두 번째 줄부터 시작한다.

   ```powershell
   node start.mjs 20
   cd work/ch20/apps/mobile
   npm.cmd ci
   npm.cmd run web
   ```

2. 서버를 켜 둔 채 개발 저장소 최상위 폴더에서 두 번째 터미널을 연다. 설치된 Chrome과 Node에서 불러올 수 있는 `playwright` 패키지가 필요하다. 패키지를 별도 도구 폴더에 설치했다면 `BOOK_NODE_MODULES`에 그 `node_modules` 경로를 지정한다. 아래 주소는 첫 번째 터미널에 표시된 웹 서버 주소로 바꿔 사용한다.

   ```powershell
   node docs/book/tools/check_web_focus.cjs http://localhost:8081
   ```

검사 스크립트는 Chrome에서 실제로 초점을 가진 요소(`document.activeElement`)를 읽고, 페이지 예외와 오류 수준의 콘솔 메시지를 함께 수집한다.

## 확인 결과

기존 ZIP과 수정 ZIP을 각각 새 폴더에 풀어 Chrome 157.0.8103.79에서 같은 검사를 실행했다. 기존 ZIP은 상품 화면 제목의 초점 검사에서 실패했다. 수정 ZIP의 20장에서는 다음 흐름을 모두 통과했고 페이지 예외와 콘솔 오류가 각각 0건이었다.

| 동작 | Chrome에서 확인한 결과 |
| --- | --- |
| Enter로 예시 상품을 선택하고 Tab 누르기 | 상품 12개가 나타나고 상품 화면 제목에 초점이 갔다. Tab을 누르면 다음 조작 요소로 이동했다. |
| 예산 50,000원에서 사과 2개와 우유 1개 담기 | 장바구니 합계가 5,500원이었다. |
| 50,000원권 선택 후 오답을 입력하고 다시 풀기 | 입력칸으로 초점이 돌아왔다. 44,500원을 입력해 확인하자 정답 안내로 초점이 이동했다. |
| 계산을 완료하고 다시 장보기 | 영수증 제목에 초점이 갔다. 합계 5,500원, 낸 돈 50,000원, 거스름돈 44,500원을 확인했다. 다시 장보기를 누르면 상품 제목으로 초점이 돌아오고 장바구니가 비었다. |

앱 폴더에서 `npm.cmd test` 153개, `npm.cmd run typecheck`, `npm.cmd run lint`를 통과했다. `npm.cmd run export:check -- --source-maps`로 생성한 웹과 Android 번들의 소스맵에서 웹은 새 파일을, Android는 기존 TalkBack 파일을 선택했음을 확인했다. 이번 실기능 검사는 PC용 Chrome에서 수행했다.

전자책 HTML·PDF에 첨부한 ZIP과 자료실용 ZIP의 SHA-256은 `6f1ef7ce10ad9d7caac3ee7f10bdf16d25daa7e694400025fa9bd45ea84ade08`이다.
