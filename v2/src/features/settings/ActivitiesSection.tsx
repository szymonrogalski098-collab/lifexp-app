// Settings → Aktywności (v1 renderActivityDefsSettings): the activity types that can
// be logged, in v1's order, each with its colour and points per hour. A new one from
// a sheet; a tap on one changes it in the same sheet (v2 only); removing one with
// undo (D8; v1 asks first). Logged activities keep their points.
import { Plus } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import type { ActivityDef, ActivityDefDraft } from '@/domain/activity';
import type { Profile } from '@/domain/profile';
import { t } from '@/i18n';
import { createActivityDef, deleteActivityDef, editActivityDef, ensureActivityDefs } from '@/services/activity';
import { activityDefs, watchActivityDefsState } from '@/stores/activityDefs';
import { useSettingsToast } from './toast';
import { ActivityDefSheet, colorName } from './ActivityDefSheet';
import { Button } from '@/ui/components/Button';
import { EmptyState, Skeleton } from '@/ui/components/Display';
import { Card, Stack } from '@/ui/components/Layout';

export function ActivitiesSection({ uid }: { uid: string; profile: Profile }) {
  const [sheet, setSheet] = useState<{ open: boolean; key: number; def?: ActivityDef }>({ open: false, key: 0 });
  const { notify, failed } = useSettingsToast();
  useEffect(() => watchActivityDefsState(uid), [uid]);
  // v1 seeds its list when Settings open; v2 does it here, where types are managed.
  useEffect(() => void ensureActivityDefs(uid).catch(() => {}), [uid]);

  const { defs, failed: loadFailed } = activityDefs.value;
  const close = () => setSheet((s) => ({ ...s, open: false }));

  const save = (draft: ActivityDefDraft) => {
    if (sheet.def) {
      const edited = editActivityDef(uid, sheet.def, draft);
      if (!edited.ok) return edited.problem;
      edited.saved.catch(failed);
      notify({
        message: t('settings.activitySaved', { name: draft.name.trim() }),
        tone: 'positive',
        action: { label: t('ui.undo'), onAction: () => void edited.undo().catch(failed) },
      });
      close();
      return null;
    }
    const result = createActivityDef(uid, draft, defs ?? []);
    if (!result.ok) return result.problem;
    result.saved.catch(failed);
    notify({ message: t('settings.activityAdded', { name: draft.name.trim() }), tone: 'positive' });
    close();
    return null;
  };

  const remove = (def: ActivityDef) => {
    const { saved, undo } = deleteActivityDef(uid, def);
    saved.catch(failed);
    notify({
      message: t('settings.activityDeleted', { name: def.name }),
      action: { label: t('ui.undo'), onAction: () => void undo().catch(failed) },
    });
  };

  return (
    <>
      <Stack gap="sm">
        <div class="settings-defs__head">
          <p class="settings-note">{t('settings.activityTypesNote')}</p>
          <Button variant="primary" onClick={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}>
            <Plus aria-hidden="true" />
            {t('settings.activityNew')}
          </Button>
        </div>
        <Card padding={defs && defs.length > 0 ? 'none' : 'md'}>
          {!defs ? (
            loadFailed ? (
              <p class="settings-problem" role="alert">
                {t('settings.loadFailed')}
              </p>
            ) : (
              <Skeleton lines={3} />
            )
          ) : defs.length === 0 ? (
            <EmptyState title={t('settings.noActivityTypes')} />
          ) : (
            <ul class="settings-defs" aria-label={t('settings.activityTypes')}>
              {defs.map((def) => (
                <li key={def.id} class="settings-defs__row">
                  <button
                    type="button"
                    class="settings-defs__edit"
                    aria-label={t('settings.activityEditNamed', { name: def.name })}
                    onClick={() => setSheet((s) => ({ open: true, key: s.key + 1, def }))}
                  >
                    {def.color && <span class="settings-swatch" style={{ '--swatch': def.color }} aria-hidden="true" />}
                    <span class="settings-defs__text">
                      <span class="settings-defs__name user-text">{def.name}</span>
                      <span class="settings-defs__meta">
                        <span class="numeric">{t('settings.pointsPerHour', { points: def.points })}</span>
                        {def.color && ` · ${colorName(def.color)}`}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="quiet"
                    onClick={() => remove(def)}
                    aria-label={t('settings.activityDeleteNamed', { name: def.name })}
                  >
                    {t('settings.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Stack>
      {sheet.key > 0 && <ActivityDefSheet key={sheet.key} open={sheet.open} def={sheet.def} onClose={close} onSave={save} />}
    </>
  );
}
