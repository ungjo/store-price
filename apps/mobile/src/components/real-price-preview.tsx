import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatPreviewTime, loadRealPricePreview, previewIsExpired, previewStockLabel,
  readRealPricePreviewConfig, type RealPricePreview, type RealPricePreviewConfig,
} from '../features/catalog/real-price-preview';

type PreviewState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; data: RealPricePreview };

const won = new Intl.NumberFormat('ko-KR');

export function PrivatePricePreview() {
  // 실제 자료는 앱 번들에 넣지 않습니다. 개발 중 명시적으로 켠 PC 연결만 사용합니다.
  if (!__DEV__) return null;
  let config: RealPricePreviewConfig | null;
  try {
    config = readRealPricePreviewConfig(
      __DEV__,
      process.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW,
      process.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN,
    );
  } catch {
    return null;
  }
  if (!config) return null;
  return <PreviewDialog config={config} />;
}

function PreviewDialog({ config }: { config: RealPricePreviewConfig }) {
  const { token } = config;
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });
  const [viewedAt, setViewedAt] = useState(() => Date.now());
  const deviceRunId = process.env.EXPO_PUBLIC_DEVICE_RUN_ID;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    const clock = setInterval(() => setViewedAt(Date.now()), 60_000);
    // 닫기·재시도 뒤 늦게 도착한 응답이 다시 열거나 이전 기록을 덮어쓰지 않게 합니다.
    void loadRealPricePreview({ token }, { signal: controller.signal, expectedSessionId: deviceRunId })
      .then((data) => {
        if (active && !controller.signal.aborted) setPreview({ status: 'ready', data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setPreview({ status: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
      clearInterval(clock);
    };
  }, [open, attempt, token, deviceRunId]);

  function show() {
    setPreview({ status: 'loading' });
    setViewedAt(Date.now());
    setOpen(true);
  }

  function close() {
    // 미리보기는 놀이 상태를 변경하지 않고, 닫을 때 읽은 자료도 화면 상태에서 비웁니다.
    setOpen(false);
    setPreview({ status: 'idle' });
  }

  function retry() {
    setPreview({ status: 'loading' });
    setViewedAt(Date.now());
    setAttempt((value) => value + 1);
  }

  return (
    <>
      <Pressable
        testID="preview-open"
        accessibilityRole="button"
        accessibilityLabel="실제 가격 미리보기 열기"
        onPress={show}
        style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
      >
        <Text style={styles.openLabel}>실제 가격 미리보기 <Text style={styles.developmentLabel}>· 개발용</Text></Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
        <SafeAreaView testID="preview-modal" style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>실제 가격 미리보기 · 개발용</Text>
              <Text style={styles.title} accessibilityRole="header">확인 당시 가격</Text>
            </View>
            <Pressable testID="preview-close" accessibilityRole="button" accessibilityLabel="실제 가격 미리보기 닫기" onPress={close} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView testID="preview-list" contentContainerStyle={styles.content}>
            <Text testID="preview-description" style={styles.description}>실제 이마트몰에서 확인한 기록이에요.{ '\n' }이 화면에서는 가격을 살펴보기만 해요.</Text>
            {preview.status === 'loading' && (
              <View style={styles.stateCard}>
                <ActivityIndicator size="large" color="#255B42" accessibilityLabel="가격 기록 불러오는 중" />
                <Text testID="preview-loading" accessibilityLiveRegion="polite" style={styles.stateTitle}>PC의 가격 기록을 가져오고 있어요</Text>
              </View>
            )}
            {preview.status === 'error' && (
              <View style={styles.stateCard}>
                <Text testID="preview-error" accessibilityLiveRegion="polite" style={styles.stateTitle}>가격 기록에 연결하지 못했어요</Text>
                <Text style={styles.description}>USB 연결과 PC의 미리보기 실행 상태를 확인해 주세요.</Text>
                <RetryButton onPress={retry} />
              </View>
            )}
            {preview.status === 'ready' && (
              <>
                <Text testID="preview-ready" style={styles.count}>확인한 가격 {preview.data.products.length}개</Text>
                <Text testID="preview-fetched" style={styles.metadata}>DB에서 가져온 시각 {formatPreviewTime(preview.data.fetchedAt)}</Text>
                <Text style={styles.metadata}>DB에서 가져온 시각은 가격을 확인한 시각과 달라요.</Text>
                {deviceRunId && <Text testID="preview-session-marker" accessible accessibilityLabel={'미리보기 실행 ' + preview.data.sessionId} style={styles.marker}>이번 검사 연결 확인</Text>}
                {preview.data.products.length === 0 && <Text testID="preview-empty" style={styles.stateTitle}>아직 확인할 가격 기록이 없어요</Text>}
                {preview.data.products.map((product, index) => {
                  const prefix = 'preview-product-' + index;
                  return (
                    <View key={product.id} style={styles.product}>
                      <Text testID={prefix + '-name'} accessibilityRole="header" style={styles.productName}>{product.name}</Text>
                      <Text testID={prefix + '-unit'} style={styles.unit}>{product.unit}</Text>
                      <Text testID={prefix + '-price'} style={styles.price}>{won.format(product.priceKrw)}원</Text>
                      <Text testID={prefix + '-stock'} style={[styles.stock, product.availability === 'out_of_stock' && styles.stockOut]}>{previewStockLabel(product.availability)}</Text>
                      <Text testID={prefix + '-source'} style={styles.metadata}>SSG.COM 이마트 온라인</Text>
                      <Text testID={prefix + '-observed'} style={styles.metadata}>확인 시각 {formatPreviewTime(product.observedAt)}</Text>
                      <Text testID={prefix + '-expiry'} style={[styles.metadata, previewIsExpired(product, viewedAt) && styles.stale]}>
                        {previewIsExpired(product, viewedAt) ? '내부 재확인 기한이 지난 기록이에요.' : '확인 당시 가격이며 지금 가격과 다를 수 있어요.'}
                      </Text>
                      <Text testID={prefix + '-url'} selectable style={styles.sourceUrl}>{product.sourceUrl}</Text>
                    </View>
                  );
                })}
                <Text style={styles.description}>배송지를 선택하지 않은 기록은 배송지별 재고를 보장하지 않아요. 카드 혜택과 적립금은 표시 가격에 반영하지 않았어요.</Text>
                <RetryButton onPress={retry} />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable testID="preview-retry" accessibilityRole="button" accessibilityLabel="PC 가격 기록 다시 불러오기" onPress={onPress} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>PC 기록 다시 불러오기</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF8F0' },
  openButton: { alignSelf: 'center', width: '100%', maxWidth: 720, minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#EAF0E5', justifyContent: 'center' },
  openLabel: { fontSize: 16, fontWeight: '700', color: '#255B42' },
  developmentLabel: { fontSize: 13, fontWeight: '500', color: '#596B5B' },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#DDE4D5' },
  heading: { flex: 1 },
  eyebrow: { color: '#596B5B', fontSize: 13, lineHeight: 20 },
  title: { color: '#204839', fontSize: 26, fontWeight: '800', lineHeight: 36, marginTop: 4 },
  closeButton: { minWidth: 60, minHeight: 48, padding: 12, backgroundColor: '#255B42', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 36 },
  description: { fontSize: 15, lineHeight: 25, color: '#46614D', marginBottom: 16 },
  count: { fontSize: 20, fontWeight: '800', color: '#293D31', marginBottom: 8 },
  metadata: { fontSize: 14, lineHeight: 23, color: '#596B5B', marginTop: 5 },
  marker: { fontSize: 12, color: '#596B5B', marginTop: 8 },
  stateCard: { marginTop: 12, padding: 24, borderRadius: 20, backgroundColor: '#E9EEDC' },
  stateTitle: { fontSize: 20, lineHeight: 30, fontWeight: '700', color: '#204839', marginVertical: 16 },
  product: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#ECEDE3', padding: 18, marginTop: 20 },
  productName: { fontSize: 20, fontWeight: '800', color: '#293D31', lineHeight: 29 },
  unit: { fontSize: 15, color: '#627064', marginTop: 6, lineHeight: 23 },
  price: { fontSize: 26, fontWeight: '800', color: '#255B42', marginTop: 12 },
  stock: { fontSize: 15, fontWeight: '700', color: '#46614D', marginTop: 12, marginBottom: 6 },
  stockOut: { color: '#8D452E' },
  stale: { color: '#8D452E', fontWeight: '700' },
  sourceUrl: { fontSize: 12, lineHeight: 20, color: '#657466', marginTop: 10 },
  retryButton: { minHeight: 52, backgroundColor: '#255B42', borderRadius: 14, padding: 14, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
