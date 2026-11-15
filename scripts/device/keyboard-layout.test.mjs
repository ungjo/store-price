import test from 'node:test';
import assert from 'node:assert/strict';
import { assertKeyboardLayout, parseBounds, visibleKeyboardFrame } from './keyboard-layout.mjs';

const node = (id, bounds, extra = {}) => ({ attributes: { 'resource-id': id, bounds, ...extra }, enabled: true });
function fixture() {
  return {
    hierarchy: { children: [
      { ...node('quiz-answer', '[80,900][1100,1100]', { text: '12345' }), focused: true },
      node('quiz-check', '[80,1130][1360,1330]'),
    ] },
    windowDump: 'mCurrentFocus=Window{abc u0 host.exp.exponent/experience.HomeActivity}\nInsetsSource: type=ime frame=[0,1700][1440,3120] visible=true flags=[]',
    inputMethodDump: 'mInputShown=true', expectedAnswer: '12345', screenSize: { width: 1440, height: 3120 },
  };
}

test('full input and button above the real keyboard pass, with duplicate identical inset records', () => {
  const value = fixture(); value.windowDump += '\nInsetsSource: type=ime frame=[0,1700][1440,3120] visible=true';
  const result = assertKeyboardLayout(value);
  assert.equal(result.answerLength, 5); assert.equal(result.keyboard.top, 1700); assert.equal(result.focused, true);
});
test('hidden keyboard, another app and missing or contradictory IME frames fail', () => {
  const f = fixture();
  assert.throws(() => visibleKeyboardFrame(f.windowDump, 'mInputShown=false'));
  assert.throws(() => visibleKeyboardFrame(f.windowDump.replace('host.exp.exponent', 'other.app'), f.inputMethodDump));
  assert.throws(() => visibleKeyboardFrame(f.windowDump.replace('visible=true', 'visible=false'), f.inputMethodDump));
  assert.throws(() => visibleKeyboardFrame(f.windowDump + '\ntype=ime frame=[0,1600][1440,3120] visible=true', f.inputMethodDump));
});
test('observed Android 17 visibleFrame between frame and visibility is supported', () => {
  const f = fixture();
  f.windowDump = f.windowDump.replace('frame=[0,1700][1440,3120]', 'frame=[0,1798][1440,3120] visibleFrame=[0,1798][1440,3120]');
  assert.equal(assertKeyboardLayout(f).keyboard.top, 1798);
  assert.throws(() => assertKeyboardLayout({ ...f, windowDump: f.windowDump.replace('visible=true', 'visible=false') }));
});
test('clipped input or partially obscured check button fails even if its center is visible', () => {
  for (const [index, bounds] of [[0, '[-1,900][1100,1100]'], [0, '[80,900][1441,1100]'], [1, '[80,1600][1360,1800]']]) {
    const f = fixture(); f.hierarchy.children[index].attributes.bounds = bounds;
    assert.throws(() => assertKeyboardLayout(f));
  }
});
test('duplicate, missing, disabled and overlapping controls fail', () => {
  const duplicate = fixture(); duplicate.hierarchy.children.push(duplicate.hierarchy.children[0]);
  assert.throws(() => assertKeyboardLayout(duplicate));
  const missing = fixture(); missing.hierarchy.children.pop(); assert.throws(() => assertKeyboardLayout(missing));
  const disabled = fixture(); disabled.hierarchy.children[1].enabled = false; assert.throws(() => assertKeyboardLayout(disabled));
  const overlap = fixture(); overlap.hierarchy.children[1].attributes.bounds = '[100,1000][1300,1200]';
  assert.throws(() => assertKeyboardLayout(overlap));
});
test('wrong answer, lost focus and malformed native evidence cannot produce a success', () => {
  const wrong = fixture(); wrong.expectedAnswer = '3500'; assert.throws(() => assertKeyboardLayout(wrong));
  const unfocused = fixture(); unfocused.hierarchy.children[0].focused = false; assert.throws(() => assertKeyboardLayout(unfocused));
  const malformed = fixture(); malformed.hierarchy = '{'; assert.throws(() => assertKeyboardLayout(malformed));
  assert.throws(() => parseBounds('[0,0][0,100]')); assert.throws(() => parseBounds('unknown'));
});
