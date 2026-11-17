/* Canvas renderer: stage, fighters, VFX, HUD, kernel ticker. */
import { Engine } from './engine';
import { Fighter, FLOOR_Y, MAX_DRIVE, MAX_HP, VIEW_H, VIEW_W, CHAR_SCALE } from './types';
import { CHAR_INFO } from './moves';
import { Assets } from './assets';
import { AIStatus } from './ai';

interface FxItem {
  img: string | null;      // vfx key, null = procedural
  kind: string;
  x: number; y: number;
  t: number; dur: number;
  scale: number;
  vx: number; vy: number;
  text?: string;
  color?: string;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private assets: Assets;
  fx: FxItem[] = [];

  constructor(ctx: CanvasRenderingContext2D, assets: Assets) {
    this.ctx = ctx;
    this.assets = assets;
  }

  spawn(kind: string, x: number, y: number, opts?: Partial<FxItem>): void {
    const cfg: Record<string, { img: string | null; dur: number; scale: number }> = {
      hitspark: { img: 'hitspark', dur: 12, scale: 0.55 },
      heavyflash: { img: 'heavy_flash', dur: 16, scale: 0.95 },
      parry: { img: 'parry_ring', dur: 18, scale: 0.8 },
      dust: { img: 'dust', dur: 20, scale: 0.5 },
      koburst: { img: 'ko_burst', dur: 26, scale: 1.5 },
      aura: { img: null, dur: 24, scale: 1 },
      guard: { img: null, dur: 10, scale: 1 },
      counter: { img: null, dur: 40, scale: 1 },
      tech: { img: null, dur: 36, scale: 1 },
      rushaura: { img: null, dur: 26, scale: 1 },
    };
    const c = cfg[kind] ?? { img: null, dur: 14, scale: 1 };
    this.fx.push({
      kind, img: c.img, x, y, t: 0, dur: c.dur, scale: c.scale,
      vx: opts?.vx ?? 0, vy: opts?.vy ?? 0,
      text: opts?.text, color: opts?.color,
    });
    if (this.fx.length > 40) this.fx.shift();
  }

  /* ---------------- main draw ---------------- */

  draw(e: Engine, aiStatus: AIStatus | null, stage: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // stage (with shake)
    const sh = e.shake;
    if (sh > 0) {
      ctx.translate((Math.random() - 0.5) * sh * 2, (Math.random() - 0.5) * sh * 1.2);
    }
    const stageImg = this.assets.stages.get(stage);
    if (stageImg) ctx.drawImage(stageImg, 0, 0, VIEW_W, VIEW_H);

    this.drawShadow(e.fighters[0]);
    this.drawShadow(e.fighters[1]);

    // draw the fighter further from camera first (simple painter's order by y)
    const order = [...e.fighters].sort((a, b) => a.y - b.y);
    for (const f of order) this.drawFighter(f, e);

    this.drawFx();

    ctx.restore();

    this.drawVignette();
    this.drawHud(e);
    if (aiStatus) this.drawKernelTicker(aiStatus, e);
    this.drawAnnounce(e);
  }

  /* ---------------- fighters ---------------- */

  private poseFor(f: Fighter): { pose: string; alpha: number; dx: number } {
    const s = f.state;
    if (s === 'idle' || s === 'intro') return { pose: 'idle', alpha: 1, dx: 0 };
    if (s === 'walk') {
      const alt = Math.floor(f.animT / 11) % 2 === 0;
      return { pose: alt ? 'walk_f' : 'walk_b', alpha: 1, dx: 0 };
    }
    if (s === 'crouch') return { pose: f.blockFlash > 0 ? 'crouch_guard' : 'crouch', alpha: 1, dx: 0 };
    if (s === 'jump') {
      if (!f.airborne) return { pose: 'crouch', alpha: 1, dx: 0 };
      return { pose: f.vy < 0 ? 'jump_up' : 'jump_down', alpha: 1, dx: 0 };
    }
    if (s === 'dash') return { pose: 'dash', alpha: 1, dx: 0 };
    if (s === 'backdash') return { pose: 'walk_b', alpha: 1, dx: 0 };
    if (s === 'rush') return { pose: 'dash', alpha: 1, dx: 0 };
    if (s === 'parry') return { pose: 'sig_charge', alpha: 1, dx: 0 };
    if (s === 'attack' && f.move) {
      const m = f.move;
      if (f.moveFrame <= m.startup) {
        return { pose: f.crouch ? 'crouch' : 'idle', alpha: 0.95, dx: -10 * f.facing };
      }
      return { pose: m.pose, alpha: f.moveFrame > m.startup + m.active ? 0.94 : 1, dx: 0 };
    }
    if (s === 'blockstun') {
      return { pose: f.crouch ? 'crouch_guard' : 'blockstun', alpha: 1, dx: 0 };
    }
    if (s === 'hitstun') {
      return { pose: f.lastStunHigh ? 'hit_high' : 'hit_body', alpha: 1, dx: 0 };
    }
    if (s === 'stagger') return { pose: 'hit_high', alpha: 1, dx: 0 };
    if (s === 'thrown') return { pose: 'hit_body', alpha: 1, dx: 0 };
    if (s === 'knockdown' || s === 'ko') return { pose: 'knockdown', alpha: 1, dx: 0 };
    if (s === 'wakeup') return { pose: 'crouch', alpha: 1, dx: 0 };
    if (s === 'win') return { pose: 'sig_fire', alpha: 1, dx: 0 };
    return { pose: 'idle', alpha: 1, dx: 0 };
  }

  private drawFighter(f: Fighter, e: Engine): void {
    const ctx = this.ctx;
    const { pose, alpha, dx } = this.poseFor(f);
    // pose fallback: some chars lack variants (e.g. vx9 has no crouch_guard)
    const img = this.assets.poses.get(`${f.id}_${pose}`) ??
      (pose === 'crouch_guard' ? this.assets.poses.get(`${f.id}_crouch`) : undefined) ??
      this.assets.poses.get(`${f.id}_idle`);
    if (!img) return;
    const usedPose = pose === 'crouch_guard' && !this.assets.poses.get(`${f.id}_${pose}`)
      ? 'crouch' : pose;
    // poseIndex is keyed `${char}_${label}`; manifest ids carry sheet prefixes
    // (kaito_B_jab) so a raw id lookup would always miss and fall back to 340
    const entry = this.assets.poseIndex.get(`${f.id}_${usedPose}`);
    const drawH = entry?.draw_h ?? 340;
    const scale = drawH / img.height;
    const w = img.width * scale;
    const h = img.height * scale;

    const feetY = FLOOR_Y + f.y;
    const bob = (f.state === 'idle' || f.state === 'intro')
      ? Math.sin(f.animT / 16) * 4 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(f.x + dx, feetY + bob);
    if (f.facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);

    // white flash on hit (additive self copy)
    if (f.hitFlash > 4) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // drive-rush aura
    if (f.state === 'rush' || (f.rushBuff > 30 && f.state === 'attack')) {
      const aura = this.assets.vfx.get(f.id === 'kaito' ? 'aura_kaito' : 'aura_vx9');
      if (aura) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.75;
        const ah = drawH * 1.15;
        const aw = ah * (aura.width / aura.height);
        ctx.drawImage(aura, f.x - aw / 2, feetY - ah + 10, aw, ah);
        ctx.restore();
      }
    }

    // guard shield flash (arc scales with the character's frame size)
    if (f.blockFlash > 0) {
      const gsc = CHAR_SCALE[f.id];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = f.hitFlash > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(80,200,255,0.9)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 46 * gsc, feetY - (f.crouch ? 90 : 160) * gsc,
        78 * gsc, -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
    }

    // wakeup invuln shimmer
    if (f.state === 'wakeup') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#7ee8ff';
      ctx.fillRect(f.x - 40, feetY - drawH - 12, 80, 5);
      ctx.restore();
    }
    void e;
  }

  private drawShadow(f: Fighter): void {
    const ctx = this.ctx;
    const sc = CHAR_SCALE[f.id];
    const t = Math.max(0.15, 1 + f.y / 400);
    ctx.save();
    ctx.globalAlpha = 0.42 * t;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(f.x, FLOOR_Y + 6, 90 * sc * t, 16 * sc * t, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- fx ---------------- */

  private drawFx(): void {
    const ctx = this.ctx;
    for (const it of this.fx) {
      it.t++;
      it.x += it.vx;
      it.y += it.vy;
      const p = it.t / it.dur;
      const alpha = Math.max(0, 1 - p);
      ctx.save();
      if (it.kind === 'counter' || it.kind === 'tech') {
        ctx.globalAlpha = alpha;
        ctx.font = 'italic 900 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.fillStyle = it.color ?? '#ffd34d';
        const pop = 1 + Math.max(0, 0.3 - p) * 1.4;
        ctx.translate(it.x, it.y - p * 40);
        ctx.scale(pop, pop);
        ctx.strokeText(it.text ?? '', 0, 0);
        ctx.fillText(it.text ?? '', 0, 0);
        ctx.restore();
        continue;
      }
      if (it.img) {
        const img = this.assets.vfx.get(it.img);
        if (img) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha;
          const w = img.width * it.scale * (0.7 + 0.3 * Math.min(1, p * 3));
          const h = img.height * it.scale * (0.7 + 0.3 * Math.min(1, p * 3));
          ctx.drawImage(img, it.x - w / 2, it.y - h / 2, w, h);
        }
      } else if (it.kind === 'guard') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = '#7ee8ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(it.x, it.y, 60 + p * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.fx = this.fx.filter((it) => it.t < it.dur);
  }

  private drawVignette(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.55,
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,10,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /* ---------------- HUD ---------------- */

  private drawHud(e: Engine): void {
    const ctx = this.ctx;
    const barW = 880;
    const barH = 92;
    const y = 34;

    // portraits
    const pk = this.assets.ui.get('portrait_kaito');
    const pv = this.assets.ui.get('portrait_vx9');
    if (pk) ctx.drawImage(pk, 44, y - 8, 150, 143);
    if (pv) ctx.drawImage(pv, VIEW_W - 194, y - 8, 150, 143);

    const drawBar = (x: number, hpFrac: number, trailFrac: number, mirror: boolean) => {
      const fh = this.assets.ui.get('health_frame');
      if (fh) {
        ctx.save();
        if (mirror) {
          ctx.translate(x + barW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(fh, 0, y, barW, barH);
        } else {
          ctx.drawImage(fh, x, y, barW, barH);
        }
        ctx.restore();
      }
      const innerX = x + 34;
      const innerY = y + 22;
      const innerW = barW - 78;
      const innerH = barH - 44;
      // trail (white/yellow)
      const trailW = innerW * trailFrac;
      ctx.fillStyle = 'rgba(255, 210, 90, 0.85)';
      if (mirror) ctx.fillRect(innerX + innerW - trailW, innerY, trailW, innerH);
      else ctx.fillRect(innerX, innerY, trailW, innerH);
      // current hp
      const hpW = innerW * hpFrac;
      const grad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
      if (!mirror) {
        grad.addColorStop(0, '#ffd23c');
        grad.addColorStop(0.5, '#ff8a2a');
        grad.addColorStop(1, '#e8452c');
      } else {
        grad.addColorStop(0, '#37e6ff');
        grad.addColorStop(0.5, '#2fa8ff');
        grad.addColorStop(1, '#1f6dff');
      }
      ctx.fillStyle = grad;
      if (mirror) ctx.fillRect(innerX + innerW - hpW, innerY, hpW, innerH);
      else ctx.fillRect(innerX, innerY, hpW, innerH);
    };

    // trails stored per fighter via hpTrail map handled by game
    const [p1, p2] = e.fighters;
    drawBar(206, p1.hp / MAX_HP, this.trails[0], false);
    drawBar(VIEW_W - 206 - barW, p2.hp / MAX_HP, this.trails[1], true);

    // names + round pips
    ctx.font = '900 26px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('KAITO REN', 210, y + barH + 30);
    ctx.textAlign = 'right';
    ctx.fillText('VX-9 ARBITER', VIEW_W - 210, y + barH + 30);

    for (let i = 0; i < 2; i++) {
      this.drawPip(430 + i * 40, y + barH + 22, p1.wins > i);
      this.drawPip(VIEW_W - 430 - i * 40, y + barH + 22, p2.wins > i);
    }

    // drive gauges
    this.drawDrive(210, y + barH + 44, p1.drive / MAX_DRIVE, '#ffb02a');
    this.drawDrive(VIEW_W - 210 - 300, y + barH + 44, p2.drive / MAX_DRIVE, '#37e6ff');

    // timer disc
    const td = this.assets.ui.get('timer_disc');
    if (td) ctx.drawImage(td, VIEW_W / 2 - 95, 24, 190, 156);
    const secs = Math.ceil(e.timer / 60);
    ctx.font = '900 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 ? '#ff5040' : '#ffffff';
    ctx.fillText(String(secs), VIEW_W / 2, 122);

    // combo counters
    if (p2.comboHits >= 2) {
      this.comboText(VIEW_W - 320, 300, p2.comboHits, '#37e6ff');
    }
    if (p1.comboHits >= 2) {
      this.comboText(320, 300, p1.comboHits, '#ff8a2a');
    }
  }

  trails: [number, number] = [1, 1];

  private drawPip(x: number, y: number, filled: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = filled ? '#ffd23c' : 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
  }

  private drawDrive(x: number, y: number, frac: number, color: string): void {
    const ctx = this.ctx;
    const img = this.assets.ui.get('drive_gauge');
    const w = 300;
    const h = 62;
    if (img) ctx.drawImage(img, x, y, w, h);
    const segs = 5;
    const innerX = x + 14;
    const innerY = y + 10;
    const innerW = (w - 28) / segs;
    const innerH = h - 20;
    const segFrac = Math.min(1, frac * segs);
    for (let i = 0; i < segs; i++) {
      const f = Math.max(0, Math.min(1, segFrac - i));
      if (f <= 0) break;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(innerX + i * innerW + 3, innerY + (1 - f) * innerH * 0.2,
        innerW - 6, innerH * f * 0.9);
      ctx.globalAlpha = 1;
    }
  }

  private comboText(x: number, y: number, hits: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'italic 900 54px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = color;
    ctx.strokeText(`${hits} HITS`, x, y);
    ctx.fillText(`${hits} HITS`, x, y);
    ctx.font = '900 20px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('COMBO', x, y + 26);
    ctx.restore();
  }

  private drawKernelTicker(st: AIStatus, e: Engine): void {
    const ctx = this.ctx;
    const w = 560;
    const x = VIEW_W - w - 26;
    const y = VIEW_H - 96;
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,18,0.72)';
    ctx.strokeStyle = 'rgba(55,230,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 66, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 15px "Courier New", monospace';
    ctx.fillStyle = '#37e6ff';
    ctx.textAlign = 'left';
    const avg = st.decisions > 0 ? 'avg ' + (avgMsGlobal / Math.max(1, st.decisions)).toFixed(1) + 'ms' : '';
    ctx.fillText(`OMNIDECIDE KERNEL  |  decisions: ${st.decisions} ${avg}`, x + 16, y + 24);
    ctx.fillStyle = '#cfefff';
    ctx.font = '700 17px "Courier New", monospace';
    const line = `${st.lastKind.toUpperCase()} > ${st.lastChoice}  (${(st.confidence * 100).toFixed(0)}%)`;
    ctx.fillText(line.slice(0, 52), x + 16, y + 50);
    ctx.restore();
    void e;
  }

  private drawAnnounce(e: Engine): void {
    const ctx = this.ctx;
    let text: string | null = null;
    let t = 0;
    if (e.phase === 'intro') {
      text = `ROUND ${e.round}`;
      t = e.phaseT;
    } else if (e.announce) {
      text = e.announce.text;
      t = e.announce.t;
    }
    if (!text) return;
    const pop = t > 80 ? 1 + (t - 80) * 0.012 : 1;
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2 - 120);
    ctx.scale(pop, pop);
    ctx.font = 'italic 900 110px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(6,8,20,0.9)';
    ctx.shadowColor = text === 'FIGHT' || text === 'K.O.' ? '#ff5040' : '#37e6ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

let avgMsGlobal = 0;
export function reportKernelTiming(totalMs: number, n: number): void {
  if (n > 0) avgMsGlobal = totalMs / n;
}
