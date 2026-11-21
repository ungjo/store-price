# 2장 · Windows 개발 도구 점검표

ZIP을 모두 푼 뒤 VS Code에서 `start.mjs`가 있는 폴더를 엽니다. **터미널 → 새 터미널**에서 아래 명령을 한 줄씩 실행하세요.

| 명령 | 확인할 내용 |
| --- | --- |
| `node --version` | 책 실습에 사용하는 Node.js 26의 버전 |
| `npm.cmd --version` | 앱 패키지를 설치하는 npm의 버전 |
| `git --version` | Git 설치 버전 |
| `node start.mjs --help` | 꾸러미의 1~20장 명령 목록 |

- [ ] VS Code 탐색기에 `start.mjs`가 보인다.
- [ ] 터미널에서 세 도구의 버전을 확인했다.
- [ ] `F1` → **작업: 작업 실행** → **실습 명령어 도움말**로 명령 목록을 열었다.

확인을 마쳤으면 꾸러미 터미널에서 `node start.mjs --open 03`을 입력해 첫 계산 예제를 엽니다.
