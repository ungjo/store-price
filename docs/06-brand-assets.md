# 꼬마 시장 브랜드 이미지

이번 이미지는 ChatGPT의 내장 `image_gen` 도구로 새로 생성하고 같은 도구로 배경·검사 배지·단색 변형을 만들었다. 외부 이마트·SSG 로고와 상품 사진은 사용하지 않았다. 생성 원본은 로컬 생성 이미지 폴더에 보존하고, 실제 앱이 읽는 최종 6개 PNG를 `apps/mobile/assets/brand`에 복사했다. Python·별도 이미지 API는 사용하지 않았다.

## 적용

- 정식 앱: 초록 장바구니, 사과, 빵. 별도 글자 없음.
- 검사 앱: 같은 그림 위에 주황색 **검사** 배지를 추가.
- adaptive foreground: 투명 여백이 있는 그림. Android가 기기별 모양으로 표시한다.
- monochrome: 투명 배경의 검정 알파 마스크. 테마 아이콘에 사용할 수 있도록 내부 구멍과 검사 글자 부분을 비웠다.
- 일반 icon: 크림색 배경을 포함하는 불투명 그림.
- 시작 화면: 해당 앱의 foreground와 `#FAF8EF` 배경을 사용. 실행 시간을 인위적으로 늘리는 코드는 넣지 않았다.

기본 생성 요청은 1024×1024였지만 실제 반환 파일은 모두 **1254×1254**였다. 실제 파일 크기를 기록하고 정사각형·투명도·안전 여백을 점검했다. Android 리소스 크기는 Expo 빌드 과정에서 만들어진다. Google Play 스토어 등록용 이미지 규격 검증과는 별도다.

2026-11-18 원본 읽기 점검에서 일반 icon 2개는 전 픽셀이 불투명했다. 나머지 4개 레이어의 중심 그림은 평균 alpha 약 252~253/255였고 투명한 바깥 여백을 확인했다. 72/108 원형 표시 경계 밖의 주요 픽셀(alpha≥128)은 0개였다. 보수적인 66/108 안전 원에서는 바구니 하단 모서리 일부가 벗어나므로 모든 제조사의 효과를 검증했다는 뜻은 아니다. 실제 태블릿 아이콘·시작 화면 확인은 [APK 개발 기록](book/chapters/07b-branding-apk.md)에 구분해 남긴다.

코드 `2` 검사 APK에서는 manifest의 icon·roundIcon과 적응형 전경·단색 레이어, 시작 테마의 `splashscreen_logo`·`#FAF8EF` 연결을 읽어 확인했다. 추출 그림도 검사 배지와 대응했으며 근거는 빌드 폴더의 `branding-evidence/summary.json`에 남겼다. 태블릿 앱 정보의 아이콘과 실제 시작 화면은 별도 원본 화면·영상으로 직접 확인했다. 원본 이미지 검사·APK 리소스 검사·기기 시각 확인은 서로 다른 근거이며 모든 런처 모양·테마 아이콘 설정이나 전체 놀이 회귀를 통과했다는 뜻은 아니다.

## 사용한 프롬프트

모든 호출은 내장 도구를 사용했다. 배경이 투명한 4개 호출은 `transparent_background: true`, 일반 icon 2개 호출은 `false`를 지정했다. 수정 호출에는 앞선 생성 파일을 참조 이미지로 전달했다.

### 1. market-foreground.png — 새 생성

> Use case: logo-brand. Create a production-ready square Android adaptive app-icon FOREGROUND for a Korean children's pretend grocery-shopping app named 꼬마 시장, for ages 6–9. Output one single finished transparent PNG image, 1024 by 1024. Genuinely transparent background, no background tile, no drop shadow outside the emblem. Main emblem: an inviting rounded forest-green shopping basket with a simple arched handle, containing one bright coral-red apple with a green leaf and one small golden bread loaf. Playful, polished, bold flat vector-like illustration, clean rounded edges and very subtle depth, clear silhouette at 48px. No words, no letters, no watermarks, no branded retailer marks, no currency symbols, no faces. Palette is anchored in forest green #285E47, warm golden yellow #F3C56B, coral #E87461 and cream #FAF8EF matching the existing app. IMPORTANT composition: the entire emblem including handle and leaf fits within the central 58% diameter circle of the canvas, with generous transparent margins on every side; centered optically. This is the final asset, not a mockup or presentation sheet.

### 2. market-icon.png — 1번을 참조한 불투명 배경

> Edit the provided app-icon foreground. Preserve the basket, apple, bread, exact colors, scale, position, and artwork pixel arrangement as faithfully as possible. Make ONLY one change: replace the transparent background with one completely uniform solid warm cream #FAF8EF, filling the entire square canvas edge-to-edge. No gradient, no border, no rounded outer tile, no text, no new shadows. Preserve the generous margins and centered composition. Output a single final square PNG for an Android app icon, not a mockup.

### 3. inspection-foreground.png — 1번을 참조한 검사 배지

> Edit this Korean children's market app icon into its TEST/INSPECTION variant. Preserve the original forest-green basket, coral apple, golden bread and their proportions and exact overall center position. Add one small but very legible rounded orange badge with dark green bold Korean text exactly '검사' on the upper right part of the basket, overlapping the handle just above the bread, inside the original emblem's bounding box. This badge should remain obvious at launcher size and should be part of the emblem, not a corner-of-canvas overlay. No other text, no new objects. Keep the whole mark inside the central 58% diameter safe circle of the square canvas with the generous transparent margins. Keep the background genuinely transparent. Output one final square PNG.

### 4. market-monochrome.png — 1번을 참조한 단색 마스크

> Convert the provided market-basket app icon into a clean one-color Android themed icon alpha mask. Preserve the basket with arched handle, single apple and bread recognizable silhouette, exact position, scale and generous margins. Use only solid black opaque strokes/shapes with transparent negative spaces: holes between handle and groceries, three basket slots, small separation between apple and loaf, simple leaf/stem separation. Remove all shading, colors, outlines in other tones, background, glow, and shadows. Black drawing on genuinely transparent background; do not add an opaque square. No text. Keep the entire symbol inside the central 58% circle. One final square PNG.

### 5. inspection-icon.png — 3번을 참조한 불투명 배경

> Edit this inspection variant app icon. Preserve the green basket, apple, bread and the orange badge with exact Korean text '검사', along with their position and scale. Only replace the transparent background with a fully opaque, completely uniform warm cream #FAF8EF across the entire square. No other edits. No shadows on background, no frame, no round outer tile. Single final square PNG.

### 6. inspection-monochrome.png — 3번을 참조한 단색 마스크

> Convert this inspection variant into a clean one-color Android themed-icon alpha mask. Preserve the basket/apple/bread recognizable shape and upper-right inspection badge placement. Use opaque solid black for the mark and badge, with transparent negative space for inner basket slots, handle gap, leaf and bread separations and the two Korean characters '검사' cut out of the badge. No color/shading/shadows/background. Keep the same center position and generous transparent margins so the whole emblem fits within the central 58% circle. Make the two characters simple bold cut-outs. Final square PNG on genuine transparency.

## 파일 지문

다음 SHA-256은 프로젝트에 복사한 파일을 직접 읽어 계산했다. 프롬프트 의도와 실제 출력은 구분하며, 후속 검사는 실제 PNG를 대상으로 한다.

| 파일 | SHA-256 |
| --- | --- |
| apps/mobile/assets/brand/market-foreground.png | `ada8cf06b6bf4a41ed2dbeb1e831e7390c8e1fdde0fee3e68b8130d55ec651c3` |
| apps/mobile/assets/brand/market-icon.png | `0c73f68a9f9173062747695aee65d065182ab24d8dc4f71103c2e3bc4a97c8e7` |
| apps/mobile/assets/brand/market-monochrome.png | `b165840bda3f421256967b9eb8d8f621462f2958fda985362a89b19bfb730fd2` |
| apps/mobile/assets/brand/inspection-foreground.png | `1f5635344c1818248ae32ed5703539443726fa2e70c22b826e688fe623133aa5` |
| apps/mobile/assets/brand/inspection-icon.png | `4403b90670cbbe49411e677b18732a3cc6232289264b1d9ed9112e650961b9ea` |
| apps/mobile/assets/brand/inspection-monochrome.png | `f7b7606dce7d03de75f4e9bc0b59db9de198998a018ab00178b003a97f702118` |
