/* Loads the real OmniDecide WASM kernel in the browser and wraps calls. */
import { ExperienceBrain } from './brain';

export interface KernelEnvelope {
  result: unknown;
  confidence: number;
  distribution: Record<string, number>;
  [k: string]: unknown;
}

export interface ODKernel {
  kernelVersion: string;
  evaluateChoice(instruction: string, options: string[], context: string,
    opts?: Record<string, unknown>): KernelEnvelope;
  evaluateRank(instruction: string, options: string[], context: string,
    opts?: Record<string, unknown>): KernelEnvelope;
  evaluate(instr: Record<string, unknown>): KernelEnvelope;
  free(): void;
}

declare global {
  interface Window {
    OmniDecide?: { create(cfg: Record<string, unknown>): Promise<ODKernel> };
    OmniDecideError?: ErrorConstructor;
    createOmniDecideModule?: unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function loadKernel(): Promise<ODKernel> {
  if (!window.createOmniDecideModule) {
    await loadScript('/kernel/omnidecide-emscripten.js');
  }
  if (!window.OmniDecide) {
    await loadScript('/kernel/omnidecide-api.js');
  }
  const api = window.OmniDecide;
  if (!api) throw new Error('OmniDecide API global missing after script load');
  const kernel = await api.create({ mode: 'ascii', language: 'und' });
  return kernel;
}

/* Keep decision text pure ASCII: the kernel runs in ascii mode. */
export function ascii(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u00d7/g, 'x')
    .replace(/[^\x20-\x7E\n]/g, '');
}

export interface KernelCall {
  n: number;
  frame: number;
  kind: string;
  options: string[];
  chosen: string;
  confidence: number;
  top: Array<[string, number]>;
  ms: number;
  ok: boolean;
  err?: string;
}

export class KernelBridge {
  kernel: ODKernel | null;
  calls: KernelCall[] = [];
  totalCalls = 0;
  totalMs = 0;
  private n = 0;

  constructor(kernel: ODKernel | null) {
    this.kernel = kernel;
  }

  /**
   * Run one choice decision against the kernel.
   * Returns the chosen option or null if the kernel is unavailable/failed.
   * When an experience brain is provided, the kernel's distribution is
   * re-ranked by the brain's documented blend (docs/LEARNING.md) before the
   * argmax - the kernel still produces the evidence, experience only shifts it.
   */
  choose(kind: string, instruction: string, options: string[], context: string,
    frame: number, brain?: ExperienceBrain | null): { choice: string | null; call: KernelCall } {
    const t0 = performance.now();
    const base: KernelCall = {
      n: ++this.n, frame, kind, options, chosen: '', confidence: 0,
      top: [], ms: 0, ok: false,
    };
    if (!this.kernel) {
      base.ms = performance.now() - t0;
      base.err = 'kernel not loaded';
      this.remember(base);
      return { choice: null, call: base };
    }
    try {
      const env = this.kernel.evaluateChoice(ascii(instruction), options, ascii(context), { meta: true });
      base.ms = performance.now() - t0;
      base.ok = true;
      const res = String(env.result ?? '');
      base.chosen = res;
      base.confidence = typeof env.confidence === 'number' ? env.confidence : 0;
      this.totalMs += base.ms;
      this.totalCalls++;
      const dist = env.distribution && typeof env.distribution === 'object'
        ? env.distribution as Record<string, number> : {};
      // Experience re-ranking: shift the kernel's evidence by the brain's
      // bonus and recompute the calibrated distribution (host-side odk_brain).
      if (brain && brain.size > 0) {
        const probs = options.map((o) => Number(dist[o] ?? 0));
        const blended = brain.blend(kind, options, probs, brain.weight);
        let best = 0;
        for (let i = 1; i < blended.length; i++) {
          if (blended[i] > blended[best]) best = i;
        }
        base.confidence = blended[best];
        base.top = blended.map((v, i) => [options[i], v] as [string, number])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);
        base.chosen = options[best];
        this.remember(base);
        return { choice: options[best], call: base };
      }
      base.top = Object.entries(dist)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 4)
        .map(([k, v]) => [k, Number(v)] as [string, number]);
      this.remember(base);
      // Map result to a real option (kernel may rephrase)
      let choice = options.find((o) => o === res);
      if (!choice) choice = options.find((o) => res.includes(o) || o.includes(res));
      if (!choice && base.top.length > 0) {
        const best = base.top[0][0];
        choice = options.find((o) => o === best);
      }
      if (!choice) choice = options[0];
      base.chosen = choice;
      return { choice, call: base };
    } catch (e) {
      base.ms = performance.now() - t0;
      base.err = e instanceof Error ? e.message : String(e);
      this.remember(base);
      return { choice: null, call: base };
    }
  }

  private remember(c: KernelCall): void {
    this.calls.push(c);
    if (this.calls.length > 10) this.calls.shift();
  }
}
