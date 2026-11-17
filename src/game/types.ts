/* Shared types for the Arbiter Dojo fighting game. */

export type FighterId = 'kaito' | 'vx9';

/* Six-button layout, classic style:
 *   punches  lp / mp / hp  (fast-light -> slow-heavy)
 *   kicks    lk / mk / hk  (fast-light -> slow-heavy)
 * plus crouching variants, air variants, launcher, throw and drive moves. */
export type MoveId =
  | 'lp' | 'mp' | 'hp' | 'lk' | 'mk' | 'hk'
  | 'cr_lp' | 'cr_mp' | 'cr_hp' | 'cr_lk' | 'cr_mk' | 'cr_hk'
  | 'launcher'
  | 'air_lp' | 'air_mp' | 'air_hp' | 'air_lk' | 'air_mk' | 'air_hk'
  | 'throw' | 'drive_impact';

export type Level = 'high' | 'mid' | 'low' | 'overhead' | 'throw';

export interface MoveDef {
  id: MoveId;
  name: string;
  pose: string;              // semantic pose key (both fighters share names)
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  level: Level;
  reach: number;             // hitbox reach from fighter center, px
  hitAdv: number;            // frame advantage on hit
  blockAdv: number;          // frame advantage on block
  knockdown?: boolean;
  launcher?: boolean;
  cost?: number;             // drive cost
  armorStart?: number;       // armor window in move frames (inclusive)
  armorEnd?: number;
  techable?: number;         // throw tech window, frames
  airOnly?: boolean;
  crouchOnly?: boolean;      // only usable while crouching
  fxHeavy?: boolean;
  stun?: 'high' | 'body';    // hurt pose the victim snaps into
  hitH0?: number;            // hitbox vertical band relative to feet (negative up)
  hitH1?: number;
}

export interface Cmd {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /* six attack buttons */
  lp: boolean;               // light punch
  mp: boolean;               // medium punch
  hp: boolean;               // heavy punch
  lk: boolean;               // light kick
  mk: boolean;               // medium kick
  hk: boolean;               // heavy kick
  throw: boolean;
  impact: boolean;           // drive impact
  parry: boolean;            // drive parry
  rush: boolean;             // drive rush
}

export type FState =
  | 'idle' | 'walk' | 'crouch' | 'jump' | 'dash' | 'backdash'
  | 'attack' | 'hitstun' | 'blockstun' | 'stagger' | 'knockdown'
  | 'wakeup' | 'thrown' | 'parry' | 'rush' | 'ko' | 'win' | 'intro';

export interface Fighter {
  id: FighterId;
  x: number;                 // feet center, world px
  y: number;                 // 0 = floor, negative = airborne height
  vy: number;
  facing: 1 | -1;
  state: FState;
  stateT: number;            // frames remaining in state (0 = free)
  move: MoveDef | null;
  moveFrame: number;
  moveHit: boolean;
  armor: boolean;
  airborne: boolean;
  juggle: number;            // juggle hits taken while airborne
  crouch: boolean;
  hp: number;
  drive: number;
  wins: number;
  rushBuff: number;          // drive-rush advantage frames
  airAttackUsed: boolean;
  animT: number;             // animation clock
  hitFlash: number;
  blockFlash: number;
  comboHits: number;         // combo hits landed on current victim stun
  lastStunHigh: boolean;     // true = snap into hit_high pose
}

export type Who = 0 | 1;

export type GameEvent =
  | { t: 'attack_start'; who: Who; move: MoveDef; dist: number }
  | { t: 'attack_whiff'; who: Who; move: MoveDef }
  | { t: 'blocked'; who: Who; move: MoveDef }              // who = defender
  | { t: 'hit'; who: Who; move: MoveDef; dmg: number; counter: boolean }  // who = victim
  | { t: 'tech'; who: Who }
  | { t: 'jump'; who: Who }
  | { t: 'dash'; who: Who; back: boolean }
  | { t: 'knockdown'; who: Who }
  | { t: 'wakeup'; who: Who }
  | { t: 'parried'; who: Who }                              // who = parrier
  | { t: 'parry_whiff'; who: Who }
  | { t: 'rush'; who: Who }
  | { t: 'throw_start'; who: Who }
  | { t: 'stagger'; who: Who; frames: number };

export type Phase = 'intro' | 'fight' | 'ko' | 'roundend' | 'matchend';

export interface MatchConfig {
  difficulty: 'rookie' | 'veteran' | 'master';
  persona: 'rushdown' | 'counter' | 'adaptive';
  stage: string;
  rounds: number;            // wins needed
}

export const emptyCmd = (): Cmd => ({
  left: false, right: false, up: false, down: false,
  lp: false, mp: false, hp: false, lk: false, mk: false, hk: false,
  throw: false, impact: false, parry: false, rush: false,
});

/* ---- world constants (60 fps fixed step) ---- */
export const VIEW_W = 1920;
export const VIEW_H = 1080;
export const FLOOR_Y = 950;
export const WALL_L = 80;
export const WALL_R = 1840;
export const BODY_HALF = 58;
export const GRAV = 0.92;
export const JUMP_VY = -15.8;
export const WALK_F = 5.4;
export const WALK_B = 4.5;
export const MAX_HP = 1000;
export const MAX_DRIVE = 100;
export const ROUND_SECONDS = 99;
export const START_X: [number, number] = [620, 1300];

/* ---- per-character body scale ----
 * VX-9 "Arbiter" is a heavier combat frame and must read slightly larger
 * than Kaito Ren in every pose (user spec). One factor drives both layers:
 *   visual    - manifest draw_h values for vx9 are pre-multiplied by it
 *   collision - hurtbox bands, throw grab box and pushbox scale with it,
 *               so hit detection keeps matching the bigger silhouette.
 * Kaito is the reference build at 1.0; Arbiter is 10% larger. */
export const CHAR_SCALE: Record<FighterId, number> = { kaito: 1.0, vx9: 1.1 };

/* Hurtbox band heights (world px above feet) for a scale-1.0 fighter. */
export const STAND_TOP = 300;   // standing hurtbox top
export const CROUCH_TOP = 180;  // crouching hurtbox top
export const AIR_TOP = 260;     // airborne hurtbox top above y
export const AIR_BOT = 20;      // airborne hurtbox bottom margin above feet
