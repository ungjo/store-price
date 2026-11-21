export const MAX_CHANGE_ANSWER_LENGTH = 5;

export type ChangeQuizState = {
  answer: string;
  status: 'unanswered' | 'invalid' | 'incorrect' | 'correct';
};

export function gradeChangeAnswer(
  answer: string,
  expected: number,
): Exclude<ChangeQuizState['status'], 'unanswered'> {
  // 빈 입력을 0원으로 바꾸거나 쉼표·소수를 몰래 보정하지 않고, 아이가 입력한 원 단위 숫자만 채점합니다.
  // 숫자 외 문자를 따로 검사해 줄바꿈이나 다른 문자권의 숫자도 정답으로 통과하지 못하게 합니다.
  if (answer.length === 0 || answer.length > MAX_CHANGE_ANSWER_LENGTH || /[^0-9]/u.test(answer)) {
    return 'invalid';
  }

  return Number(answer) === expected ? 'correct' : 'incorrect';
}
