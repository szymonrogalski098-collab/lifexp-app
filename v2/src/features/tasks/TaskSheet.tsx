// Adding or editing a task in a sheet (PLAN.md 7.6: forms always in a Sheet): what,
// by when, how big. A new task says up front what missing the date costs (v1 asks
// for a confirmation in a dialog; here the warning sits next to the button).
import { useState } from 'preact/hooks';
import { TASK_SIZES, TASK_TEXT_MAX, type Task, type TaskDraft, type TaskProblem, type TaskSize } from '@/domain/tasks';
import { locale, t } from '@/i18n';
import { formatLongDate } from '@/lib/dates';
import { Button } from '@/ui/components/Button';
import { DateField, SegmentedControl, TextAreaField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const FORM_ID = 'task-form';

const PROBLEM_KEY = {
  textRequired: 'tasks.needText',
  dueRequired: 'tasks.needDue',
  dueInPast: 'tasks.dueInPast',
} as const;

/** "2026-10-03" → "sobota, 3 października" (the key's own calendar day). */
function dueLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatLongDate(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1), locale());
}

interface TaskSheetProps {
  open: boolean;
  /** null = a new task. */
  task: Task | null;
  today: string;
  onClose: () => void;
  /** Returns a problem to show, or null when saved. */
  onSave: (draft: TaskDraft) => TaskProblem | null;
  onDelete?: (task: Task) => void;
}

export function TaskSheet({ open, task, today, onClose, onSave, onDelete }: TaskSheetProps) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    text: task?.text ?? '',
    dueDate: task?.dueDate ?? '',
    size: task?.size ?? 'S',
  }));
  const [problem, setProblem] = useState<TaskProblem | null>(null);
  const set = (patch: Partial<TaskDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: TaskProblem[]) => (problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem]) : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(task ? 'tasks.edit' : 'tasks.new')}
      footer={
        <div class="tasks-sheet__footer">
          {!task && draft.dueDate && draft.dueDate >= today && (
            <p class="tasks-sheet__warning">{t('tasks.addWarning', { date: dueLabel(draft.dueDate) })}</p>
          )}
          <Button type="submit" form={FORM_ID} variant="primary" size="lg" block>
            {t(task ? 'tasks.save' : 'tasks.add')}
          </Button>
          {task && onDelete && (
            <Button variant="danger" block onClick={() => onDelete(task)}>
              {t('tasks.deleteTask')}
            </Button>
          )}
        </div>
      }
    >
      <form
        id={FORM_ID}
        class="stack"
        // Our messages (translated, next to the field) instead of the browser's bubbles.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setProblem(onSave(draft));
        }}
      >
        <TextAreaField
          label={t('tasks.text')}
          value={draft.text}
          onInput={(text) => set({ text })}
          placeholder={t('tasks.textPh')}
          error={error('textRequired')}
          rows={3}
          maxLength={TASK_TEXT_MAX}
        />
        <DateField
          label={t('tasks.due')}
          value={draft.dueDate}
          onChange={(dueDate) => set({ dueDate })}
          min={today}
          error={error('dueRequired', 'dueInPast')}
        />
        <SegmentedControl<TaskSize>
          label={t('tasks.size')}
          value={draft.size}
          options={TASK_SIZES.map((size) => ({ value: size, label: t(`tasks.sizes.${size}`) }))}
          onChange={(size) => set({ size })}
        />
      </form>
    </Sheet>
  );
}
