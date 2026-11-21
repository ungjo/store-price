import { Keyboard, TextInput, View } from 'react-native';
import { MAX_CHANGE_ANSWER_LENGTH, type ChangeQuizState } from '../features/payment/change-quiz';
import { ActionButton, Body, Card, Title, ui, won } from './book-ui';

type Props = {
  quiz: ChangeQuizState;
  totalPriceKrw: number;
  selectedPaymentKrw: number;
  onAnswer: (answer: string) => void;
  onCheck: () => void;
  onRetry: () => void;
};

export function QuizPanel({ quiz, totalPriceKrw, selectedPaymentKrw, onAnswer, onCheck, onRetry }: Props) {
  const correct = quiz.status === 'correct';
  const guidance = quiz.status === 'invalid' ? '0부터 9까지의 숫자로 답을 입력해 주세요.'
    : quiz.status === 'incorrect' ? '다시 생각해 볼까요? 낼 돈에서 물건값을 빼 보세요.'
      : correct ? '정답이에요! 계산을 마칠 준비가 되었어요.' : '받을 거스름돈은 얼마일까요?';
  return (
    <Card>
      <Title>거스름돈 맞히기</Title>
      <Body>낼 돈 {won(selectedPaymentKrw)} − 물건값 {won(totalPriceKrw)}</Body>
      <View style={ui.row}>
        <TextInput value={quiz.answer} onChangeText={onAnswer}
          keyboardType="number-pad" maxLength={MAX_CHANGE_ANSWER_LENGTH}
          editable={!correct} placeholder="답 입력" accessibilityLabel="거스름돈 답"
          testID="quiz-answer" style={ui.input} />
        <ActionButton title="정답 확인" testID="quiz-check" disabled={correct}
          onPress={() => { Keyboard.dismiss(); onCheck(); }} />
      </View>
      <Body>{guidance}</Body>
      {correct && <Body>받을 거스름돈 {won(selectedPaymentKrw - totalPriceKrw)}</Body>}
      <ActionButton title="다시 풀기" secondary testID="quiz-retry"
        onPress={() => { Keyboard.dismiss(); onRetry(); }} />
    </Card>
  );
}
