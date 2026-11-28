const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 정식 Android 번들에는 상품 서버 로더 대신 기기 안의 예시만 읽는 모듈을 넣습니다.
if (process.env.STORE_PRICE_APP_VARIANT === 'production') {
  const onlineLoader = path.resolve(__dirname, 'src/components/catalog-loader.tsx');
  const bundledLoader = path.resolve(__dirname, 'src/components/bundled-catalog-loader.ts');
  const previousResolver = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = previousResolver ?? context.resolveRequest;
    const result = resolve(context, moduleName, platform);
    if (platform === 'android' && result.type === 'sourceFile' && result.filePath === onlineLoader) {
      return { type: 'sourceFile', filePath: bundledLoader };
    }
    return result;
  };
}

module.exports = config;
