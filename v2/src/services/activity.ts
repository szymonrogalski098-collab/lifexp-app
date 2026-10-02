// Activity use cases (docs/v2/PLAN.md 4.6, stage 3e; GOLDEN G1, G11): the rules of
// domain/activity, then the repository's transaction. Logging and deleting move
// points, so they are awaited and need the server; offline they fail and change
// nothing (offline drafts come with stage 3f).
import { deleteActivity, logActivity, seedActivityDefsIfEmpty } from '@/data/repos/activities';
import {
  GENERATED_TYPE,
  activityProblem,
  type Activity,
  type ActivityDef,
  type ActivityDraft,
  type ActivityProblem,
} from '@/domain/activity';

export type SaveActivityResult =
  | { ok: true; points: number; earned: number }
  | { ok: false; problem: ActivityProblem | 'dailyLimit' };

/** v1 logActivity(): the chosen definition's rate, the time, an optional note. */
export async function saveActivity(
  uid: string,
  draft: ActivityDraft,
  defs: readonly ActivityDef[],
  now = new Date(),
): Promise<SaveActivityResult> {
  const problem = activityProblem(draft);
  if (problem) return { ok: false, problem };
  // v1 goLogGenerated(): an activity from the generator's own pool, saved under its name.
  if (draft.type === GENERATED_TYPE && draft.generated) {
    return logActivity(uid, {
      type: GENERATED_TYPE,
      typeName: draft.generated.name,
      minutes: draft.minutes ?? 0,
      desc: draft.desc.trim(),
      pointsPerHour: draft.generated.points,
      now,
    });
  }
  const def = defs.find((d) => d.id === draft.type);
  if (!def) return { ok: false, problem: 'typeRequired' };
  return logActivity(uid, {
    type: def.id,
    typeName: null,
    minutes: draft.minutes ?? 0,
    desc: draft.desc.trim(),
    pointsPerHour: def.points,
    now,
  });
}

/** G11: the entry goes and its points come back off; resolves to the points taken back. */
export function removeActivity(uid: string, activity: Activity): Promise<number> {
  return deleteActivity(uid, activity.id);
}

const seedChecked = new Set<string>();

/**
 * v1 loadActivityDefs() seeds an account without definitions. Once per account per
 * app start, like v1; a failure (offline) leaves it for the next time.
 */
export async function ensureActivityDefs(uid: string): Promise<void> {
  if (seedChecked.has(uid)) return;
  seedChecked.add(uid);
  try {
    await seedActivityDefsIfEmpty(uid);
  } catch (error) {
    seedChecked.delete(uid);
    throw error;
  }
}
