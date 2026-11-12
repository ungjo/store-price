import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { sampleProducts } from '../data/sample-products';
import { loadCatalog, readCatalogConfig, type CatalogProduct } from '../features/catalog/catalog';
import { createCatalogSession, INITIAL_CATALOG_STATE, type CatalogSource } from '../features/catalog/catalog-session';
import { createCatalogDeviceFixture, INITIAL_CATALOG_DEVICE_STATE, isCatalogDeviceFixtureEnabled } from '../features/catalog/catalog-device-fixture';

export type { CatalogSource } from '../features/catalog/catalog-session';

// Expo는 점 표기로 적힌 공개 환경 변수만 번들에 넣습니다. 관리자 비밀 키는 사용하지 않습니다.
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const deviceRunId = process.env.EXPO_PUBLIC_DEVICE_RUN_ID;
const catalogTestScenario = process.env.EXPO_PUBLIC_CATALOG_TEST_SCENARIO;

export function CatalogLoader({ children }: {
  children: (products: readonly CatalogProduct[], source: CatalogSource, reload: () => void) => ReactNode;
}) {
  const [catalog, setCatalog] = useState(INITIAL_CATALOG_STATE);
  const [round, setRound] = useState(0);
  const [fixtureState, setFixtureState] = useState(INITIAL_CATALOG_DEVICE_STATE);
  const [fixture] = useState(() => __DEV__ && isCatalogDeviceFixtureEnabled({
    development: __DEV__, runId: deviceRunId, scenario: catalogTestScenario,
  }) ? createCatalogDeviceFixture(sampleProducts) : null);
  const [session] = useState(() => createCatalogSession({
    samples: sampleProducts,
    read: (signal) => {
      if (fixture) return fixture.read(signal);
      const config = readCatalogConfig(projectUrl, publishableKey);
      return config ? loadCatalog(config, { signal }) : Promise.resolve(null);
    },
  }));

  useEffect(() => {
    const unsubscribe = fixture?.subscribe(setFixtureState);
    const disconnect = session.connect(setCatalog);
    return () => {
      unsubscribe?.();
      disconnect();
    };
  }, [fixture, session]);

  const reload = () => {
    // 아주 빠른 응답으로 loading 렌더가 합쳐져도 이전 영수증·장바구니가 새 놀이에 남지 않게 합니다.
    setRound((value) => value + 1);
    session.reload();
  };

  const loading = catalog.status === 'loading';
  const title = loading ? '가게 물건을 가져오고 있어요'
    : catalog.status === 'empty' ? '아직 준비된 물건이 없어요'
      : catalog.status === 'unconfigured' ? '가게를 준비하고 있어요'
        : '물건을 불러오지 못했어요';
  const description = loading ? '기다리지 않고 예시 상품으로 놀이할 수도 있어요.'
    : catalog.status === 'error' ? '지금은 가게에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.'
      : '예시 상품으로 먼저 시장놀이를 해 볼까요?';

  const screen = catalog.status === 'ready' ? (
    <Fragment key={round}>{children(catalog.products, catalog.source, reload)}</Fragment>
  ) : (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.brand}>🌱 꼬마 시장</Text>
          <View style={styles.card}>
            <Text style={styles.icon} accessible={false}>{loading ? '🧺' : '🌱'}</Text>
            {loading && <ActivityIndicator size="large" color="#255B42" accessibilityLabel="상품 불러오는 중" />}
            <Text testID={'catalog-' + catalog.status} style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Text>
            <Text style={styles.description}>{description}</Text>
            {!loading && (
              <Pressable testID="catalog-retry" accessibilityRole="button" accessibilityLabel="상품 다시 불러오기" onPress={reload} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>다시 불러오기</Text>
              </Pressable>
            )}
            <Pressable testID="catalog-use-samples" accessibilityRole="button" accessibilityLabel="예시 상품으로 바로 놀이하기" onPress={session.useSamples} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>예시 상품으로 바로 놀이하기</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );

  if (!fixture) return screen;
  // 검사 표시가 갱신돼도 놀이 화면의 위치와 컴포넌트를 유지해 장바구니가 초기화되지 않게 합니다.
  // 기기마다 높이가 다른 하단 탐색 버튼에 검사 표시가 가리지 않도록 실제 안전 영역을 적용합니다.
  return (
    <SafeAreaProvider style={styles.fixtureRoot}>
      <SafeAreaView edges={['bottom']} style={styles.fixtureRoot}>
        <View style={styles.fixtureContent}>{screen}</View>
        <View style={styles.fixtureMarkers}>
          <Text testID="catalog-test-marker" accessible accessibilityLabel={'상품 대기 검사 ' + deviceRunId} style={styles.fixtureText}>상품 대기 검사 {deviceRunId}</Text>
          <Text testID="catalog-test-request-count" accessible accessibilityLabel={'검사 요청 ' + fixtureState.requests + '회'} style={styles.fixtureText}>검사 요청 {fixtureState.requests}회</Text>
          {fixtureState.lateResponse && <Text testID="catalog-test-late-marker" accessible accessibilityLabel="취소 뒤 늦은 응답 확인" style={styles.fixtureText}>취소 뒤 늦은 응답 확인</Text>}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fixtureRoot: { flex: 1, backgroundColor: '#FAF8F0' },
  fixtureContent: { flex: 1 },
  fixtureMarkers: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, backgroundColor: '#FAF8F0' },
  fixtureText: { fontSize: 10, color: '#46614D' },
  screen: { flex: 1, backgroundColor: '#FAF8F0' },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', width: '100%', maxWidth: 720, alignSelf: 'center' },
  brand: { fontSize: 24, fontWeight: '800', color: '#234F40', marginBottom: 24 },
  card: { padding: 24, borderRadius: 24, backgroundColor: '#E9EEDC', alignItems: 'center' },
  icon: { fontSize: 48, marginBottom: 18 },
  title: { fontSize: 25, lineHeight: 36, fontWeight: '800', color: '#204839', textAlign: 'center', marginTop: 16 },
  description: { fontSize: 17, lineHeight: 28, color: '#46614D', textAlign: 'center', marginVertical: 18 },
  button: { minHeight: 52, width: '100%', borderRadius: 14, backgroundColor: '#255B42', justifyContent: 'center', alignItems: 'center', padding: 14, marginTop: 8 },
  buttonText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  secondaryButton: { minHeight: 52, width: '100%', borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#91A688', justifyContent: 'center', alignItems: 'center', padding: 14, marginTop: 12 },
  secondaryText: { fontSize: 17, fontWeight: '700', color: '#315239', textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
