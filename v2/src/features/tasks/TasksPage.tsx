// Tasks (docs/v2/PLAN.md 9, stage 3a; GOLDEN G9): what is overdue, what is left,
// what is done, and the PC they build. Ticking a task is final; in time it adds
// pieces, overdue tasks take one back — applied here, when the list opens, as v1
// does, but through a service and never while rendering (B15).
import { Check, Plus } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { canAddTask, groupTasks, isOverdue, TASKS_MAX, tasksToPenalise, type Task, type TaskDraft } from '@/domain/tasks';
import { locale, t } from '@/i18n';
import { formatShortDate, localDayKey } from '@/lib/dates';
import type { RouteProps } from '@/lib/route-match';
import { applyOverduePenalties, completeTask, createTask, deleteTask, updateTask } from '@/services/tasks';
import { account } from '@/stores/session';
import { tasks as tasksState, watchTasks } from '@/stores/tasks';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { EmptyState, Skeleton } from '@/ui/components/Display';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { Markdown } from '@/ui/components/Markdown';
import { PcBuildCard } from './PcBuildCard';
import { TaskSheet } from './TaskSheet';
import './tasks.css';

/** A local day key as the person reads it ("3 paź"). */
function shortDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatShortDate(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1), locale());
}

function dueText(task: Task, today: string): string {
  if (!task.dueDate) return '';
  if (isOverdue(task, today)) return `${shortDay(task.dueDate)} · ${t('tasks.overdueTag')}`;
  if (task.dueDate === today) return t('tasks.dueToday');
  return t('tasks.dueOn', { date: shortDay(task.dueDate) });
}

interface TaskRowProps {
  task: Task;
  today: string;
  busy: boolean;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function TaskRow({ task, today, busy, onComplete, onOpen, onDelete }: TaskRowProps) {
  const overdue = isOverdue(task, today);
  const label = task.text.split('\n')[0] ?? '';
  return (
    <li class={`tasks-row${task.done ? ' tasks-row--done' : ''}${overdue ? ' tasks-row--overdue' : ''}`}>
      {task.done ? (
        <span class="tasks-check tasks-check--done" aria-hidden="true">
          <Check />
        </span>
      ) : (
        <button
          type="button"
          class="tasks-check"
          aria-label={t('tasks.markDone', { text: label })}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => onComplete(task)}
        />
      )}
      {task.done ? (
        <div class="tasks-row__body">
          <Markdown text={task.text} />
          <p class="tasks-row__meta">
            <span class="tasks-size">{task.size}</span> {t('tasks.done')}
          </p>
        </div>
      ) : (
        <button type="button" class="tasks-row__body tasks-row__body--action" onClick={() => onOpen(task)}>
          <Markdown text={task.text} />
          <span class="tasks-row__meta">
            <span class="tasks-size">{task.size}</span> {dueText(task, today)}
          </span>
        </button>
      )}
      {task.done && (
        <Button variant="quiet" onClick={() => onDelete(task)} aria-label={t('tasks.deleteNamed', { text: label })}>
          {t('tasks.delete')}
        </Button>
      )}
    </li>
  );
}

function TaskGroup({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <Section title={title}>
      <Card padding="none">
        <ul class="tasks-list" aria-label={title}>
          {children}
        </ul>
      </Card>
    </Section>
  );
}

/** The sheet stays mounted while it closes (exit animation); `key` gives each opening a fresh form. */
interface SheetState {
  open: boolean;
  task: Task | null;
  key: number;
}

export default function TasksPage({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchTasks(uid) : undefined), [uid]);

  const [sheet, setSheet] = useState<SheetState>({ open: false, task: null, key: 0 });
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const lastToast = useRef<number | null>(null);
  const sheetKey = useRef(0);

  const list = tasksState.value.list;
  const today = localDayKey(new Date());
  // Overdue tasks not penalised yet: apply once they are known. A failure (offline)
  // leaves them for the next visit; the transaction skips any another tab handled.
  const penaltyKey = list ? tasksToPenalise(list, today).map((task) => task.id).join(',') : '';
  useEffect(() => {
    if (uid && list && penaltyKey) applyOverduePenalties(uid, list, today).catch(() => {});
  }, [uid, penaltyKey]);

  // #/tasks/new (the "+" sheet): the list's address, with the form open on top.
  useEffect(() => {
    if (path !== '/tasks/new' || !list) return;
    navigate('/tasks', { replace: true });
    if (canAddTask(list)) {
      sheetKey.current += 1;
      setSheet({ open: true, task: null, key: sheetKey.current });
    } else {
      showToast({ message: t('tasks.maxTasks', { max: TASKS_MAX }), tone: 'negative' });
    }
  }, [path, list === undefined]);

  if (!current || !uid) return null;

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const failed = (key: 'tasks.saveFailed' | 'tasks.completeFailed') => () => notify({ message: t(key), tone: 'negative' });

  const openSheet = (task: Task | null) => {
    sheetKey.current += 1;
    setSheet({ open: true, task, key: sheetKey.current });
  };
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  const save = (draft: TaskDraft) => {
    if (!list) return null;
    const result = sheet.task
      ? updateTask(uid, sheet.task.id, draft, today)
      : createTask(uid, draft, list, current.profile.pcBuild !== null, today);
    if (!result.ok) {
      if (result.problem !== 'limit') return result.problem;
      notify({ message: t('tasks.maxTasks', { max: TASKS_MAX }), tone: 'negative' });
      return null;
    }
    result.saved.catch(failed('tasks.saveFailed'));
    notify({ message: t('tasks.saved'), tone: 'positive' });
    closeSheet();
    return null;
  };

  const complete = (task: Task) => {
    setBusyIds((ids) => new Set(ids).add(task.id));
    completeTask(uid, task.id, today)
      .then((pieces) =>
        notify(
          pieces > 0
            ? { message: t('tasks.piecesEarned', { count: pieces }), tone: 'positive' }
            : { message: t('tasks.lateNoPieces') },
        ),
      )
      .catch(failed('tasks.completeFailed'))
      .finally(() =>
        setBusyIds((ids) => {
          const next = new Set(ids);
          next.delete(task.id);
          return next;
        }),
      );
  };

  const remove = (task: Task) => {
    closeSheet();
    const { saved, undo } = deleteTask(uid, task);
    saved.catch(failed('tasks.saveFailed'));
    notify({
      message: t('tasks.deleted'),
      action: { label: t('ui.undo'), onAction: () => void undo().catch(failed('tasks.saveFailed')) },
    });
  };

  const startNew = () => {
    if (list && !canAddTask(list)) notify({ message: t('tasks.maxTasks', { max: TASKS_MAX }), tone: 'negative' });
    else openSheet(null);
  };

  const groups = list ? groupTasks(list, today) : null;
  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      busy={busyIds.has(task.id)}
      onComplete={complete}
      onOpen={openSheet}
      onDelete={remove}
    />
  );

  return (
    <Page>
      <Stack>
        {tasksState.value.failed && (
          <p class="tasks-error" role="alert">
            {t('tasks.loadFailed')}
          </p>
        )}

        <div class="tasks-head">
          <p class="tasks-count numeric">{list ? t('tasks.count', { count: list.length, max: TASKS_MAX }) : ''}</p>
          <Button variant="primary" onClick={startNew} disabled={!list}>
            <Plus aria-hidden="true" />
            {t('tasks.new')}
          </Button>
        </div>

        {!groups ? (
          <Card>
            <Skeleton lines={4} />
          </Card>
        ) : groups.overdue.length + groups.open.length + groups.done.length === 0 ? (
          <Card>
            <EmptyState title={t('tasks.empty')} />
          </Card>
        ) : (
          <>
            {groups.overdue.length > 0 && <TaskGroup title={t('tasks.overdue')}>{groups.overdue.map(row)}</TaskGroup>}
            {groups.open.length > 0 && <TaskGroup title={t('tasks.open')}>{groups.open.map(row)}</TaskGroup>}
            {groups.done.length > 0 && <TaskGroup title={t('tasks.done')}>{groups.done.map(row)}</TaskGroup>}
          </>
        )}

        <PcBuildCard build={current.profile.pcBuild} />
      </Stack>

      {sheet.key > 0 && (
        <TaskSheet
          key={sheet.key}
          open={sheet.open}
          task={sheet.task}
          today={today}
          onClose={closeSheet}
          onSave={save}
          onDelete={remove}
        />
      )}
    </Page>
  );
}
