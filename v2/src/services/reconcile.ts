// "Sprawdź spójność" (docs/v2/PLAN.md 5.5 point 4): reads the account from the
// server and sets its counters against its history. Changes nothing.
import { readReconcileInput } from '@/data/repos/reconcile';
import { reconcile, type Reconciliation } from '@/domain/reconcile';

export async function checkConsistency(uid: string): Promise<Reconciliation> {
  return reconcile(await readReconcileInput(uid));
}
