// ───────────────────────────────────────────────────────────────────────────
// Streak: consecutive days, stored in localStorage.
// Counted by UTC date keys ("YYYY-MM-DD"). Idempotent: a second win
// on the same day doesn't bump the streak.
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "lightsout.progress.v1";

export interface Progress {
  streak: number; // current streak
  bestStreak: number; // best ever
  lastWonKey: string | null; // date of the last win (UTC)
}

const EMPTY: Progress = { streak: 0, bestStreak: 0, lastWonKey: null };

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY; // SSR guard
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      streak: p.streak ?? 0,
      bestStreak: p.bestStreak ?? 0,
      lastWonKey: p.lastWonKey ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function save(p: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage not available (private mode), ignore */
  }
}

/** Previous calendar day for a "YYYY-MM-DD" key (UTC). */
function previousKey(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a win for `todayKey` and return the updated progress.
 *  • already won today: no change (idempotent);
 *  • last win was yesterday: streak +1;
 *  • otherwise (first day or a gap): streak = 1.
 */
export function recordWin(todayKey: string): Progress {
  const cur = loadProgress();
  if (cur.lastWonKey === todayKey) return cur;

  const streak = cur.lastWonKey === previousKey(todayKey) ? cur.streak + 1 : 1;

  const next: Progress = {
    streak,
    bestStreak: Math.max(cur.bestStreak, streak),
    lastWonKey: todayKey,
  };
  save(next);
  return next;
}
