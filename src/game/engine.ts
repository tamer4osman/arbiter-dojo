/* Fight engine: deterministic 60fps simulation. No randomness in combat math. */
import {
  Cmd, Fighter, FighterId, GameEvent, MoveDef, Phase, Who,
  emptyCmd, BODY_HALF, FLOOR_Y, GRAV, JUMP_VY, MAX_DRIVE, MAX_HP,
  ROUND_SECONDS, START_X, WALK_B, WALK_F, WALL_L, WALL_R,
  CHAR_SCALE, STAND_TOP, CROUCH_TOP, AIR_TOP, AIR_BOT,
} from './types';
import { MOVES, pickGroundMove, pickAirMove, comboScale } from './moves';

const GROUND_STATES = new Set(['idle', 'walk', 'crouch']);
const DASH_F = 20;
const DASH_F_SPEED = 12;
const DASH_B = 16;
const DASH_B_SPEED = 9;
const RUSH_F = 24;
const RUSH_SPEED = 13;
const PARRY_START = 2;
const PARRY_ACTIVE = 10;
const PARRY_RECOVER = 12;
const PREJUMP = 4;
const KD_LIE = 42;
const KD_WAKE = 16;

export interface Snapshot {
  frame: number;
  phase: Phase;
  round: number;
  timer: number;
  dist: number;
  self: FighterView;
  opp: FighterView;
  oppWallBehind: boolean;
  selfWallBehind: boolean;
}

export interface FighterView {
  x: number; y: number; facing: 1 | -1;
  hp: number; drive: number; wins: number;
  state: string; stateT: number;
  crouch: boolean; airborne: boolean;
  move: string | null; movePhase: string; moveFrame: number; moveTotal: number;
  juggle: number; name: string;
}

function mkFighter(id: FighterId, x: number, facing: 1 | -1): Fighter {
  return {
    id, x, y: 0, vy: 0, facing,
    state: 'idle', stateT: 0, move: null, moveFrame: 0, moveHit: false,
    armor: false, airborne: false, juggle: 0, crouch: false,
    hp: MAX_HP, drive: 50, wins: 0, rushBuff: 0, airAttackUsed: false,
    animT: 0, hitFlash: 0, blockFlash: 0, comboHits: 0, lastStunHigh: false,
  };
}

export class Engine {
  fighters: [Fighter, Fighter];
  phase: Phase = 'intro';
  phaseT = 110;
  round = 1;
  roundsToWin = 2;
  timer = ROUND_SECONDS * 60;
  frame = 0;
  events: GameEvent[] = [];
  hitstop = 0;
  shake = 0;
  roundWinner: Who | null = null;
  matchWinner: Who | null = null;
  koSlowmo = false;
  announce: { text: string; t: number } | null = null;
  private prev: [Cmd, Cmd] = [emptyCmd(), emptyCmd()];
  private tapT: [number, number] = [-99, -99];
  private tapDir: [number, number] = [0, 0];
  private lastTechTry: number[] = [-99, -99];

  constructor(roundsToWin = 2) {
    this.fighters = [mkFighter('kaito', START_X[0], 1), mkFighter('vx9', START_X[1], -1)];
    this.roundsToWin = roundsToWin;
  }

  /* ---------- public API ---------- */

  resetMatch(): void {
    this.round = 1;
    this.matchWinner = null;
    this.fighters[0].wins = 0;
    this.fighters[1].wins = 0;
    this.resetRound();
  }

  resetRound(): void {
    const [a, b] = this.fighters;
    a.x = START_X[0]; b.x = START_X[1];
    for (const f of this.fighters) {
      f.y = 0; f.vy = 0; f.state = 'intro'; f.stateT = 0; f.move = null;
      f.moveFrame = 0; f.moveHit = false; f.airborne = false; f.juggle = 0;
      f.crouch = false; f.hp = MAX_HP; f.drive = 50; f.rushBuff = 0;
      f.airAttackUsed = false; f.hitFlash = 0; f.blockFlash = 0;
      f.comboHits = 0;
    }
    a.facing = 1; b.facing = -1;
    this.phase = 'intro';
    this.phaseT = 110;
    this.timer = ROUND_SECONDS * 60;
    this.roundWinner = null;
    this.koSlowmo = false;
    this.announce = null;
    this.hitstop = 0;
    this.shake = 0;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /**
   * Situation snapshot from one fighter's perspective. `who` = the observer
   * (self = that fighter, opp = the other). Defaults to 1 - the AI side -
   * which matches every historical caller; self-play training passes 0 for
   * the second learner so both AIs read the same world from opposite corners.
   */
  snapshot(who: Who = 1): Snapshot {
    const selfF = this.fighters[who];
    const oppF = this.fighters[who === 0 ? 1 : 0];
    const dist = Math.abs(selfF.x - oppF.x);
    return {
      frame: this.frame,
      phase: this.phase,
      round: this.round,
      timer: this.timer,
      dist,
      opp: view(oppF, dist),
      self: view(selfF, dist),
      oppWallBehind: oppF.x < WALL_L + 160,
      selfWallBehind: selfF.x < WALL_L + 160 || selfF.x > WALL_R - 160,
    };
  }

  oppRecoveryFrames(who: Who): number {
    const f = this.fighters[who];
    if (f.state !== 'attack' || !f.move) return -1;
    const total = f.move.startup + f.move.active + f.move.recovery;
    if (f.moveFrame < f.move.startup + f.move.active) return -1;
    return total - f.moveFrame;
  }

  oppInBlockstun(who: Who): boolean {
    return this.fighters[who].state === 'blockstun';
  }

  oppAirborneApproaching(who: Who): boolean {
    const f = this.fighters[who];
    const me = this.fighters[who === 0 ? 1 : 0];
    return f.airborne && Math.abs(f.x - me.x) < 420 && f.vy > -4;
  }

  selfDowned(who: Who): boolean {
    const f = this.fighters[who];
    return (f.state === 'knockdown' && f.stateT <= KD_LIE && f.stateT > 2) ||
      (f.state === 'thrown');
  }

  /* ---------- main tick ---------- */

  tick(cmds: [Cmd, Cmd]): void {
    this.frame++;
    if (this.announce) {
      this.announce.t--;
      if (this.announce.t <= 0) this.announce = null;
    }

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    switch (this.phase) {
      case 'intro':
        this.phaseT--;
        for (const f of this.fighters) f.animT++;
        if (this.phaseT <= 0) {
          this.phase = 'fight';
          for (const f of this.fighters) { f.state = 'idle'; }
          this.announce = { text: 'FIGHT', t: 60 };
        }
        return;
      case 'ko':
        this.phaseT--;
        this.stepFighters(cmds, true);
        for (const f of this.fighters) f.animT++;
        if (this.phaseT <= 0) this.endRound();
        return;
      case 'roundend':
        this.phaseT--;
        for (const f of this.fighters) f.animT++;
        if (this.phaseT <= 0) {
          if (this.matchWinner !== null) {
            this.phase = 'matchend';
          } else {
            this.round++;
            this.resetRound();
          }
        }
        return;
      case 'matchend':
        return;
      case 'fight':
        break;
    }

    // normal fight frame
    this.stepFighters(cmds, false);
    for (const f of this.fighters) f.animT++;
    this.separateBodies();
    this.checkTime();
  }

  /* ---------- internal steps ---------- */

  private stepFighters(cmds: [Cmd, Cmd], frozen: boolean): void {
    const [p, ai] = this.fighters;
    // record throw-tech attempts
    for (const w of [0, 1] as Who[]) {
      if (cmds[w].throw && !this.prev[w].throw) this.lastTechTry[w] = this.frame;
    }
    for (const w of [0, 1] as Who[]) {
      this.stepOne(w, cmds[w], this.prev[w], frozen);
    }
    this.prev = [{ ...cmds[0] }, { ...cmds[1] }];
    void p; void ai;
  }

  private stepOne(w: Who, c: Cmd, pc: Cmd, frozen: boolean): void {
    const f = this.fighters[w];
    const o = this.fighters[w === 0 ? 1 : 0];
    f.hitFlash = Math.max(0, f.hitFlash - 1);
    f.blockFlash = Math.max(0, f.blockFlash - 1);
    if (f.rushBuff > 0) f.rushBuff--;

    const edge = (btn: boolean, prevBtn: boolean) => btn && !prevBtn;

    if (frozen) {
      // during KO slow-mo only physics of ko state
      if (f.state === 'ko') { this.applyGravity(f); }
      return;
    }

    const dist = Math.abs(f.x - o.x);
    const towardOp = o.x > f.x ? 1 : -1;
    const actionable = GROUND_STATES.has(f.state);

    if (actionable) {
      f.facing = (o.x >= f.x ? 1 : -1) as 1 | -1;
    }

    switch (f.state) {
      case 'idle': case 'walk': case 'crouch': {
        f.crouch = c.down;
        const holdingBack = (f.facing === 1 && c.left) || (f.facing === -1 && c.right);
        const holdingFwd = (f.facing === 1 && c.right) || (f.facing === -1 && c.left);

        // dash detection: double tap
        const dirTap = c.right && !pc.right ? 1 : c.left && !pc.left ? -1 : 0;
        if (dirTap !== 0) {
          if (this.tapDir[w] === dirTap && this.frame - this.tapT[w] <= 10 && !holdingBack) {
            f.state = 'dash'; f.stateT = DASH_F;
            this.events.push({ t: 'dash', who: w, back: false });
            break;
          }
          this.tapDir[w] = dirTap; this.tapT[w] = this.frame;
        }
        if (holdingBack && !dirTap && ((f.facing === 1 && c.left && !pc.left) || (f.facing === -1 && c.right && !pc.right))) {
          f.state = 'backdash'; f.stateT = DASH_B;
          this.events.push({ t: 'dash', who: w, back: true });
          break;
        }

        // jump
        if (edge(c.up, pc.up)) {
          f.state = 'jump'; f.stateT = PREJUMP; f.vy = 0;
          f.airborne = false; // becomes airborne after prejump
          break;
        }
        // drive actions
        if (edge(c.rush, pc.rush) && f.drive >= 25 && holdingFwd) {
          f.drive -= 25; f.state = 'rush'; f.stateT = RUSH_F;
          this.events.push({ t: 'rush', who: w });
          break;
        }
        if (edge(c.parry, pc.parry)) {
          f.state = 'parry'; f.stateT = PARRY_START + PARRY_ACTIVE + PARRY_RECOVER;
          f.moveFrame = 0;
          break;
        }
        if (edge(c.impact, pc.impact) && f.drive >= 25) {
          f.drive -= 25;
          this.startAttack(w, MOVES.drive_impact);
          break;
        }
        if (edge(c.throw, pc.throw)) {
          if (dist <= MOVES.throw.reach + BODY_HALF * CHAR_SCALE[o.id]) {
            this.startAttack(w, MOVES.throw);
            this.events.push({ t: 'throw_start', who: w });
          } else {
            // whiffed grab
            this.startAttack(w, MOVES.throw);
            this.events.push({ t: 'throw_start', who: w });
          }
          break;
        }
        const moveId = pickGroundMove(c.down, holdingFwd,
          edge(c.lp, pc.lp), edge(c.mp, pc.mp), edge(c.hp, pc.hp),
          edge(c.lk, pc.lk), edge(c.mk, pc.mk), edge(c.hk, pc.hk));
        if (moveId) {
          this.startAttack(w, MOVES[moveId]);
          break;
        }

        // movement
        if (c.down) {
          f.state = 'crouch';
        } else if (c.left || c.right) {
          const dir = c.right ? 1 : -1;
          f.x += dir * (dir === f.facing ? WALK_F : WALK_B);
          f.state = 'walk';
        } else {
          f.state = 'idle';
        }
        if (f.drive < MAX_DRIVE) f.drive = Math.min(MAX_DRIVE, f.drive + 0.07);
        break;
      }

      case 'jump': {
        if (f.stateT > 0 && !f.airborne) {
          f.stateT--;
          if (f.stateT === 0) {
            f.airborne = true;
            f.vy = JUMP_VY;
            const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
            (f as Fighter & { jumpDir?: number }).jumpDir = dir;
            this.events.push({ t: 'jump', who: w });
          }
          break;
        }
        const dir = (f as Fighter & { jumpDir?: number }).jumpDir ?? 0;
        // air attack: any of the six buttons picks its air variant
        if (!f.airAttackUsed) {
          const airId = pickAirMove(
            edge(c.lp, pc.lp), edge(c.mp, pc.mp), edge(c.hp, pc.hp),
            edge(c.lk, pc.lk), edge(c.mk, pc.mk), edge(c.hk, pc.hk));
          if (airId) {
            f.airAttackUsed = true;
            this.startAttack(w, MOVES[airId]);
          }
        }
        if ((f.state as string) !== 'attack') f.state = 'jump';
        f.x += dir * 4.9;
        this.applyGravity(f);
        break;
      }

      case 'attack': {
        const m = f.move!;
        f.moveFrame++;
        if (f.airborne) this.applyGravity(f);
        if (f.armor) f.armor = m.armorStart !== undefined &&
          f.moveFrame >= m.armorStart && f.moveFrame <= m.armorEnd!;
        else if (m.armorStart !== undefined && f.moveFrame >= m.armorStart && f.moveFrame <= m.armorEnd!) {
          f.armor = true;
        }

        const inActive = f.moveFrame > m.startup && f.moveFrame <= m.startup + m.active;
        if (inActive && !f.moveHit) {
          this.tryHit(w, m);
        }
        const total = m.startup + m.active + m.recovery;
        if (f.moveFrame >= total) {
          if (!f.moveHit) this.events.push({ t: 'attack_whiff', who: w, move: m });
          f.move = null; f.moveFrame = 0; f.armor = false;
          f.state = f.airborne ? 'jump' : 'idle';
        }
        if (f.airborne && f.y >= 0 && f.vy > 0) {
          this.land(f);
        }
        break;
      }

      case 'dash': {
        f.stateT--;
        f.x += f.facing * DASH_F_SPEED;
        if (f.stateT <= 0) f.state = 'idle';
        break;
      }
      case 'backdash': {
        f.stateT--;
        f.x -= f.facing * DASH_B_SPEED;
        if (f.stateT <= 0) f.state = 'idle';
        break;
      }
      case 'rush': {
        f.stateT--;
        f.x += f.facing * RUSH_SPEED;
        if (f.stateT <= 0) {
          f.state = 'idle';
          f.rushBuff = 40;
        }
        break;
      }
      case 'parry': {
        f.stateT--;
        f.moveFrame++;
        if (f.stateT <= 0) {
          f.state = 'idle';
          this.events.push({ t: 'parry_whiff', who: w });
        }
        break;
      }
      case 'hitstun': case 'stagger': {
        f.stateT--;
        if (f.airborne) {
          this.applyGravity(f);
          if (f.y >= 0 && f.vy > 0) {
            this.land(f);
            f.state = 'knockdown'; f.stateT = KD_LIE + KD_WAKE;
            this.events.push({ t: 'knockdown', who: w });
          }
        } else if (f.stateT <= 0) {
          f.state = 'idle';
          o.comboHits = 0;
        }
        break;
      }
      case 'blockstun': {
        f.stateT--;
        f.crouch = c.down;
        if (f.stateT <= 0) {
          f.state = 'idle';
          o.comboHits = 0;
        }
        break;
      }
      case 'knockdown': {
        f.stateT--;
        if (f.stateT === KD_WAKE) {
          f.state = 'wakeup'; f.stateT = KD_WAKE;
          this.events.push({ t: 'wakeup', who: w });
        } else if (f.stateT <= 0) {
          f.state = 'idle';
          o.comboHits = 0;
        }
        break;
      }
      case 'wakeup': {
        f.stateT--;
        if (f.stateT <= 0) {
          f.state = 'idle';
          o.comboHits = 0;
        }
        break;
      }
      case 'thrown': {
        f.stateT--;
        f.x -= f.facing * 6;
        if (f.stateT <= 0) {
          f.state = 'knockdown'; f.stateT = KD_LIE + KD_WAKE;
          this.events.push({ t: 'knockdown', who: w });
        }
        break;
      }
      case 'ko': case 'win': case 'intro': {
        if (f.state === 'ko') this.applyGravity(f);
        break;
      }
    }

    // walls
    if (f.x < WALL_L) f.x = WALL_L;
    if (f.x > WALL_R) f.x = WALL_R;
    void towardOp; void dist;
  }

  private applyGravity(f: Fighter): void {
    f.vy += GRAV;
    f.y += f.vy;
    if (f.y > 0) f.y = 0;
  }

  private land(f: Fighter): void {
    f.y = 0; f.vy = 0; f.airborne = false; f.airAttackUsed = false;
    f.juggle = 0;
    if (f.state === 'attack' && f.move) {
      if (!f.moveHit) this.events.push({ t: 'attack_whiff', who: f === this.fighters[0] ? 0 : 1, move: f.move });
      f.move = null; f.moveFrame = 0; f.armor = false;
    }
    f.state = 'idle';
  }

  private startAttack(w: Who, m: MoveDef): void {
    const f = this.fighters[w];
    const o = this.fighters[w === 0 ? 1 : 0];
    f.state = 'attack';
    f.move = m;
    f.moveFrame = 0;
    f.moveHit = false;
    f.armor = false;
    f.crouch = !!m.crouchOnly;
    this.events.push({
      t: 'attack_start', who: w, move: m,
      dist: Math.abs(f.x - o.x),
    });
  }

  /* ---------- hit resolution ---------- */

  private tryHit(w: Who, m: MoveDef): void {
    const a = this.fighters[w];
    const d = this.fighters[w === 0 ? 1 : 0];
    const dw = (w === 0 ? 1 : 0) as Who;

    // horizontal hitbox (defender body width scales with character size)
    const x0 = a.x + a.facing * 24;
    const x1 = a.x + a.facing * m.reach;
    const hxMin = Math.min(x0, x1);
    const hxMax = Math.max(x0, x1);
    const dHalf = BODY_HALF * CHAR_SCALE[d.id];
    const dxMin = d.x - dHalf;
    const dxMax = d.x + dHalf;
    if (hxMax < dxMin || hxMin > dxMax) return;

    // vertical band: defender hurtbox (taller frame => taller hurtbox)
    const sc = CHAR_SCALE[d.id];
    const dTop = d.airborne ? d.y - AIR_TOP * sc
      : d.crouch ? d.y - CROUCH_TOP * sc : d.y - STAND_TOP * sc;
    const dBot = d.airborne ? d.y - AIR_BOT * sc : d.y;
    const hitTop = m.hitH0 ?? -250;
    const hitBot = m.hitH1 ?? 0;
    if (hitBot < dTop || hitTop > dBot) return;

    // defender invulnerable during wakeup / lying knockdown
    if (d.state === 'wakeup' && d.stateT > KD_WAKE - 8) return;
    if (d.state === 'knockdown' && d.stateT > KD_WAKE) return;
    if (d.state === 'ko') return;

    // parry
    if (d.state === 'parry') {
      const pFrame = (PARRY_START + PARRY_ACTIVE + PARRY_RECOVER) - d.stateT;
      if (pFrame > PARRY_START && pFrame <= PARRY_START + PARRY_ACTIVE && m.level !== 'throw') {
        d.drive = Math.min(MAX_DRIVE, d.drive + 40);
        d.stateT = 4; // snap out of parry into brief flash
        a.state = 'stagger'; a.stateT = 26; a.move = null; a.moveFrame = 0; a.armor = false;
        this.events.push({ t: 'parried', who: dw });
        this.events.push({ t: 'stagger', who: w, frames: 26 });
        this.hitstop = 10;
        a.moveHit = true;
        return;
      }
    }

    // throw
    if (m.level === 'throw') {
      const groundedOk = !d.airborne && d.state !== 'knockdown' && d.state !== 'wakeup';
      if (!groundedOk) return;
      const techWindow = m.techable ?? 10;
      if (this.frame - this.lastTechTry[dw] <= techWindow) {
        // tech! both pushed
        a.x -= a.facing * 55;
        d.x += d.facing * 20;
        a.state = 'stagger'; a.stateT = 14;
        d.state = 'idle';
        this.events.push({ t: 'tech', who: dw });
        a.moveHit = true;
        this.hitstop = 6;
        return;
      }
      // thrown
      d.hp -= m.damage;
      d.state = 'thrown'; d.stateT = 34; d.lastStunHigh = false;
      d.hitFlash = 8;
      a.moveHit = true;
      this.events.push({ t: 'hit', who: dw, move: m, dmg: m.damage, counter: false });
      this.events.push({ t: 'knockdown', who: dw });
      this.hitstop = 12;
      this.shake = 10;
      a.drive = Math.min(MAX_DRIVE, a.drive + 8);
      d.drive = Math.max(0, d.drive - 10);
      if (d.hp <= 0) this.triggerKO(w);
      return;
    }

    // armor absorption (drive impact)
    if (d.armor && d.state === 'attack') {
      d.hp -= Math.floor(m.damage * 0.4);
      d.hitFlash = 4;
      this.events.push({ t: 'hit', who: dw, move: m, dmg: Math.floor(m.damage * 0.4), counter: false });
      this.hitstop = 8;
      this.shake = 6;
      a.moveHit = true;
      if (d.hp <= 0) this.triggerKO(w);
      return;
    }

    // block check
    const holdingBack = (d.facing === 1 && this.currentCmd(dw).left) ||
      (d.facing === -1 && this.currentCmd(dw).right);
    const canBlock = holdingBack && !d.airborne &&
      !['attack', 'hitstun', 'knockdown', 'wakeup', 'stagger', 'thrown', 'ko'].includes(d.state);
    const blocksLow = canBlock && d.crouch;
    const blocksHigh = canBlock && !d.crouch;
    const blocked =
      (m.level === 'low' && blocksLow) ||
      (m.level === 'overhead' && blocksHigh) ||
      ((m.level === 'high' || m.level === 'mid') && (blocksLow || blocksHigh));

    if (blocked) {
      const rem = this.attackerRemaining(a);
      d.state = 'blockstun';
      d.stateT = Math.max(2, m.blockAdv + rem);
      d.crouch = this.currentCmd(dw).down;
      d.blockFlash = 6;
      const push = 10;
      this.pushApart(d, a, push, 4);
      d.drive = Math.min(MAX_DRIVE, d.drive + 2);
      a.drive = Math.min(MAX_DRIVE, a.drive + 4);
      this.events.push({ t: 'blocked', who: dw, move: m });
      a.moveHit = true;
      this.hitstop = 5;
      return;
    }

    // clean hit
    const counter = d.state === 'attack' && d.moveFrame <= d.move!.startup;
    let dmg = m.damage * comboScale(a.comboHits);
    if (counter) dmg *= 1.25;
    if (d.airborne && d.juggle > 0) dmg *= 0.8;
    dmg = Math.round(dmg);
    if (!Number.isFinite(dmg) || dmg <= 0) dmg = m.damage; // safety guard
    d.hp -= dmg;
    d.hitFlash = 8;
    d.lastStunHigh = m.stun === 'high';

    const rem = this.attackerRemaining(a);
    let stun = Math.max(2, m.hitAdv + rem) + (counter ? 4 : 0) + (a.rushBuff > 0 ? 6 : 0);

    a.moveHit = true;
    a.drive = Math.min(MAX_DRIVE, a.drive + 8);
    d.drive = Math.max(0, d.drive - 10);

    const juggleOk = m.launcher || (d.airborne && d.juggle < 3);
    if (juggleOk) {
      d.airborne = true;
      d.vy = m.launcher ? -10.5 : -8;
      d.state = 'hitstun';
      d.stateT = stun;
      d.juggle += 1;
    } else if (m.knockdown) {
      d.state = 'knockdown';
      d.stateT = KD_LIE + KD_WAKE;
      this.events.push({ t: 'knockdown', who: dw });
    } else if (d.airborne) {
      d.state = 'hitstun';
      d.stateT = stun;
      d.juggle += 1;
    } else {
      d.state = 'hitstun';
      d.stateT = stun;
    }

    this.events.push({ t: 'hit', who: dw, move: m, dmg, counter });
    this.hitstop = m.fxHeavy || counter ? 12 : 7;
    this.shake = Math.max(this.shake, m.fxHeavy ? 12 : counter ? 8 : 4);
    this.pushApart(d, a, 14, 5);
    a.comboHits++;
    if (d.hp <= 0) this.triggerKO(w);
  }

  private attackerRemaining(a: Fighter): number {
    const m = a.move!;
    const total = m.startup + m.active + m.recovery;
    return Math.max(0, total - a.moveFrame);
  }

  private pushApart(victim: Fighter, attacker: Fighter, vPush: number, aPush: number): void {
    const dir = victim.x >= attacker.x ? 1 : -1;
    const vTarget = clamp(victim.x + dir * vPush);
    if (vTarget === victim.x + dir * vPush) {
      victim.x = vTarget;
      attacker.x = clamp(attacker.x - dir * aPush);
    } else {
      attacker.x = clamp(attacker.x - dir * (vPush + aPush));
    }
  }

  private separateBodies(): void {
    const [a, b] = this.fighters;
    const skip = (f: Fighter) => f.state === 'knockdown' || f.state === 'ko' ||
      f.state === 'thrown' || (f.airborne && Math.abs(f.y) > 60);
    if (skip(a) || skip(b)) return;
    const minDist = BODY_HALF * (CHAR_SCALE[a.id] + CHAR_SCALE[b.id]) - 6;
    const overlap = minDist - Math.abs(a.x - b.x);
    if (overlap > 0) {
      const dir = a.x <= b.x ? 1 : -1;
      const halfL = overlap / 2;
      const nx1 = clamp(a.x - dir * halfL);
      const nx2 = clamp(b.x + dir * halfL);
      if (Math.abs(nx2 - nx1) < minDist) {
        a.x = clamp(nx1 - dir * overlap);
        b.x = nx2;
      } else {
        a.x = nx1; b.x = nx2;
      }
    }
  }

  private checkTime(): void {
    this.timer--;
    if (this.timer <= 0) {
      this.timer = 0;
      const [a, b] = this.fighters;
      if (a.hp === b.hp) {
        this.roundWinner = null;
        this.announce = { text: 'TIME UP - DRAW', t: 90 };
      } else {
        const w: Who = a.hp > b.hp ? 0 : 1;
        this.roundWinner = w;
        this.fighters[w].state = 'win';
        this.fighters[w].wins++;
        this.announce = { text: 'TIME UP', t: 90 };
      }
      this.phase = 'ko';
      this.phaseT = 120;
      this.koSlowmo = false;
    }
  }

  private triggerKO(byWho: Who): void {
    const loserW = (byWho === 0 ? 1 : 0) as Who;
    const loser = this.fighters[loserW];
    loser.hp = Math.max(0, Number.isFinite(loser.hp) ? loser.hp : 0);
    loser.state = 'ko';
    loser.airborne = true;
    loser.vy = -8;
    this.fighters[byWho].move = null;
    this.fighters[byWho].state = 'idle';
    this.fighters[byWho].wins++;
    this.roundWinner = byWho;
    this.phase = 'ko';
    this.phaseT = 170;
    this.koSlowmo = true;
    this.hitstop = 24;
    this.shake = 16;
    this.announce = { text: 'K.O.', t: 130 };
  }

  private endRound(): void {
    if (this.roundWinner !== null) {
      if (this.fighters[this.roundWinner].wins >= this.roundsToWin) {
        this.matchWinner = this.roundWinner;
      } else {
        this.fighters[this.roundWinner].state = 'win';
        this.announce = { text: this.roundWinner === 0 ? 'ROUND WON' : 'ROUND LOST', t: 90 };
      }
    } else {
      this.announce = { text: 'DRAW', t: 80 };
    }
    this.phase = 'roundend';
    this.phaseT = 130;
  }

  private currentCmd(w: Who): Cmd {
    return this.prev[w];
  }
}

function view(f: Fighter, dist: number): FighterView {
  let movePhase = 'none';
  let moveTotal = 0;
  if (f.move) {
    moveTotal = f.move.startup + f.move.active + f.move.recovery;
    movePhase = f.moveFrame <= f.move.startup ? 'startup'
      : f.moveFrame <= f.move.startup + f.move.active ? 'active' : 'recovery';
  }
  void dist;
  return {
    x: f.x, y: f.y, facing: f.facing,
    hp: f.hp, drive: f.drive, wins: f.wins,
    state: f.state, stateT: f.stateT,
    crouch: f.crouch, airborne: f.airborne,
    move: f.move ? f.move.name : null,
    movePhase, moveFrame: f.moveFrame, moveTotal,
    juggle: f.juggle,
    name: f.id === 'kaito' ? 'Kaito Ren' : 'VX-9',
  };
}

function clamp(x: number): number {
  return Math.max(WALL_L, Math.min(WALL_R, x));
}
