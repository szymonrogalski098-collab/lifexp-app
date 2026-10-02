// What the tab bar's "+" opens (D10). Each kind of item moves here with its module
// (stage 3); until then the row says when, and the footer hands over to v1.
import { ClipboardCheck, ListTodo, type LucideIcon, NotebookPen, Wallet, Zap } from 'lucide-preact';
import { isModuleOn, type ModuleChoice, type OptionalModule } from '@/domain/modules';
import { t } from '@/i18n';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { IconTile, List, ListRow } from '@/ui/components/Display';
import { Card } from '@/ui/components/Layout';
import { Sheet } from '@/ui/components/Sheet';

interface AddItem {
  icon: LucideIcon;
  labelKey: 'add.activity' | 'add.task' | 'add.chore' | 'add.expense' | 'add.note';
  /** Stage of docs/v2/PLAN.md 9 that brings adding it in v2. */
  stage: string;
  /** Where v2 adds it, once the module is here. */
  path?: string;
  /** Gone while this module is off; in v1 activities belong to "Statystyki XP". */
  module?: OptionalModule;
}

const ITEMS: readonly AddItem[] = [
  { icon: Zap, labelKey: 'add.activity', stage: '3e', path: '/today/activity', module: 'stats' },
  { icon: ListTodo, labelKey: 'add.task', stage: '3a', path: '/tasks/new' },
  { icon: ClipboardCheck, labelKey: 'add.chore', stage: '3b', path: '/chores/new', module: 'chores' },
  { icon: Wallet, labelKey: 'add.expense', stage: '3c', path: '/money/new', module: 'money' },
  { icon: NotebookPen, labelKey: 'add.note', stage: '3a', path: '/notes/new', module: 'notes' },
];

interface AddSheetProps {
  open: boolean;
  modules: ModuleChoice;
  onClose: () => void;
  /** Opens where an item is added; the sheet's history entry becomes that screen. */
  onPick: (path: string) => void;
}

export function AddSheet({ open, modules, onClose, onPick }: AddSheetProps) {
  const items = ITEMS.filter((item) => item.module === undefined || isModuleOn(item.module, modules));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('add.title')}
      footer={
        <ButtonLink variant="primary" size="lg" block href="../app.html">
          {t('add.openV1')}
        </ButtonLink>
      }
    >
      <p class="add-sheet__intro">{t('add.intro')}</p>
      <Card padding="none">
        <List>
          {items.map(({ icon: Icon, labelKey, stage, path }) => (
            <ListRow
              key={labelKey}
              leading={
                <IconTile>
                  <Icon />
                </IconTile>
              }
              title={t(labelKey)}
              meta={path ? undefined : t('add.comingIn', { stage })}
              onClick={path ? () => onPick(path) : undefined}
            />
          ))}
        </List>
      </Card>
    </Sheet>
  );
}
