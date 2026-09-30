// The note editor's formatting buttons (v1 mdFormat, notes.js): a plain textarea
// and Markdown marks inserted around the selection — no WYSIWYG. Pure: text and
// selection in, text and selection out; the component applies the result.

export type MarkdownFormat = 'bold' | 'italic' | 'heading' | 'bullets' | 'numbers';

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const INLINE: Partial<Record<MarkdownFormat, string>> = { bold: '**', italic: '_' };
const LINE_PREFIX: Partial<Record<MarkdownFormat, (index: number) => string>> = {
  heading: () => '## ',
  bullets: () => '- ',
  numbers: (i) => `${i + 1}. `,
};

export function applyMarkdownFormat(value: string, start: number, end: number, format: MarkdownFormat): TextEdit {
  const prefix = LINE_PREFIX[format];
  if (prefix) {
    // A line format applies to every line the selection touches (the caret's line when empty).
    const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const found = value.indexOf('\n', end);
    const lineEnd = found === -1 ? value.length : found;
    const out = value
      .slice(lineStart, lineEnd)
      .split('\n')
      .map((line, i) => prefix(i) + line)
      .join('\n');
    return {
      value: value.slice(0, lineStart) + out + value.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart + out.length,
    };
  }
  const mark = INLINE[format] ?? '';
  const selected = value.slice(start, end);
  // The selection stays on the text inside the marks, so typing can go on.
  return {
    value: value.slice(0, start) + mark + selected + mark + value.slice(end),
    selectionStart: start + mark.length,
    selectionEnd: start + mark.length + selected.length,
  };
}
