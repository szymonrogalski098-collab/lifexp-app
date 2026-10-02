// Achievements (docs/v2/GOLDEN.md G4; v1 checkAchievements): 14 badges, added and
// never taken away. v1 checks them on every dashboard load and after an income in
// Money; v2 checks them on Today and records new ones through a service.

export interface Achievement {
  /** v1's id, kept in users.achievements. */
  id: string;
  /** Shown next to the badge's name (content, as v1 shows it). */
  emoji: string;
}

/** v1 ACHIEVEMENTS, in v1's order. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_activity', emoji: '✨' },
  { id: 'pts_1000', emoji: '💰' },
  { id: 'pts_5000', emoji: '💎' },
  { id: 'first_purchase', emoji: '🛒' },
  { id: 'streak_7', emoji: '🔥' },
  { id: 'streak_30', emoji: '🏆' },
  { id: 'gaming_hour', emoji: '🎮' },
  { id: 'daily_limit', emoji: '⚡' },
  { id: 'money_100', emoji: '💵' },
  { id: 'money_500', emoji: '💶' },
  { id: 'money_1000', emoji: '🤑' },
  { id: 'money_2500', emoji: '🪙' },
  { id: 'money_5000', emoji: '🏦' },
  { id: 'money_10000', emoji: '👑' },
];

export interface AchievementInput {
  earnedAllTime: number;
  spentAllTime: number;
  /** Days, as Today shows it. */
  streak: number;
  /** The UTC day's dailyLog. */
  pointsToday: number;
  gamingMinutesToday: number;
  /** The daily limit in force (the profile's, or v1's default). */
  dailyLimit: number;
  /** Grosze; null = not counted yet (M2), as 0 in v1. */
  moneyIncomeAllTime: number | null;
}

const ZLOTY = 100;

/** G4: whether each badge's condition holds now. */
function holds(id: string, input: AchievementInput): boolean {
  const income = input.moneyIncomeAllTime ?? 0;
  switch (id) {
    case 'first_activity':
      return input.earnedAllTime > 0;
    case 'pts_1000':
      return input.earnedAllTime >= 1000;
    case 'pts_5000':
      return input.earnedAllTime >= 5000;
    case 'first_purchase':
      return input.spentAllTime > 0;
    case 'streak_7':
      return input.streak >= 7;
    case 'streak_30':
      return input.streak >= 30;
    case 'gaming_hour':
      return input.gamingMinutesToday >= 60;
    case 'daily_limit':
      return input.pointsToday >= input.dailyLimit;
    case 'money_100':
      return income >= 100 * ZLOTY;
    case 'money_500':
      return income >= 500 * ZLOTY;
    case 'money_1000':
      return income >= 1000 * ZLOTY;
    case 'money_2500':
      return income >= 2500 * ZLOTY;
    case 'money_5000':
      return income >= 5000 * ZLOTY;
    case 'money_10000':
      return income >= 10000 * ZLOTY;
    default:
      return false;
  }
}

/** G4: the badges earned now and not held yet, in v1's order. */
export function newAchievements(held: readonly string[], input: AchievementInput): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !held.includes(a.id) && holds(a.id, input));
}
