// Notes as v1 keeps them (notes.js:370-559, docs/v2/GOLDEN.md G15): a title, Markdown
// content, a colour, an archive flag. At most 30 active notes of at most 1000 lines.

/** v1 NOTES_MAX: active notes; archived ones do not count. */
export const NOTES_MAX = 30;
/** v1 NOTE_MAX_LINES. */
export const NOTE_MAX_LINES = 1000;
/** v1's title field (maxlength="80"). */
export const NOTE_TITLE_MAX = 80;

/** v1 NOTE_COLOR_PRESETS, in its order. "" = no colour. */
export const NOTE_COLORS = ['#6c63ff', '#4ecca3', '#ffd700', '#ff6b6b', '#8a8fa8', '#ff9f43', '#00d2d3', '#feca57'] as const;

/** users/{uid}/notes/{id}. */
export interface Note {
  id: string;
  title: string;
  /** Markdown. */
  content: string;
  /** v1 Tabler icon class, kept but not shown (PLAN.md 7.1); "" = none. */
  icon: string;
  /** Hex colour, "" = none. */
  color: string;
  createdAt: Date | null;
  archived: boolean;
}

/** What the editor changes. The icon is not edited in v2 and stays as it was. */
export interface NoteDraft {
  title: string;
  content: string;
  color: string;
}

export type NoteProblem = { kind: 'titleRequired' } | { kind: 'tooManyLines'; lines: number; max: number };

/** v1 saveNote(): a trimmed title is required; the content may have at most NOTE_MAX_LINES lines. */
export function noteProblem(draft: NoteDraft): NoteProblem | null {
  if (!draft.title.trim()) return { kind: 'titleRequired' };
  const lines = draft.content.split('\n').length;
  if (lines > NOTE_MAX_LINES) return { kind: 'tooManyLines', lines, max: NOTE_MAX_LINES };
  return null;
}

/** The values v1 stores: the title trimmed, the content as typed. */
export function normalizedDraft(draft: NoteDraft): NoteDraft {
  return { title: draft.title.trim(), content: draft.content, color: draft.color };
}

export function activeNoteCount(notes: readonly Note[]): number {
  return notes.filter((n) => !n.archived).length;
}

/** v1 openNoteEditor(): a new note only below the active limit. */
export function canAddNote(notes: readonly Note[]): boolean {
  return activeNoteCount(notes) < NOTES_MAX;
}

/** Active or archived notes, newest first (v1 orders by createdAt desc). */
export function notesInView(notes: readonly Note[], archived: boolean): Note[] {
  return notes
    .filter((n) => n.archived === archived)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/**
 * One line of plain text for a list row: Markdown marks removed, whitespace
 * collapsed. Only for display; the stored content is never changed.
 */
export function noteExcerpt(content: string, max = 160): string {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
