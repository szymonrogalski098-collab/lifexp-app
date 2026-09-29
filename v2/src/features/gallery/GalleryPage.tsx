// #/ui — every ui/ component in its states, under a live theme switch. Used to
// review the design system on a real phone before screens are built from it.
// Holds only local sample state; nothing is saved except the theme choice.
import { useState } from 'preact/hooks';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { FAMILY_MODES, THEME_FAMILIES, type ModePreference, type ThemeFamily } from '@/lib/theme';
import { setThemePreference, themePreference } from '@/stores/theme';
import { Button } from '@/ui/components/Button';
import { EmptyState, List, ListRow, Metric, ProgressBar, Skeleton } from '@/ui/components/Display';
import {
  DateField,
  FilterChip,
  MoneyField,
  NumberField,
  SegmentedControl,
  Select,
  TextField,
} from '@/ui/components/Fields';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { Sheet } from '@/ui/components/Sheet';
import { showToast } from '@/ui/toast';
import './gallery.css';

const SAMPLE_BALANCE = 123456; // grosze

function ThemeSection() {
  const pref = themePreference.value;
  return (
    <Section title={t('gallery.theme')}>
      <Card>
        <Stack gap="sm">
          <SegmentedControl<ThemeFamily>
            label={t('gallery.family')}
            value={pref.family}
            options={THEME_FAMILIES.map((f) => ({ value: f, label: t(`gallery.families.${f}`) }))}
            onChange={(family) => setThemePreference({ family, mode: FAMILY_MODES[family][0] })}
          />
          {FAMILY_MODES[pref.family].length > 1 && (
            <SegmentedControl<ModePreference>
              label={t('gallery.mode')}
              value={pref.mode}
              options={FAMILY_MODES[pref.family].map((m) => ({ value: m, label: t(`gallery.modes.${m}`) }))}
              onChange={(mode) => setThemePreference({ family: pref.family, mode })}
            />
          )}
        </Stack>
      </Card>
    </Section>
  );
}

function FieldsSection() {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number | null>(45);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState('2026-09-29');
  const [category, setCategory] = useState<'food' | 'transport' | 'fun'>('food');
  const [filters, setFilters] = useState({ income: true, expense: false, month: true });
  const toggle = (key: keyof typeof filters) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  return (
    <Section title={t('gallery.fields')}>
      <Card>
        <Stack gap="sm">
          <TextField label={t('gallery.name')} value={name} onInput={setName} hint={t('gallery.nameHint')} maxLength={60} />
          <NumberField
            label={t('gallery.minutes')}
            value={minutes}
            onChange={setMinutes}
            suffix={t('gallery.minutesSuffix')}
          />
          <MoneyField
            label={t('gallery.amount')}
            value={amount}
            onChange={setAmount}
            hint={t('gallery.balanceAfter', { amount: formatMoney(SAMPLE_BALANCE - (amount ?? 0)) })}
          />
          <DateField label={t('gallery.date')} value={date} onChange={setDate} />
          <Select
            label={t('gallery.category')}
            value={category}
            onChange={setCategory}
            options={(['food', 'transport', 'fun'] as const).map((c) => ({ value: c, label: t(`gallery.categories.${c}`) }))}
          />
          <div class="row gallery-chips" role="group" aria-label={t('gallery.filters')}>
            <FilterChip label={t('gallery.filterIncome')} selected={filters.income} onToggle={() => toggle('income')} />
            <FilterChip label={t('gallery.filterExpense')} selected={filters.expense} onToggle={() => toggle('expense')} />
            <FilterChip label={t('gallery.filterMonth')} selected={filters.month} onToggle={() => toggle('month')} />
          </div>
        </Stack>
      </Card>
    </Section>
  );
}

function LayersSection() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const save = () => {
    setSheetOpen(false);
    showToast({
      message: t('gallery.saved', { amount: formatMoney(amount ?? 0) }),
      tone: 'positive',
      action: { label: t('gallery.undo'), onAction: () => showToast({ message: t('gallery.undone') }) },
    });
    setAmount(null);
    setNote('');
  };

  return (
    <Section title={t('gallery.layers')}>
      <Card>
        <div class="row gallery-buttons">
          <Button variant="primary" onClick={() => setSheetOpen(true)}>
            {t('gallery.openSheet')}
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            {t('gallery.openConfirm')}
          </Button>
          <Button onClick={() => showToast({ message: t('gallery.errorMessage'), tone: 'negative' })}>
            {t('gallery.showError')}
          </Button>
        </div>
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('gallery.sheetTitle')}
        footer={
          <Button variant="primary" size="lg" block disabled={amount === null || amount === 0} onClick={save}>
            {t('gallery.primary')}
          </Button>
        }
      >
        <Stack gap="sm">
          <MoneyField
            label={t('gallery.amount')}
            value={amount}
            onChange={setAmount}
            hint={t('gallery.balanceAfter', { amount: formatMoney(SAMPLE_BALANCE - (amount ?? 0)) })}
          />
          <TextField label={t('gallery.note')} value={note} onInput={setNote} maxLength={80} />
        </Stack>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title={t('gallery.confirmTitle')}
        body={t('gallery.confirmBody')}
        confirmLabel={t('gallery.danger')}
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          showToast({ message: t('gallery.deleted') });
        }}
      />
    </Section>
  );
}

export default function GalleryPage() {
  return (
    <Page>
      <Stack>
        <p class="gallery-intro">{t('gallery.intro')}</p>
        <ThemeSection />

        <Section title={t('gallery.numbers')}>
          <Card>
            <Stack gap="sm">
              <Metric size="hero" label={t('gallery.balance')} value={formatMoney(SAMPLE_BALANCE)} detail={t('gallery.balanceDetail')} />
              <Metric label={t('gallery.today')} value="95" detail={t('gallery.todayDetail')} tone="positive" />
              <Metric label={t('gallery.goal')} value={`${formatMoney(32206)} / ${formatMoney(120000)}`} />
              <ProgressBar value={32206 / 120000} label={t('gallery.goalProgress')} />
            </Stack>
          </Card>
        </Section>

        <Section title={t('gallery.list')} action={<Button variant="quiet">{t('gallery.quiet')}</Button>}>
          <List>
            <ListRow title={t('gallery.rowPocketMoney')} meta={t('gallery.rowPocketMeta')} value={`+${formatMoney(5000)}`} valueTone="positive" />
            <ListRow title={t('gallery.rowShopping')} meta={t('gallery.rowShoppingMeta')} value={`−${formatMoney(2349)}`} valueTone="negative" />
            <ListRow title={t('gallery.rowLoans')} meta={t('gallery.rowLoansMeta')} href="#/ui" />
          </List>
        </Section>

        <Section title={t('gallery.buttons')}>
          <Card>
            <Stack gap="sm">
              <div class="row gallery-buttons">
                <Button variant="primary">{t('gallery.primary')}</Button>
                <Button>{t('gallery.secondary')}</Button>
                <Button variant="quiet">{t('gallery.quiet')}</Button>
                <Button variant="danger">{t('gallery.danger')}</Button>
                <Button variant="primary" busy>
                  {t('gallery.busy')}
                </Button>
              </div>
              <Button variant="primary" size="lg" block>
                {t('gallery.addExpense')}
              </Button>
            </Stack>
          </Card>
        </Section>

        <FieldsSection />

        <LayersSection />

        <Section title={t('gallery.states')}>
          <Card>
            <EmptyState
              title={t('gallery.emptyTitle')}
              body={t('gallery.emptyBody')}
              action={<Button variant="primary">{t('gallery.emptyAction')}</Button>}
            />
          </Card>
          <Card>
            <Skeleton lines={3} />
          </Card>
        </Section>
      </Stack>
    </Page>
  );
}
