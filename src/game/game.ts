/* Game orchestrator: fixed-step loop, input mapping, event->fx, round flow. */
import { Engine } from './engine';
import { Assets } from './assets';
import { Renderer, reportKernelTiming } from './render';
import { Sfx } from './sfx';
import { ArbiterAI, AIStatus, DifficultyCfg, PersonaCfg } from './ai';
import { KernelBridge } from './kernelClient';
import { ExperienceBrain } from './brain';
import { MOVES } from './moves';
import { Cmd, FState, MatchConfig, MoveId, Who, emptyCmd, FLOOR_Y, VIEW_H, VIEW_W } from './types';

export interface GameCallbacks {
  onMatchEnd: (playerWon: boolean, score: [number, number]) => void;
  onPauseRequest: () => void;
}

export class Game {
  engine: Engine;
  renderer: Renderer;
  ai: ArbiterAI;
  sfx = new Sfx();
  private assets: Assets;
  private bridge: KernelBridge;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private keys = new Set<string>();
  private running = false;
  paused = false;
  private prevCmd: Cmd = emptyCmd();
  private cfg: MatchConfig;
  private cb: GameCallbacks;
  private slowTick = false;
  private aiStatus: AIStatus;
  private gamepad: Gamepad | null = null;
  private padStartPrev = false;
  private brain: ExperienceBrain | null;

  constructor(canvas: HTMLCanvasElement, assets: Assets, bridge: KernelBridge,
    cfg: MatchConfig, diff: DifficultyCfg, persona: PersonaCfg, cb: GameCallbacks,
    brain: ExperienceBrain | null = null) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.assets = assets;
    this.bridge = bridge;
    this.cfg = cfg;
    this.cb = cb;
    this.brain = brain;
    this.engine = new Engine(2);
    this.renderer = new Renderer(ctx, assets);
    this.ai = new ArbiterAI(bridge, diff, persona, brain, 1);
    this.aiStatus = this.ai.status;
  }

  start(): void {
    (window as unknown as { __game?: Game }).__game = this; // debug probe
    this.engine.resetMatch();
    this.ai.resetMatch();
    this.running = true;
    this.last = performance.now();
    this.loop(this.last);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.last = performance.now();
  }

  keyDown(code: string): boolean {
    if (code === 'Escape') { this.cb.onPauseRequest(); return true; }
    if (code === 'Period') {
      this.sfx.setMuted(!this.sfx.muted);
      return true;
    }
    if (!this.keys.has(code)) {
      this.keys.add(code);
      this.sfx.resume();
    }
    return false;
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  /* ---------- gamepad (Xbox standard mapping) ---------- */

  private pollGamepad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      this.gamepad = null;
      return;
    }
    try {
      const pads = navigator.getGamepads();
      let pad: Gamepad | null = null;
      for (const p of pads) {
        if (p && p.connected) { pad = p; break; }
      }
      this.gamepad = pad;
    } catch {
      this.gamepad = null;
    }
  }

  get padName(): string | null {
    return this.gamepad ? this.gamepad.id : null;
  }

  /**
   * Classic six-button mapping on the Xbox pad (Street Fighter style):
   *   X light punch - Y medium punch - RB heavy punch
   *   A light kick  - B medium kick - RT heavy kick
   *   A+X throw - LB drive impact (or RB+RT) - LT drive parry
   *   Y+B drive rush - Menu pause
   */
  private buildPadCmd(): Cmd | null {
    const gp = this.gamepad;
    if (!gp) return null;
    const btn = (i: number) => !!gp.buttons[i]?.pressed;
    const ax0 = gp.axes[0] ?? 0;
    const ax1 = gp.axes[1] ?? 0;
    const c = emptyCmd();
    c.left = ax0 < -0.4 || btn(14);
    c.right = ax0 > 0.4 || btn(15);
    c.up = ax1 < -0.6 || btn(12);
    c.down = ax1 > 0.6 || btn(13);
    c.lp = btn(2);                  // X
    c.mp = btn(3);                  // Y
    c.hp = btn(5);                  // RB
    c.lk = btn(0);                  // A
    c.mk = btn(1);                  // B
    c.hk = btn(7);                  // RT
    c.throw = btn(0) && btn(2);     // A + X
    c.impact = btn(4) || (btn(5) && btn(7)); // LB, or RB + RT
    c.parry = btn(6);               // LT
    c.rush = btn(3) && btn(1);      // Y + B
    return c;
  }

  private handlePadPause(): void {
    const start = !!this.gamepad?.buttons[9]?.pressed; // Menu/Start
    if (start && !this.padStartPrev) this.cb.onPauseRequest();
    this.padStartPrev = start;
  }

  private rumble(strong: number, weak: number, ms: number): void {
    const act = (this.gamepad as (Gamepad & {
      vibrationActuator?: {
        playEffect?: (t: string, p: Record<string, number>) => Promise<string>;
      };
    }) | null)?.vibrationActuator;
    if (act?.playEffect) {
      try {
        void act.playEffect('dual-rumble', {
          duration: ms, strongMagnitude: strong, weakMagnitude: weak,
        });
      } catch { /* haptics unsupported - ignore */ }
    }
  }

  private buildPlayerCmd(): Cmd {
    const k = this.keys;
    const c = emptyCmd();
    if (k.has('ArrowLeft') || k.has('KeyA')) c.left = true;
    if (k.has('ArrowRight') || k.has('KeyD')) c.right = true;
    if (k.has('ArrowUp') || k.has('KeyW')) c.up = true;
    if (k.has('ArrowDown') || k.has('KeyS')) c.down = true;
    // punches
    if (k.has('KeyJ')) c.lp = true;
    if (k.has('KeyK')) c.mp = true;
    if (k.has('KeyL')) c.hp = true;
    // kicks
    if (k.has('KeyU')) c.lk = true;
    if (k.has('KeyI')) c.mk = true;
    if (k.has('KeyO')) c.hk = true;
    // command moves
    if (k.has('KeyB')) c.throw = true;
    if (k.has('KeyN')) c.impact = true;
    if (k.has('KeyM')) c.parry = true;
    if (k.has('Comma')) c.rush = true;
    const pad = this.buildPadCmd();
    if (pad) {
      c.left = c.left || pad.left;
      c.right = c.right || pad.right;
      c.up = c.up || pad.up;
      c.down = c.down || pad.down;
      c.lp = c.lp || pad.lp;
      c.mp = c.mp || pad.mp;
      c.hp = c.hp || pad.hp;
      c.lk = c.lk || pad.lk;
      c.mk = c.mk || pad.mk;
      c.hk = c.hk || pad.hk;
      c.throw = c.throw || pad.throw;
      c.impact = c.impact || pad.impact;
      c.parry = c.parry || pad.parry;
      c.rush = c.rush || pad.rush;
    }
    return c;
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    // gamepad polled every rAF frame, even while paused (so START can resume)
    this.pollGamepad();
    this.handlePadPause();
    if (this.paused) return;

    const dt = Math.min(100, now - this.last);
    this.last = now;
    this.acc += dt;
    const stepMs = 1000 / 60;
    const want = Math.floor(this.acc / stepMs);
    this.acc -= want * stepMs;
    if (want > 5) this.acc = 0; // drop backlog: never run faster than real time
    const steps = Math.min(want, 5);
    for (let i = 0; i < steps; i++) {
      this.slowTick = !this.slowTick;
      const doSim = !(this.engine.koSlowmo && !this.slowTick);
      if (doSim) this.step();
    }
    this.renderer.draw(this.engine, this.aiStatus, this.cfg.stage);
  };

  private step(): void {
    const e = this.engine;
    e.shake = Math.max(0, e.shake - 1.2);

    const playerCmd = e.phase === 'fight' ? this.buildPlayerCmd() : emptyCmd();
    const events = e.drainEvents();

    let aiCmd: Cmd = emptyCmd();
    if (e.phase === 'fight') {
      aiCmd = this.ai.command(e.snapshot(), events);
    } else {
      // still observe so habits stay warm
      this.ai.command(e.snapshot(), []);
    }

    const before = e.phase;
    e.tick([playerCmd, aiCmd]);
    const after = e.phase;

    if (before === 'intro' && after === 'fight') this.sfx.round();

    // round result -> credit the brain's choices from this round
    if ((after === 'roundend' || after === 'matchend')
      && before !== 'roundend' && before !== 'matchend'
      && e.roundWinner !== null) {
      this.ai.creditRound(e.roundWinner === 1);
    }

    this.dispatchFx(events);
    reportKernelTiming(this.bridge.totalMs, this.bridge.totalCalls);

    // health bar trails
    const [p1, p2] = e.fighters;
    const r = this.renderer.trails;
    r[0] += (p1.hp / 1000 - r[0]) * 0.06;
    r[1] += (p2.hp / 1000 - r[1]) * 0.06;
    if (r[0] < p1.hp / 1000) r[0] = p1.hp / 1000;
    if (r[1] < p2.hp / 1000) r[1] = p2.hp / 1000;

    if (e.phase === 'matchend' && e.matchWinner !== null && before !== 'matchend') {
      this.cb.onMatchEnd(e.matchWinner === 0, [e.fighters[0].wins, e.fighters[1].wins]);
    }
    void this.prevCmd;
    this.prevCmd = playerCmd;
  }

  private dispatchFx(events: ReturnType<Engine['drainEvents']>): void {
    const e = this.engine;
    const [p1, p2] = e.fighters;
    for (const ev of events) {
      const victim = ev.who === 0 ? p1 : p2;
      const actor = ev.who === 0 ? p2 : p1;
      switch (ev.t) {
        case 'hit': {
          const heavy = ev.move.fxHeavy || ev.counter || ev.dmg >= 100;
          this.renderer.spawn(heavy ? 'heavyflash' : 'hitspark',
            victim.x - victim.facing * 30, FLOOR_Y + victim.y - (victim.crouch ? 90 : 170));
          this.sfx.hit(heavy);
          if (ev.who === 0) this.rumble(heavy ? 1.0 : 0.7, heavy ? 0.6 : 0.35, heavy ? 200 : 120);
          if (ev.counter) {
            this.renderer.spawn('counter', victim.x, FLOOR_Y - 330,
              { text: 'COUNTER', color: '#ff5040' });
          }
          break;
        }
        case 'blocked':
          this.renderer.spawn('guard', victim.x + victim.facing * 50, FLOOR_Y - 160);
          this.sfx.block();
          break;
        case 'parried':
          this.renderer.spawn('parry', actor.x, FLOOR_Y - 180);
          this.sfx.parry();
          break;
        case 'tech':
          this.renderer.spawn('dust', victim.x, FLOOR_Y - 40);
          this.renderer.spawn('tech', victim.x, FLOOR_Y - 300, { text: 'TECH', color: '#7ee8ff' });
          this.sfx.tech();
          break;
        case 'dash':
          this.renderer.spawn('dust', actor.x, FLOOR_Y - 30);
          this.sfx.dash();
          break;
        case 'jump':
          this.sfx.jump();
          break;
        case 'knockdown':
          this.renderer.spawn('dust', victim.x, FLOOR_Y - 30);
          break;
        case 'parry_whiff':
          break;
        case 'rush':
          this.sfx.dash();
          break;
        case 'stagger':
          break;
        case 'attack_start':
          if (ev.move.id === 'drive_impact') {
            this.renderer.spawn('guard', actor.x, FLOOR_Y - 170);
          }
          break;
        case 'throw_start':
          break;
        case 'attack_whiff':
          break;
        case 'wakeup':
          break;
      }
    }
    // KO burst
    if (e.phase === 'ko' && e.koSlowmo && e.announce?.text === 'K.O.') {
      const loser = e.roundWinner === 0 ? p2 : p1;
      if (!this.koFxSpawned) {
        this.koFxSpawned = true;
        this.renderer.spawn('koburst', loser.x, FLOOR_Y - 200);
        this.sfx.ko();
        this.rumble(1.0, 1.0, 380);
      }
    }
    if (e.phase !== 'ko') this.koFxSpawned = false;
  }

  private koFxSpawned = false;

  get viewSize(): { w: number; h: number } {
    return { w: VIEW_W, h: VIEW_H };
  }

  /* ---------- test support ---------- */

  /**
   * Test-support hook: freeze a fighter into a given state and render exactly
   * one frame without stepping the simulation. Stage is omitted so the
   * fighter's pixels can be measured against a cleared background (used by
   * the E2E suite to verify sprite size consistency in-game).
   */
  debugDrawState(who: Who, state: FState, moveId: MoveId | null = null,
    vy = -1): void {
    const e = this.engine;
    const f = e.fighters[who];
    const other = e.fighters[who === 0 ? 1 : 0];
    other.x = 4000; other.y = 0; other.airborne = false; // park outside view
    f.x = 960; f.y = 0; f.vy = vy; f.facing = 1;
    f.state = state;
    f.move = moveId ? MOVES[moveId] : null;
    f.moveFrame = f.move ? f.move.startup + 1 : 0;
    f.moveHit = false;
    f.airborne = state === 'jump';
    f.crouch = state === 'crouch' || state === 'wakeup';
    f.hitFlash = 0; f.blockFlash = 0; f.animT = 8; f.rushBuff = 0;
    e.shake = 0;
    e.announce = null;
    e.phase = 'fight';
    this.renderer.draw(e, null, '');
  }
}
