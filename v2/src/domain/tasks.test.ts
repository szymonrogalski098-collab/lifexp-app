import { describe, expect, test } from 'vitest';
import {
  addPieces,
  applyPenalty,
  canAddTask,
  completionPieces,
  groupTasks,
  makePcBuild,
  pcBuildOrNull,
  PC_COMPONENTS,
  taskProblem,
  tasksToPenalise,
  TASKS_MAX,
  type PcBuild,
  type Task,
} from './tasks';

const TODAY = '2026-09-30';

let n = 0;
const task = (patch: Partial<Task> = {}): Task => ({
  id: `t${(n += 1)}`,
  text: 'Zadanie',
  dueDate: TODAY,
  size: 'S',
  done: false,
  createdAt: new Date('2026-09-20T10:00:00Z'),
  penaltyApplied: false,
  ...patch,
});

/** case, motherboard, gpu, cpu, psu, ram with the given pieces and current index. */
function build(pieces: number[], current: number): PcBuild {
  const componentOrder = [...PC_COMPONENTS];
  return {
    componentOrder,
    progress: Object.fromEntries(componentOrder.map((c, i) => [c, pieces[i] ?? 0])),
    currentComponentIndex: current,
  };
}

describe('G9 PC build (v1 addPiecesToBuild, applyPenaltyToBuild)', () => {
  test('G9.1: case 0/3 + L → case 3/3, motherboard is next', () => {
    expect(addPieces(build([0], 0), 3)).toEqual(build([3], 1));
  });

  test('G9.2: case 2/3 + L → 3/3, the extra 2 pieces are lost', () => {
    expect(addPieces(build([2], 0), 3)).toEqual(build([3, 0], 1));
  });

  test('G9.3: done after the due day → no pieces', () => {
    expect(completionPieces(task({ dueDate: '2026-09-29', size: 'L' }), TODAY)).toBe(0);
  });

  test('G9.4: the penalty hits the last finished component, the current one stays', () => {
    expect(applyPenalty(build([3, 3, 1], 2))).toEqual(build([3, 2, 1], 2));
  });

  test('G9.5: nothing finished → the penalty changes nothing', () => {
    expect(applyPenalty(build([2, 0], 0))).toEqual(build([2, 0], 0));
  });

  test('G9.6: done on the due day is in time; S/M/L = 1/2/3 pieces', () => {
    expect(completionPieces(task({ dueDate: TODAY, size: 'S' }), TODAY)).toBe(1);
    expect(completionPieces(task({ dueDate: TODAY, size: 'M' }), TODAY)).toBe(2);
    expect(completionPieces(task({ dueDate: '2026-10-05', size: 'L' }), TODAY)).toBe(3);
  });

  test('a complete PC takes no more pieces', () => {
    const complete = build([3, 3, 3, 3, 3, 3], 6);
    expect(addPieces(complete, 2)).toEqual(complete);
  });

  test('a new build: case and motherboard first, the other four shuffled, all at 0', () => {
    const b = makePcBuild(() => 0);
    expect(b.componentOrder.slice(0, 2)).toEqual(['case', 'motherboard']);
    expect([...b.componentOrder.slice(2)].sort()).toEqual(['cpu', 'gpu', 'psu', 'ram']);
    expect(Object.values(b.progress)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(b.currentComponentIndex).toBe(0);
  });

  test('a stored build with the wrong shape counts as none (v1 getPcBuild)', () => {
    expect(pcBuildOrNull(undefined)).toBeNull();
    expect(pcBuildOrNull({ componentOrder: ['case'], progress: {}, currentComponentIndex: 0 })).toBeNull();
    expect(pcBuildOrNull(build([1], 0))).toEqual(build([1], 0));
  });
});

describe('task rules (v1 saveTodo, openTodoForm, applyOverduePenalties)', () => {
  test('text, a due date and not in the past', () => {
    expect(taskProblem({ text: '  ', dueDate: TODAY, size: 'S' }, TODAY)).toBe('textRequired');
    expect(taskProblem({ text: 'x', dueDate: '', size: 'S' }, TODAY)).toBe('dueRequired');
    expect(taskProblem({ text: 'x', dueDate: '2026-09-29', size: 'S' }, TODAY)).toBe('dueInPast');
    expect(taskProblem({ text: 'x', dueDate: TODAY, size: 'S' }, TODAY)).toBeNull();
  });

  test('30 tasks block a new one, done ones included', () => {
    expect(canAddTask(Array.from({ length: TASKS_MAX }, () => task({ done: true })))).toBe(false);
    expect(canAddTask(Array.from({ length: TASKS_MAX - 1 }, () => task()))).toBe(true);
  });

  test('each overdue task is penalised once; done and due-today ones never', () => {
    const overdue = task({ dueDate: '2026-09-28' });
    const penalised = task({ dueDate: '2026-09-28', penaltyApplied: true });
    const doneLate = task({ dueDate: '2026-09-28', done: true });
    const dueToday = task({ dueDate: TODAY });
    expect(tasksToPenalise([overdue, penalised, doneLate, dueToday], TODAY)).toEqual([overdue]);
  });
});

describe('groups', () => {
  test('overdue and open by due date, done last', () => {
    const later = task({ dueDate: '2026-10-10' });
    const sooner = task({ dueDate: '2026-10-01' });
    const late = task({ dueDate: '2026-09-01' });
    const done = task({ done: true });
    expect(groupTasks([later, done, late, sooner], TODAY)).toEqual({
      overdue: [late],
      open: [sooner, later],
      done: [done],
    });
  });
});
