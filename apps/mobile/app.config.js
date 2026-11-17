module.exports = ({ config }) => {
  const variant = process.env.STORE_PRICE_APP_VARIANT ?? 'inspection';
  const standaloneSwitch = process.env.STORE_PRICE_STANDALONE_BUILD ?? '';
  if (!['inspection', 'production'].includes(variant)
    || !['', '0', '1'].includes(standaloneSwitch)) {
    throw new Error('앱 용도 설정이 올바르지 않습니다. inspection 또는 production 프로필을 확인해 주세요.');
  }

  const standalone = standaloneSwitch === '1';
  const androidPackage = process.env.STORE_PRICE_ANDROID_PACKAGE ?? '';
  const nonce = process.env.STORE_PRICE_BUILD_NONCE ?? '';
  const runId = process.env.EXPO_PUBLIC_DEVICE_RUN_ID ?? '';

  // 정식 앱은 명시적으로만 선택하며, 셸에 남은 검사 설정이 배포 결과를 바꾸면 빌드를 중단합니다.
  if (variant === 'production') {
    const previewEnabled = [
      'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW',
      'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN',
      'EXPO_PUBLIC_CATALOG_TEST_SCENARIO',
    ].some((key) => !['', 'disabled'].includes(process.env[key] ?? ''));
    if (standalone || androidPackage || nonce || runId || previewEnabled) {
      throw new Error('정식 배포에는 검사 실행 번호·독립 APK 식별자·개발 미리보기 설정을 사용할 수 없습니다.');
    }
  }

  if (!standalone && (androidPackage || nonce)) {
    throw new Error('독립 APK 식별자는 전용 preview 빌드에서만 사용할 수 있습니다.');
  }
  if (standalone) {
    const packageMatch = /^com\.ungjo\.storeprice\.offline\.b([a-f0-9]{16})$/u.exec(androidPackage);
    // 처음 설치한 상태를 증명하는 패키지·빌드 번호·화면 표시를 같은 검사 빌드에 묶습니다.
    if (!packageMatch || packageMatch[0] !== androidPackage
      || nonce !== 'standalone-' + packageMatch[1] || (runId && runId !== nonce)) {
      throw new Error('독립 APK 검사 식별자가 올바르지 않습니다. 전용 빌드 준비 명령을 다시 실행해 주세요.');
    }
  }

  // 프로젝트 연결 정보는 보존하지만, 다른 용도로 해석한 설정에 과거 검사 메타데이터를 남기지 않습니다.
  const extra = { ...config.extra };
  delete extra.standaloneBuild;
  if (standalone) extra.standaloneBuild = { schemaVersion: 1, nonce, androidPackage };

  // 아이콘과 시작화면을 같은 용도로 묶어 검사 APK가 정식 앱처럼 보이지 않게 합니다.
  const brand = variant === 'production' ? 'market' : 'inspection';
  const backgroundColor = '#FAF8EF';
  const foregroundImage = './assets/brand/' + brand + '-foreground.png';
  // 정적 기본값이나 이전 설정에 plugin이 있어도 현재 variant 설정을 한 번만 적용합니다.
  const plugins = (config.plugins ?? []).filter((plugin) =>
    (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-splash-screen');
  plugins.push(['expo-splash-screen', {
    backgroundColor, image: foregroundImage, imageWidth: 200, resizeMode: 'contain',
  }]);

  return {
    ...config,
    icon: './assets/brand/' + brand + '-icon.png',
    plugins,
    name: standalone ? '꼬마 시장 읽기 검사' : variant === 'production' ? '꼬마 시장' : '꼬마 시장 검사',
    slug: 'store-price',
    android: {
      ...config.android,
      // 템플릿 배경 이미지를 함께 남기면 단색 브랜드 배경이 가려지므로 레이어를 교체합니다.
      adaptiveIcon: {
        backgroundColor, foregroundImage,
        monochromeImage: './assets/brand/' + brand + '-monochrome.png',
      },
      package: standalone ? androidPackage : variant === 'production'
        ? 'com.ungjo.storeprice' : 'com.ungjo.storeprice.inspection',
      allowBackup: false,
      // 최초 실행 검사는 매번 새 패키지이므로 1을 사용하고, 정식·일반 검사는 app.json에서 관리합니다.
      versionCode: standalone ? 1 : config.android.versionCode,
    },
    extra,
  };
};
