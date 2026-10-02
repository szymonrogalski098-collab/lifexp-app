import { describe, expect, it } from 'vitest';
import { isModuleOn, surveyModules, toggleModule } from './modules';

const choice = (enabledModules: string[] | null, disabledModules: string[] | null = null) => ({
  enabledModules,
  disabledModules,
});

describe('isModuleOn', () => {
  it('has everything on until the person chose (v1 isModuleEnabled)', () => {
    for (const id of ['chores', 'money', 'notes', 'stats', 'games', 'aichat']) expect(isModuleOn(id, choice(null))).toBe(true);
  });

  it("follows v1's list for v1's modules", () => {
    const c = choice(['chores', 'stats', 'notes']);
    expect(isModuleOn('chores', c)).toBe(true);
    expect(isModuleOn('money', c)).toBe(false);
    expect(isModuleOn('games', c)).toBe(false);
  });

  it('B9: an account that chose the Planner before 24.08 has Notes', () => {
    expect(isModuleOn('notes', choice(['chores', 'planner']))).toBe(true);
    expect(isModuleOn('notes', choice(['chores']))).toBe(false);
  });

  it("keeps v1's list the truth while v1 can still change it", () => {
    // v2 turned money off, then v1 turned it back on: only enabledModules knows.
    expect(isModuleOn('money', choice(['money'], ['money']))).toBe(true);
  });

  it('turns on a module v1 does not know unless it is listed as off', () => {
    expect(isModuleOn('future', choice(['chores']))).toBe(true);
    expect(isModuleOn('future', choice(['chores'], ['future']))).toBe(false);
  });
});

describe('toggleModule', () => {
  it("writes v1's list without the Planner, Notes kept, and what is off (M3)", () => {
    expect(toggleModule(choice(['chores', 'money', 'planner', 'stats', 'aichat']), 'money', false)).toEqual({
      enabledModules: ['chores', 'stats', 'notes', 'aichat'],
      disabledModules: ['money', 'games'],
    });
  });

  it('starts from everything on when nothing was chosen', () => {
    expect(toggleModule(choice(null), 'games', false)).toEqual({
      enabledModules: ['chores', 'money', 'stats', 'notes', 'aichat'],
      disabledModules: ['games'],
    });
  });

  it('turns a module back on', () => {
    expect(toggleModule(choice(['chores'], ['money', 'notes', 'stats', 'games', 'aichat']), 'money', true)).toEqual({
      enabledModules: ['chores', 'money'],
      disabledModules: ['notes', 'stats', 'games', 'aichat'],
    });
  });
});

describe('surveyModules', () => {
  it("writes the survey in v1's order, with what was unticked as off", () => {
    expect(surveyModules(['notes', 'chores', 'aichat'])).toEqual({
      enabledModules: ['chores', 'notes', 'aichat'],
      disabledModules: ['money', 'stats', 'games'],
    });
  });
});
