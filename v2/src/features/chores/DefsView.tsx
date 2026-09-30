// The list of chores (v1 Settings → "Zarządzaj obowiązkami", GOLDEN G8): what can be
// logged, in v1's order; a new one from a sheet; removing one with undo (D8; v1 asks
// first). Logged entries keep their own name and points, so they stay as they are.
import { Plus } from 'lucide-preact';
import { useRef, useState } from 'preact/hooks';
import type { ChoreDef, ChoreDefDraft } from '@/domain/chores';
import { t } from '@/i18n';
import { createChoreDef, deleteChoreDef } from '@/services/chores';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/Display';
import { Card } from '@/ui/components/Layout';
import { ChoreDefSheet } from './ChoreDefSheet';

export function DefsView({ uid, defs }: { uid: string; defs: readonly ChoreDef[] }) {
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const lastToast = useRef<number | null>(null);

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const saveFailed = () => notify({ message: t('chores.saveFailed'), tone: 'negative' });
  const close = () => setSheet((s) => ({ ...s, open: false }));

  const save = (draft: ChoreDefDraft) => {
    const result = createChoreDef(uid, draft, defs);
    if (!result.ok) return result.problem;
    result.saved.catch(saveFailed);
    notify({ message: t('chores.defAdded', { name: draft.name.trim() }), tone: 'positive' });
    close();
    return null;
  };

  const remove = (def: ChoreDef) => {
    const { saved, undo } = deleteChoreDef(uid, def);
    saved.catch(saveFailed);
    notify({
      message: t('chores.defDeleted', { name: def.name }),
      action: { label: t('ui.undo'), onAction: () => void undo().catch(saveFailed) },
    });
  };

  return (
    <>
      <div class="chores-defs__head">
        <p class="chores-defs__note">{t('chores.defsNote')}</p>
        <Button variant="primary" onClick={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}>
          <Plus aria-hidden="true" />
          {t('chores.newDef')}
        </Button>
      </div>

      <Card padding={defs.length === 0 ? 'md' : 'none'}>
        {defs.length === 0 ? (
          <EmptyState title={t('chores.noDefs')} />
        ) : (
          <ul class="chores-defs" aria-label={t('chores.defsView')}>
            {defs.map((def) => (
              <li key={def.id} class="chores-defs__row">
                <span class="chores-emoji" aria-hidden="true">
                  {def.emoji}
                </span>
                <span class="chores-defs__text">
                  <span class="chores-defs__name user-text">{def.name}</span>
                  {(def.desc || def.oneTime) && (
                    <span class="chores-defs__meta user-text">
                      {[def.desc, def.oneTime ? t('chores.oneTime') : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span class="chores-defs__points numeric">{t('units.pointsGained', { points: def.points })}</span>
                <Button variant="quiet" onClick={() => remove(def)} aria-label={t('chores.deleteNamed', { name: def.name })}>
                  {t('chores.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sheet.key > 0 && <ChoreDefSheet key={sheet.key} open={sheet.open} onClose={close} onSave={save} />}
    </>
  );
}
