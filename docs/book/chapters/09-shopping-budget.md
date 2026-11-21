# 09. 5만 원으로 장보기

아이들이 ‘오늘의 놀이돈’에서 10,000원과 50,000원 중 하나를 골라 같은 상품으로 서로 다른 거스름돈 문제를 풀 수 있게 했다. 첫 놀이와 ‘다시 장보기’의 예산은 10,000원이다. 예시 가격 안내에는 ‘실제 마트 판매 가격이 아니에요.’라고 표시한다.

## 예산을 바꿀 때

예산을 장바구니와 함께 쇼핑 상태에 저장한다. 예산을 바꾸면 물건과 수량을 유지하고, 지불할 돈과 풀던 퀴즈를 초기화한다. 예를 들어 10,500원어치를 담고 예산을 50,000원에서 10,000원으로 낮추면 물건을 그대로 보여 주면서 500원이 부족하다고 알려준다. 아이가 직접 수량을 줄이거나 예산을 다시 고를 수 있다.

‘낼 놀이돈 고르기’에는 50,000원 지폐를 추가했다. 현재 예산을 넘는 지폐는 비활성화하고 쓸 수 있는 예산을 안내한다. 장바구니 잔액은 선택한 예산에서 물건값을 빼고, 거스름돈은 실제 낸 지폐에서 물건값을 뺀다. 50,000원 예산으로 5,500원어치를 담으면 10,000원권을 내도, 50,000원권을 내도 예산 잔액은 44,500원이다. 거스름돈 정답은 각각 4,500원과 44,500원이다. 영수증에는 계산이 끝난 시점의 금액을 기록한다.

## 재현과 검사

`apps/mobile`에서 `npm test`, `npm run typecheck`, `npm run lint`를 실행한다. 실기기 시나리오 `budget-choice.yaml`은 금액 안내 문구, 예산 전환, 50,000원권의 선택 가능 여부, 다섯 자리 거스름돈, 영수증 금액과 새 놀이 초기값을 확인한다. Android 검사의 모든 결과는 [실기기 검사 기록](../verification/latest-android.md)에 남는다.

앱 단위 검사 153개와 TypeScript·ESLint 검사를 통과했다. 이번 빌드의 소스 SHA-256은 `7ca4069a0ad9ef1986f3924df06d184cca94e5b7c1400299a2e4c93cd2f0615a`이다. 업로드할 아카이브의 45개 파일을 로컬 복사본과 대조한 뒤 [Expo 검사 빌드](https://expo.dev/accounts/juj_chroma/projects/store-price/builds/26281501-a79b-4114-a36d-ec9aa38f5a52)를 요청했다.

새 APK를 기다리는 동안 SM-X710의 Expo Go에서 `budget-choice.yaml`을 실행했다. 새 가격 문구, 10,500원 장바구니로 예산을 낮췄을 때의 500원 부족 표시와 지폐 선택 해제, 5,500원 구매의 거스름돈 44,500원과 영수증, 새 놀이의 기본 예산을 확인했다. 독립 시나리오는 1건 통과했고 종료 시 임시 개발 서버, USB 8093 포트와 화면 유지 설정을 정리했다.

검사 앱 패키지는 `com.ungjo.storeprice.inspection`이다. 같은 패키지와 버전 번호를 사용하는 이전 설치본을 구별하기 위해 `b5915cf`의 검증 기록과 APK 파일 지문을 대조한다. 이번 빌드 표시는 `inspection-ecb20a267fa3873d`이다. EAS 빌드가 완료된 뒤 다운로드한 APK의 SHA-256은 `b19645b4f7702768c6ade60b24cafcd180a8815528c31b83a8c4285eb52ca877`이다.

```bash
node scripts/build/inspection.mjs prepare
# 빌드 폴더의 project에서 의존성을 설치한 뒤 기존 검사 서명으로 빌드한다.
npm ci --prefer-offline --no-audit --no-fund
eas build --platform android --profile inspection --message inspection-ecb20a267fa3873d --non-interactive --no-wait
# 완료된 빌드의 build.json을 받은 뒤 저장소 루트에서 실행한다.
node scripts/build/inspection.mjs download .artifacts/build/inspection-ecb20a267fa3873d
node scripts/device/verify.mjs --inspection-apk .artifacts/build/inspection-ecb20a267fa3873d/provenance.json --inspection-update-from .artifacts/build/inspection-d9fea202791a8c41/provenance.json --inspection-update-commit b5915cf --inspection-from-home --message "feat: 장보기 예산과 오만 원권 선택 추가"
```
