import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { getPaymentSummary, PAYMENT_OPTIONS_KRW } from '../features/payment/payment';

import { type ChangeQuizState } from '../features/payment/change-quiz';
import { ChangeQuiz } from './change-quiz';

type PaymentSelectorProps = {
  totalPriceKrw: number;
  selectedPaymentKrw: number | null;
  onSelect: (amountKrw: number) => void;
  onClear: () => void;
  quiz: ChangeQuizState;
  onAnswer: (answer: string) => void;
  onCheck: () => void;
  onRetry: () => void;
};

const won = new Intl.NumberFormat('ko-KR');

export function PaymentSelector({
  totalPriceKrw,
  selectedPaymentKrw,
  onSelect,
  onClear,
  quiz,
  onAnswer,
  onCheck,
  onRetry,
}: PaymentSelectorProps) {
  const payment = getPaymentSummary(totalPriceKrw, selectedPaymentKrw);
  const disabled = payment.status === 'empty' || payment.status === 'over-budget';
  const needsMoreMoney = payment.status === 'insufficient';
  const message = payment.status === 'empty'
    ? '먼저 물건을 담아 주세요.'
    : payment.status === 'over-budget'
      ? '물건을 조금 빼고 놀이돈을 골라요.'
      : payment.status === 'unselected'
        ? '낼 놀이돈을 하나 골라 주세요.'
        : needsMoreMoney
          ? won.format(payment.missingAmountKrw) + '원이 더 필요해요.'
          : '이 돈으로 계산할 수 있어요!';

  return (
    <View testID="payment-selector" style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">낼 놀이돈 고르기</Text>
      <Text style={styles.hint}>한 번에 한 금액을 골라요.</Text>
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>물건값</Text>
        <Text style={styles.price}>{won.format(totalPriceKrw)}원</Text>
      </View>

      {/* 색과 함께 글자·접근성 상태를 바꿔 어떤 금액을 골랐는지 알 수 있게 합니다. */}
      {PAYMENT_OPTIONS_KRW.map((amountKrw) => {
        const selected = amountKrw === selectedPaymentKrw;
        return (
          <Pressable
            key={amountKrw}
            testID={'payment-option-' + amountKrw}
            accessibilityRole="button"
            accessibilityLabel={won.format(amountKrw) + '원 놀이돈 고르기'}
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            onPress={() => { Keyboard.dismiss(); onSelect(amountKrw); }}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selectedOption,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.optionAmount, selected && styles.selectedText]}>
              {won.format(amountKrw)}원
            </Text>
            <Text style={[styles.optionLabel, selected && styles.selectedText]}>
              {selected ? '선택됨' : '고르기'}
            </Text>
          </Pressable>
        );
      })}

      {/* 결과 영역만 묶어 읽게 하여 돈을 고르는 버튼은 각각 조작할 수 있게 둡니다. */}
      <View
        testID="payment-result"
        style={[styles.result, needsMoreMoney && styles.insufficient]}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={'선택한 돈 ' + (selectedPaymentKrw === null ? '없음' : won.format(selectedPaymentKrw) + '원') + '. ' + message}
      >
        <Text style={styles.resultLabel}>선택한 돈</Text>
        <Text style={styles.resultAmount}>
          {selectedPaymentKrw === null ? '아직 안 골랐어요' : won.format(selectedPaymentKrw) + '원'}
        </Text>
        <Text style={[styles.message, needsMoreMoney && styles.insufficientText]}>{message}</Text>
      </View>
      {/* 0원도 문제로 풀 수 있게 null과 구분하며, 계산식은 정답을 맞힌 뒤에만 공개합니다. */}
      {payment.changeAmountKrw !== null && selectedPaymentKrw !== null && (
        <ChangeQuiz
          totalPriceKrw={totalPriceKrw}
          selectedPaymentKrw={selectedPaymentKrw}
          quiz={quiz}
          onAnswer={onAnswer}
          onCheck={onCheck}
          onRetry={onRetry}
        />
      )}
      {payment.changeAmountKrw !== null && selectedPaymentKrw !== null && quiz.status === 'correct' && (
        <View
          testID="payment-change"
          style={styles.changeResult}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={'받을 거스름돈 ' + won.format(payment.changeAmountKrw) + '원. 낼 돈 ' + won.format(selectedPaymentKrw) + '원 빼기 물건값 ' + won.format(totalPriceKrw) + '원은 ' + won.format(payment.changeAmountKrw) + '원.'}
        >
          <Text style={styles.changeLabel}>받을 거스름돈</Text>
          <Text style={styles.changeAmount}>{won.format(payment.changeAmountKrw)}원</Text>
          <Text style={styles.changeRule}>낼 돈 − 물건값</Text>
          <Text style={styles.changeEquation}>
            {won.format(selectedPaymentKrw)}원 − {won.format(totalPriceKrw)}원 = {won.format(payment.changeAmountKrw)}원
          </Text>
          <Text style={styles.changeHint}>
            {payment.changeAmountKrw === 0
              ? '딱 맞게 골랐어요. 거스름돈은 0원이에요.'
              : '이 돈을 내면 돌려받을 돈이에요.'}
          </Text>
        </View>
      )}
      {selectedPaymentKrw !== null && (
        <Pressable
          testID="payment-clear"
          accessibilityRole="button"
          accessibilityLabel="놀이돈 선택 취소"
          onPress={() => { Keyboard.dismiss(); onClear(); }}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        >
          <Text style={styles.clearLabel}>선택 취소</Text>
        </Pressable>
      )}
      <Text style={styles.resetHint}>물건을 바꾸면 놀이돈을 다시 골라요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, borderRadius: 20, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7DB' },
  title: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  hint: { fontSize: 15, lineHeight: 24, color: '#4E6653', marginTop: 8 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginVertical: 16 },
  priceLabel: { fontSize: 17, color: '#315239', fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '800', color: '#255B42' },
  option: { minHeight: 60, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#C8D5BF', borderRadius: 14, backgroundColor: '#F5F8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  selectedOption: { backgroundColor: '#295C43', borderColor: '#295C43' },
  optionAmount: { fontSize: 23, fontWeight: '800', color: '#255B42' },
  optionLabel: { fontSize: 15, fontWeight: '700', color: '#315239' },
  selectedText: { color: '#FFFFFF' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  result: { backgroundColor: '#EAF0E5', borderRadius: 14, padding: 14, marginTop: 4 },
  insufficient: { backgroundColor: '#FFF0D7' },
  resultLabel: { fontSize: 15, color: '#4E6653' },
  resultAmount: { fontSize: 22, fontWeight: '800', color: '#255B42', marginTop: 6 },
  message: { fontSize: 16, lineHeight: 25, color: '#315239', fontWeight: '700', marginTop: 8 },
  insufficientText: { color: '#7B4A16' },
  changeResult: { backgroundColor: '#FFF5D8', borderColor: '#E9D49C', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  changeLabel: { fontSize: 18, fontWeight: '700', color: '#60431C' },
  changeAmount: { fontSize: 28, fontWeight: '800', color: '#60431C', marginTop: 6 },
  changeRule: { fontSize: 14, color: '#70532C', marginTop: 12 },
  changeEquation: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: '#60431C', marginTop: 4 },
  changeHint: { fontSize: 15, lineHeight: 24, color: '#70532C', marginTop: 8 },
  clearButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#91A688', marginTop: 12 },
  clearLabel: { fontSize: 15, fontWeight: '700', color: '#315239' },
  resetHint: { fontSize: 13, lineHeight: 21, color: '#627064', marginTop: 12 },
});
