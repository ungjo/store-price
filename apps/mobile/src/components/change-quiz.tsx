import { type ComponentRef, useEffect, useRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { MAX_CHANGE_ANSWER_LENGTH, type ChangeQuizState } from '../features/payment/change-quiz';
import { useAccessibilityFocus } from '../features/accessibility/use-accessibility-focus';

type ChangeQuizProps = {
  totalPriceKrw: number;
  selectedPaymentKrw: number;
  quiz: ChangeQuizState;
  onAnswer: (answer: string) => void;
  onAnswerFocus?: (region: ComponentRef<typeof View> | null) => void;
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

export function ChangeQuiz({ totalPriceKrw, selectedPaymentKrw, quiz, onAnswer, onAnswerFocus, onCheck, onRetry }: ChangeQuizProps) {
  const { width, fontScale } = useWindowDimensions();
  // 입력칸뿐 아니라 채점 버튼까지 키보드 위로 올릴 수 있게 전체 영역을 부모에게 전달합니다.
  const rowRef = useRef<ComponentRef<typeof View>>(null);
  // 큰 글자를 줄이지 않고 답 입력 폭을 확보하도록 좁은 화면에서는 채점 버튼을 아래로 옮깁니다.
  const stacked = width < 380 || fontScale > 1.2;
  const solved = quiz.status === 'correct';
  const answerRef = useRef<ComponentRef<typeof TextInput>>(null);
  const restoreAnswerFocus = useRef(false);
  const focusAnswer = useAccessibilityFocus(answerRef, { afterKeyboardHides: true });
  const feedbackRef = useRef<ComponentRef<typeof Text>>(null);
  const focusFeedback = useAccessibilityFocus(feedbackRef, { afterKeyboardHides: true });
  useEffect(() => {
    // 정답 확인 버튼이 사라진 자리에서 초점을 잃지 않고 다음 결과를 읽게 합니다.
    if (solved) return focusFeedback();
  }, [solved, focusFeedback]);
  useEffect(() => {
    if (restoreAnswerFocus.current && quiz.answer === '' && quiz.status === 'unanswered') {
      restoreAnswerFocus.current = false;
      return focusAnswer();
    }
  }, [quiz.answer, quiz.status, focusAnswer]);
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
      <View ref={rowRef} collapsable={false} style={[styles.inputRow, stacked && styles.stackedInputRow]}>
        <View style={[styles.answerFields, stacked && styles.stackedAnswerFields]}>
          <TextInput
            ref={answerRef}
            testID="quiz-answer"
            accessibilityLabel="거스름돈 답 입력"
            accessibilityState={{ disabled: solved }}
            value={quiz.answer}
            onChangeText={onAnswer}
            onFocus={() => onAnswerFocus?.(rowRef.current)}
            onBlur={() => onAnswerFocus?.(null)}
            onSubmitEditing={checkAnswer}
            editable={!solved}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={MAX_CHANGE_ANSWER_LENGTH}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="답 입력"
            placeholderTextColor="#657365"
            style={[styles.input, stacked && styles.stackedInput, solved && styles.solvedInput]}
          />
          <Text style={styles.unit}>원</Text>
        </View>
        {!solved && (
          <Pressable
            testID="quiz-check"
            accessibilityRole="button"
            accessibilityLabel="정답 확인"
            onPress={checkAnswer}
            style={({ pressed }) => [styles.checkButton, stacked && styles.stackedCheckButton, pressed && styles.pressed]}
          >
            <Text style={styles.checkText}>정답 확인</Text>
          </Pressable>
        )}
      </View>
      <Text
        ref={feedbackRef}
        accessible
        testID="quiz-feedback"
        style={[styles.feedback, solved && styles.correctFeedback]}
        accessibilityLiveRegion={solved ? 'none' : 'polite'}
        accessibilityLabel={feedback[quiz.status]}
      >
        {feedback[quiz.status]}
      </Text>
      {canRetry && (
        <Pressable
          testID="quiz-retry"
          accessibilityRole="button"
          onPress={() => {
            // 사라지는 다시 풀기 버튼 대신 빈 입력칸을 읽게 하되, 키보드를 강제로 열지는 않습니다.
            restoreAnswerFocus.current = true;
            Keyboard.dismiss();
            onRetry();
          }}
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
  stackedInputRow: { flexDirection: 'column', alignItems: 'stretch' },
  answerFields: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stackedAnswerFields: { flex: 0, width: '100%' },
  input: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 2, borderColor: '#73936A', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontSize: 25, color: '#234F40', fontWeight: '700' },
  stackedInput: { paddingHorizontal: 8 },
  solvedInput: { borderColor: '#C8D5BF', backgroundColor: '#EAF0E5' },
  unit: { fontSize: 20, color: '#315239', fontWeight: '700' },
  checkButton: { minWidth: 72, minHeight: 64, borderRadius: 12, backgroundColor: '#295C43', alignItems: 'center', justifyContent: 'center', padding: 8 },
  stackedCheckButton: { width: '100%' },
  checkText: { fontSize: 16, lineHeight: 22, textAlign: 'center', fontWeight: '700', color: '#FFFFFF' },
  feedback: { fontSize: 16, lineHeight: 26, color: '#4E6653', marginTop: 12 },
  correctFeedback: { color: '#255B42', fontWeight: '700' },
  retryButton: { minHeight: 48, borderWidth: 1, borderColor: '#91A688', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 10 },
  retryText: { fontSize: 16, fontWeight: '700', color: '#315239' },
  pressed: { opacity: 0.7 },
});
