import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { STARTING_BUDGET_KRW } from '../features/budget/budget';
import { type Receipt } from '../features/payment/receipt';

type ShoppingReceiptProps = {
  receipt: Receipt;
  onNewRound: () => void;
};

const won = new Intl.NumberFormat('ko-KR');

export function ShoppingReceipt({ receipt, onNewRound }: ShoppingReceiptProps) {
  return (
    <ScrollView testID="receipt-screen" style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.icon} accessible={false}>🧾</Text>
        <Text style={styles.brand}>꼬마 시장 · 놀이 영수증</Text>
        <Text testID="receipt-title" style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          계산을 마쳤어요!
        </Text>
        <Text style={styles.description}>고른 물건과 돌려받은 돈을 살펴봐요.</Text>
      </View>

      <View style={styles.paper}>
        <Text style={styles.sectionTitle} accessibilityRole="header">내가 산 물건</Text>
        {/* 계산 순간 복사한 내역만 읽어 장바구니를 비운 뒤에도 영수증 금액을 보존합니다. */}
        {receipt.items.map((item) => (
          <View
            key={item.productId}
            testID={'receipt-item-' + item.productId}
            style={styles.item}
            accessible
            accessibilityLabel={item.name + ', ' + item.unit + '. ' + won.format(item.unitPriceKrw) + '원 × ' + item.quantity + '개, ' + won.format(item.lineTotalKrw) + '원.'}
          >
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.unit}>{item.unit}</Text>
            <View style={styles.row}>
              <Text style={styles.detail}>{won.format(item.unitPriceKrw)}원 × {item.quantity}개</Text>
              <Text style={styles.itemTotal}>{won.format(item.lineTotalKrw)}원</Text>
            </View>
          </View>
        ))}
        <View
          testID="receipt-total"
          style={[styles.row, styles.total]}
          accessible
          accessibilityLabel={'총 ' + receipt.totalQuantity + '개, 합계 ' + won.format(receipt.totalPriceKrw) + '원.'}
        >
          <Text style={styles.totalLabel}>총 {receipt.totalQuantity}개</Text>
          <Text style={styles.totalAmount}>{won.format(receipt.totalPriceKrw)}원</Text>
        </View>
        <View
          testID="receipt-payment"
          style={styles.payment}
          accessible
          accessibilityLabel={'낸 놀이돈 ' + won.format(receipt.paidAmountKrw) + '원. 받은 거스름돈 ' + won.format(receipt.changeAmountKrw) + '원. 계산 후 남은 놀이돈 ' + won.format(receipt.remainingBudgetKrw) + '원.'}
        >
          <View style={styles.row}>
            <Text style={styles.label}>낸 놀이돈</Text>
            <Text style={styles.amount}>{won.format(receipt.paidAmountKrw)}원</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>받은 거스름돈</Text>
            <Text style={styles.change}>{won.format(receipt.changeAmountKrw)}원</Text>
          </View>
          <View style={[styles.row, styles.balance]}>
            <Text style={styles.label}>계산 후 남은 놀이돈</Text>
            <Text style={styles.amount}>{won.format(receipt.remainingBudgetKrw)}원</Text>
          </View>
        </View>
      </View>

      <View style={styles.nextRound}>
        <Text style={styles.nextTitle} accessibilityRole="header">한 번 더 장을 볼까요?</Text>
        <Text style={styles.nextHint}>
          다시 시작하면 놀이돈 {won.format(STARTING_BUDGET_KRW)}원과 빈 장바구니로 돌아가요.
        </Text>
        <Pressable
          testID="receipt-new-round"
          accessibilityRole="button"
          accessibilityLabel="다시 장보기"
          onPress={onNewRound}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>다시 장보기</Text>
        </Pressable>
        <Text style={styles.notice}>
          이번 놀이의 영수증이에요. 다시 장보기를 누르거나 앱을 다시 시작하면 사라져요.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 32 },
  heading: { alignItems: 'center', paddingVertical: 16 },
  icon: { fontSize: 44, marginBottom: 10 },
  brand: { fontSize: 16, fontWeight: '700', color: '#627064' },
  title: { fontSize: 28, fontWeight: '800', color: '#255B42', marginTop: 10, textAlign: 'center' },
  description: { fontSize: 16, lineHeight: 25, color: '#4E6653', marginTop: 10, textAlign: 'center' },
  paper: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7DB', borderRadius: 20, padding: 20, marginTop: 16 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  item: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E1E7DB' },
  itemName: { fontSize: 20, fontWeight: '700', color: '#293D31' },
  unit: { fontSize: 14, lineHeight: 22, color: '#627064', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  detail: { fontSize: 16, lineHeight: 26, color: '#4E6653' },
  itemTotal: { fontSize: 19, fontWeight: '700', color: '#255B42' },
  total: { marginTop: 18, paddingBottom: 18, borderBottomWidth: 2, borderStyle: 'dashed', borderBottomColor: '#AABD9F' },
  totalLabel: { fontSize: 18, fontWeight: '700', color: '#315239' },
  totalAmount: { fontSize: 28, fontWeight: '800', color: '#255B42' },
  payment: { paddingTop: 18, gap: 16 },
  label: { fontSize: 16, lineHeight: 25, color: '#4E6653' },
  amount: { fontSize: 20, fontWeight: '700', color: '#255B42' },
  change: { fontSize: 25, fontWeight: '800', color: '#7B4A16' },
  balance: { padding: 12, borderRadius: 12, backgroundColor: '#EAF0E5' },
  nextRound: { marginTop: 24 },
  nextTitle: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  nextHint: { fontSize: 16, lineHeight: 26, color: '#4E6653', marginTop: 8 },
  button: { minHeight: 60, backgroundColor: '#295C43', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  notice: { fontSize: 14, lineHeight: 23, color: '#627064', marginTop: 14 },
  pressed: { opacity: 0.7 },
});
