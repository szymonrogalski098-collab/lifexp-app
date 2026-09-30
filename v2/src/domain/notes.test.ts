import { describe, expect, test } from 'vitest';
import { canAddNote, NOTE_MAX_LINES, noteExcerpt, noteProblem, notesInView, NOTES_MAX, type Note } from './notes';

let n = 0;
const note = (patch: Partial<Note> = {}): Note => ({
  id: `n${(n += 1)}`,
  title: 'Tytuł',
  content: '',
  icon: '',
  color: '',
  createdAt: new Date('2026-09-30T10:00:00Z'),
  archived: false,
  ...patch,
});

describe('G15 note rules (v1 saveNote, openNoteEditor)', () => {
  test('G15.1: a title of spaces is no title', () => {
    expect(noteProblem({ title: '   ', content: 'x', color: '' })).toEqual({ kind: 'titleRequired' });
  });

  test('G15.2: 1000 lines pass, 1001 are too many and the message names the count', () => {
    const lines = (count: number) => Array.from({ length: count }, () => 'x').join('\n');
    expect(noteProblem({ title: 'T', content: lines(NOTE_MAX_LINES), color: '' })).toBeNull();
    expect(noteProblem({ title: 'T', content: lines(1001), color: '' })).toEqual({
      kind: 'tooManyLines',
      lines: 1001,
      max: 1000,
    });
  });

  test('G15.3: 30 active notes block a new one; archived notes do not count', () => {
    const active = Array.from({ length: NOTES_MAX }, () => note());
    expect(canAddNote(active)).toBe(false);
    expect(canAddNote([...active.slice(1), note({ archived: true })])).toBe(true);
  });
});

describe('views', () => {
  test('active or archived, newest first; a note without a date goes last', () => {
    const old = note({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const fresh = note({ createdAt: new Date('2026-09-01T00:00:00Z') });
    const undated = note({ createdAt: null });
    const archived = note({ archived: true });
    expect(notesInView([old, undated, fresh, archived], false).map((x) => x.id)).toEqual([fresh.id, old.id, undated.id]);
    expect(notesInView([old, archived], true)).toEqual([archived]);
  });
});

describe('excerpt', () => {
  test('Markdown marks removed, lines joined', () => {
    expect(noteExcerpt('## Zakupy\n- **mleko**\n- _chleb_ i [sklep](https://x.pl)\n1. `kod`')).toBe(
      'Zakupy mleko chleb i sklep kod',
    );
  });

  test('long text is cut with an ellipsis', () => {
    expect(noteExcerpt('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});
