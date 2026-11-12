import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { sampleProducts } from '../data/sample-products';
import { loadCatalog, readCatalogConfig, type CatalogProduct } from '../features/catalog/catalog';

export type CatalogSource = 'supabase' | 'sample';
type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; products: readonly CatalogProduct[]; source: CatalogSource }
  | { status: 'empty' | 'error' | 'unconfigured' };

// Expo는 점 표기로 적힌 공개 환경 변수만 번들에 넣습니다. 관리자 비밀 키는 사용하지 않습니다.
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function CatalogLoader({ children }: {
  children: (products: readonly CatalogProduct[], source: CatalogSource, reload: () => void) => ReactNode;
}) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function readProducts() {
      try {
        const config = readCatalogConfig(projectUrl, publishableKey);
        if (!config) {
          if (active) setCatalog({ status: 'unconfigured' });
          return;
        }
        const products = await loadCatalog(config, { signal: controller.signal });
        // 이전 요청이 늦게 끝나도 새 화면이나 사용자가 고른 예시 목록을 덮어쓰지 않습니다.
        if (active && !controller.signal.aborted) {
          setCatalog(products.length ? { status: 'ready', products, source: 'supabase' } : { status: 'empty' });
        }
      } catch {
        if (active && !controller.signal.aborted) setCatalog({ status: 'error' });
      }
    }

    void readProducts();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const reload = () => {
    // 기존 놀이 화면을 먼저 닫고 새 목록을 받은 뒤 장바구니를 새로 시작합니다.
    setCatalog({ status: 'loading' });
    setAttempt((value) => value + 1);
  };
  const useSamples = () => {
    // 통신 실패를 DB 연결 성공처럼 숨기지 않고, 사용자가 선택할 때만 내장 예시로 전환합니다.
    setCatalog({ status: 'ready', products: sampleProducts, source: 'sample' });
  };

  if (catalog.status === 'ready') return children(catalog.products, catalog.source, reload);

  const loading = catalog.status === 'loading';
  const title = loading ? '가게 물건을 가져오고 있어요'
    : catalog.status === 'empty' ? '아직 준비된 물건이 없어요'
      : catalog.status === 'unconfigured' ? '가게를 준비하고 있어요'
        : '물건을 불러오지 못했어요';
  const description = loading ? '잠시만 기다려 주세요.'
    : catalog.status === 'error' ? '지금은 가게에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.'
      : '예시 상품으로 먼저 시장놀이를 해 볼까요?';

  return (
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
              <>
                <Pressable testID="catalog-retry" accessibilityRole="button" accessibilityLabel="상품 다시 불러오기" onPress={reload} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                  <Text style={styles.buttonText}>다시 불러오기</Text>
                </Pressable>
                <Pressable testID="catalog-use-samples" accessibilityRole="button" accessibilityLabel="예시 상품으로 놀이하기" onPress={useSamples} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>예시 상품으로 놀이하기</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
