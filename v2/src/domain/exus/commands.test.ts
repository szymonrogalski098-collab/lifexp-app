import { describe, expect, it } from 'vitest';
import { availableCommands, COMMANDS, findCommand, palette, parseInput, type CommandSpec } from './commands';

const TODAY = '2026-10-09';

describe('the registry', () => {
  it('has unique ids and aliases', () => {
    const names = COMMANDS.flatMap((c) => [c.id, ...c.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('finds a command by id or alias, in any case and without Polish letters', () => {
    expect(findCommand('ZADANIE', COMMANDS)?.id).toBe('create-task');
    expect(findCommand('create-task', COMMANDS)?.id).toBe('create-task');
    expect(findCommand('dziś', COMMANDS)?.id).toBe('today');
    expect(findCommand('nic', COMMANDS)).toBeNull();
  });

  it("leaves out a module's commands while it is off", () => {
    const money: CommandSpec = { id: 'today', aliases: ['saldo'], module: 'money', risk: 'read', slots: () => [] };
    expect(availableCommands({ enabledModules: ['chores'], disabledModules: ['money'] }, [money])).toEqual([]);
    expect(availableCommands({ enabledModules: null, disabledModules: null }, [money])).toEqual([money]);
  });
});

describe('parseInput', () => {
  it('passes plain text on (for the AI)', () => {
    expect(parseInput('  odłóż 50 zł  ', TODAY, COMMANDS)).toEqual({ kind: 'text', text: 'odłóż 50 zł' });
  });

  it('names a command it does not know', () => {
    expect(parseInput('/latanie', TODAY, COMMANDS)).toEqual({ kind: 'unknown', name: 'latanie' });
  });

  it.each([
    ['/zadanie Kupić mleko jutro M', { text: 'Kupić mleko', due: '2026-10-10', size: 'M' }, []],
    ['/zadanie l pt Wypracowanie', { text: 'Wypracowanie', due: '2026-10-09', size: 'L' }, []],
    ['/zadanie Kupić mleko', { text: 'Kupić mleko' }, ['due']],
    ['/zadanie', {}, ['text', 'due']],
  ])('%s', (input, args, missing) => {
    const parsed = parseInput(input, TODAY, COMMANDS);
    expect(parsed).toMatchObject({ kind: 'command', args, missing });
    if (parsed.kind === 'command') expect(parsed.spec.id).toBe('create-task');
  });

  it('reads /pomoc with the command asked about', () => {
    expect(parseInput('/pomoc zadanie', TODAY, COMMANDS)).toMatchObject({ kind: 'command', args: { command: 'zadanie' }, missing: [] });
  });
});

describe('palette', () => {
  const ids = (draft: string) => palette(draft, COMMANDS).suggestions.map((c) => c.id);

  it('shows every command for a bare "/", nothing for plain text', () => {
    expect(ids('/')).toEqual(['help', 'today', 'create-task']);
    expect(ids('zadanie')).toEqual([]);
  });

  it('puts names starting with what is typed first, then names containing it', () => {
    expect(ids('/za')).toEqual(['create-task']);
    expect(ids('/DZ')).toEqual(['today']);
    expect(ids('/task')).toEqual(['create-task']);
    expect(ids('/xyz')).toEqual([]);
  });

  it('once a space follows the name, offers its syntax instead of a list', () => {
    expect(palette('/zadanie ', COMMANDS)).toMatchObject({ suggestions: [], current: { id: 'create-task' } });
    expect(palette('/nic ', COMMANDS)).toEqual({ suggestions: [], current: null });
  });
});
