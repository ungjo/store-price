# 08a. 놀이 중 TalkBack 설정 열기

상품을 기다리는 화면, 장보기 화면 위쪽, 영수증 아래에 **TalkBack 설정 열기**를 배치했다. 버튼을 누르고 Android 접근성 설정에서 TalkBack을 고르면 기기 전체의 화면 읽기를 켜거나 끌 수 있다. Android 뒤로 가기로 장보기나 영수증으로 돌아온다. 설정을 열 수 없는 기기에는 직접 찾아가는 경로를 표시한다.

앱은 Android의 공개 접근성 설정 화면을 열며 별도 권한이나 설치 패키지 목록이 필요하지 않다. 버튼 아래에는 기기가 알려 주는 화면 읽기 상태를 표시한다. 다른 화면 읽기 서비스도 이 상태에 반영되므로 특정 서비스 이름으로 상태를 단정하지 않는다. 설정에서 돌아오면 상태를 다시 읽고, 설정 변경 알림보다 오래된 조회 결과는 버린다. 놀이 상태는 기존 장보기 화면에서 관리한다.

## 확인 방법

저장소 루트에서 `node scripts/device/verify.mjs --talkback --message "feat: 놀이 중 TalkBack 설정 열기"`를 실행한다. 장바구니에 사과 두 개와 우유 한 개를 담은 뒤 설정을 열고, 돌아와 상품 3개와 합계 5,500원이 유지되는지 검사한다. 실제 TalkBack을 켠 검사에서는 버튼의 상태가 ‘화면 읽기 켜짐’으로 바뀌는지도 확인한다. 기기 설정을 바꾸는 작업은 검사 도구에 한정된다. 실행 결과와 기기 설정 복구 결과는 [Android 검사 기록](../verification/latest-android.md)에서 해당 실행을 확인한다.

[Android 접근성 서비스의 활성화](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService) · [TalkBack 사용 설정](https://support.google.com/accessibility/android/answer/6007100?hl=ko)
