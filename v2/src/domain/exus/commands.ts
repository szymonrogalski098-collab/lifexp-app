// The Ex-us command registry (docs/v2/PLAN.md 6.4, 6.5): what each slash command is
// called, its Polish aliases, its slots and how risky it is. Pure: what a command
// does lives in the feature that runs it; here is only what it is and how its
// text is read. Grows a few commands per PR (stage 5a).
import { isModuleOn, type ModuleChoice, type OptionalModule } from '../modules';
import { TASK_SIZES, type TaskSize } from '../tasks';
import { fillSlots, missingSlots, tokenize, type SlotDef } from './parse';
import { dateFrom, fold, oneOf } from './recognizers';

/** read: runs at once; write: runs, with undo; destructive: asks first (6.6). */
export type Risk = 'read' | 'write' | 'destructive';

export type CommandId = 'help' | 'today' | 'create-task';

export interface CommandSpec {
  id: CommandId;
  /** Polish shortcuts, typed without Polish letters too. */
  aliases: readonly string[];
  /** Gone while this module is off; null = always there. */
  module: OptionalModule | null;
  risk: Risk;
  /** Slots read from the text; dates count from `today` (local day key). */
  slots: (today: string) => SlotDef[];
}

const SIZE = oneOf<TaskSize>(Object.fromEntries(TASK_SIZES.map((s) => [s, s])) as Record<string, TaskSize>);

export const COMMANDS: readonly CommandSpec[] = [
  {
    id: 'help',
    aliases: ['pomoc'],
    module: null,
    risk: 'read',
    slots: () => [{ name: 'command', type: 'text', required: false }],
  },
  {
    id: 'today',
    aliases: ['dzis'],
    module: null,
    risk: 'read',
    slots: () => [],
  },
  {
    id: 'create-task',
    aliases: ['zadanie'],
    module: null,
    risk: 'write',
    slots: (today) => [
      { name: 'text', type: 'text', required: true },
      { name: 'due', type: 'date', required: true, recognize: dateFrom(today) },
      { name: 'size', type: 'enum', required: false, recognize: SIZE },
    ],
  },
];

/** The commands of the modules that are on. */
export function availableCommands(choice: ModuleChoice, all: readonly CommandSpec[] = COMMANDS): CommandSpec[] {
  return all.filter((c) => c.module === null || isModuleOn(c.module, choice));
}

/** By id or alias, in any case, with or without Polish letters. */
export function findCommand(name: string, commands: readonly CommandSpec[]): CommandSpec | null {
  const key = fold(name);
  return commands.find((c) => fold(c.id) === key || c.aliases.some((a) => fold(a) === key)) ?? null;
}

export type Parsed =
  | { kind: 'text'; text: string }
  | { kind: 'unknown'; name: string }
  | { kind: 'command'; spec: CommandSpec; args: Record<string, unknown>; missing: string[] };

/** What the person typed: plain text (for the AI, stage 5b), an unknown command, or a command with its slots. */
export function parseInput(input: string, today: string, commands: readonly CommandSpec[]): Parsed {
  const tokenized = tokenize(input);
  if (tokenized.command === null) return { kind: 'text', text: input.trim() };
  const spec = findCommand(tokenized.command, commands);
  if (!spec) return { kind: 'unknown', name: tokenized.command };
  const slots = spec.slots(today);
  const args = fillSlots(tokenized.tokens, slots);
  return { kind: 'command', spec, args, missing: missingSlots(slots, args) };
}

export interface Palette {
  /** Commands for the name being typed: names starting with it first, then names containing it. */
  suggestions: CommandSpec[];
  /** The command whose name is complete (a space follows it): its syntax shows under the field. */
  current: CommandSpec | null;
}

/** The command palette for what is in the field (PLAN.md 6.3): only while it starts with "/". */
export function palette(draft: string, commands: readonly CommandSpec[]): Palette {
  const m = /^\s*\/(\S*)(\s?)/.exec(draft);
  if (!m) return { suggestions: [], current: null };
  if (m[2]) return { suggestions: [], current: findCommand(m[1]!, commands) };
  const typed = fold(m[1]!);
  const names = (c: CommandSpec) => [c.id, ...c.aliases].map(fold);
  const starts = commands.filter((c) => names(c).some((n) => n.startsWith(typed)));
  const contains = commands.filter((c) => !starts.includes(c) && names(c).some((n) => n.includes(typed)));
  return { suggestions: [...starts, ...contains], current: null };
}
