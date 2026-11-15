module.exports = ({ config }) => {
  // Expo Go와 일반 설정은 그대로 두고, 명시한 독립 APK 검사에서만 새 앱을 만듭니다.
  if (process.env.STORE_PRICE_STANDALONE_BUILD !== '1') return config;

  const androidPackage = process.env.STORE_PRICE_ANDROID_PACKAGE ?? '';
  const nonce = process.env.STORE_PRICE_BUILD_NONCE ?? '';
  const packageMatch = /^([a-z][a-z0-9_]*\.)+offline\.b([a-f0-9]{16,64})$/u.exec(androidPackage);

  // 재설치나 백업 복원으로 남은 상태를 첫 실행으로 오인하지 않도록 빌드마다 식별자를 묶습니다.
  if (!packageMatch || androidPackage.length > 200 || nonce !== 'standalone-' + packageMatch[2]) {
    throw new Error('독립 APK 검사 식별자가 올바르지 않습니다. 전용 빌드 준비 명령을 다시 실행해 주세요.');
  }

  return {
    ...config,
    // 이전 6개 상품 검사 앱과 나란히 설치해도 새 버전을 찾을 수 있도록 이름을 구분합니다.
    name: '꼬마 시장 검사 12',
    slug: 'store-price',
    android: {
      ...config.android,
      package: androidPackage,
      allowBackup: false,
      versionCode: 1,
    },
    extra: {
      // EAS CLI가 app.json에 연결한 실제 프로젝트 정보와 기존 설정을 보존합니다.
      ...config.extra,
      standaloneBuild: { schemaVersion: 1, nonce, androidPackage },
    },
  };
};
