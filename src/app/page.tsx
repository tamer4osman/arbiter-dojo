'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAllAssets, Assets } from '@/game/assets';
import { loadKernel, KernelBridge, KernelCall } from '@/game/kernelClient';
import { Game } from '@/game/game';
import { DIFFICULTIES, PERSONAS, DiffKey, PersonaKey } from '@/game/ai';
import { ExperienceBrain, brainStorage } from '@/game/brain';
import { Trainer, TrainState } from '@/game/trainer';
import { MatchConfig } from '@/game/types';

type Screen = 'boot' | 'menu' | 'setup' | 'fight';

const STAGES: Array<{ id: string; name: string; thumb: string }> = [
  { id: 'stage_finale', name: 'NEON ROOFTOP', thumb: '/game/assets/stages/stage_finale.jpg' },
  { id: 'stage_umbra', name: 'MOONLIT PROMENADE', thumb: '/game/assets/stages/stage_umbra.jpg' },
  { id: 'stage_rooftop', name: 'SATELLITE DECK', thumb: '/game/assets/stages/stage_rooftop.jpg' },
  { id: 'stage_docks', name: 'HARBOR SIX', thumb: '/game/assets/stages/stage_docks.jpg' },
];

const KEY_ROWS: Array<[string, string]> = [
  ['MOVE', 'A / D or Arrow Keys (double-tap = dash)'],
  ['JUMP', 'W / Up'],
  ['CROUCH', 'S / Down'],
  ['LIGHT PUNCH (fast)', 'J'],
  ['MEDIUM PUNCH', 'K'],
  ['HEAVY PUNCH (heavy)', 'L - forward + L = launcher'],
  ['LIGHT KICK (fast)', 'U'],
  ['MEDIUM KICK', 'I'],
  ['HEAVY KICK (heavy)', 'O - knocks down'],
  ['CROUCH ATTACKS (lows)', 'S + J / K / L / U / I / O - S + O = sweep'],
  ['THROW / TECH', 'B (tech with B)'],
  ['DRIVE IMPACT (armored)', 'N (costs 25 drive)'],
  ['DRIVE PARRY', 'M (big reward on perfect timing)'],
  ['DRIVE RUSH', 'Forward + , (costs 25 drive)'],
  ['PAUSE / KERNEL TRACE', 'ESC / F1'],
  ['MUTE', '. (period)'],
];

const PAD_ROWS: Array<[string, string]> = [
  ['MOVE', 'Left Stick / D-Pad (double-tap = dash)'],
  ['JUMP / CROUCH', 'Stick Up / Stick Down'],
  ['LIGHT PUNCH / MEDIUM PUNCH', 'X / Y'],
  ['HEAVY PUNCH', 'RB'],
  ['LIGHT KICK / MEDIUM KICK', 'A / B'],
  ['HEAVY KICK', 'RT'],
  ['THROW / TECH', 'A + X (tech with A + X)'],
  ['LAUNCHER (combo starter)', 'Forward + RB'],
  ['DRIVE IMPACT (armored)', 'LB or RB + RT (costs 25 drive)'],
  ['DRIVE PARRY', 'LT (big reward on perfect timing)'],
  ['DRIVE RUSH', 'Forward + Y + B (costs 25 drive)'],
  ['PAUSE', 'Menu (Start) button'],
  ['RUMBLE', 'On hits and K.O.'],
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [kernelState, setKernelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [kernelInfo, setKernelInfo] = useState('loading WASM kernel...');
  const [assetProg, setAssetProg] = useState(0);
  const [bootMsg, setBootMsg] = useState('Initializing...');
  const [cfg, setCfg] = useState<MatchConfig>({
    difficulty: 'veteran', persona: 'rushdown', stage: 'stage_finale', rounds: 2,
  });
  const [paused, setPaused] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [trace, setTrace] = useState<KernelCall[]>([]);
  const [callCount, setCallCount] = useState(0);
  const [endResult, setEndResult] = useState<{ won: boolean; score: [number, number] } | null>(null);
  const [pad, setPad] = useState<string | null>(null);
  const [brainInfo, setBrainInfo] = useState({ entries: 0, visits: 0 });
  const [training, setTraining] = useState<TrainState | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const bridgeRef = useRef<KernelBridge | null>(null);
  const assetsRef = useRef<Assets | null>(null);
  const brainRef = useRef<ExperienceBrain | null>(null);
  const trainerRef = useRef<Trainer | null>(null);

  const refreshBrainInfo = useCallback(() => {
    const b = brainRef.current;
    if (b) setBrainInfo({ entries: b.size, visits: b.totalVisits() });
  }, []);

  const startTraining = useCallback((n: number) => {
    const bridge = bridgeRef.current;
    const brain = brainRef.current;
    if (!bridge || !brain) return;
    if (trainerRef.current) trainerRef.current.stop();
    const trainer = new Trainer(bridge, brain);
    trainerRef.current = trainer;
    trainer.start(n);
    setTraining({ ...trainer.state });
  }, []);

  /* ---------- boot: kernel + assets ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBootMsg('Loading OmniDecide WASM kernel...');
        const kernel = await loadKernel();
        if (!alive) return;
        setKernelInfo(`kernel v${kernel.kernelVersion} ready (ascii/und)`);
        setKernelState('ready');
        bridgeRef.current = new KernelBridge(kernel);
      } catch (err) {
        if (!alive) return;
        setKernelState('error');
        setKernelInfo(err instanceof Error ? err.message : String(err));
        bridgeRef.current = new KernelBridge(null);
      }
      try {
        setBootMsg('Loading fight assets...');
        const assets = await loadAllAssets((p, total) => {
          if (alive) setAssetProg(total > 0 ? p / total : 0);
        });
        if (!alive) return;
        assetsRef.current = assets;
        // experience brain: restore the user's own trained memory, or fall
        // back to the shipped 100-match training seed on first boot
        const brain = new ExperienceBrain();
        let loaded = 0;
        if (brainStorage.has()) {
          loaded = brainStorage.load(brain);
        } else {
          try {
            const seed = await fetch('/game/brain-seed.json');
            if (seed.ok) loaded = brain.load(await seed.text());
          } catch { /* seed is optional */ }
        }
        brainRef.current = brain;
        setBrainInfo({ entries: brain.size, visits: brain.totalVisits() });
        // test / debug hooks
        const w = window as unknown as Record<string, unknown>;
        w.__brain = brain;
        w.__brainState = () => ({
          entries: brain.size, visits: brain.totalVisits(), weight: brain.weight,
          saved: brainStorage.has(), lessons: brain.lessons(3),
          training: trainerRef.current ? { ...trainerRef.current.state } : null,
        });
        w.__trainBrain = (n: number) => { startTraining(n); };
        w.__evalBrain = async (n: number, useBrain: boolean) => {
          const bridge = bridgeRef.current;
          if (!bridge) return { wins: 0, losses: 0, draws: 0, total: n };
          const t = new Trainer(bridge, brain);
          return t.evaluate(n, useBrain);
        };
        setScreen('menu');
        void loaded;
      } catch (err) {
        if (alive) setBootMsg('asset load failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ---------- gamepad connect / disconnect badge ---------- */
  useEffect(() => {
    const onConn = (e: Event) => {
      const id = (e as GamepadEvent).gamepad?.id ?? 'gamepad';
      setPad(id.length > 40 ? id.slice(0, 40) + '...' : id);
    };
    const onDisc = (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      setPad((p) => (p && gp && p.startsWith(gp.id.slice(0, 40)) ? null : p));
    };
    window.addEventListener('gamepadconnected', onConn);
    window.addEventListener('gamepaddisconnected', onDisc);
    return () => {
      window.removeEventListener('gamepadconnected', onConn);
      window.removeEventListener('gamepaddisconnected', onDisc);
    };
  }, []);

  /* ---------- fight lifecycle ---------- */
  useEffect(() => {
    if (screen !== 'fight') return;
    const canvas = canvasRef.current;
    const assets = assetsRef.current;
    const bridge = bridgeRef.current;
    if (!canvas || !assets || !bridge) return;
    // a running training session would contend with the fight - stop it
    if (trainerRef.current?.state.running) {
      trainerRef.current.stop();
      setTraining({ ...trainerRef.current.state });
    }
    const game = new Game(canvas, assets, bridge, cfg,
      DIFFICULTIES[cfg.difficulty], PERSONAS[cfg.persona],
      {
        onMatchEnd: (won, score) => {
          setEndResult({ won, score });
          refreshBrainInfo();   // the AI kept learning during the match
        },
        onPauseRequest: () => {
          setPaused((p) => {
            game.setPaused(!p);
            return !p;
          });
        },
      }, brainRef.current);
    gameRef.current = game;
    game.start();
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [screen, refreshBrainInfo]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'F1') { e.preventDefault(); setTraceOpen((t) => !t); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      gameRef.current?.keyDown(e.code);
    };
    const ku = (e: KeyboardEvent) => gameRef.current?.keyUp(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  /* ---------- kernel trace polling ---------- */
  useEffect(() => {
    if (!traceOpen || screen !== 'fight') return;
    const iv = setInterval(() => {
      if (bridgeRef.current) {
        setTrace([...bridgeRef.current.calls].reverse());
        setCallCount(bridgeRef.current.totalCalls);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [traceOpen, screen]);

  const leaveFight = useCallback((to: Screen) => {
    setEndResult(null);
    setPaused(false);
    refreshBrainInfo();
    setScreen(to);
  }, [refreshBrainInfo]);

  /* ---------- trainer progress polling ---------- */
  useEffect(() => {
    if (!training?.running) return;
    const iv = setInterval(() => {
      const t = trainerRef.current;
      if (t) {
        setTraining({ ...t.state, log: [...t.state.log] });
        refreshBrainInfo();
      }
    }, 400);
    return () => clearInterval(iv);
  }, [training?.running, refreshBrainInfo]);

  const resetBrain = useCallback(() => {
    const b = brainRef.current;
    if (!b) return;
    if (!window.confirm('Erase the Arbiter\'s trained experience? This cannot be undone.')) return;
    b.reset();
    brainStorage.clear();
    refreshBrainInfo();
    setTraining(null);
  }, [refreshBrainInfo]);

  /* ================= render ================= */

  if (screen === 'boot') {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black">
        <img src="/game/assets/ui/title_emblem.png" alt="Arbiter Dojo emblem"
          className="w-44 h-48 object-contain animate-pulse" />
        <div className="text-cyan-300 font-mono text-lg">{bootMsg}</div>
        <div className="w-80 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full bg-cyan-400 transition-all"
            style={{ width: `${Math.round(assetProg * 100)}%` }} />
        </div>
        <div className={`font-mono text-sm ${kernelState === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
          {kernelInfo}
        </div>
      </main>
    );
  }

  if (screen === 'menu') {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black overflow-auto">
        <div className="absolute inset-0 opacity-40">
          <img src="/game/assets/stages/stage_umbra.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black" />
        </div>
        <div className="relative flex flex-col items-center gap-2 z-10">
          <img src="/game/assets/ui/title_emblem.png" alt="emblem" className="w-40 h-44 object-contain" />
          <h1 className="text-6xl font-black italic tracking-wider"
            style={{ textShadow: '0 0 30px rgba(55,230,255,.8), 0 0 8px rgba(255,138,42,.9)' }}>
            ARBITER DOJO
          </h1>
          <p className="text-neutral-300 font-mono">
            a 2.5D fighter whose opponent is the OmniDecide WASM kernel
          </p>
          <p className={`font-mono text-sm ${kernelState === 'ready' ? 'text-cyan-300' : 'text-red-400'}`}>
            KERNEL: {kernelState.toUpperCase()} - {kernelInfo}
          </p>
          <p className="font-mono text-sm text-neutral-400">
            BRAIN: {brainInfo.entries} experiences - {brainInfo.entries > 0
              ? 'trained memory active (weight 0.35)'
              : 'untrained - it learns from every fight and from training runs'}
          </p>
          <p className={`font-mono text-sm ${pad ? 'text-emerald-300' : 'text-neutral-500'}`}>
            {pad ? `GAMEPAD CONNECTED - ${pad}` : 'keyboard ready - connect an Xbox controller anytime'}
          </p>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4 mt-2">
          <button
            className="px-12 py-4 text-2xl font-black italic tracking-widest bg-orange-600 hover:bg-orange-500 active:scale-95 transition rounded-lg border-2 border-orange-300/60"
            onClick={() => { setEndResult(null); setScreen('setup'); }}>
            ENTER THE ARENA
          </button>
          <div className="grid grid-cols-3 gap-3 max-w-3xl text-center font-mono text-xs text-neutral-300">
            <div className="p-3 rounded bg-black/60 border border-neutral-700">
              <div className="text-cyan-300 font-bold mb-1">IT READS YOU</div>
              The Arbiter profiles your habits from what it sees: your openers, your lows, your wake-up answers.
            </div>
            <div className="p-3 rounded bg-black/60 border border-neutral-700">
              <div className="text-cyan-300 font-bold mb-1">IT NEVER CHEATS</div>
              It cannot read your input buffer. It only sees what you see on screen.
            </div>
            <div className="p-3 rounded bg-black/60 border border-neutral-700">
              <div className="text-cyan-300 font-bold mb-1">IT EXPLAINS ITSELF</div>
              Press F1 in a fight to watch every kernel decision with confidence and timing.
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (screen === 'setup') {
    return (
      <main className="fixed inset-0 overflow-auto bg-neutral-950">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black italic tracking-wider text-orange-400">MATCH SETUP</h2>
            <button className="text-neutral-400 hover:text-white font-mono"
              onClick={() => setScreen('menu')}>back</button>
          </div>

          <section>
            <h3 className="font-mono text-cyan-300 mb-3">ARBITER DIFFICULTY (reaction + misread rate)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(Object.keys(DIFFICULTIES) as DiffKey[]).map((k) => (
                <button key={k}
                  onClick={() => setCfg((c) => ({ ...c, difficulty: k }))}
                  className={`p-4 rounded-lg border text-left transition ${cfg.difficulty === k
                    ? 'border-orange-400 bg-orange-950/40'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'}`}>
                  <div className="font-black tracking-wide">{DIFFICULTIES[k].label}</div>
                  <div className="text-xs text-neutral-400 mt-1">{DIFFICULTIES[k].desc}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-mono text-cyan-300 mb-3">ARBITER PERSONA (kernel doctrine)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(Object.keys(PERSONAS) as PersonaKey[]).map((k) => (
                <button key={k}
                  onClick={() => setCfg((c) => ({ ...c, persona: k }))}
                  className={`p-4 rounded-lg border text-left transition ${cfg.persona === k
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'}`}>
                  <div className="font-black tracking-wide">{PERSONAS[k].label}</div>
                  <div className="text-xs text-neutral-400 mt-1">{PERSONAS[k].desc}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-mono text-cyan-300 mb-3">STAGE</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STAGES.map((s) => (
                <button key={s.id}
                  onClick={() => setCfg((c) => ({ ...c, stage: s.id }))}
                  className={`rounded-lg overflow-hidden border transition ${cfg.stage === s.id
                    ? 'border-orange-400 ring-2 ring-orange-400/40'
                    : 'border-neutral-700 hover:border-neutral-500'}`}>
                  <img src={s.thumb} alt={s.name} className="w-full aspect-video object-cover" />
                  <div className="py-2 text-center font-mono text-xs bg-black">{s.name}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-black/60 p-4">
            <h3 className="font-mono text-cyan-300 mb-1">ARBITER BRAIN (experience memory)</h3>
            <p className="text-neutral-400 text-xs font-mono mb-3">
              A reward memory layered on the OmniDecide kernel, exactly like the kernel&apos;s
              own odk_brain design: hits landed earn credit, whiffs / blocks / parries cost
              confidence, round results reinforce. Experience shifts the kernel&apos;s ranking
              by weight 0.35 - a nudge, never a takeover. Training runs 100 self-play
              matches headless in about a minute and saves after every match.
            </p>
            <div className="font-mono text-sm text-neutral-300 mb-3">
              <span className="text-cyan-300">{brainInfo.entries}</span> experiences |{" "}
              <span className="text-cyan-300">{brainInfo.visits}</span> recorded outcomes
            </div>
            {training?.running ? (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-cyan-300">
                    TRAINING MATCH {Math.min(training.match + 1, training.total)}/{training.total}
                  </span>
                  <span className="text-neutral-300">
                    trainee {training.traineeWins} - {training.oppWins} sparring
                    {training.draws > 0 ? ` (${training.draws} draws)` : ''}
                  </span>
                  <button className="text-red-300 hover:text-red-200"
                    onClick={() => trainerRef.current?.stop()}>stop</button>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all"
                    style={{ width: `${Math.min(100, ((training.done ? training.total : training.match) / Math.max(1, training.total)) * 100)}%` }} />
                </div>
                <div className="font-mono text-xs text-neutral-500">
                  {training.log.slice(-3).join('  |  ') || 'sparring...'}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="px-6 py-2.5 font-black tracking-wider bg-cyan-700 hover:bg-cyan-600 active:scale-95 transition rounded"
                  onClick={() => startTraining(100)}>
                  TRAIN 100 MATCHES
                </button>
                <button
                  className="px-4 py-2 font-mono text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
                  onClick={() => startTraining(20)}>
                  quick: 20
                </button>
                {brainInfo.entries > 0 && (
                  <button
                    className="px-4 py-2 font-mono text-sm text-red-300 bg-neutral-900 border border-red-900/60 hover:border-red-500 rounded"
                    onClick={resetBrain}>
                    reset brain
                  </button>
                )}
                {training?.done && (
                  <span className="font-mono text-sm text-emerald-300">
                    session {training.traineeWins}-{training.oppWins}
                    {training.draws > 0 ? ` (${training.draws} draws)` : ''} - brain saved
                  </span>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-neutral-800 bg-black/60 p-4">
            <h3 className="font-mono text-cyan-300 mb-3">CONTROLS - KEYBOARD</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 font-mono text-sm">
              {KEY_ROWS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-neutral-800/60 py-1">
                  <span className="text-orange-300">{k}</span>
                  <span className="text-neutral-300 text-right">{v}</span>
                </div>
              ))}
            </div>
            <h3 className="font-mono text-cyan-300 mt-5 mb-3">CONTROLS - XBOX GAMEPAD (standard mapping)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 font-mono text-sm">
              {PAD_ROWS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-neutral-800/60 py-1">
                  <span className="text-emerald-300">{k}</span>
                  <span className="text-neutral-300 text-right">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-neutral-500 text-xs mt-3 font-mono">
              Six buttons, classic rules: punches (J K L) are fast chains, kicks (U I O) hit
              harder and reach further - light is quick, heavy is slow and hurts. The Drive
              gauge powers Impact (armor), Parry (reversal) and Rush (pressure). It regenerates when you are calm.
            </p>
          </section>

          <button
            className="mx-auto px-14 py-4 text-2xl font-black italic tracking-widest bg-orange-600 hover:bg-orange-500 active:scale-95 transition rounded-lg border-2 border-orange-300/60"
            onClick={() => { setEndResult(null); setScreen('fight'); }}>
            FIGHT
          </button>
        </div>
      </main>
    );
  }

  /* fight screen */
  return (
    <main className="fixed inset-0 bg-black overflow-hidden select-none">
      <div className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          tabIndex={0}
          className="outline-none"
          style={{ width: 'min(100vw, 177.78vh)', height: 'min(56.25vw, 100vh)' }}
        />
      </div>

      {/* gamepad badge */}
      {pad && (
        <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded bg-black/70 border border-emerald-500/50 font-mono text-xs text-emerald-300">
          GAMEPAD CONNECTED - {pad}
        </div>
      )}

      {/* pause overlay */}
      {paused && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-6">
          <h2 className="text-5xl font-black italic tracking-widest text-cyan-300">PAUSED</h2>
          <div className="flex flex-col gap-3 w-72">
            <button className="py-3 font-black tracking-wider bg-orange-600 hover:bg-orange-500 rounded"
              onClick={() => { setPaused(false); gameRef.current?.setPaused(false); }}>RESUME</button>
            <button className="py-3 font-black tracking-wider bg-neutral-800 hover:bg-neutral-700 rounded"
              onClick={() => leaveFight('setup')}>CHANGE SETUP</button>
            <button className="py-3 font-black tracking-wider bg-neutral-800 hover:bg-neutral-700 rounded"
              onClick={() => leaveFight('menu')}>QUIT TO MENU</button>
          </div>
          <p className="text-neutral-400 font-mono text-sm">ESC or START resume - F1 kernel trace - . mute</p>
        </div>
      )}

      {/* match end overlay */}
      {endResult && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-6">
          <img src="/game/assets/ui/ko_banner.png" alt="KO" className="w-[520px] max-w-[80vw] rounded-lg" />
          <h2 className={`text-6xl font-black italic tracking-widest ${endResult.won ? 'text-orange-400' : 'text-cyan-300'}`}>
            {endResult.won ? 'YOU WIN' : 'ARBITER WINS'}
          </h2>
          <p className="font-mono text-neutral-300">
            final score {endResult.score[0]} - {endResult.score[1]}
          </p>
          <div className="flex gap-4">
            <button className="px-10 py-3 font-black tracking-wider bg-orange-600 hover:bg-orange-500 rounded"
              onClick={() => { setEndResult(null); gameRef.current?.start(); }}>REMATCH</button>
            <button className="px-10 py-3 font-black tracking-wider bg-neutral-800 hover:bg-neutral-700 rounded"
              onClick={() => leaveFight('setup')}>CHANGE SETUP</button>
          </div>
        </div>
      )}

      {/* kernel trace panel */}
      {traceOpen && (
        <div className="absolute top-4 right-4 w-[420px] max-h-[80vh] overflow-y-auto rounded-lg bg-black/85 border border-cyan-500/40 p-3 font-mono text-xs"
          style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-cyan-300 font-bold">KERNEL TRACE (F1 to close)</span>
            <span className="text-neutral-500">
              {callCount} calls
            </span>
          </div>
          <p className="text-neutral-500 mb-2">
            Every decision below ran inside WebAssembly: evaluateChoice(instruction, options, context).
          </p>
          {trace.length === 0 && <div className="text-neutral-500">waiting for decisions...</div>}
          {trace.map((c) => (
            <div key={c.n} className="border-t border-neutral-800 py-2">
              <div className="flex justify-between text-neutral-400">
                <span>#{c.n} f{c.frame} {c.kind}</span>
                <span>{c.ms.toFixed(1)}ms {c.ok ? '' : 'FAILED'}</span>
              </div>
              <div className="text-cyan-200">
                &gt; {c.chosen} ({(c.confidence * 100).toFixed(0)}%)
              </div>
              <div className="mt-1 space-y-0.5">
                {c.top.map(([opt, v]) => (
                  <div key={opt} className="flex items-center gap-2">
                    <span className="w-40 truncate text-neutral-400">{opt}</span>
                    <div className="flex-1 h-1.5 bg-neutral-800 rounded">
                      <div className="h-full bg-cyan-500 rounded" style={{ width: `${Math.min(100, v * 100)}%` }} />
                    </div>
                    <span className="w-8 text-right text-neutral-500">{(v * 100).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              {c.err && <div className="text-red-400">{c.err}</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
