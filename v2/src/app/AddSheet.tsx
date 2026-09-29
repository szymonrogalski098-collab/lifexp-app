// What the tab bar's "+" opens (D10). v2 writes nothing until the modules land
// (stage 3), so for now it lists what will be added here and hands over to v1.
import { ClipboardCheck, ListTodo, type LucideIcon, NotebookPen, Wallet } from 'lucide-preact';
import { t } from '@/i18n';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { IconTile, List, ListRow } from '@/ui/components/Display';
import { Card } from '@/ui/components/Layout';
import { Sheet } from '@/ui/components/Sheet';

interface AddItem {
  icon: LucideIcon;
  labelKey: 'add.task' | 'add.chore' | 'add.expense' | 'add.note';
  /** Stage of docs/v2/PLAN.md 9 that brings adding it in v2. */
  stage: string;
}

const ITEMS: readonly AddItem[] = [
  { icon: ListTodo, labelKey: 'add.task', stage: '3a' },
  { icon: ClipboardCheck, labelKey: 'add.chore', stage: '3b' },
  { icon: Wallet, labelKey: 'add.expense', stage: '3c' },
  { icon: NotebookPen, labelKey: 'add.note', stage: '3a' },
];

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          {ITEMS.map(({ icon: Icon, labelKey, stage }) => (
            <ListRow
              key={labelKey}
              leading={
                <IconTile>
                  <Icon />
                </IconTile>
              }
              title={t(labelKey)}
              meta={t('add.comingIn', { stage })}
            />
          ))}
        </List>
      </Card>
    </Sheet>
  );
}
