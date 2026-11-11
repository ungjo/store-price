import { StatusBar } from 'expo-status-bar';
import { useReducer } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { PaymentSelector } from './src/components/payment-selector';
import { QuantityControl } from './src/components/quantity-control';
import { getCartSummary } from './src/features/cart/cart';
import { getBudgetSummary, STARTING_BUDGET_KRW } from './src/features/budget/budget';
import { createShoppingReducer } from './src/features/payment/payment';
import { sampleProducts } from './src/data/sample-products';

// 원 단위 정수 가격에 천 단위 구분 기호를 붙입니다. 원래 가격 값은 바꾸지 않습니다.
const won = new Intl.NumberFormat('ko-KR');

const shoppingReducer = createShoppingReducer(sampleProducts);
// 검사 실행 번호를 번들에 넣어 이전 서버나 캐시된 화면을 성공으로 오인하지 않게 합니다.
const deviceRunId = process.env.EXPO_PUBLIC_DEVICE_RUN_ID;

export default function App() {
  // 물건이 바뀐 뒤 예전 돈 선택이 남지 않도록 장바구니와 선택 금액을 함께 관리합니다.
  const [shopping, dispatch] = useReducer(shoppingReducer, { cart: {}, selectedPaymentKrw: null });
  const { cart, selectedPaymentKrw } = shopping;
  const summary = getCartSummary(cart, sampleProducts);
  // 잔액도 장바구니 합계에서 매번 계산해 담기·빼기·비우기 뒤 금액이 항상 함께 바뀝니다.
  const budget = getBudgetSummary(summary.totalPriceKrw);
  const budgetLabel = budget.status === 'over' ? '부족한 돈' : '남을 돈';
  const budgetAmountKrw = budget.status === 'over' ? budget.shortfallKrw : budget.remainingKrw;
  const budgetHint = budget.status === 'over'
    ? '물건을 조금 빼 볼까요?'
    : budget.status === 'exact'
      ? '놀이돈에 딱 맞아요!'
      : summary.totalQuantity === 0
        ? '놀이돈 안에서 장을 봐요.'
        : '이대로 사면 남을 돈이에요.';
  const selectedProducts = sampleProducts.filter((product) => (cart[product.id] ?? 0) > 0);
  const { width, fontScale } = useWindowDimensions();
  // 좁은 화면이나 큰 글자 설정에서는 상품을 한 줄에 하나씩 보여 읽기 쉽게 합니다.
  const columns = width >= 380 && fontScale <= 1.2 ? 2 : 1;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {/* 열 수가 바뀌면 key도 바꿔 FlatList를 새로 만들어 열 변경 오류를 피합니다. */}
        <FlatList
          key={columns}
          testID="market-list"
          data={sampleProducts}
          extraData={shopping}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.content}
          columnWrapperStyle={columns === 2 ? styles.row : undefined}
          ListHeaderComponent={
            <View>
              {deviceRunId && (
                <Text
                  testID="device-run-marker"
                  accessible
                  accessibilityLabel={'자동 검사 ' + deviceRunId}
                  style={styles.deviceRunMarker}
                >
                  자동 검사 중
                </Text>
              )}
              <View style={styles.brand}>
                <Text style={styles.brandIcon} accessible={false}>🌱</Text>
                <Text style={styles.brandName}>꼬마 시장</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>시장놀이</Text>
                </View>
              </View>

              <View style={styles.welcome}>
                <Text style={styles.eyebrow}>어서 오세요!</Text>
                <Text style={styles.title} accessibilityRole="header">
                  오늘은 무엇을{'\n'}사 볼까요?
                </Text>
                <Text style={styles.description}>
                  알록달록 우리 가게에서{'\n'}물건과 가격을 살펴봐요.
                </Text>
                <View style={styles.awning} accessible={false}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <View
                      key={index}
                      style={[styles.stripe, index % 2 === 0 && styles.greenStripe]}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>연습용 예시 가격이에요</Text>
                <Text style={styles.noticeText}>
                  놀이를 위해 만든 가격이에요.{'\n'}실제 이마트 판매 가격이 아니에요.
                </Text>
              </View>

              <View
                style={styles.playMoney}
                accessible
                accessibilityLabel={'오늘의 놀이돈 ' + won.format(STARTING_BUDGET_KRW) + '원. 이 돈 안에서 물건을 골라 봐요.'}
              >
                <View style={styles.summaryRow}>
                  <Text style={styles.playMoneyLabel}>오늘의 놀이돈</Text>
                  <Text style={styles.playMoneyAmount}>{won.format(STARTING_BUDGET_KRW)}원</Text>
                </View>
                <Text style={styles.playMoneyHint}>이 돈 안에서 물건을 골라 봐요.</Text>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle} accessibilityRole="header">우리 가게 물건</Text>
                <Text style={styles.count}>{sampleProducts.length}가지</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.product}>
              {/* 상품 설명만 묶어서 읽고, 담기 버튼은 독립적으로 선택할 수 있게 합니다. */}
              <View
                accessible
                accessibilityLabel={item.name + ', ' + item.unit + ', 연습용 가격 ' + won.format(item.priceKrw) + '원'}
              >
                <View style={[styles.productPicture, { backgroundColor: item.color }]}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                </View>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.unit}>{item.unit}</Text>
                <Text style={styles.price}>{won.format(item.priceKrw)}원</Text>
              </View>
              <QuantityControl
                productId={item.id}
                productName={item.name}
                quantity={cart[item.id] ?? 0}
                onAdd={() => dispatch({ type: 'add', productId: item.id })}
                onDecrease={() => dispatch({ type: 'decrease', productId: item.id })}
              />
            </View>
          )}
          ListFooterComponent={
            <View>
              <View style={styles.cart}>
                <View style={styles.cartHeading}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">내 장바구니</Text>
                  <Text style={styles.count}>{summary.distinctProducts}가지 · {summary.totalQuantity}개</Text>
                </View>
                <Text style={styles.cartHint}>물건은 한 종류에 9개까지 담을 수 있어요.</Text>
                {selectedProducts.length === 0 ? (
                  <View style={styles.emptyCart}>
                    <Text style={styles.emptyIcon} accessible={false}>🧺</Text>
                    <Text testID="cart-empty" style={styles.emptyTitle}>아직 장바구니가 비어 있어요</Text>
                    <Text style={styles.footerText}>마음에 드는 물건의 담기를 눌러 보세요.</Text>
                  </View>
                ) : (
                  <View>
                    {selectedProducts.map((product) => (
                      <View key={product.id} style={styles.cartItem}>
                        <View style={styles.cartItemInfo}>
                          <Text style={styles.cartItemName}>{product.emoji} {product.name}</Text>
                          <Text style={styles.cartItemDetail}>
                            {won.format(product.priceKrw)}원 × {cart[product.id]}개
                          </Text>
                          <Text style={styles.cartItemPrice}>
                            {won.format(product.priceKrw * cart[product.id])}원
                          </Text>
                        </View>
                        <Pressable
                          testID={'cart-' + product.id + '-remove'}
                          accessibilityRole="button"
                          accessibilityLabel={product.name + ' 모두 빼기'}
                          onPress={() => dispatch({ type: 'remove', productId: product.id })}
                          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.removeLabel}>빼기</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      testID="cart-clear"
                      accessibilityRole="button"
                      accessibilityLabel="장바구니 비우기"
                      onPress={() => dispatch({ type: 'clear' })}
                      style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.removeLabel}>장바구니 비우기</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <PaymentSelector
                totalPriceKrw={summary.totalPriceKrw}
                selectedPaymentKrw={selectedPaymentKrw}
                onSelect={(amountKrw) => dispatch({ type: 'select-payment', amountKrw })}
                onClear={() => dispatch({ type: 'clear-payment' })}
              />
            </View>
          }
        />
        {/* 합계는 별도 상태로 저장하지 않아 수량과 금액이 서로 어긋나는 일을 막습니다. */}
        <View
          testID="cart-summary"
          style={styles.summary}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={'장바구니 총 ' + summary.totalQuantity + '개, 합계 ' + won.format(summary.totalPriceKrw) + '원. 오늘의 놀이돈 ' + won.format(STARTING_BUDGET_KRW) + '원. ' + budgetLabel + ' ' + won.format(budgetAmountKrw) + '원. ' + budgetHint}
        >
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>🧺 담은 물건 {summary.totalQuantity}개</Text>
            <Text style={styles.summaryPrice}>{won.format(summary.totalPriceKrw)}원</Text>
          </View>
          {/* 색만으로 구분하지 않고 남을 돈과 부족한 돈을 글자로도 알려줍니다. */}
          <View style={[styles.balanceRow, budget.status === 'over' && styles.balanceOver]}>
            <Text style={[styles.balanceLabel, budget.status === 'over' && styles.shortfallText]}>
              {budgetLabel}
            </Text>
            <Text style={[styles.balanceAmount, budget.status === 'over' && styles.shortfallText]}>
              {won.format(budgetAmountKrw)}원
            </Text>
          </View>
          <Text style={styles.summaryHint}>{budgetHint}</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF8F0' },
  deviceRunMarker: { color: '#4E6653', fontSize: 12, marginBottom: 8 },
  list: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  content: { padding: 20, paddingBottom: 36 },
  row: { gap: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  brandIcon: { fontSize: 25 },
  brandName: { fontSize: 22, fontWeight: '800', color: '#234F40' },
  badge: { backgroundColor: '#E6EEDC', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#36543A' },
  welcome: { backgroundColor: '#E9EEDC', borderRadius: 24, overflow: 'hidden', paddingTop: 26 },
  eyebrow: { color: '#416A45', fontSize: 16, fontWeight: '700', paddingHorizontal: 24 },
  title: { color: '#204839', fontSize: 34, fontWeight: '800', lineHeight: 45, paddingHorizontal: 24, marginTop: 8 },
  description: { color: '#46614D', fontSize: 17, lineHeight: 27, paddingHorizontal: 24, marginTop: 12, marginBottom: 26 },
  awning: { flexDirection: 'row', height: 18 },
  stripe: { flex: 1, backgroundColor: '#F3D28A', borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  greenStripe: { backgroundColor: '#6D8D69' },
  notice: { marginTop: 18, borderWidth: 1, borderColor: '#E4D8B5', borderRadius: 16, padding: 16, backgroundColor: '#FFF9E8' },
  noticeTitle: { color: '#765522', fontWeight: '700', fontSize: 16 },
  noticeText: { color: '#705C3B', fontSize: 14, lineHeight: 22, marginTop: 6 },
  sectionHeading: { marginTop: 28, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  count: { fontSize: 15, color: '#596B5B' },
  product: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEDE3', borderRadius: 20, padding: 12, marginBottom: 14 },
  productPicture: { borderRadius: 14, minHeight: 110, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 54 },
  productName: { fontSize: 19, fontWeight: '700', color: '#293D31', marginTop: 14 },
  unit: { fontSize: 14, color: '#627064', marginTop: 5 },
  price: { fontSize: 22, fontWeight: '800', color: '#255B42', marginTop: 10 },
  cart: { borderRadius: 20, padding: 18, backgroundColor: '#EAF0E5', marginTop: 14 },
  cartHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  cartHint: { fontSize: 13, lineHeight: 21, color: '#4E6653', marginTop: 8 },
  emptyCart: { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { fontSize: 38, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#315239', textAlign: 'center' },
  footerText: { fontSize: 15, lineHeight: 25, color: '#4E6653', marginTop: 8, textAlign: 'center' },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#CDD9C6' },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 18, fontWeight: '700', color: '#293D31' },
  cartItemDetail: { fontSize: 14, lineHeight: 22, color: '#4E6653', marginTop: 6 },
  cartItemPrice: { fontSize: 19, fontWeight: '700', color: '#255B42', marginTop: 5 },
  removeButton: { minWidth: 56, minHeight: 48, backgroundColor: '#FFFFFF', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 10 },
  removeLabel: { color: '#315239', fontSize: 15, fontWeight: '700' },
  clearButton: { minHeight: 48, marginTop: 18, borderWidth: 1, borderColor: '#91A688', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12 },
  pressed: { opacity: 0.7 },
  summary: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#DDE4D5' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  summaryLabel: { fontSize: 16, fontWeight: '700', color: '#315239' },
  summaryPrice: { fontSize: 25, fontWeight: '800', color: '#255B42' },
  playMoney: { marginTop: 18, padding: 16, backgroundColor: '#EAF0E5', borderRadius: 16 },
  playMoneyLabel: { fontSize: 17, fontWeight: '700', color: '#315239' },
  playMoneyAmount: { fontSize: 24, fontWeight: '800', color: '#255B42' },
  playMoneyHint: { fontSize: 14, lineHeight: 22, color: '#4E6653', marginTop: 6 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10, borderRadius: 12, backgroundColor: '#EAF0E5', paddingHorizontal: 12, paddingVertical: 8 },
  balanceOver: { backgroundColor: '#FFF0D7' },
  balanceLabel: { fontSize: 16, fontWeight: '700', color: '#315239' },
  balanceAmount: { fontSize: 22, fontWeight: '800', color: '#255B42' },
  shortfallText: { color: '#7B4A16' },
  summaryHint: { fontSize: 13, lineHeight: 20, color: '#627064', marginTop: 6 },
});
