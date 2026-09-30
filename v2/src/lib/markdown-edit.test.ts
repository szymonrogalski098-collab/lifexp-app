import { describe, expect, test } from 'vitest';
import { applyMarkdownFormat } from './markdown-edit';

describe('inline marks (v1 mdFormat bold/italic)', () => {
  test('around the selection, which stays on the text', () => {
    expect(applyMarkdownFormat('kup mleko', 4, 9, 'bold')).toEqual({
      value: 'kup **mleko**',
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  test('an empty selection gets an empty pair with the caret inside', () => {
    expect(applyMarkdownFormat('ab', 1, 1, 'italic')).toEqual({ value: 'a__b', selectionStart: 2, selectionEnd: 2 });
  });
});

describe('line prefixes (v1 mdFormat head/ul/ol)', () => {
  test('every line the selection touches; numbers count from 1', () => {
    const value = 'intro\nmleko\nchleb\nkoniec';
    const start = value.indexOf('lek');
    const end = value.indexOf('hle');
    expect(applyMarkdownFormat(value, start, end, 'numbers')).toEqual({
      value: 'intro\n1. mleko\n2. chleb\nkoniec',
      selectionStart: 6,
      selectionEnd: 23,
    });
  });

  test("the caret's line when nothing is selected, also on the first line", () => {
    expect(applyMarkdownFormat('Zakupy\nlista', 2, 2, 'heading').value).toBe('## Zakupy\nlista');
    expect(applyMarkdownFormat('a\nb', 3, 3, 'bullets').value).toBe('a\n- b');
  });
});
