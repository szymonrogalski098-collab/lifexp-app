// Confirming an offline draft (docs/v2/PLAN.md 4.8, stage 3f; v1 applyOfflineDraft):
// the same transaction as the form, run now, online, against the account as it is
// now: the daily limit, the Money balance, the points an expense costs. The entry
// keeps the time the draft was made. Only when the write succeeds does the draft
// leave the queue, so a failure (offline again) loses nothing.
import { logActivity } from '@/data/repos/activities';
import { addChoreEntry } from '@/data/repos/chores';
import { addMoneyTx, getMoneyCategories } from '@/data/repos/money';
import type { DraftItem } from '@/domain/drafts';
import { resolveCategory, txProblem, type TxDraft } from '@/domain/money';
import { removeDraft } from '@/offline/queue';

export type DraftOutcome =
  | { ok: true }
  | { ok: false; problem: 'dailyLimit' | 'notEnoughBalance' | 'invalid' | 'unsupported' };

async function apply(uid: string, draft: DraftItem, rate: number): Promise<DraftOutcome> {
  switch (draft.kind) {
    case 'activity': {
      const result = await logActivity(uid, {
        type: draft.type,
        typeName: draft.typeName,
        minutes: draft.minutes,
        desc: draft.desc,
        pointsPerHour: draft.pointsPerHour,
        now: draft.createdAt,
        day: draft.day,
      });
      return result.ok ? { ok: true } : { ok: false, problem: 'dailyLimit' };
    }
    case 'chore': {
      const def = {
        id: draft.choreId,
        name: draft.name,
        desc: '',
        emoji: draft.emoji,
        points: draft.points,
        oneTime: draft.oneTime,
        order: 0,
      };
      await addChoreEntry(uid, def, draft.dateISO, draft.createdAt).saved;
      return { ok: true };
    }
    case 'money': {
      // The category is a name: an existing one (any case) or a new one, as v1 addMoneyCategoryByName.
      const tx: TxDraft = {
        type: draft.txType,
        grosze: draft.grosze,
        category: '',
        newCategory: draft.category,
        note: draft.note,
        date: draft.date,
      };
      if (txProblem(tx)) return { ok: false, problem: 'invalid' };
      const categories = await getMoneyCategories(uid);
      const result = await addMoneyTx(uid, {
        type: tx.type,
        grosze: draft.grosze,
        category: resolveCategory(tx, categories),
        note: tx.note.trim(),
        date: tx.date,
        rate,
        now: draft.createdAt,
      });
      return result.ok ? { ok: true } : { ok: false, problem: 'notEnoughBalance' };
    }
    default:
      return { ok: false, problem: 'unsupported' };
  }
}

/** v1 "Dodaj" on a draft: written to the account, then out of the queue. `rate` is the general złoty per point. */
export async function confirmDraft(uid: string, draft: DraftItem, rate: number): Promise<DraftOutcome> {
  const outcome = await apply(uid, draft, rate);
  if (outcome.ok) removeDraft(draft.id);
  return outcome;
}

/** v1 "Odrzuć": the draft leaves the queue, nothing is written. */
export function discardDraft(draft: DraftItem): void {
  removeDraft(draft.id);
}
