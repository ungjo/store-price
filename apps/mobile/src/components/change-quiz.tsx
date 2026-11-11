import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MAX_CHANGE_ANSWER_LENGTH, type ChangeQuizState } from '../features/payment/change-quiz';

type ChangeQuizProps = {
  totalPriceKrw: number;
  selectedPaymentKrw: number;
  quiz: ChangeQuizState;
  onAnswer: (answer: string) => void;
  onCheck: () => void;
  onRetry: () => void;
};

const won = new Intl.NumberFormat('ko-KR');
const feedback = {
  unanswered: '거스름돈을 숫자로 적고 정답 확인을 눌러 주세요.',
  invalid: '숫자만 입력해 주세요. 거스름돈이 없으면 0을 적어요.',
  incorrect: '다시 생각해 볼까요? 낼 돈에서 물건값을 빼 보세요.',
  correct: '정답이에요! 거스름돈을 잘 계산했어요.',
};

export function ChangeQuiz({ totalPriceKrw, selectedPaymentKrw, quiz, onAnswer, onCheck, onRetry }: ChangeQuizProps) {
  const solved = quiz.status === 'correct';
  const canRetry = quiz.answer !== '' || quiz.status !== 'unanswered';
  const checkAnswer = () => {
    // 채점 뒤에는 키보드를 닫아 정답 안내와 계산식을 바로 읽을 수 있게 합니다.
    Keyboard.dismiss();
    onCheck();
  };

  return (
    <View testID="payment-quiz" style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">거스름돈 맞히기</Text>
      <Text
        testID="quiz-question"
        style={styles.question}
        accessibilityLabel={'낼 돈 ' + won.format(selectedPaymentKrw) + '원, 물건값 ' + won.format(totalPriceKrw) + '원. 거스름돈은 얼마일까요?'}
      >
        낼 돈 {won.format(selectedPaymentKrw)}원{ '\n' }
        물건값 {won.format(totalPriceKrw)}원{ '\n' }
        거스름돈은 얼마일까요?
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          testID="quiz-answer"
          accessibilityLabel="거스름돈 답 입력"
          accessibilityState={{ disabled: solved }}
          value={quiz.answer}
          onChangeText={onAnswer}
          onSubmitEditing={checkAnswer}
          editable={!solved}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={MAX_CHANGE_ANSWER_LENGTH}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="답 입력"
          placeholderTextColor="#657365"
          style={[styles.input, solved && styles.solvedInput]}
        />
        <Text style={styles.unit}>원</Text>
        {/* 키보드와 하단 요약이 화면을 줄여도 입력칸과 채점 버튼을 함께 볼 수 있게 나란히 둡니다. */}
        {!solved && (
          <Pressable
            testID="quiz-check"
            accessibilityRole="button"
            accessibilityLabel="정답 확인"
            onPress={checkAnswer}
            style={({ pressed }) => [styles.checkButton, pressed && styles.pressed]}
          >
            <Text style={styles.checkText}>정답{'\n'}확인</Text>
          </Pressable>
        )}
      </View>
      <Text
        testID="quiz-feedback"
        style={[styles.feedback, solved && styles.correctFeedback]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={feedback[quiz.status]}
      >
        {feedback[quiz.status]}
      </Text>
      {canRetry && (
        <Pressable
          testID="quiz-retry"
          accessibilityRole="button"
          onPress={() => { Keyboard.dismiss(); onRetry(); }}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>다시 풀기</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#C8D5BF', backgroundColor: '#F4F7EF' },
  title: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  question: { fontSize: 18, lineHeight: 28, color: '#315239', marginTop: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  input: { flex: 1, minWidth: 100, minHeight: 64, borderWidth: 2, borderColor: '#73936A', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontSize: 25, color: '#234F40', fontWeight: '700' },
  solvedInput: { borderColor: '#C8D5BF', backgroundColor: '#EAF0E5' },
  unit: { fontSize: 20, color: '#315239', fontWeight: '700' },
  checkButton: { width: 72, minHeight: 64, borderRadius: 12, backgroundColor: '#295C43', alignItems: 'center', justifyContent: 'center', padding: 8 },
  checkText: { fontSize: 16, lineHeight: 22, textAlign: 'center', fontWeight: '700', color: '#FFFFFF' },
  feedback: { fontSize: 16, lineHeight: 26, color: '#4E6653', marginTop: 12 },
  correctFeedback: { color: '#255B42', fontWeight: '700' },
  retryButton: { minHeight: 48, borderWidth: 1, borderColor: '#91A688', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 10 },
  retryText: { fontSize: 16, fontWeight: '700', color: '#315239' },
  pressed: { opacity: 0.7 },
});
