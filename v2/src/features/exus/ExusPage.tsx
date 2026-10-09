// Ex-us (docs/v2/PLAN.md 6, stage 5a): one chat for slash commands now and for
// the AI later (5b). A command is read locally (domain/exus) and run through the
// same services as the screens, so it obeys the same limits. The conversation
// lives in memory for now; history on the device comes with the full UI (6.10).
import { useEffect, useRef, useState } from 'preact/hooks';
import { availableCommands, findCommand, parseInput, type CommandSpec } from '@/domain/exus/commands';
import { DAILY_LIMIT_DEFAULT } from '@/domain/points';
import { TASKS_MAX, type TaskSize } from '@/domain/tasks';
import { isModuleOn } from '@/domain/modules';
import { language, locale, t } from '@/i18n';
import { formatDayMonth, localDayKey, utcDayKey } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { createTask, removeCreatedTask } from '@/services/tasks';
import { account } from '@/stores/session';
import { tasks, watchTasks } from '@/stores/tasks';
import { today as todaySources, watchToday } from '@/stores/today';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/Fields';
import { Card, Page, Stack } from '@/ui/components/Layout';
import { showToast } from '@/ui/toast';
import './exus.css';

interface Message {
  id: number;
  from: 'me' | 'exus';
  text: string;
}

let nextId = 1;

/** The command's name and arguments; the name is the Polish alias, or the id in English. */
function syntax(spec: CommandSpec): string {
  const name = language.value === 'en' ? spec.id : (spec.aliases[0] ?? spec.id);
  if (spec.id === 'today') return `/${name}`;
  return `/${name} ${t(`exus.args.${spec.id}`)}`;
}

function helpText(commands: readonly CommandSpec[], about: string | undefined): string {
  if (about) {
    const spec = findCommand(about.replace(/^\//, ''), commands);
    if (!spec) return t('exus.unknown', { name: about.replace(/^\//, '') });
    return `${t(`exus.commands.${spec.id}`)}\n${syntax(spec)}`;
  }
  return [t('exus.helpIntro'), ...commands.map((c) => `${syntax(c)} — ${t(`exus.commands.${c.id}`)}`)].join('\n');
}

export default function ExusPage() {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchTasks(uid) : undefined), [uid]);
  useEffect(() => (uid ? watchToday(uid) : undefined), [uid]);
  const [messages, setMessages] = useState<Message[]>(() => [{ id: nextId++, from: 'exus', text: t('exus.hello') }]);
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (!current || !uid) return null;
  const { profile } = current;
  const commands = availableCommands(profile);

  const say = (text: string) => setMessages((m) => [...m, { id: nextId++, from: 'exus', text }]);

  const summary = (): string => {
    const lang = locale();
    const earned = todaySources.value.days?.get(utcDayKey(new Date()))?.pointsEarned ?? 0;
    const lines = [
      t('exus.today.points', {
        total: formatInteger(profile.points.total, lang),
        earned: formatInteger(earned, lang),
        limit: formatInteger(profile.dailyLimit ?? DAILY_LIMIT_DEFAULT, lang),
      }),
    ];
    const balance = todaySources.value.balance;
    if (isModuleOn('money', profile) && typeof balance === 'number') lines.push(t('exus.today.balance', { amount: formatMoney(balance, lang) }));
    const list = tasks.value.list;
    if (list) {
      const day = localDayKey(new Date());
      const due = list.filter((task) => !task.done && task.dueDate !== null && task.dueDate <= day).length;
      lines.push(t('exus.today.tasks', { count: due }));
    }
    return lines.join('\n');
  };

  const createFromCommand = (args: Record<string, unknown>) => {
    const list = tasks.value.list;
    if (!list) return say(t('exus.notReady'));
    const day = localDayKey(new Date());
    const text = String(args.text);
    const dueDate = String(args.due);
    const size = (args.size as TaskSize | undefined) ?? 'M';
    const result = createTask(uid, { text, dueDate, size }, list, profile.pcBuild !== null, day);
    if (!result.ok) {
      return say(result.problem === 'limit' ? t('tasks.maxTasks', { max: TASKS_MAX }) : t(`exus.taskProblem.${result.problem}`));
    }
    const failed = () => showToast({ message: t('tasks.saveFailed'), tone: 'negative' });
    result.saved.catch(failed);
    say(t('exus.taskCreated', { text, date: formatDayMonth(dueDate, locale()), size }));
    showToast({
      message: t('tasks.saved'),
      tone: 'positive',
      action: {
        label: t('ui.undo'),
        onAction: () =>
          void removeCreatedTask(uid, result.id).then(() => say(t('exus.undone')), failed),
      },
    });
  };

  const send = () => {
    const input = draft.trim();
    if (!input) return;
    setDraft('');
    setMessages((m) => [...m, { id: nextId++, from: 'me', text: input }]);
    const parsed = parseInput(input, localDayKey(new Date()), commands);
    if (parsed.kind === 'text') return say(t('exus.aiLater'));
    if (parsed.kind === 'unknown') return say(t('exus.unknown', { name: parsed.name }));
    const { spec, args, missing } = parsed;
    if (missing.length > 0) {
      return say(
        t('exus.missing', {
          fields: missing.map((name) => t(`exus.slots.${name as 'text' | 'due'}`)).join(', '),
          syntax: syntax(spec),
        }),
      );
    }
    if (spec.id === 'help') return say(helpText(commands, args.command as string | undefined));
    if (spec.id === 'today') return say(summary());
    if (spec.id === 'create-task') return createFromCommand(args);
  };

  return (
    <Page>
      <Stack gap="sm">
        <div class="exus-log" role="log" aria-label={t('exus.log')} ref={log}>
          {messages.map((m) => (
            <p key={m.id} class={`exus-msg exus-msg--${m.from} user-text`}>
              {m.text}
            </p>
          ))}
        </div>
        <Card>
          <form
            class="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <TextField
              label={t('exus.inputLabel')}
              value={draft}
              onInput={setDraft}
              placeholder={t('exus.placeholder')}
              autoComplete="off"
            />
            <div>
              <Button type="submit" variant="primary">
                {t('exus.send')}
              </Button>
            </div>
          </form>
        </Card>
      </Stack>
    </Page>
  );
}
