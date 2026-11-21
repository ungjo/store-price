import { View } from 'react-native';
import { getPaymentSummary, PAYMENT_OPTIONS_KRW } from '../features/payment/payment';
import { ActionButton, Body, Card, Title, ui, won } from './book-ui';

type Props = {
  totalPriceKrw: number;
  selectedPaymentKrw: number | null;
  onSelect: (amount: number) => void;
  onClear: () => void;
  revealChange?: boolean;
};

export function PaymentPanel({ totalPriceKrw, selectedPaymentKrw, onSelect, onClear, revealChange = true }: Props) {
  const result = getPaymentSummary(totalPriceKrw, selectedPaymentKrw);
  const disabled = result.status === 'empty' || result.status === 'over-budget';
  // 먼저 해결할 상태를 우선 안내해 빈 장바구니에서 돈 선택을 유도하지 않습니다.
  const guidance = result.status === 'empty' ? '먼저 물건을 담아 주세요.'
    : result.status === 'over-budget' ? '물건을 조금 빼고 놀이돈을 골라요.'
      : result.status === 'unselected' ? '낼 놀이돈을 하나 골라 주세요.'
        : result.status === 'insufficient' ? won(result.missingAmountKrw) + '이 더 필요해요.'
          : '이 돈으로 계산할 수 있어요!';
  return (
    <Card>
      <Title>낼 놀이돈 고르기</Title>
      <Body>물건값 {won(totalPriceKrw)}</Body>
      <View style={ui.row}>
        {PAYMENT_OPTIONS_KRW.map((amount) => (
          <ActionButton key={amount} title={won(amount) + (amount === selectedPaymentKrw ? ' 선택됨' : ' 고르기')}
            selected={amount === selectedPaymentKrw} disabled={disabled}
            testID={'payment-option-' + amount} onPress={() => onSelect(amount)} />
        ))}
      </View>
      <Body>{selectedPaymentKrw === null ? '아직 안 골랐어요' : '선택한 돈 ' + won(selectedPaymentKrw)}</Body>
      <Body>{guidance}</Body>
      {selectedPaymentKrw !== null && <ActionButton title="선택 취소" secondary testID="payment-clear" onPress={onClear} />}
      {revealChange && result.changeAmountKrw !== null && selectedPaymentKrw !== null && (
        <Body>받을 거스름돈 {won(result.changeAmountKrw)} · {won(selectedPaymentKrw)} − {won(totalPriceKrw)}</Body>
      )}
    </Card>
  );
}
