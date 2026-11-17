/* Frame data - the shared rulebook both fighters obey.
 *
 * Six-button classic layout (Street Fighter style): three punches and three
 * kicks, each in a light/medium/heavy weight. Weights follow the standard
 * conventions researched from fighting-game references (Infil's glossary,
 * SuperCombo SF6 frame data):
 *   - lights come out fastest (5-6f) with short active/recovery windows and
 *     the least damage; they are plus-on-block pokes.
 *   - mediums trade a few more startup frames for meaningfully more damage
 *     and reach (7-11f).
 *   - heavies are the slow buttons (13-16f), biggest reward, but heavily
 *     minus on block so they must be spaced or conditioned.
 * Kicks hit slightly harder than punches of the same weight but are a touch
 * slower; punches stay the fastest buttons in the game.
 */
import type { MoveDef, MoveId, FighterId } from './types';

export const MOVES: Record<MoveId, MoveDef> = {
  /* ---------------- standing punches (J / K / L) ---------------- */
  lp: {
    id: 'lp', name: 'Jab', pose: 'jab',
    startup: 5, active: 3, recovery: 9,
    damage: 40, level: 'high', reach: 150,
    hitAdv: 4, blockAdv: 1, stun: 'high',
    hitH0: -250, hitH1: -80,
  },
  mp: {
    id: 'mp', name: 'Palm Strike', pose: 'cross',
    startup: 10, active: 4, recovery: 15,
    damage: 80, level: 'mid', reach: 175,
    hitAdv: 6, blockAdv: -3, stun: 'high',
    hitH0: -240, hitH1: -40,
  },
  hp: {
    id: 'hp', name: 'Skullcracker', pose: 'cross',
    startup: 13, active: 4, recovery: 21,
    damage: 115, level: 'mid', reach: 165,
    hitAdv: 5, blockAdv: -8, fxHeavy: true, stun: 'high',
    hitH0: -260, hitH1: -40,
  },
  /* forward + heavy punch: the anti-air / combo starter */
  launcher: {
    id: 'launcher', name: 'Rising Fang', pose: 'launcher',
    startup: 14, active: 4, recovery: 26,
    damage: 70, level: 'mid', reach: 155,
    hitAdv: 0, blockAdv: -24, launcher: true, stun: 'high',
    hitH0: -280, hitH1: -20,
  },

  /* ---------------- standing kicks (U / I / O) ---------------- */
  lk: {
    id: 'lk', name: 'Snap Kick', pose: 'high_kick',
    startup: 6, active: 3, recovery: 10,
    damage: 45, level: 'high', reach: 160,
    hitAdv: 3, blockAdv: -1, stun: 'body',
    hitH0: -240, hitH1: -60,
  },
  mk: {
    id: 'mk', name: 'Rush Knee', pose: 'heavy_kick',
    startup: 11, active: 4, recovery: 16,
    damage: 85, level: 'mid', reach: 185,
    hitAdv: 5, blockAdv: -4, stun: 'body',
    hitH0: -220, hitH1: -20,
  },
  hk: {
    id: 'hk', name: 'Heavy Heel', pose: 'high_kick',
    startup: 16, active: 4, recovery: 22,
    damage: 120, level: 'mid', reach: 195,
    hitAdv: 6, blockAdv: -10, knockdown: true, fxHeavy: true, stun: 'body',
    hitH0: -260, hitH1: -20,
  },

  /* ---------------- crouching punches (S + J / K / L) ---------------- */
  cr_lp: {
    id: 'cr_lp', name: 'Low Jab', pose: 'jab',
    startup: 5, active: 3, recovery: 10,
    damage: 35, level: 'low', reach: 135,
    hitAdv: 2, blockAdv: -2, crouchOnly: true, stun: 'high',
    hitH0: -110, hitH1: 0,
  },
  cr_mp: {
    id: 'cr_mp', name: 'Under Palm', pose: 'cross',
    startup: 9, active: 4, recovery: 14,
    damage: 70, level: 'mid', reach: 150,
    hitAdv: 3, blockAdv: -3, crouchOnly: true, stun: 'high',
    hitH0: -160, hitH1: 0,
  },
  cr_hp: {
    id: 'cr_hp', name: 'Uppercut', pose: 'launcher',
    startup: 12, active: 4, recovery: 20,
    damage: 100, level: 'mid', reach: 140,
    hitAdv: 2, blockAdv: -12, crouchOnly: true, fxHeavy: true, stun: 'high',
    hitH0: -240, hitH1: 0,
  },

  /* ---------------- crouching kicks (S + U / I / O) ---------------- */
  cr_lk: {
    id: 'cr_lk', name: 'Shin Poke', pose: 'sweep',
    startup: 6, active: 3, recovery: 11,
    damage: 40, level: 'low', reach: 140,
    hitAdv: 2, blockAdv: -2, crouchOnly: true, stun: 'body',
    hitH0: -110, hitH1: 0,
  },
  cr_mk: {
    id: 'cr_mk', name: 'Low Kick', pose: 'sweep',
    startup: 11, active: 4, recovery: 17,
    damage: 75, level: 'low', reach: 175,
    hitAdv: 4, blockAdv: -4, crouchOnly: true, stun: 'body',
    hitH0: -110, hitH1: 0,
  },
  cr_hk: {
    id: 'cr_hk', name: 'Ankle Sweep', pose: 'sweep',
    startup: 13, active: 4, recovery: 21,
    damage: 90, level: 'low', reach: 185,
    hitAdv: 0, blockAdv: -14, knockdown: true, crouchOnly: true, fxHeavy: true,
    stun: 'body',
    hitH0: -110, hitH1: 0,
  },

  /* ---------------- air attacks (all overheads) ---------------- */
  air_lp: {
    id: 'air_lp', name: 'Air Jab', pose: 'jab',
    startup: 6, active: 4, recovery: 12,
    damage: 50, level: 'overhead', reach: 135,
    hitAdv: 3, blockAdv: -5, airOnly: true, stun: 'high',
    hitH0: -220, hitH1: 40,
  },
  air_mp: {
    id: 'air_mp', name: 'Air Smash', pose: 'cross',
    startup: 7, active: 4, recovery: 13,
    damage: 70, level: 'overhead', reach: 150,
    hitAdv: 4, blockAdv: -6, airOnly: true, stun: 'high',
    hitH0: -220, hitH1: 40,
  },
  air_hp: {
    id: 'air_hp', name: 'Air Fang', pose: 'launcher',
    startup: 8, active: 4, recovery: 14,
    damage: 90, level: 'overhead', reach: 155,
    hitAdv: 5, blockAdv: -7, airOnly: true, fxHeavy: true, stun: 'high',
    hitH0: -220, hitH1: 40,
  },
  air_lk: {
    id: 'air_lk', name: 'Air Snap', pose: 'high_kick',
    startup: 6, active: 4, recovery: 12,
    damage: 55, level: 'overhead', reach: 140,
    hitAdv: 3, blockAdv: -5, airOnly: true, stun: 'body',
    hitH0: -220, hitH1: 40,
  },
  air_mk: {
    id: 'air_mk', name: 'Air Knee', pose: 'heavy_kick',
    startup: 7, active: 4, recovery: 13,
    damage: 75, level: 'overhead', reach: 155,
    hitAdv: 4, blockAdv: -6, airOnly: true, stun: 'body',
    hitH0: -220, hitH1: 40,
  },
  air_hk: {
    id: 'air_hk', name: 'Dive Heel', pose: 'high_kick',
    startup: 8, active: 5, recovery: 14,
    damage: 100, level: 'overhead', reach: 165,
    hitAdv: 5, blockAdv: -7, airOnly: true, fxHeavy: true, stun: 'body',
    hitH0: -220, hitH1: 40,
  },

  /* ---------------- command moves ---------------- */
  throw: {
    id: 'throw', name: 'Throw', pose: 'cross',
    startup: 5, active: 1, recovery: 20,
    damage: 130, level: 'throw', reach: 105,
    hitAdv: 0, blockAdv: 0, knockdown: true, techable: 10,
    hitH0: -200, hitH1: 0,
  },
  drive_impact: {
    id: 'drive_impact', name: 'Drive Impact', pose: 'cross',
    startup: 20, active: 5, recovery: 25,
    damage: 100, level: 'mid', reach: 215,
    hitAdv: 0, blockAdv: -18, knockdown: true, fxHeavy: true,
    cost: 25, armorStart: 3, armorEnd: 16,
    hitH0: -260, hitH1: 0,
  },
};

/* Attack button resolution: (crouching?, forward held?, six button edges)
 * -> MoveId. Stronger buttons win when several are pressed on the same frame;
 * holding forward with heavy punch turns it into the launcher. */
export function pickGroundMove(down: boolean, forwardHeld: boolean,
  lp: boolean, mp: boolean, hp: boolean,
  lk: boolean, mk: boolean, hk: boolean): MoveId | null {
  if (down) {
    if (hk) return 'cr_hk';
    if (hp) return 'cr_hp';
    if (mk) return 'cr_mk';
    if (mp) return 'cr_mp';
    if (lk) return 'cr_lk';
    if (lp) return 'cr_lp';
    return null;
  }
  if (hp) return forwardHeld ? 'launcher' : 'hp';
  if (hk) return 'hk';
  if (mp) return 'mp';
  if (mk) return 'mk';
  if (lp) return 'lp';
  if (lk) return 'lk';
  return null;
}

export function pickAirMove(lp: boolean, mp: boolean, hp: boolean,
  lk: boolean, mk: boolean, hk: boolean): MoveId | null {
  if (hp) return 'air_hp';
  if (hk) return 'air_hk';
  if (mp) return 'air_mp';
  if (mk) return 'air_mk';
  if (lp) return 'air_lp';
  if (lk) return 'air_lk';
  return null;
}

export const CHAR_INFO: Record<FighterId, { name: string; tag: string; color: string }> = {
  kaito: { name: 'KAITO REN', tag: 'EMBER FIST', color: '#ff5a3c' },
  vx9: { name: 'VX-9 ARBITER', tag: 'OMNIDECIDE KERNEL', color: '#37e6ff' },
};

export const FRAME_SCALE = [1.0, 0.85, 0.7, 0.6, 0.5, 0.45];

export function comboScale(nHits: number): number {
  return FRAME_SCALE[Math.min(nHits, FRAME_SCALE.length - 1)];
}
