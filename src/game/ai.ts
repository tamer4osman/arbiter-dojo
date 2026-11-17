/*
 * VX-9 "Arbiter" AI - driven by the OmniDecide WASM kernel.
 *
 * Iron rule: the AI NEVER reads the player's input buffer. It observes only
 * what is visible on screen: the game state snapshot and the stream of
 * visible events (attacks thrown, blocks, whiffs, techs, dashes, knockdowns).
 *
 * Pipeline every decision tick:
 *   1. PROFILE  - maintain a habit model from observed player actions
 *   2. DESCRIBE - serialize situation + habits into ASCII text
 *   3. DECIDE   - kernel.evaluateChoice(instruction, options, context)
 *   4. EXECUTE  - translate the chosen action into virtual controller input
 */
import { Cmd, emptyCmd, GameEvent, MAX_DRIVE, Who } from './types';
import { Snapshot } from './engine';
import { KernelBridge } from './kernelClient';
import { ExperienceBrain } from './brain';

export type DiffKey = 'rookie' | 'veteran' | 'master';
export type PersonaKey = 'rushdown' | 'counter' | 'adaptive';

export interface DifficultyCfg {
  label: string;
  desc: string;
  interval: number;      // frames between decisions = reaction time
  noise: number;         // chance of misreading the kernel's call
  combo: number;         // max combo follow-ups it will attempt
}

export const DIFFICULTIES: Record<DiffKey, DifficultyCfg> = {
  rookie: {
    label: 'ROOKIE PROTOCOL', interval: 30, noise: 0.35, combo: 1,
    desc: 'Slow reads, frequent mispredictions. 500ms reaction.',
  },
  veteran: {
    label: 'VETERAN PROTOCOL', interval: 20, noise: 0.15, combo: 2,
    desc: 'Solid reads, real punishes. 333ms reaction.',
  },
  master: {
    label: 'MASTER PROTOCOL', interval: 13, noise: 0.04, combo: 3,
    desc: 'Near-instant reads, brutal punishes. 217ms reaction.',
  },
};

export interface PersonaCfg {
  label: string;
  doctrine: string;
  desc: string;
}

export const PERSONAS: Record<PersonaKey, PersonaCfg> = {
  rushdown: {
    label: 'RELENTLESS RUSHDOWN',
    doctrine: 'Hunt the opponent down. Deny them space, close gaps fast, '+
      'apply constant pressure, throw when they turtle. Aggression is your armor.',
    desc: 'Hunts you down and never stops pressuring.',
  },
  counter: {
    label: 'COUNTER ZONER',
    doctrine: 'Hold your ground. Control space, block deliberately, '+
      'punish every whiff and every bad habit. Patience is your weapon; '+
      'never take reckless risks.',
    desc: 'Waits, reads you, and punishes every mistake.',
  },
  adaptive: {
    label: 'ADAPTIVE DUELIST',
    doctrine: 'Mirror and exploit. Match the opponent\'s energy: press when '+
      'they are passive, turtle when they are reckless, and always target '+
      'their most repeated habit.',
    desc: 'Evolves with you every round.',
  },
};

type Band = 'close' | 'mid' | 'far';
type AtkClass = 'light' | 'med' | 'heavy' | 'low' | 'throw' | 'air' | 'impact';

interface HabitModel {
  observed: number;
  openers: Record<Band, Record<AtkClass, number>>;
  lows: number;
  afterBlock: { attack: number; retreat: number; jump: number; none: number };
  onWake: { attack: number; throw: number; jump: number; wait: number };
  techs: number;
  thrownToThem: number;
  jumps: number[];
  attacks: number[];          // timestamps of player attacks (rolling window)
  landedOnAI: number[];
  recentTokens: string[];
}

function newHabits(): HabitModel {
  return {
    observed: 0,
    openers: {
      close: { light: 0, med: 0, heavy: 0, low: 0, throw: 0, air: 0, impact: 0 },
      mid: { light: 0, med: 0, heavy: 0, low: 0, throw: 0, air: 0, impact: 0 },
      far: { light: 0, med: 0, heavy: 0, low: 0, throw: 0, air: 0, impact: 0 },
    },
    lows: 0,
    afterBlock: { attack: 0, retreat: 0, jump: 0, none: 0 },
    onWake: { attack: 0, throw: 0, jump: 0, wait: 0 },
    techs: 0,
    thrownToThem: 0,
    jumps: [],
    attacks: [],
    landedOnAI: [],
    recentTokens: [],
  };
}

interface PlanStep {
  cmd?: Partial<Cmd>;
  frames?: number;
  until?: Band;
  timeout?: number;
}

export interface AIStatus {
  lastKind: string;
  lastChoice: string;
  confidence: number;
  decisions: number;
  kernelOk: boolean;
}

const bandOf = (d: number): Band => (d < 150 ? 'close' : d < 330 ? 'mid' : 'far');

function classOf(moveId: string): AtkClass {
  if (moveId === 'lp' || moveId === 'lk') return 'light';
  if (moveId === 'mp' || moveId === 'mk' || moveId === 'cr_mp') return 'med';
  if (moveId === 'hp' || moveId === 'hk' || moveId === 'cr_hp' || moveId === 'launcher') return 'heavy';
  if (moveId === 'cr_lp' || moveId === 'cr_lk' || moveId === 'cr_mk' || moveId === 'cr_hk') return 'low';
  if (moveId === 'throw') return 'throw';
  if (moveId.startsWith('air_')) return 'air';
  return 'impact';
}

interface DecisionCredit { kind: string; option: string; born: number; }

/** Damage-scaled reward magnitude for landing/taking a hit, in [0.3, 1]. */
function hitReward(dmg: number): number {
  return Math.max(0.3, Math.min(1.0, dmg / 120));
}

export class ArbiterAI {
  private bridge: KernelBridge;
  private diff: DifficultyCfg;
  private persona: PersonaCfg;
  private brain: ExperienceBrain | null;
  private selfIdx: Who;          // which fighter this AI drives (default 1)
  private oppIdx: Who;
  /** when false, outcomes are not recorded into the brain (A/B evaluation) */
  learning = true;
  private habits = newHabits();
  private plan: PlanStep[] = [];
  private planFrame = 0;
  private stepTimeout = 0;
  private nextDecision = 40;
  private prevOppState = 'idle';
  private watchAfterBlock = -1;   // frame until which we watch player after blockstun
  private watchAfterBlockSeen = false;
  private watchWake = -1;
  private watchWakeSeen = false;
  private wakeupDecided = false;
  private downedThisTime = false;
  private recentChoices: string[] = [];
  /** decision awaiting its outcome reward (single credit, expires) */
  private credit: DecisionCredit | null = null;
  /** every decision made this round, for win/loss credit at round end */
  private roundLog: DecisionCredit[] = [];
  status: AIStatus = { lastKind: '-', lastChoice: '-', confidence: 0, decisions: 0, kernelOk: false };

  constructor(bridge: KernelBridge, diff: DifficultyCfg, persona: PersonaCfg,
    brain: ExperienceBrain | null = null, selfIdx: Who = 1) {
    this.bridge = bridge;
    this.diff = diff;
    this.persona = persona;
    this.brain = brain;
    this.selfIdx = selfIdx;
    this.oppIdx = (selfIdx === 0 ? 1 : 0) as Who;
  }

  /* ---------------- 1. PROFILE ---------------- */

  observe(snap: Snapshot, events: GameEvent[]): void {
    this.frameAdvance(snap);
    const f = this.frame();

    for (const ev of events) {
      // events about the OPPONENT (from this AI's perspective) or involving it
      if (ev.t === 'attack_start' && ev.who === this.oppIdx) {
        const band = bandOf(ev.dist);
        const cls = classOf(ev.move.id);
        this.habits.openers[band][cls]++;
        this.habits.observed++;
        if (cls === 'low') this.habits.lows++;
        this.habits.attacks.push(f);
        this.habits.recentTokens.push(`P:atk:${cls}:${band}:started`);
      } else if (ev.t === 'blocked' && ev.who === this.oppIdx) {
        // they blocked my attack - start watching what they do next
        this.watchAfterBlock = f + 14;
        this.watchAfterBlockSeen = false;
        this.habits.recentTokens.push('P:blocked');
        this.rewardDecision(-0.15, f);          // offense did not pay off
      } else if (ev.t === 'hit' && ev.who === this.selfIdx) {
        this.habits.landedOnAI.push(f);
        this.habits.recentTokens.push(`P:hit:${ev.move.id}:${ev.dmg}`);
        this.rewardDecision(-hitReward(ev.dmg), f);
      } else if (ev.t === 'hit' && ev.who === this.oppIdx) {
        this.habits.recentTokens.push('P:took_hit');
        this.rewardDecision(hitReward(ev.dmg), f);
      } else if (ev.t === 'tech' && ev.who === this.oppIdx) {
        this.habits.techs++;
        this.habits.recentTokens.push('P:throw_tech');
        this.rewardDecision(-0.5, f);           // throw was read
      } else if (ev.t === 'parried' && ev.who === this.oppIdx) {
        this.rewardDecision(-0.7, f);           // attack was parried - bad choice
      } else if (ev.t === 'attack_whiff' && ev.who === this.selfIdx) {
        this.rewardDecision(-0.35, f);          // whiffed - risky and fruitless
      } else if (ev.t === 'jump' && ev.who === this.oppIdx) {
        this.habits.jumps.push(f);
        this.habits.recentTokens.push('P:jump');
      } else if (ev.t === 'dash' && ev.who === this.oppIdx) {
        this.habits.recentTokens.push(ev.back ? 'P:backdash' : 'P:dash_fwd');
      } else if (ev.t === 'wakeup' && ev.who === this.oppIdx) {
        this.watchWake = f + 22;
        this.watchWakeSeen = false;
      } else if (ev.t === 'knockdown' && ev.who === this.oppIdx) {
        this.habits.recentTokens.push('P:knocked_down');
      } else if (ev.t === 'attack_whiff' && ev.who === this.oppIdx) {
        this.habits.recentTokens.push(`P:whiff:${ev.move.id}`);
      }
    }

    // throw landed on opponent
    for (const ev of events) {
      if (ev.t === 'hit' && ev.who === this.oppIdx && ev.move.id === 'throw') {
        this.habits.thrownToThem++;
      }
    }

    // watch windows
    if (this.watchAfterBlock > 0 && f <= this.watchAfterBlock) {
      const opp = snap.opp;
      if (!this.watchAfterBlockSeen) {
        if (opp.state === 'attack') { this.habits.afterBlock.attack++; this.watchAfterBlockSeen = true; }
        else if (opp.state === 'walk' || opp.state === 'dash' || opp.state === 'backdash') {
          this.habits.afterBlock.retreat++; this.watchAfterBlockSeen = true;
        }
      }
    } else if (this.watchAfterBlock > 0 && f > this.watchAfterBlock) {
      if (!this.watchAfterBlockSeen) this.habits.afterBlock.none++;
      this.watchAfterBlock = -1;
    }
    if (this.watchWake > 0 && f <= this.watchWake) {
      if (!this.watchWakeSeen) {
        const opp = snap.opp;
        if (opp.state === 'attack') { this.habits.onWake.attack++; this.watchWakeSeen = true; }
        else if (opp.state === 'jump') { this.habits.onWake.jump++; this.watchWakeSeen = true; }
      }
    } else if (this.watchWake > 0 && f > this.watchWake) {
      if (!this.watchWakeSeen) this.habits.onWake.wait++;
      this.watchWake = -1;
    }

    // decay old timestamps
    while (this.habits.attacks.length && f - this.habits.attacks[0] > 600) this.habits.attacks.shift();
    while (this.habits.jumps.length && f - this.habits.jumps[0] > 600) this.habits.jumps.shift();
    while (this.habits.landedOnAI.length && f - this.habits.landedOnAI[0] > 600) this.habits.landedOnAI.shift();
    if (this.habits.recentTokens.length > 12) this.habits.recentTokens.splice(0, this.habits.recentTokens.length - 12);

    this.prevOppState = snap.opp.state;
  }

  private frameCounter = 0;
  private frame(): number { return this.frameCounter; }
  private frameAdvance(_s: Snapshot): void { this.frameCounter++; }

  /* ---------------- 2. DESCRIBE ---------------- */

  private describe(snap: Snapshot, kind: string): string {
    const h = this.habits;
    const pct = (n: number, total: number) =>
      total > 0 ? `${Math.round((n / total) * 100)}%` : 'n/a';
    const lines: string[] = [];
    lines.push('SITUATION');
    lines.push(`dist=${bandOf(snap.dist)}(${Math.round(snap.dist)}px) | round ${snap.round} (you ${snap.self.wins} - player ${snap.opp.wins}) | timer ${Math.ceil(snap.timer / 60)}s`);
    lines.push(`YOU VX-9: hp ${snap.self.hp} drive ${Math.round(snap.self.drive)} | state ${snap.self.state}${snap.self.move ? ':' + snap.self.move + ':' + snap.self.movePhase : ''} | crouch ${snap.self.crouch ? 'yes' : 'no'} | air ${snap.self.airborne ? 'yes' : 'no'} | corner ${snap.selfWallBehind ? 'yes' : 'no'}`);
    lines.push(`PLAYER: hp ${snap.opp.hp} drive ${Math.round(snap.opp.drive)} | state ${snap.opp.state}${snap.opp.move ? ':' + snap.opp.move + ':' + snap.opp.movePhase + ' f' + snap.opp.moveFrame + '/' + snap.opp.moveTotal : ''} | crouch ${snap.opp.crouch ? 'yes' : 'no'} | air ${snap.opp.airborne ? 'yes' : 'no'} | corner ${snap.oppWallBehind ? 'yes' : 'no'}`);
    if (snap.opp.movePhase === 'recovery') {
      lines.push(`FRAME WINDOW: player is recovering for ${snap.opp.moveTotal - snap.opp.moveFrame} more frames (punishable)`);
    }
    lines.push('MOMENTUM');
    lines.push(`player attacks last 10s: ${h.attacks.length} | landed on you: ${h.landedOnAI.length} | player jump-ins: ${h.jumps.length}`);
    lines.push('HABITS (observed from visible actions only)');
    const oc = h.openers.close, om = h.openers.mid;
    const ocTotal = Object.values(oc).reduce((a, b) => a + b, 0);
    const omTotal = Object.values(om).reduce((a, b) => a + b, 0);
    lines.push(`close-range openers: light ${pct(oc.light, ocTotal)} med ${pct(oc.med, ocTotal)} heavy ${pct(oc.heavy, ocTotal)} low ${pct(oc.low, ocTotal)} throw ${pct(oc.throw, ocTotal)}`);
    lines.push(`mid-range openers: med ${pct(om.med, omTotal)} heavy ${pct(om.heavy, omTotal)} low ${pct(om.low, omTotal)}`);
    lines.push(`low attacks: ${pct(h.lows, h.observed)} of all | throw techs: ${h.techs}/${h.thrownToThem} | after being blocked: attack ${pct(h.afterBlock.attack, h.afterBlock.attack + h.afterBlock.retreat + h.afterBlock.none)} back-off ${pct(h.afterBlock.retreat, h.afterBlock.attack + h.afterBlock.retreat + h.afterBlock.none)}`);
    const wTotal = h.onWake.attack + h.onWake.throw + h.onWake.jump + h.onWake.wait;
    lines.push(`on your knockdown: attack ${pct(h.onWake.attack, wTotal)} throw ${pct(h.onWake.throw, wTotal)} jump ${pct(h.onWake.jump, wTotal)} wait ${pct(h.onWake.wait, wTotal)}`);
    lines.push(`RECENT: ${h.recentTokens.slice(-8).join(' | ') || 'none yet'}`);
    lines.push(`YOUR LAST CHOICES: ${this.recentChoices.slice(-5).join(', ') || 'none yet'}`);
    const last3 = this.recentChoices.slice(-3);
    if (last3.length === 3 && last3.every((c) => c === last3[0])) {
      lines.push(`NOTE: you have chosen ${last3[0]} three times in a row - vary your approach to stay unreadable.`);
    }
    lines.push(`DECISION TYPE: ${kind}`);
    return lines.join('\n');
  }

  private instruction(kind: string): string {
    const base = `You are VX-9 ARBITER, an adaptive combat android whose mind is the OmniDecide decision kernel. Persona: ${this.persona.label}. ${this.persona.doctrine} You know the frame data exactly: punches are the fastest buttons and chain well, kicks hit harder and reach further, heavies must be spaced or punished, lows must be blocked crouching, overheads standing, throws beat block and must be teched. `;
    const perKind: Record<string, string> = {
      neutral: 'NEUTRAL: no one has advantage. Choose the best immediate action: control space, respect the opponent\'s habits, do not repeat yourself. If you keep repeating one choice or the situation is static, pick a different option.',
      offense: 'OFFENSE: the player is in blockstun, you have frame advantage. Choose how to continue pressure: strikes, lows, throws or a reset.',
      punish: 'PUNISH: the player is stuck in attack recovery or stagger and reachable. Maximize damage with the best punishable option within the window.',
      antiair: 'ANTI-AIR: the player is airborne and approaching. Choose the best response to deny the jump-in.',
      wakeup: 'WAKEUP: you are knocked down about to rise. The player is waiting nearby. Choose the option that best escapes or counters their wake-up pressure based on their habits.',
      juggle: 'JUGGLE: you launched the player into the air. Choose the follow-up to extend the combo without dropping it.',
    };
    return base + (perKind[kind] ?? perKind.neutral) + ' Pick exactly one option.';
  }

  /* ---------------- 3. DECIDE ---------------- */

  private optionsFor(snap: Snapshot, kind: string): string[] {
    const drive = snap.self.drive;
    const dist = snap.dist;
    const close = dist < 190;
    const near = dist < 340;
    switch (kind) {
      case 'offense':
        return [
          'continue_light', 'continue_low', 'continue_kick', 'throw_attempt',
          ...(drive >= 25 ? ['drive_rush_pressure'] : []),
          ...(near ? ['frame_trap_mid'] : []),
          'backdash_reset', 'stop_and_block',
        ];
      case 'punish':
        return [
          'punish_heavy', 'punish_hk', 'punish_sweep', 'punish_launcher',
          ...(close ? ['punish_throw'] : []),
          ...(drive >= 25 ? ['punish_drive_impact'] : []),
          'safe_poke',
        ];
      case 'antiair':
        return [
          'anti_air_launcher', 'anti_air_heavy', 'block_low', 'block_stand',
          ...(drive >= 25 ? ['drive_impact_aa'] : []),
          'backdash_escape',
        ];
      case 'wakeup':
        return [
          'wake_block_low', 'wake_block_high', 'wake_throw_tech',
          'wake_revenge_jab', 'wake_jump_escape', 'wake_backdash',
        ];
      case 'juggle':
        return ['juggle_medium', 'juggle_heavy', ...(drive >= 25 ? ['drive_rush_extend'] : []), 'reset_to_block'];
      case 'neutral':
      default:
        return [
          'hold_ground_block', 'hold_block_low', 'walk_approach', 'walk_retreat',
          'dash_in', 'poke_light', 'poke_low', 'poke_mid', 'kick_chain',
          'heavy_swing', 'heavy_kick_swing',
          'sweep_knockdown', 'bait_throw_walk',
          ...(drive >= 25 ? ['drive_rush_in', 'drive_impact'] : []),
          ...(snap.opp.hp < 260 || snap.self.hp < 200 ? ['jump_in'] : []),
        ];
    }
  }

  private decideKind(snap: Snapshot): string {
    const self = snap.self, opp = snap.opp;
    if (self.state === 'knockdown' || self.state === 'thrown') {
      if (!this.wakeupDecided && self.stateT < 40) { this.downedThisTime = true; return 'wakeup'; }
      return 'wait_down';
    }
    if (this.downedThisTime && self.state !== 'knockdown') this.downedThisTime = false;
    if (opp.airborne && snap.dist < 430) return 'antiair';
    const oppRecovery = opp.movePhase === 'recovery' ? opp.moveTotal - opp.moveFrame : -1;
    if ((oppRecovery >= 4 && snap.dist < 380) || opp.state === 'stagger') return 'punish';
    if (opp.state === 'blockstun' && self.state !== 'attack') return 'offense';
    if (opp.airborne && self.move === 'Rising Fang') return 'antiair';
    if (opp.state === 'hitstun' && opp.airborne && opp.juggle > 0) return 'juggle';
    return 'neutral';
  }

  /* ---------------- 4. EXECUTE ---------------- */

  private planFor(choice: string, snap: Snapshot): PlanStep[] {
    const toward = snap.opp.x > snap.self.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';
    const S = (cmd: Partial<Cmd>, frames?: number, until?: Band, timeout?: number): PlanStep =>
      ({ cmd, frames, until, timeout });
    const fwd: Partial<Cmd> = toward === 'right' ? { right: true } : { left: true };
    const back: Partial<Cmd> = away === 'right' ? { right: true } : { left: true };
    const block = back;
    const blockLow = { ...back, down: true };

    switch (choice) {
      case 'hold_ground_block': return [S(block, 26)];
      case 'hold_block_low': return [S(blockLow, 26)];
      case 'walk_approach': return [S(fwd, undefined, 'close', 40)];
      case 'walk_retreat': return [S(back, 20)];
      case 'dash_in':
        return [S({ [toward]: true }, 1), S({}, 3), S(fwd, 1), S(fwd, 16)];
      case 'poke_light':
        return [S(fwd, undefined, 'close', 36), S({ ...fwd, lp: true }, 2), S(block, 14)];
      case 'poke_low':
        return [S(fwd, undefined, 'close', 36), S({ down: true, lk: true }, 2), S(blockLow, 16)];
      case 'poke_mid':
        return [S(fwd, undefined, 'close', 40), S({ ...fwd, mk: true }, 2), S(block, 16)];
      case 'kick_chain':
        return [S(fwd, undefined, 'close', 36), S({ ...fwd, lk: true }, 2), S({}, 5),
          S({ mk: true }, 2), S(block, 16)];
      case 'heavy_swing':
        return [S(fwd, undefined, 'close', 44), S({ ...fwd, hp: true }, 2), S(block, 20)];
      case 'heavy_kick_swing':
        return [S(fwd, undefined, 'close', 44), S({ ...fwd, hk: true }, 2), S(blockLow, 22)];
      case 'sweep_knockdown':
        return [S(fwd, undefined, 'close', 40), S({ down: true, hk: true }, 2), S(blockLow, 18)];
      case 'bait_throw_walk':
        return [S(back, 8), S(fwd, undefined, 'close', 14), S(block, 16)];
      case 'jump_in':
        return [S({ ...fwd, up: true }, 2), S(fwd, 12), S({ ...fwd, mp: true }, 3), S(block, 22)];
      case 'drive_rush_in':
        return [S({ ...fwd, rush: true }, 2), S(fwd, 22), S({ ...fwd, mp: true }, 2), S(block, 12)];
      case 'drive_impact':
        return [S({ impact: true }, 2), S(block, 34)];
      case 'continue_light':
        return [S({ lp: true }, 2), S({}, 5), S({ lp: true }, 2), S(block, 12)];
      case 'continue_low':
        return [S({ down: true, lk: true }, 2), S({}, 5), S({ down: true, lk: true }, 2), S(blockLow, 14)];
      case 'continue_kick':
        return [S({ mp: true }, 2), S({}, 5), S({ mk: true }, 2), S(block, 14)];
      case 'throw_attempt':
        return [S(fwd, undefined, 'close', 18), S({ throw: true }, 2), S(block, 12)];
      case 'frame_trap_mid':
        return [S({}, 8), S({ mp: true }, 2), S(block, 16)];
      case 'drive_rush_pressure':
        return [S({ ...fwd, rush: true }, 2), S(fwd, 22), S({ lp: true }, 2), S(block, 14)];
      case 'backdash_reset':
        return [S({ [away]: true }, 1), S({}, 3), S({ [away]: true }, 1), S(back, 10)];
      case 'stop_and_block':
        return [S(block, 24)];
      case 'punish_heavy':
        return [S(fwd, undefined, 'close', 24), S({ hp: true }, 2), S({ ...fwd, mp: true }, 2), S(block, 18)];
      case 'punish_hk':
        return [S(fwd, undefined, 'close', 24), S({ hk: true }, 2), S(block, 22)];
      case 'punish_sweep':
        return [S(fwd, undefined, 'close', 22), S({ down: true, hk: true }, 2), S(blockLow, 20)];
      case 'punish_launcher':
        return [S(fwd, undefined, 'close', 22), S({ ...fwd, hp: true }, 2), S({}, 8),
          S({ mp: true }, 2), S({}, 6), S({ hp: true }, 2), S(block, 20)];
      case 'punish_throw':
        return [S(fwd, undefined, 'close', 14), S({ throw: true }, 2), S({}, 10)];
      case 'punish_drive_impact':
        return [S({ impact: true }, 2), S(block, 34)];
      case 'safe_poke':
        return [S({ ...fwd, lp: true }, 2), S(block, 18)];
      case 'anti_air_launcher':
        return [S({ ...fwd, hp: true }, 2), S({}, 10), S({ mp: true }, 2), S(block, 20)];
      case 'anti_air_heavy':
        return [S({ hp: true }, 2), S(block, 20)];
      case 'block_low': return [S(blockLow, 28)];
      case 'block_stand': return [S(block, 28)];
      case 'backdash_escape':
        return [S({ [away]: true }, 1), S({}, 3), S({ [away]: true }, 1), S(back, 12)];
      case 'drive_impact_aa':
        return [S({ impact: true }, 2), S(block, 34)];
      case 'wake_block_low': return [S(blockLow, 30)];
      case 'wake_block_high': return [S(block, 30)];
      case 'wake_throw_tech':
        return [S({ throw: true }, 2), S({}, 6), S({ throw: true }, 2), S({}, 6), S(blockLow, 12)];
      case 'wake_revenge_jab':
        return [S({ lp: true }, 2), S({}, 6), S({ lp: true }, 2), S(block, 12)];
      case 'wake_jump_escape':
        return [S({ ...back, up: true }, 2), S(back, 28)];
      case 'wake_backdash':
        return [S({ [away]: true }, 1), S({}, 3), S({ [away]: true }, 1), S(back, 14)];
      case 'juggle_medium':
        return [S({}, 9), S({ mp: true }, 2), S({}, 7), S({ hp: true }, 2), S(block, 18)];
      case 'juggle_heavy':
        return [S({}, 11), S({ hp: true }, 2), S(block, 20)];
      case 'drive_rush_extend':
        return [S({ ...fwd, rush: true }, 2), S(fwd, 18), S({ mp: true }, 2), S({}, 6), S({ hp: true }, 2), S(block, 18)];
      case 'reset_to_block':
        return [S(block, 24)];
      default:
        return [S(block, 20)];
    }
  }

  /* ---------------- per-frame interface ---------------- */

  private frameNum = 0;

  command(snap: Snapshot, events: GameEvent[]): Cmd {
    this.observe(snap, events);
    this.frameNum = snap.frame;
    const f = this.frameNum;

    // run plan
    if (this.plan.length > 0) {
      const step = this.plan[0];
      const held = Object.assign(emptyCmd(), step.cmd ?? {});
      // advance step
      if (step.frames !== undefined) {
        step.frames--;
        if (step.frames <= 0) this.plan.shift();
      } else if (step.until) {
        this.stepTimeout++;
        const band = bandOf(snap.dist);
        if (band === step.until || this.stepTimeout > (step.timeout ?? 40)) {
          this.plan.shift();
          this.stepTimeout = 0;
        }
      }
      return held;
    }
    this.stepTimeout = 0;

    // decision cadence
    if (f < this.nextDecision) return emptyCmd();
    this.nextDecision = f + this.diff.interval + ((f * 7) % 5);

    const kind = this.decideKind(snap);
    if (kind === 'wait_down') return emptyCmd();
    if (kind === 'wakeup') this.wakeupDecided = true;
    if (snap.self.state !== 'knockdown' && snap.self.state !== 'thrown') this.wakeupDecided = false;

    const options = this.optionsFor(snap, kind);
    // keep the decision fresh: the kernel must re-rank among actions it has
    // not just taken (orchestration stays ours, the ranking stays the kernel's)
    const recent = new Set(this.recentChoices.slice(-2));
    let live = options.filter((o) => !recent.has(o));
    if (live.length < 5) live = options;
    const context = this.describe(snap, kind);
    const instruction = this.instruction(kind);
    const { choice, call } = this.bridge.choose(kind, instruction, live, context, f, this.brain);

    let executed = choice ?? this.heuristic(snap, kind, live);
    if (Math.random() < this.diff.noise) {
      executed = live[Math.floor(Math.random() * live.length)];
    }
    this.recentChoices.push(executed);
    if (this.recentChoices.length > 6) this.recentChoices.shift();

    // open an outcome credit for this decision; the reward lands when a
    // visible consequence (hit/block/whiff/tech/parry) resolves it
    if (this.brain) {
      this.credit = { kind, option: executed, born: f };
      this.roundLog.push({ kind, option: executed, born: f });
      if (this.roundLog.length > 60) this.roundLog.shift();
    }

    this.status.lastKind = kind;
    this.status.lastChoice = executed;
    this.status.confidence = call.confidence;
    this.status.decisions++;
    this.status.kernelOk = call.ok && choice !== null;

    this.plan = this.planFor(executed, snap);
    return emptyCmd();
  }

  /**
   * Credit (or punish) the decision currently awaiting its outcome. One
   * decision consumes one reward; stale credits expire after 150 frames.
   */
  private rewardDecision(reward: number, f: number): void {
    if (!this.brain || !this.learning || !this.credit) return;
    if (f - this.credit.born > 150) { this.credit = null; return; }
    this.brain.record(this.credit.kind, this.credit.option, reward);
    this.credit = null;
  }

  /** Round ended: credit every choice made this round with the outcome. */
  creditRound(won: boolean): void {
    if (this.brain && this.learning) {
      const r = won ? 0.3 : -0.3;
      for (const c of this.roundLog) this.brain.record(c.kind, c.option, r);
    }
    this.roundLog = [];
    this.credit = null;
  }

  /* fallback when the kernel is unavailable: habit-driven heuristic */
  private heuristic(snap: Snapshot, kind: string, options: string[]): string {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    switch (kind) {
      case 'antiair': return 'anti_air_heavy';
      case 'punish': return 'punish_heavy';
      case 'offense': return 'continue_low';
      case 'wakeup': return 'wake_block_low';
      case 'juggle': return 'juggle_medium';
      default:
        return pick(options.filter((o) => o.startsWith('poke') || o === 'walk_approach'
          || o === 'hold_block_low' || o === 'sweep_knockdown'));
    }
  }

  resetMatch(): void {
    this.habits = newHabits();
    this.plan = [];
    this.nextDecision = 40;
    this.wakeupDecided = false;
    this.downedThisTime = false;
    this.recentChoices = [];
    this.credit = null;
    this.roundLog = [];
  }

  habitSummary(): string {
    const h = this.habits;
    const oc = h.openers.close;
    const total = Object.values(oc).reduce((a, b) => a + b, 0);
    return `observed ${h.observed} actions | close openers: L${oc.light} M${oc.med} H${oc.heavy} LOW${oc.low} T${oc.throw}` +
      ` (n=${total}) | lows ${h.lows} | techs ${h.techs} | jumps10s ${h.jumps.length}`;
  }
}

export function clampDrive(v: number): number {
  return Math.max(0, Math.min(MAX_DRIVE, v));
}
