// Money, live (stage 3c): transactions, categories, the monthly limit and the
// balance. The Money screen starts the listeners when it mounts and stops them
// when it leaves.
import { signal } from '@preact/signals';
import type { MoneyCategory, MoneyTx } from '@/domain/money';

/** undefined = still loading. */
export interface MoneyState {
  txs: readonly MoneyTx[] | undefined;
  categories: readonly MoneyCategory[] | undefined;
  /** Grosze; 0 = no limit. */
  limit: number | undefined;
  /** Grosze; null = no money/balance document yet. */
  balance: number | null | undefined;
  failed: boolean;
}

const EMPTY: MoneyState = { txs: undefined, categories: undefined, limit: undefined, balance: undefined, failed: false };

export const money = signal<MoneyState>(EMPTY);

export function watchMoney(uid: string): () => void {
  let stopped = false;
  const stops: Array<() => void> = [];
  const set = (patch: Partial<MoneyState>) => {
    if (!stopped) money.value = { ...money.value, ...patch };
  };
  const fail = () => set({ failed: true });
  void Promise.all([import('@/data/repos/money'), import('@/data/repos/today')])
    .then(([moneyRepo, todayRepo]) => {
      if (stopped) return;
      stops.push(
        moneyRepo.watchMoneyTxs(uid, (txs) => set({ txs }), fail),
        moneyRepo.watchMoneyCategories(uid, (categories) => set({ categories }), fail),
        moneyRepo.watchMonthlyLimit(uid, (limit) => set({ limit }), fail),
        todayRepo.watchMoneyBalance(uid, (balance) => set({ balance }), fail),
      );
    })
    .catch(fail);
  return () => {
    stopped = true;
    for (const stop of stops) stop();
    money.value = EMPTY;
  };
}
