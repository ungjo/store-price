# 17장 코드와 휴대전화 반복 검사 자동화하기

버튼을 바꿀 때마다 사과를 담고, 돈을 고르고, 영수증까지 다시 확인하기는 번거롭다. 반복하는 순서를 검사 파일에 적으면 컴퓨터가 기기를 조작하고, 기대한 결과와 다른 지점을 알려 준다. 이번 장에서는 코드 검사와 기기 검사를 나누어 실행한 뒤, 사과 한 개를 담고 빼는 작은 자동 검사를 직접 만든다.

16장에서는 화면 읽기까지 개선했다. 16장과 17장의 예제 앱에는 같은 **TalkBack 설정 열기** 버튼이 있다. 17장은 `97b00ff`를 기준으로 설치형 접근성 검사 도구를 더한 단계다. 이전 실습 폴더를 보존하고 다음처럼 새 참고 폴더를 준비한다.

```bash
cd ~/market-book/kit
node start.mjs 17
cd work/ch17
npm --prefix apps/mobile ci
npm --prefix scripts/database ci
```

`start.mjs`가 출력한 실제 폴더가 다르면 그 경로를 사용한다. 먼저 VS Code에서 `work/ch17`을 열어 파일을 확인한다. 본인이 16장에서 바꾼 문구는 이 새 폴더로 자동 이동하지 않는다. 필요한 변경은 두 파일을 비교하고 다시 적용한다.

## 17.1 단위 테스트·타입 검사·린트의 역할 나누기

화면이 열리는 것과 계산이 정확한 것은 다른 확인이다. 테스트는 작을수록 원인을 찾기 쉽다. 먼저 PC에서 계산 규칙과 타입을 확인하고, 그다음 기기에서 실제 버튼·키보드·화면 이동을 확인한다.

| 검사 | 찾아내는 문제의 예 | 성공만으로 알 수 없는 것 |
| --- | --- | --- |
| 단위 테스트 | 수량을 뺀 뒤 합계가 틀림, 0원 답변을 빈칸으로 처리 | 기기에서 버튼이 가려지는지 |
| TypeScript | 없는 속성 접근, 문자열을 가격으로 전달 | 글자가 읽기 편한지 |
| ESLint | 사용하지 않은 변수, 위험한 코드 패턴 | 영수증까지 실제 이동하는지 |
| 번들 내보내기 | import 경로·리소스·번들 구성 문제 | 설치와 실제 실행 성공 |
| Maestro 기기 검사 | 누른 버튼과 결과가 다름, 요소를 찾지 못함 | 모든 기기의 사용성·사람의 학습 효과 |

`work/ch17` 루트의 Git Bash에서 다음 명령을 한 줄씩 실행한다.

```bash
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix scripts/database test
```

테스트 출력에서 `fail 0`을 찾고, 타입·린트 명령이 오류 없이 끝나는지 확인한다. 테스트 개수는 사용하는 단계 소스와 다를 수 있다. ‘검사 149개’라는 숫자만 외우기보다 **어떤 파일이 실행되었는지, 실패가 0인지**를 읽는다.

단위 테스트 하나만 실행해 보자.

```bash
cd apps/mobile
node --experimental-strip-types --test src/features/cart/cart.test.ts
```

이는 장바구니 계산 파일에 연결된 검사다. 현재 폴더가 앱 폴더이므로 경로 앞에 `apps/mobile/`을 다시 붙이지 않는다. 전체 저장소로 돌아올 때는 `cd ../..`을 실행한다.

### Android와 웹만 내보내기

과거 기록의 `package.json`에는 세 플랫폼 전체를 내보내는 명령이 남아 있다. VS Code에서 `apps/mobile/package.json`을 열고 `scripts`의 `export:check` 값을 다음으로 바꾼다.

```json
"export:check": "expo export --platform android --platform web"
```

`ios` 시작 스크립트가 있으면 그 항목도 제거한다. 바로 앞 항목의 쉼표를 확인한다. 이 책의 실습 대상은 Android이며 웹은 PC 미리보기다. 앱 폴더에서 실행한다.

```bash
npm run export:check
```

출력에 Android와 웹 번들이 표시되면 번들 검사가 끝난 것이다. APK 설치 성공으로 기록하지 않는다.

**작은 연습:** `cart.test.ts`에서 빈 장바구니의 기대값을 찾아본다. 테스트 이름, 입력 자료, 기대 결과가 각각 어느 줄인지 표시한다. 코드를 일부러 바꾸어 실패를 관찰할 때는 본인이 고친 한 줄만 되돌린 후 다시 실행한다.

## 17.2 Java·Maestro를 준비하고 ADB 연결 다시 확인하기

ADB는 PC와 기기를 연결하고, Maestro는 화면을 조작한다. Java는 Maestro를 실행하는 데 필요하다. 앱의 TypeScript를 Java로 바꾸는 작업은 없다.

프로젝트의 전체 검사기는 **JDK 21·Maestro 2.12.1**을 확인하도록 작성되어 있다. 처음에는 이 조합으로 실습한다. JDK의 수정 버전까지 저자 PC와 같을 필요는 없지만 주 버전 21을 확인한다.

### JDK 21 설치

1. [Microsoft Build of OpenJDK 다운로드](https://learn.microsoft.com/en-us/java/openjdk/download)에서 OpenJDK 21의 Windows용 파일을 선택한다.
2. PC의 **설정 → 시스템 → 정보 → 시스템 종류**에서 x64 또는 ARM64를 확인하고 맞는 파일을 받는다.
3. 설치 프로그램을 실행한다. 또는 ZIP을 사용한다면 본인이 관리하는 폴더에 압축을 푼다.
4. `bin/java.exe`가 있는 JDK 폴더 경로를 확인한다.
5. Windows의 **계정의 환경 변수 편집**을 열어 사용자 변수 `JAVA_HOME`에 JDK 폴더를 지정한다. `bin` 자체를 넣지 않는다.
6. 사용자 `Path`에 `%JAVA_HOME%\bin`이 없다면 새 항목으로 추가한다. 기존 Path 전체를 다른 문자열로 덮어쓰지 않는다.
7. VS Code의 기존 터미널을 닫고 새 Git Bash를 연다.

```bash
java -version
```

주 버전 `21`이 나와야 한다. 다른 Java가 먼저 나온다면 `where.exe java`로 실제 실행 위치를 찾고 환경 변수 순서를 확인한다.

### 13장에서 설치한 ADB를 같은 터미널에서 사용하기

13장에서는 실행 파일의 전체 경로를 변수에 넣었다. 여기서는 `adb`라는 이름으로 실행할 수 있도록 현재 Git Bash의 검색 경로에 해당 폴더를 추가한다.

```bash
export PATH="$HOME/market-book/tools/platform-tools:$PATH"
adb version
```

다른 폴더에 압축을 풀었다면 첫 경로를 실제 `adb.exe`가 있는 폴더로 바꾼다. 기존 `$PATH`는 유지한다. 이 설정은 현재 터미널에만 적용되므로 새로운 Git Bash를 열었을 때 다시 실행하거나 Windows 사용자 Path에 같은 폴더를 한 항목으로 추가한다.

### Maestro 2.12.1 준비

1. [Maestro 2.12.1 배포 페이지](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.12.1)를 연다.
2. **Assets**에서 `maestro.zip`을 받는다. 소스코드 ZIP과 구분한다.
3. 예를 들어 `C:\market-tools\maestro-2.12.1`에 압축을 푼다.
4. 그 아래 `bin\maestro.bat`가 실제로 있는지 확인한다.
5. 사용자 Path에 그 `bin` 폴더를 추가하고 새 Git Bash를 연다.

```bash
maestro --version
maestro --help
adb version
```

Maestro 버전은 `2.12.1`이어야 한다. `maestro`가 인식되지 않고 같은 폴더의 `maestro.bat`만 실행된다면 Windows용 실행 파일 이름을 명령에 사용한다. 이 장의 `maestro test`도 같은 방식으로 `maestro.bat test`로 실행할 수 있다. 설치 방식의 기준은 [Maestro 공식 Windows 안내](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)다.

### 전체 검사기에 도구 위치 알려 주기

직접 `adb`와 `maestro`를 실행하는 것과 Node 검사기가 같은 도구를 찾는 것은 별도다. `scripts/device/verify.mjs`는 기본 설치 위치가 아니면 환경 변수로 위치를 받는다. Git Bash에서 실제 설치 경로로 바꿔 입력한다.

```bash
export STORE_PRICE_ADB="$(cygpath -w "$HOME/market-book/tools/platform-tools/adb.exe")"
export STORE_PRICE_MAESTRO="C:/market-tools/maestro-2.12.1/bin/maestro.bat"
export JAVA_HOME="C:/market-tools/jdk-21"
```

위 경로는 설명용이다. 각 위치를 파일 탐색기로 열어 실행 파일이 있는지 확인한다. 설치 프로그램으로 JDK를 설치했다면 `JAVA_HOME`에는 그 실제 설치 폴더를 넣는다. 이 `export` 설정은 현재 터미널에만 적용된다.

## 17.3 adb devices에서 기기 없음·승인 대기·연결 상태를 구별하고 진단 명령 실행하기

기기에 앱이 보이더라도 USB 자동 검사는 아직 준비되지 않았을 수 있다.

1. Android의 개발자 옵션에서 USB 디버깅을 켠다.
2. 데이터 전송용 USB 케이블로 PC에 연결한다.
3. 기기 잠금을 직접 해제한다.
4. 기기에 나온 USB 디버깅 허용 창에서 본인 PC를 확인하고 허용한다.
5. Git Bash에서 상태를 읽는다.

```bash
adb devices -l
```

| 출력 | 의미 | 다음 행동 |
| --- | --- | --- |
| 제목만 있고 기기 행 없음 | 연결된 디버깅 기기를 못 찾음 | 케이블·USB 포트·드라이버 확인 |
| `unauthorized` | 기기의 연결 승인이 끝나지 않음 | 잠금을 풀고 승인 창 확인 |
| `offline` | 연결이 유효한 상태가 아님 | 케이블을 다시 연결하고 재조회 |
| `device` | ADB 연결 준비 | Expo Go와 기기 잠금 상태 확인 |
| 두 대 이상 | 검사 대상이 모호함 | 한 대만 남기거나 대상 번호 지정 |

기기 번호는 화면 캡처나 공개 저장소에 싣지 않는다. 여러 대를 연결해야 한다면 실제 번호를 본인의 터미널 변수에만 넣는다.

```bash
export ANDROID_SERIAL="adb devices에서 확인한 실제 번호"
```

### doctor 실행 전에 Git 상태도 준비한다

작은 Maestro 파일은 Git 없이도 실행할 수 있다. 반면 프로젝트의 `--doctor`와 `--no-commit`도 검사 시작 시 Git 상태를 읽는다. 최초 커밋이 없거나 detached HEAD이면 보호 검사에서 중단된다.

새 ZIP 참고본을 사용할 경우, `work/ch17` 루트에서 `.gitignore`에 `.env`·`.artifacts`·`node_modules` 제외 규칙이 있는지 먼저 확인한다. 개인 파일을 넣기 전에 다음처럼 실습 이력의 시작점을 만든다.

```bash
git init -b codex/book-ch17
git status --short
git add .gitignore .easignore AGENTS.md README.md apps scripts supabase docs
git diff --cached --name-only
git commit -m "chore: 17장 검사 실습 시작점"
```

추가 목록에 `.env.local`, 비밀 키, APK, 개인 기기 캡처가 보이면 커밋하지 않고 해당 파일만 staging에서 제외한 뒤 원인을 확인한다. 파일을 지우는 작업이 아니다. Git 사용자 이름·이메일을 아직 정하지 않았다면 2장의 본인 설정을 먼저 완료한다.

기존 Git 저장소를 복제해 `97b00ff`를 열었다면 새로 초기화할 필요가 없다. 분리된 실습 복사본에서 `git switch -c codex/book-ch17`로 브랜치를 만든다. 원본 저장소의 진행 중인 작업을 다른 커밋으로 전환하지 않는다.

이제 저장소 루트에서 실행한다.

```bash
node scripts/device/verify.mjs --doctor
```

도구·실기기·Expo Go·Git 준비 상태를 확인한다. 성공 메시지는 **준비가 되었다는 뜻**이며 앱을 눌러 영수증까지 검사한 결과가 아니다. 기기 없음이나 승인 대기라면 해당 상태만 해결하고 다시 실행한다. 검사 중에는 기기를 만지지 않고 USB 연결을 유지한다.

## 17.4 testID와 YAML로 놀이 시나리오 작성하기

화면에서 ‘담기’가 여러 번 보이면 글자만으로 어느 상품인지 구분하기 어렵다. 앱은 각 버튼에 `testID`라는 검사 이름을 붙인다. `apps/mobile/src/components/quantity-control.tsx`를 열어 다음 흐름을 찾는다.

```tsx
const testId = 'product-' + productId;
```

같은 파일의 담기 버튼에는 다음 속성이 있다.

```tsx
testID={testId + '-add'}
accessibilityLabel={productName + (quantity === 0 ? ' 담기' : ' 한 개 더 담기')}
accessibilityState={{ disabled: atLimit }}
disabled={atLimit}
onPress={onAdd}
```

이것은 이미 작성된 `Pressable`의 속성 부분이다. 별도 컴포넌트로 통째로 붙여 넣는 코드가 아니다. 상품 ID가 `sample-apple`이면 검사 이름은 `product-sample-apple-add`가 된다. 표시 문구가 ‘+ 담기’에서 ‘+’로 바뀌어도 같은 버튼을 찾을 수 있다.

16장부터 사용하는 참고 앱의 이름과 5~10장의 작은 교육용 컴포넌트의 이름은 다를 수 있다. 이 장에서는 반드시 현재 파일의 `testID`를 기준으로 삼는다.

### 앱을 검사 시작 상태로 만든다

이번 첫 검사에서는 앱을 자동으로 여는 과정까지 한꺼번에 넣지 않는다. Expo Go에서 현재 프로젝트를 직접 열고, 상품 화면이 준비되었을 때부터 자동화한다.

앱 폴더 터미널에서 개발 서버를 켠다.

```bash
cd apps/mobile
npm start
```

기기의 Expo Go에서 QR을 열고 예시 상품 목록으로 들어간다. 이전 놀이가 남았다면 앱의 **장바구니 비우기** 또는 영수증의 **다시 장보기**로 빈 장바구니를 만든다. 목록 맨 위에 **꼬마 시장**이 보이도록 스크롤한다. 다른 터미널을 열고 저장소 루트로 이동한다.

### 작은 검사 파일 만들기

VS Code에서 저장소 루트 아래 `.artifacts/book-checks` 폴더를 만들고 `one-apple.yaml` 파일을 만든다. YAML은 들여쓰기에 탭 대신 공백 두 칸을 사용한다. 전체 내용을 입력한다.

```yaml
appId: host.exp.exponent
name: 사과 한 개를 담고 빼기
---
# 이미 연 Expo Go의 현재 앱을 검사하므로 앱 데이터나 권한을 초기화하지 않습니다.
- extendedWaitUntil:
    visible:
      id: market-title
    timeout: 30000
- scrollUntilVisible:
    element:
      id: cart-summary
    direction: DOWN
    timeout: 30000
- assertVisible:
    id: cart-summary
    text: '^장바구니 총 0개, 합계 0원.*'
- scrollUntilVisible:
    element:
      id: product-sample-apple-add
    direction: UP
    timeout: 30000
- tapOn:
    id: product-sample-apple-add
    enabled: true
- scrollUntilVisible:
    element:
      id: cart-summary
    direction: DOWN
    timeout: 30000
- assertVisible:
    id: cart-summary
    text: '^장바구니 총 1개, 합계 1,500원.*'
- takeScreenshot: one-apple
- scrollUntilVisible:
    element:
      id: product-sample-apple-decrease
    direction: UP
    timeout: 30000
- tapOn:
    id: product-sample-apple-decrease
    enabled: true
- scrollUntilVisible:
    element:
      id: cart-summary
    direction: DOWN
    timeout: 30000
- assertVisible:
    id: cart-summary
    text: '^장바구니 총 0개, 합계 0원.*'
```

`assertVisible`은 기대한 정보가 보이는지 확인한다. `tapOn`은 누르고, `scrollUntilVisible`은 지정한 요소가 보일 때까지 이동한다. 마지막 `.*`는 합계 뒤에 이어지는 예산 안내가 있어도 핵심 수량·합계를 검사하게 한다. 스크롤 명령의 옵션은 [Maestro scrollUntilVisible](https://docs.maestro.dev/reference/commands-available/scrolluntilvisible)에서 확인할 수 있다.

먼저 기기를 움직이지 않는 구문 검사를 실행한다.

```bash
maestro check-syntax .artifacts/book-checks/one-apple.yaml
```

통과하면 실제 화면 검사를 실행한다. 아래의 기기 번호는 본인 값으로 바꾼다.

```bash
maestro --device "실제 기기 번호" test --format junit --output .artifacts/book-checks/one-apple-result.xml --test-output-dir .artifacts/book-checks/results --debug-output .artifacts/book-checks/debug .artifacts/book-checks/one-apple.yaml
```

기기에서 사과가 한 개 담겼다가 빠지고, 마지막 합계가 0원이 되어야 한다. 콘솔의 각 단계와 `one-apple-result.xml`을 함께 확인한다. 첫 검사 때 Maestro가 기기용 도우미 설치를 준비할 수 있다.

이 시나리오는 앱의 저장 자료를 지우지 않는다. `launchApp: clearState: true`를 무심코 추가하면 검사 대상 앱 자료를 초기화할 수 있다. Expo Go 안의 여러 프로젝트를 유지하려면 시작 방법과 자료 초기화를 구분해야 한다. [Maestro launchApp](https://docs.maestro.dev/reference/commands-available/launchapp)

## 17.5 실패 화면과 YAML의 해당 단계, 앱의 testID를 대조한 뒤 다시 검사하기

일부러 YAML의 사과 가격 기대값을 `1,500원`에서 `1,600원`으로 바꾸고 다시 실행해 보자. 실제 계산이 1,500원이라면 합계 확인 단계가 실패해야 한다. 이 실패는 앱 계산이 잘못된 것이 아니라 우리가 기대값을 잘못 적었기 때문이다.

1. 터미널에서 실패한 명령의 이름을 읽는다.
2. `.artifacts/book-checks/debug`의 이번 실행 폴더를 연다.
3. 실패 시점의 PNG와 명령 기록을 확인한다.
4. YAML의 해당 `assertVisible` 줄을 찾는다.
5. 앱의 실제 합계와 기대값을 비교한다.
6. 기대값을 1,500원으로 고치고 빈 장바구니·목록 상단에서 다시 실행한다.

| 실패 위치 | 가능한 원인 | 먼저 확인할 것 |
| --- | --- | --- |
| `market-title` 대기 | 다른 Expo 프로젝트, 초기 안내, 잠금 화면 | 기기에 실제 표시된 화면 |
| 빈 장바구니 확인 | 이전 놀이가 남음 | 앱의 비우기·다시 장보기 |
| 담기 버튼 찾기 | 다른 단계의 testID, 다른 분류 | `quantity-control.tsx`와 전체 분류 |
| 합계 확인 | 기대값 오류, 담기 횟수 오류 | 실패 화면의 수량과 합계 |
| 스크롤 시간 초과 | 팝업·키보드가 화면을 가림 | 가리는 요소와 실제 스크롤 위치 |

실패를 없애려고 핵심 검사를 `optional`로 바꾸지 않는다. 버튼을 찾지 못했다면 ‘찾지 못한 이유’를 먼저 확인한다. 제한 시간을 늘리는 것만으로 잘못된 요소 이름을 고칠 수는 없다.

**개발에서 확인한 사례:** 실제 태블릿 검사에서는 Expo Go의 첫 안내가 앱 위를 가려 검사 표시를 찾지 못한 적이 있었다. 안내를 닫은 다음 같은 검사를 다시 실행했다. 또 다른 검사에서는 버튼이 없어졌다고 생각했지만 실제로는 위로 스크롤을 시작한 위치가 문제였다. 앱 오류와 검사기의 탐색 오류를 구분해야 수정 범위를 좁힐 수 있다.

**연습:** 같은 파일을 `two-apples.yaml`로 복사하고 담기를 두 번, 빼기를 두 번으로 바꾼다. 가운데 기대값은 2개·3,000원이다. 단계 수와 기대값을 함께 바꾼 뒤 마지막 0원까지 확인한다.

## 17.6 부분 검사와 전체 회귀 검사 구분하기

사과 한 개 검사가 통과하면 담기·빼기·합계의 작은 흐름을 확인한 것이다. 거스름돈, 영수증, 오프라인, TalkBack까지 모두 통과한 것으로 확대하지 않는다.

| 실행 | 확인 범위 | 기록할 표현 |
| --- | --- | --- |
| `npm test` | 실행된 앱 단위 테스트 | 앱 단위 검사 통과 |
| `one-apple.yaml` | 빈 장바구니→사과 한 개→비우기 | 사과 한 개 흐름 통과 |
| `--receipt-only` | 기존 영수증 부분 시나리오 | 영수증 부분 검사 통과 |
| `--no-commit` | 준비 조건을 갖춘 전체 기본 회귀 | 실행 보고서에 적힌 전체 범위 통과 |
| `--readability-only` | 화면 조건 부분 검사 | 화면 조건별 결과 |
| `--talkback-only` | TalkBack 부분 진단 | 읽기 동선 진단 결과 |

전체 자동 검사는 자체 공개 예시 12개가 있는 본인의 12장 데이터베이스 설정과 정상 Git 상태를 요구한다. 도구가 사용하는 기기·공개 상품 URL·공개 키를 먼저 확인한다. 내장 예시만 사용하는 독자는 위의 작은 Maestro 실습을 마칠 수 있지만, 원격 DB까지 대조하는 전체 실행의 성공으로 기록할 수는 없다.

새 `work/ch17`에는 12장의 `.env.local`이 자동 복사되지 않는다. 전체 검사를 선택한다면 VS Code에서 `apps/mobile/.env.example`을 같은 폴더의 `.env.local`로 복사하고, 두 값에 12장에서 만든 본인 프로젝트 URL과 publishable 키를 다시 넣는다.

```text
EXPO_PUBLIC_SUPABASE_URL=https://본인-프로젝트.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=본인_publishable_키
```

이는 값의 자리를 설명하는 예이며 그대로 저장할 값이 아니다. 서버 비밀 키나 DB 비밀번호를 쓰지 않는다. 저장 뒤 `git status --short`에 `.env.local`이 나오지 않는지 확인한다. 전체 검사는 이 본인 공개 DB를 읽어 자체 예시 12개의 이름·단위·가격·분류를 대조한다. 작은 사과 YAML은 이 연결 없이 내장 예시로 실행할 수 있다.

전체 회귀를 실행할 때는 직접 켠 개발 서버를 Ctrl+C로 종료한다. 검사기가 전용 서버를 만들고 종료하므로 같은 포트를 먼저 점유하지 않는다. 저장소 루트에서 실행한다.

```bash
node scripts/device/verify.mjs --no-commit
```

또는 앱 폴더의 다음 npm 명령을 사용한다.

```bash
npm run verify:device:check
```

두 명령은 같은 비커밋 실습 경로다. 첫 실습에서는 `npm run verify:device`와 혼동하지 않는다. 후자는 조건을 갖춘 변경을 자동 커밋할 수 있다.

검사 폴더는 `.artifacts/device/<실행 ID>` 아래에 생긴다. `summary.json`, JUnit XML, 단계별 로그를 확인한다. 전체 성공 보고서는 `docs/book/verification/latest-android.md`에 작성될 수 있지만 Git 커밋은 하지 않는다. `--no-commit`은 보고서 작성이나 기기 조작을 하지 않는 옵션이 아니라 **커밋만 생략하는 옵션**이다.

읽을 항목은 다음 네 가지다.

1. 이번 실행 ID와 시작한 소스가 맞는가.
2. 실패·오류·건너뛴 필수 검사가 없는가.
3. 변경한 기기 설정이 복구되었는가.
4. `commit` 값이 비커밋 실행에 맞게 비어 있는가.

과거 보고서의 PASS가 이번 실행 결과는 아니다. 실패했을 때 이전 성공 문서가 그대로 남아 있을 수 있으므로 실행 폴더와 시각을 대조한다.

다음은 2026년 11월 18일의 실제 검사 XML에서 결과 부분만 뽑은 예다. 기기 번호는 제외했다. 독자의 실행 ID나 소요 시간과 같아야 하는 값이 아니다.

```xml
<testsuite tests="1" failures="0" time="1025.274"
           timestamp="2026-11-18T04:42:33">
  <testcase name="놀이돈 선택과 장바구니 실기기 회귀 검사"
            file="apps\mobile\.maestro\payment.yaml"
            time="1025.136" status="SUCCESS" />
</testsuite>
```

이 XML은 이름에 적힌 Maestro 시나리오의 결과다. 단위 테스트와 설정 복구 등 전체 검사기의 다른 결과까지 한 줄에 담은 문서가 아니므로 전체 요약과 함께 읽는다. 공개할 때는 원본 XML의 기기 번호·로컬 경로도 살핀다.

## 17.7 네트워크·화면 조건을 바꾸고 원래대로 복구하기

검사 때문에 기기의 글자 크기나 Wi-Fi 상태를 바꿨다면 끝난 뒤 원래대로 돌려놓아야 한다. ‘정상 설정’이라고 생각한 임의 값으로 바꾸는 것이 아니라 **검사 직전 사용자 값**을 복원한다.

첫 연습은 15장에서 했던 수동 글자 크기 비교로 한다. 현재 글자 크기를 메모하고 한 단계 키운 뒤 앱을 확인하고 되돌린다. 실제 오프라인 놀이는 20장에서 진행한다. 아직 APK를 만들지 않은 이 단계에서 Expo Go 첫 코드 내려받기와 오프라인 설치 앱 실행을 섞지 않는다.

프로젝트의 자동화는 다음 순서를 사용한다.

```text
시작 상태 읽기
→ 이번 검사에서 바꿀 설정 기록
→ 검사 실행
→ 정상 종료 또는 오류 처리
→ 이번에 바꾼 값 복구
→ 다시 읽어 원래 값과 비교
→ 최종 성공 여부 결정
```

화면 검사 도구는 글자 배율과 밀도를, 오프라인 검사 도구는 Wi-Fi와 데이터 상태를 다룬다. SIM 없는 태블릿의 모바일 데이터 항목은 스마트폰과 같은 의미가 아닐 수 있다. 도구는 하드웨어·SIM·회선 상태를 함께 확인한다. 원래 값이 없던 밀도 설정은 ‘없던 상태’까지 복구한다.

이 도구의 단위 검사는 실제 네트워크를 끄지 않고 복구 판단을 확인한다. 저장소 루트에서 실행한다.

```bash
node --test scripts/device/display-settings.test.mjs
node --test scripts/device/keyboard-layout.test.mjs
node --test scripts/device/standalone-device.test.mjs
```

모의 검사의 통과는 복구 로직을 확인한 것이다. 자신의 기기에서 복구가 완료되었다는 사실은 실제 실행 보고서로 확인한다. 실행 중 설정을 직접 바꾸거나 USB를 빼면 자동화가 복구 대상과 사용자 변경을 구별하기 어려워진다.

## 17.8 검사한 파일과 기록을 확인한 뒤 조건부 커밋하기

커밋에는 ‘검사가 끝났을 때의 파일’이 들어가야 한다. 검사 도중 코드를 바꾸고 나중에 그 파일까지 함께 커밋하면 검사한 대상과 저장한 대상이 달라진다.

`scripts/device/git-guard.mjs`에는 그 차이를 막는 코드가 있다. 다음은 파일 지문을 비교하는 실제 핵심 부분이다.

```javascript
for (const file of allowedPaths) {
  if (ignoreReport && file === REPORT_PATH) continue;
  if (JSON.stringify(snapshot[file]) !== JSON.stringify(state.snapshot[file])) {
    throw new Error('A checked file changed during verification: ' + file);
  }
}
```

검사 후 생성하는 보고서만 별도로 다루고, 검사 대상 소스의 존재 여부·내용 지문·크기 등을 다시 비교한다. `scripts/device/commit-files.json`은 커밋을 허용할 정확한 파일 목록이다.

| 조건 | 자동 커밋 처리 |
| --- | --- |
| 코드와 필수 실기기 검사 모두 성공 | 다음 보호 조건 확인 |
| 기기 없음·검사 실패·설정 복구 실패 | 커밋하지 않음 |
| 실행 전에 staging된 변경 존재 | 기존 staging을 보존하고 중단 |
| 허용 목록 밖의 변경 발견 | 범위를 검토하기 전 중단 |
| 검사 중 파일·HEAD·브랜치 변경 | 커밋하지 않음 |
| 보고서만 달라진 재검사 | 불필요한 새 커밋을 만들지 않음 |

이 책의 기본 실습은 계속 `--no-commit`이다. 실행을 마치면 직접 변경 목록을 읽는다.

```bash
git status --short
git diff --stat
git diff -- apps/mobile/package.json
git diff -- docs/book/verification/latest-android.md
```

전체 보고서가 성공이고 자신의 변경만 들어 있음을 확인한 뒤에는 저장소의 기존 자동 커밋 절차를 선택할 수 있다. 이 프로젝트에서는 사용자가 반복 검사·기록·커밋 자동화를 요청해, 모든 보호 조건을 통과한 실행에 한해 허용한다. GitHub 업로드와 태그는 별도다.

독자가 자기 프로젝트에 이 방식을 도입한다면 먼저 허용 목록과 기기 검사 범위를 자신의 앱에 맞게 검토한다. 새 테스트 파일을 추가했다고 해서 모든 변경 경로를 와일드카드로 허용하지 않는다. 커밋 보호 검사는 다음 명령으로 따로 실행할 수 있다.

```bash
node --test scripts/device/git-guard.test.mjs
```

**완료 확인:** 사과 한 개 검사와 일부러 틀린 기대값의 실패를 모두 관찰하고, 수정 후 다시 통과시켰는가. 코드 검사·작은 흐름·전체 회귀의 결과를 서로 구별해 적었는가. 기기를 원래 상태로 돌리고, 커밋하지 않는 실습이었음을 Git 상태에서 확인했는가.
