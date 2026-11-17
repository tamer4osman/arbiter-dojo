/*
 * Experience brain for VX-9 "Arbiter" - a faithful host-side port of the
 * OmniDecide kernel's optional brain (vendor odk-brain/odk_learn.c,
 * documented in docs/LEARNING.md).
 *
 * Why host-side? The shipped omnidecide.wasm exposes only the pure kernel
 * (odkw_evaluate*), not the odk_brain_* C API. The brain is documented as
 * pure data + deterministic math, so the exact semantics run here:
 *
 *   - One memory entry per (primitive, instruction, option) key holding
 *     wins, losses, draws, visits and an EMA of rewards.
 *   - reward in [-1, 1] (clamped, NaN -> 0). reward >= +0.05 counts as a
 *     win, <= -0.05 as a loss, anything between as a draw.
 *   - advise(): bonus per option = (wins - losses) / visits, shrunk by
 *     visits / (visits + 4), clamped to [-1, 1]; 0.0 while visits < 2.
 *   - blend(): the kernel's probability for each option is re-weighted by
 *     exp(LOGIT_SCALE * weight * bonus) and renormalized. This is exactly
 *     the C path  adjusted = base + w*bonus  (clamped to [-1, 2], which
 *     never binds for weight <= 1)  followed by the calibrated softmax
 *     over LOGIT_SCALE * (adjusted - 0.5): the shared log-partition
 *     cancels, leaving q_i proportional to p_i * exp(6 * w * bonus_i).
 *   - weight 0.0 reproduces the plain kernel bit-for-bit.
 *
 * Deterministic: no randomness, no clock. Auditable: save() emits plain
 * JSON with the same fields as odk_brain_entries_report_alloc.
 */

export interface BrainEntry {
  wins: number;
  losses: number;
  draws: number;
  visits: number;
  ema: number;
}

export interface LessonReport {
  key: string;
  kind: string;
  option: string;
  wins: number;
  losses: number;
  visits: number;
  bonus: number;
}

const MIN_VISITS = 2;          // ODK_BRAIN_MIN_VISITS
const SHRINK = 4.0;            // ODK_BRAIN_SHRINK
const EMA_ALPHA = 0.25;        // ODK_BRAIN_EMA_ALPHA
export const LOGIT_SCALE = 6.0; // ODK_LOGIT_SCALE
const WIN_TH = 0.05;           // >= +0.05 win, <= -0.05 loss
const KEY_PREFIX = 'choice';   // only the choice primitive has a learning evaluator

export class ExperienceBrain {
  /** experience influence on decisions; 0.2-0.5 = nudge, 1.0 = override */
  weight = 0.35;
  private entries = new Map<string, BrainEntry>();

  get size(): number { return this.entries.size; }

  totalVisits(): number {
    let t = 0;
    for (const e of this.entries.values()) t += e.visits;
    return t;
  }

  private static key(kind: string, option: string): string {
    return `${KEY_PREFIX}|${kind}|${option}`;
  }

  /** Record one outcome for a decision. Reward in [-1, 1]. */
  record(kind: string, option: string, reward: number): void {
    if (reward !== reward) reward = 0;              // NaN guard, parity with C
    if (reward > 1.0) reward = 1.0;
    if (reward < -1.0) reward = -1.0;
    const k = ExperienceBrain.key(kind, option);
    const e = this.entries.get(k) ?? { wins: 0, losses: 0, draws: 0, visits: 0, ema: 0 };
    if (reward >= WIN_TH) e.wins++;
    else if (reward <= -WIN_TH) e.losses++;
    else e.draws++;
    e.visits++;
    e.ema += EMA_ALPHA * (reward - e.ema);
    this.entries.set(k, e);
  }

  /** Bounded bonus in [-1, 1] per option (0 while thin evidence). */
  advise(kind: string, options: string[]): number[] {
    return options.map((o) => {
      const e = this.entries.get(ExperienceBrain.key(kind, o));
      if (!e || e.visits < MIN_VISITS) return 0.0;
      const rate = (e.wins - e.losses) / e.visits;
      const b = rate * (e.visits / (e.visits + SHRINK));
      return Math.max(-1.0, Math.min(1.0, b));
    });
  }

  /**
   * Re-rank the kernel's distribution by experience. `probs` must be aligned
   * with `options` (missing keys are floored). Returns the shifted,
 * renormalized distribution - identical to odk_brain_evaluate_choice.
   */
  blend(kind: string, options: string[], probs: number[], weight: number): number[] {
    const bonuses = this.advise(kind, options);
    const logits = probs.map((p, i) =>
      Math.log(Math.max(p, 1e-9)) + LOGIT_SCALE * weight * bonuses[i]);
    const peak = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - peak));
    const total = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((e) => e / total);
  }

  /** Strongest lessons so far, for reporting / UI. */
  lessons(limit = 5): LessonReport[] {
    const out: LessonReport[] = [];
    for (const [key, e] of this.entries) {
      const [, kind, option] = key.split('|');
      const rate = (e.wins - e.losses) / e.visits;
      const bonus = e.visits < MIN_VISITS ? 0
        : Math.max(-1, Math.min(1, rate * (e.visits / (e.visits + SHRINK))));
      out.push({ key, kind, option, wins: e.wins, losses: e.losses, visits: e.visits, bonus });
    }
    out.sort((a, b) => Math.abs(b.bonus) * Math.log(1 + b.visits)
      - Math.abs(a.bonus) * Math.log(1 + a.visits));
    return out.slice(0, limit);
  }

  /** Plain-JSON snapshot (same fields as the C entries report). */
  save(): string {
    const obj: Record<string, BrainEntry> = {};
    for (const [k, e] of this.entries) obj[k] = { ...e };
    return JSON.stringify({
      version: 1,
      semantics: 'host-side odk_brain port',
      weight: this.weight,
      entries: obj,
    });
  }

  /** Load a snapshot. Ignores unknown fields; returns entries loaded. */
  load(json: string): number {
    try {
      const data = JSON.parse(json) as
        { entries?: Record<string, BrainEntry>; weight?: number };
      if (!data || typeof data !== 'object' || !data.entries) return 0;
      let n = 0;
      for (const [k, e] of Object.entries(data.entries)) {
        if (!e || typeof e !== 'object') continue;
        this.entries.set(k, {
          wins: Math.max(0, Number(e.wins) || 0),
          losses: Math.max(0, Number(e.losses) || 0),
          draws: Math.max(0, Number(e.draws) || 0),
          visits: Math.max(0, Number(e.visits) || 0),
          ema: Number(e.ema) || 0,
        });
        n++;
      }
      if (typeof data.weight === 'number' && data.weight >= 0 && data.weight <= 1) {
        this.weight = data.weight;
      }
      return n;
    } catch {
      return 0;
    }
  }

  reset(): void {
    this.entries.clear();
  }
}

/* ---------- localStorage persistence ---------- */

const STORE_KEY = 'arbiter_brain_v1';

export const brainStorage = {
  save(brain: ExperienceBrain): boolean {
    try {
      localStorage.setItem(STORE_KEY, brain.save());
      return true;
    } catch {
      return false;
    }
  },
  load(brain: ExperienceBrain): number {
    try {
      const json = localStorage.getItem(STORE_KEY);
      return json ? brain.load(json) : 0;
    } catch {
      return 0;
    }
  },
  clear(): void {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  },
  has(): boolean {
    try { return localStorage.getItem(STORE_KEY) !== null; } catch { return false; }
  },
};
