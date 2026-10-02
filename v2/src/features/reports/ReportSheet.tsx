// A new bug report in a sheet (v1 #page-report-bug): a title, where it happened and
// what happened. Checked by domain/reports in v1's order; the daily limit is the
// screen's to show, before the sheet opens.
import { useState } from 'preact/hooks';
import { BUG_AREAS, BUG_DESC_MAX, BUG_TITLE_MAX, type BugArea, type BugDraft, type BugProblem } from '@/domain/reports';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Select, TextAreaField, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const FORM_ID = 'report-form';

const PROBLEM_KEY = {
  titleRequired: 'reports.needTitle',
  areaRequired: 'reports.needArea',
  descRequired: 'reports.needDesc',
} as const;

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  /** Returns a problem to show, or null when sent. */
  onSend: (draft: BugDraft) => BugProblem | null;
}

export function ReportSheet({ open, onClose, onSend }: ReportSheetProps) {
  const [draft, setDraft] = useState<BugDraft>({ title: '', area: '', description: '' });
  const [problem, setProblem] = useState<BugProblem | null>(null);
  const set = (patch: Partial<BugDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (kind: BugProblem) => (problem === kind ? t(PROBLEM_KEY[kind]) : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('reports.newTitle')}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" size="lg" block>
          {t('reports.send')}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setProblem(onSend(draft));
        }}
      >
        <TextField
          label={t('reports.title')}
          value={draft.title}
          onInput={(title) => set({ title })}
          placeholder={t('reports.titlePh')}
          maxLength={BUG_TITLE_MAX}
          error={error('titleRequired')}
        />
        <Select<BugArea | ''>
          label={t('reports.area')}
          value={draft.area}
          options={[
            { value: '', label: t('reports.chooseArea') },
            ...BUG_AREAS.map((area) => ({ value: area, label: t(`reports.areas.${area}`) })),
          ]}
          onChange={(area) => set({ area })}
          error={error('areaRequired')}
        />
        <TextAreaField
          label={t('reports.desc')}
          value={draft.description}
          onInput={(description) => set({ description })}
          placeholder={t('reports.descPh')}
          maxLength={BUG_DESC_MAX}
          rows={5}
          hint={t('reports.charCount', { cur: draft.description.length, max: BUG_DESC_MAX })}
          error={error('descRequired')}
        />
      </form>
    </Sheet>
  );
}
