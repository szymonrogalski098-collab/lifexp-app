// Wiadomości, the admin's view (v1 #page-broadcasts): a message to everyone, shown
// once per device as a banner for 1–30 seconds, and the last 20 sent, each removable
// after asking (a message removed and sent again would show to everyone twice).
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  BROADCASTS_FOR_ADMIN,
  BROADCAST_SECONDS_DEFAULT,
  BROADCAST_SECONDS_MAX,
  BROADCAST_SECONDS_MIN,
  BROADCAST_TEXT_MAX,
  type Broadcast,
} from '@/domain/broadcasts';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { deleteBroadcast, sendBroadcast } from '@/services/broadcasts';
import { watchLatestBroadcasts } from '@/stores/broadcasts';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState, Skeleton } from '@/ui/components/Display';
import { NumberField, TextAreaField } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';

export function BroadcastsView() {
  const [list, setList] = useState<readonly Broadcast[] | undefined>(undefined);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState<number | null>(BROADCAST_SECONDS_DEFAULT);
  const [problem, setProblem] = useState(false);
  const [removing, setRemoving] = useState<Broadcast | null>(null);
  const lastToast = useRef<number | null>(null);
  const lang = locale();
  useEffect(() => watchLatestBroadcasts(BROADCASTS_FOR_ADMIN, setList), []);

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const failed = () => notify({ message: t('reports.saveFailed'), tone: 'negative' });

  const send = () => {
    const result = sendBroadcast(text, seconds);
    if (!result.ok) {
      setProblem(true);
      return;
    }
    result.saved.catch(failed);
    setText('');
    notify({ message: t('broadcasts.sent'), tone: 'positive' });
  };

  return (
    <Stack>
      <Section title={t('broadcasts.newTitle')}>
        <Card>
          <form
            class="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <p class="reports-note">{t('broadcasts.hint')}</p>
            <TextAreaField
              label={t('broadcasts.text')}
              value={text}
              onInput={(value) => {
                setText(value);
                setProblem(false);
              }}
              maxLength={BROADCAST_TEXT_MAX}
              rows={3}
              hint={t('reports.charCount', { cur: text.length, max: BROADCAST_TEXT_MAX })}
              error={problem ? t('broadcasts.needText') : null}
            />
            <NumberField
              label={t('broadcasts.seconds')}
              value={seconds}
              onChange={setSeconds}
              suffix={t('broadcasts.secondsUnit')}
              hint={t('broadcasts.secondsHint', { min: BROADCAST_SECONDS_MIN, max: BROADCAST_SECONDS_MAX })}
            />
            <div>
              <Button type="submit" variant="primary">
                {t('broadcasts.send')}
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title={t('broadcasts.sentList')}>
        <Card padding={list && list.length > 0 ? 'none' : 'md'}>
          {!list ? (
            <Skeleton lines={2} />
          ) : list.length === 0 ? (
            <EmptyState title={t('broadcasts.none')} />
          ) : (
            <ul class="reports-list" aria-label={t('broadcasts.sentList')}>
              {list.map((b) => (
                <li key={b.id} class="reports-list__item reports-broadcast">
                  <span class="reports-list__text">
                    <span class="reports-list__title user-text">{b.text}</span>
                    <span class="reports-list__meta">
                      {[b.createdAt ? formatShortDate(b.createdAt, lang) : null, t('broadcasts.forSeconds', { s: b.seconds })]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Button variant="quiet" onClick={() => setRemoving(b)} aria-label={t('broadcasts.deleteNamed', { text: b.text })}>
                    {t('settings.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <ConfirmDialog
        open={removing !== null}
        title={t('broadcasts.confirmDelete')}
        body={removing?.text ?? ''}
        confirmLabel={t('settings.delete')}
        danger
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (!target) return;
          deleteBroadcast(target.id).catch(failed);
          notify({ message: t('broadcasts.deleted') });
        }}
        onCancel={() => setRemoving(null)}
      />
    </Stack>
  );
}
