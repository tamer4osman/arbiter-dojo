/*
 * Brain trainer: runs headless self-play matches at turbo speed and feeds
 * every outcome into the ExperienceBrain. No rendering, no input reading -
 * the same engine, the same AI pipeline and the same WASM kernel as a real
 * fight, stepped as fast as the CPU allows in async chunks so the UI stays
 * responsive.
 *
 * Both fighters are ArbiterAI instances sharing one brain:
 * the trainee sits at index 1 (VX-9 slot, adaptive/veteran), the sparring
 * partner at index 0 rotates through all personas and difficulties so the
 * memory covers many styles. The brain is persisted after every match.
 */
import { Engine } from './engine';
import { ArbiterAI, DIFFICULTIES, PERSONAS, DiffKey, PersonaKey } from './ai';
import { KernelBridge } from './kernelClient';
import { brainStorage, ExperienceBrain } from './brain';
import { emptyCmd } from './types';

export interface TrainState {
  running: boolean;
  done: boolean;
  match: number;          // 0-based index of the match in progress
  total: number;
  traineeWins: number;
  oppWins: number;
  draws: number;
  brainEntries: number;
  brainVisits: number;
  log: string[];          // most recent match results (last 8)
  error: string | null;
}

export interface EvalResult {
  wins: number; losses: number; draws: number; total: number;
  /** summed (trainee hp - opponent hp) at match end, positive = dominant */
  hpDiffSum: number;
}

const emptyEval = (total = 0): EvalResult =>
  ({ wins: 0, losses: 0, draws: 0, total, hpDiffSum: 0 });

const OPP_PERSONAS: PersonaKey[] = ['rushdown', 'counter', 'adaptive'];
const OPP_DIFFS: DiffKey[] = ['veteran', 'rookie', 'master'];
const FRAMES_PER_CHUNK = 1500;   // 25s of game time per async chunk
const MATCH_GUARD = 8500;        // hard frame cap per match (timeout KO ~6.3k)

export class Trainer {
  state: TrainState = {
    running: false, done: false, match: 0, total: 0,
    traineeWins: 0, oppWins: 0, draws: 0,
    brainEntries: 0, brainVisits: 0, log: [], error: null,
  };

  private eng: Engine | null = null;
  private trainee: ArbiterAI | null = null;
  private opp: ArbiterAI | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private bridge: KernelBridge, private brain: ExperienceBrain,
    private onUpdate: (s: TrainState) => void = () => {}) {}

  /** Start a training run of `total` self-play matches. */
  start(total = 100): void {
    this.stop();
    this.state = {
      running: true, done: false, match: 0, total,
      traineeWins: 0, oppWins: 0, draws: 0,
      brainEntries: this.brain.size, brainVisits: this.brain.totalVisits(),
      log: [], error: null,
    };
    this.beginMatch(0);
    this.report();
    this.timer = setTimeout(this.chunk, 0);
  }

  stop(): void {
    this.state.running = false;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.eng = null;
    this.trainee = null;
    this.opp = null;
  }

  private beginMatch(i: number): void {
    this.state.match = i;
    this.eng = new Engine(1);   // single round per training match
    this.eng.resetMatch();
    // trainee: fixed veteran/adaptive; sparring partner rotates styles
    this.trainee = new ArbiterAI(this.bridge, DIFFICULTIES.veteran,
      PERSONAS.adaptive, this.brain, 1);
    this.opp = new ArbiterAI(this.bridge, DIFFICULTIES[OPP_DIFFS[i % 3]],
      PERSONAS[OPP_PERSONAS[i % 3]], this.brain, 0);
  }

  private report(): void {
    this.state.brainEntries = this.brain.size;
    this.state.brainVisits = this.brain.totalVisits();
    this.onUpdate({ ...this.state, log: [...this.state.log] });
  }

  private chunk = (): void => {
    if (!this.state.running || !this.eng || !this.trainee || !this.opp) return;
    const eng = this.eng;
    let frames = 0;
    while (frames < FRAMES_PER_CHUNK) {
      this.stepFrame(eng);
      frames++;
      if (eng.phase === 'matchend' || eng.frame >= MATCH_GUARD) break;
    }
    if (eng.phase === 'matchend' || eng.frame >= MATCH_GUARD) {
      this.finishMatch(eng);
      const next = this.state.match + 1;
      if (next >= this.state.total) {
        this.state.running = false;
        this.state.done = true;
        brainStorage.save(this.brain);
        this.report();
        return;
      }
      this.beginMatch(next);
    }
    this.report();
    this.timer = setTimeout(this.chunk, 0);
  };

  /** One deterministic engine frame driven by both AI perspectives. */
  private stepFrame(eng: Engine): void {
    const trainee = this.trainee!;
    const opp = this.opp!;
    const events = eng.drainEvents();
    const snap1 = eng.snapshot(1);
    const snap0 = eng.snapshot(0);
    let c1 = emptyCmd();
    let c0 = emptyCmd();
    if (eng.phase === 'fight') {
      c1 = trainee.command(snap1, events);
      c0 = opp.command(snap0, events);
    } else {
      // keep observers warm between phases (parity with the live game loop)
      trainee.command(snap1, []);
      opp.command(snap0, []);
    }
    const before = eng.phase;
    eng.shake = Math.max(0, eng.shake - 1.2);
    eng.tick([c0, c1]);
    // round result -> credit every choice made this round
    const after = eng.phase;
    if ((after === 'roundend' || after === 'matchend') && before !== 'roundend'
      && before !== 'matchend' && eng.roundWinner !== null) {
      trainee.creditRound(eng.roundWinner === 1);
      opp.creditRound(eng.roundWinner === 0);
    }
  }

  private finishMatch(eng: Engine): void {
    const w = eng.matchWinner;
    const i = this.state.match;
    const style = `${OPP_PERSONAS[i % 3]}/${OPP_DIFFS[i % 3]}`;
    if (w === 1) this.state.traineeWins++;
    else if (w === 0) this.state.oppWins++;
    else this.state.draws++;
    this.state.log.push(
      `#${i + 1} ${w === 1 ? 'WIN' : w === 0 ? 'LOSS' : 'DRAW'} vs ${style}` +
      ` (hp ${Math.max(0, Math.round(eng.fighters[1].hp))}` +
      `-${Math.max(0, Math.round(eng.fighters[0].hp))})`);
    if (this.state.log.length > 8) this.state.log.shift();
    brainStorage.save(this.brain);
  }

  /**
   * A/B evaluation: play `total` quiet matches without recording anything.
   * With useBrain=true the TRAINEE uses its trained memory while the
   * sparring partners stay plain (no brain) - so the delta measures exactly
   * what the experience adds against the same opposition mix.
   */
  async evaluate(total = 20, useBrain = true): Promise<EvalResult> {
    const res: EvalResult = emptyEval(total);
    try {
      for (let i = 0; i < total; i++) {
        const eng = new Engine(1);
        eng.resetMatch();
        const t = new ArbiterAI(this.bridge, DIFFICULTIES.veteran,
          PERSONAS.adaptive, useBrain ? this.brain : null, 1);
        const o = new ArbiterAI(this.bridge, DIFFICULTIES[OPP_DIFFS[i % 3]],
          PERSONAS[OPP_PERSONAS[i % 3]], null, 0);
        t.learning = false;
        o.learning = false;
        let guard = 0;
        while (eng.phase !== 'matchend' && guard < MATCH_GUARD) {
          this.stepEvalFrame(eng, t, o);
          guard++;
        }
        if (eng.matchWinner === 1) res.wins++;
        else if (eng.matchWinner === 0) res.losses++;
        else res.draws++;
        res.hpDiffSum += eng.fighters[1].hp - eng.fighters[0].hp;
        await new Promise((r) => setTimeout(r, 0));   // keep UI alive
      }
    } finally {
      // nothing to restore - evaluation never mutates the brain
    }
    return res;
  }

  private stepEvalFrame(eng: Engine, t: ArbiterAI, o: ArbiterAI): void {
    const events = eng.drainEvents();
    let c1 = emptyCmd();
    let c0 = emptyCmd();
    if (eng.phase === 'fight') {
      c1 = t.command(eng.snapshot(1), events);
      c0 = o.command(eng.snapshot(0), events);
    } else {
      t.command(eng.snapshot(1), []);
      o.command(eng.snapshot(0), []);
    }
    eng.shake = Math.max(0, eng.shake - 1.2);
    eng.tick([c0, c1]);
  }
}
