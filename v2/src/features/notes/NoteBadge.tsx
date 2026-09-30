// A note's mark: its icon on a tile tinted with its colour, as v1 shows it (the
// icon in the note's colour). v1 stores Tabler class names; v2 keeps those values
// and draws each with its lucide twin, so both versions show the same choice.
import {
  Briefcase,
  Code,
  Flag,
  GraduationCap,
  Heart,
  House,
  Lightbulb,
  type LucideIcon,
  Music,
  Notebook,
  Plane,
  ShoppingCart,
  Star,
} from 'lucide-preact';
import { isNoteIcon, type NoteIcon } from '@/domain/notes';

const ICONS: Readonly<Record<NoteIcon, LucideIcon>> = {
  'ti-notebook': Notebook,
  'ti-bulb': Lightbulb,
  'ti-star': Star,
  'ti-flag': Flag,
  'ti-heart': Heart,
  'ti-briefcase': Briefcase,
  'ti-school': GraduationCap,
  'ti-shopping-cart': ShoppingCart,
  'ti-plane': Plane,
  'ti-home': House,
  'ti-code': Code,
  'ti-music': Music,
};

/** v1 renders "" (and anything unknown) as the notebook. */
export function noteIconOf(icon: string): LucideIcon {
  return isNoteIcon(icon) ? ICONS[icon] : Notebook;
}

/** Decorative: the note's title next to it says what it is (D9). */
export function NoteBadge({ icon, color, size = 'md' }: { icon: string; color: string; size?: 'md' | 'lg' }) {
  const Icon = noteIconOf(icon);
  return (
    <span
      class={`notes-badge notes-badge--${size}${color ? '' : ' notes-badge--plain'}`}
      style={{ '--note-color': color || 'var(--color-text-secondary)' }}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
