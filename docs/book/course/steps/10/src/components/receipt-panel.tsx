import { Text, View } from 'react-native';
import type { Receipt } from '../features/payment/receipt';
import { ActionButton, Body, Card, Title, ui, won } from './book-ui';

export function ReceiptPanel({ receipt, onNewRound }: { receipt: Receipt; onNewRound: () => void }) {
  return (
    <Card>
      <Title>놀이 영수증</Title>
      <Body>장보기를 잘 마쳤어요!</Body>
      {receipt.items.map((item) => (
        <View key={item.productId} style={ui.line}>
          <Text style={ui.body}>{item.name} · {item.unit}</Text>
          <Body>{won(item.unitPriceKrw)} × {item.quantity} = {won(item.lineTotalKrw)}</Body>
        </View>
      ))}
      <Text style={ui.price}>총 {receipt.totalQuantity}개 · {won(receipt.totalPriceKrw)}</Text>
      <Body>낸 놀이돈 {won(receipt.paidAmountKrw)}</Body>
      <Body>받은 거스름돈 {won(receipt.changeAmountKrw)}</Body>
      <Body>계산 후 남은 놀이돈 {won(receipt.remainingBudgetKrw)}</Body>
      <Body>다시 장보기는 새 놀이돈 10,000원으로 시작해요.</Body>
      <ActionButton title="다시 장보기" testID="receipt-new-round" onPress={onNewRound} />
    </Card>
  );
}
