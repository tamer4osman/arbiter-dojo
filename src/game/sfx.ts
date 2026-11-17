/* Tiny WebAudio synth SFX - no audio assets needed. */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure(): void {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowHz = 400): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowHz;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  hit(heavy: boolean): void {
    this.noise(heavy ? 0.22 : 0.12, heavy ? 0.9 : 0.5, heavy ? 700 : 1400);
    this.tone(heavy ? 90 : 150, 0.12, 'square', 0.25, -60);
  }
  block(): void {
    this.tone(320, 0.07, 'square', 0.22, -80);
    this.noise(0.05, 0.25, 2200);
  }
  parry(): void {
    this.tone(880, 0.14, 'sine', 0.3, 500);
    this.tone(1320, 0.2, 'sine', 0.2, 300);
  }
  jump(): void { this.tone(240, 0.14, 'sine', 0.18, 260); }
  dash(): void { this.noise(0.12, 0.3, 900); }
  tech(): void { this.tone(520, 0.1, 'triangle', 0.28, 140); }
  ko(): void {
    this.noise(0.5, 1.0, 500);
    this.tone(70, 0.5, 'sawtooth', 0.4, -40);
  }
  round(): void { this.tone(440, 0.18, 'triangle', 0.3, 110); }
  ui(): void { this.tone(660, 0.06, 'square', 0.15); }
}
