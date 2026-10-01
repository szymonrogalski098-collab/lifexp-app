// Money settings (v1 Settings → Pieniądze; docs/v2/PLAN.md 9, stage 3c): the monthly
// spending limit behind the overview's alert, and the transaction categories — a new
// one gets the next colour in turn, removing one leaves transactions as they are and
// can be undone (D8; v1 asks first).
import { useRef, useState } from 'preact/hooks';
import {
  CATEGORY_NAME_MAX,
  duplicateCategories,
  sortCategories,
  type CategoryProblem,
  type MoneyCategory,
  type MoneyTx,
} from '@/domain/money';
import { locale, t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { createCategory, deleteCategory, removeDuplicateCategories, saveMonthlyLimit } from '@/services/money';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/Display';
import { MoneyField, TextField } from '@/ui/components/Fields';
import { Card, Section } from '@/ui/components/Layout';

const CATEGORY_PROBLEM = {
  nameRequired: 'money.needCategoryName',
  categoryExists: 'money.categoryExists',
} as const;

interface SettingsViewProps {
  uid: string;
  categories: readonly MoneyCategory[];
  /** To keep the category most of them use when removing repeats. */
  txs: readonly MoneyTx[];
  /** Grosze; 0 = no limit. */
  limit: number;
}

export function SettingsView({ uid, categories, txs, limit }: SettingsViewProps) {
  const [limitDraft, setLimitDraft] = useState<number | null>(limit);
  const [limitProblem, setLimitProblem] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<CategoryProblem | null>(null);
  const lastToast = useRef<number | null>(null);
  const lang = locale();

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const saveFailed = () => notify({ message: t('money.settingsSaveFailed'), tone: 'negative' });

  const saveLimit = () => {
    const result = saveMonthlyLimit(uid, limitDraft);
    if (!result.ok) {
      setLimitProblem(true);
      return;
    }
    result.saved.catch(saveFailed);
    setLimitDraft(result.limit);
    notify({
      message: result.limit > 0 ? t('money.limitSaved', { amount: formatMoney(result.limit, lang) }) : t('money.limitOff'),
      tone: 'positive',
    });
  };

  const addCategory = () => {
    const result = createCategory(uid, name, categories);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    result.saved.catch(saveFailed);
    notify({ message: t('money.categoryAdded', { name: name.trim() }), tone: 'positive' });
    setName('');
  };

  const remove = (category: MoneyCategory) => {
    const { saved, undo } = deleteCategory(uid, category);
    saved.catch(saveFailed);
    notify({
      message: t('money.categoryDeleted', { name: category.name }),
      action: { label: t('ui.undo'), onAction: () => void undo().catch(saveFailed) },
    });
  };

  const removeRepeats = () => {
    const result = removeDuplicateCategories(uid, categories, txs);
    if (!result) return;
    result.saved.catch(saveFailed);
    notify({
      message: t('money.repeatsRemoved', { count: result.count }),
      action: { label: t('ui.undo'), onAction: () => void result.undo().catch(saveFailed) },
    });
  };

  const sorted = sortCategories(categories);
  const repeats = duplicateCategories(categories, txs).length;

  return (
    <>
      <Section title={t('money.limitTitle')}>
        <Card>
          <form
            class="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveLimit();
            }}
          >
            <MoneyField
              label={t('money.limitLabel')}
              value={limitDraft}
              onChange={(grosze) => {
                setLimitDraft(grosze);
                setLimitProblem(false);
              }}
              hint={t('money.limitHint')}
              error={limitProblem ? t('money.amountTooLarge') : null}
            />
            <div>
              <Button type="submit" variant="secondary">
                {t('money.saveLimit')}
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title={t('money.categories')}>
        <Card>
          <form
            class="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              addCategory();
            }}
          >
            <TextField
              label={t('money.categoryName')}
              value={name}
              onInput={(next) => {
                setName(next);
                setProblem(null);
              }}
              maxLength={CATEGORY_NAME_MAX}
              error={problem ? t(CATEGORY_PROBLEM[problem]) : null}
            />
            <div>
              <Button type="submit" variant="primary">
                {t('money.addCategory')}
              </Button>
            </div>
          </form>
        </Card>
        {repeats > 0 && (
          <Card>
            <div class="money-repeats" data-testid="category-repeats">
              <p>{t('money.repeats', { count: repeats })}</p>
              <Button variant="secondary" onClick={removeRepeats}>
                {t('money.removeRepeats')}
              </Button>
            </div>
          </Card>
        )}
        <Card padding={sorted.length === 0 ? 'md' : 'none'}>
          {sorted.length === 0 ? (
            <EmptyState title={t('money.noCategories')} />
          ) : (
            <ul class="money-categories" aria-label={t('money.categories')}>
              {sorted.map((category) => (
                <li key={category.id} class="money-category">
                  <span class="money-tx__dot" style={{ '--category-color': category.color }} aria-hidden="true" />
                  <span class="money-category__name user-text">{category.name}</span>
                  <Button
                    variant="quiet"
                    onClick={() => remove(category)}
                    aria-label={t('money.deleteCategoryNamed', { name: category.name })}
                  >
                    {t('money.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}
