/* Chapters 1-4: Executive Summary + Cognitive Decomposition Protocol (Steps 1-9). */
const H = require("./helpers");
const { h1, h2, h3, body, numItem, dataTable, tableCaption, figure } = H;

function build() {
    const el = [];

    /* ================= 1. Executive Summary ================= */
    el.push(h1("1. Executive Summary"));
    el.push(body([
        { t: "This dossier answers a single request: design a web-based game application that uses the OmniDecide kernel engine and pushes it to its absolute limits, delivered as twenty detailed proposals. It was produced under a nine-step cognitive decomposition protocol, so the reasoning is visible before the proposals: the problem is stated as a conceptual equation (Section 2.1), its assumptions are surfaced (2.2), the hard constraints measured on the shipped kernel are tabulated (2.3), and the design space is decomposed into nine sub-nodes (2.4). Three architecturally distinct solution paths are generated (3.1), traded off critically (3.2), and one path is selected with explicit justification for eliminating the other two (3.3). Section 4 converts the selection into a ten-step implementation algorithm and anticipates ten systemic failure points. Section 5 then delivers the twenty proposals, each with concept, core loop, kernel mapping, limits pushed, and its primary risk." },
    ]));
    el.push(body([
        { t: "The selected architecture is " },
        { t: "Path A, the Kernel-as-Referee platform", b: true },
        { t: ": a conventional web game shell in which every contested outcome is adjudicated by one of the kernel's six deterministic primitives (choice, score, noul, rank, compare, extract) through a shared runtime layer. Path B (kernel-as-physics) and Path C (kernel-as-world) are absorbed as game modes rather than foundations, which is what makes the twenty proposals individually able to stress different kernel surfaces - throughput, large contexts, work budgets, output caps, error paths, multilingual detection, and byte-identical replay - without any of them carrying the whole project's risk. Every quantitative claim used here comes from the verified 1.0.0 release artifacts: the 40/40 native-to-WASM byte-identical parity, the 78/78 Node suite, and the measured pipeline throughputs (approximately 13,750 decisions per second at 200-byte contexts, 4,520 at 2 KB, 552 at 20 KB), which jointly define the pacing envelope any game built on this engine must respect." },
    ]));

    /* ================= 2. Cognitive Decomposition (Steps 1-4) ================= */
    el.push(h1("2. Cognitive Decomposition: Framing the Core Problem (Steps 1-4)"));

    el.push(h2("2.1 Step One: The Core Problem as a Conceptual Equation"));
    el.push(body([
        { t: "The core substitution is this: a video game's adjudication layer - the code that decides whether an attack lands, whether testimony holds, which bid wins, how a vote resolves - is replaced by a deterministic, lexical decision kernel running as WebAssembly in the browser. Stated as an abstract equation, the game is a loop over kernel evaluations:" },
    ]));
    el.push(body([
        { t: "Entropy(seed, players, user content)  ->  TextState(instruction, options, context, config)  ->  Envelope = K6(TextState)  ->  Outcome = Translate(Envelope, thresholds)  ->  Stake(reward, damage, payout)  ->  next State.", i: true },
    ]));
    el.push(body([
        { t: "K6 is the fixed set of six primitives; the Envelope is the kernel's five-key decision payload (result, confidence, full probability distribution, plus an optional meta accounting block when requested); Translate is the game designer's real job - it converts a continuous confidence value in the range 0 to 1 into discrete, felt consequences. The quality of the resulting experience is approximately: Fun = LearnableSurface x Stakes x Variety - Frustration. LearnableSurface is how visibly a player can improve at phrasing text the kernel scores highly; Stakes is how much the confidence margin moves the world; Variety is how much new material entropy injects per session; Frustration is dominated by one kernel property, vocabulary mismatch, which punishes synonyms that a human judge would accept." },
    ]));
    el.push(body([
        { t: "The useful mental model that falls out of the equation: " },
        { t: "the kernel is a language physics engine", b: true },
        { t: ". Text is matter; lexical similarity is force (a weighted blend of 0.35 term-frequency cosine, 0.35 Jaccard overlap, and 0.30 trigram similarity); confidence is energy; the work budget is fuel; output caps are compression; and the noul primitive is a truth test. Every game proposal in Section 5 is, in this sense, a different vehicle built on the same physics." },
    ]));

    el.push(h2("2.2 Step Two: Underlying Assumptions of the Substitution"));
    el.push(body("A substitution this aggressive rests on assumptions that must be stated before they can be defended or invalidated. Table 1 lists the nine load-bearing assumptions, the design consequence each one imposes, and the probe that would falsify it. None of them is exotic; the two most consequential are A1 (that lexical scoring is learnable enough to be a skill, rather than noise) and A2 (that determinism is experienced as fairness rather than as predictability fatigue)."));
    el.push(tableCaption("Table 1: Load-bearing assumptions and their falsification probes"));
    el.push(dataTable(
        ["ID", "Assumption", "Design consequence", "Falsification probe"],
        [7, 30, 34, 29],
        [
            ["A1", "Lexical scoring is learnable by players as a skill surface", "Ship a practice lab exposing live scores; teach 'kernel dialect' early", "Playtest drop-off; players cannot form intuition after 30 minutes"],
            ["A2", "Determinism reads as fairness and mastery, not staleness", "Seeded daily content and player-authored inputs supply variety", "Spoiler culture collapses daily modes within weeks"],
            ["A3", "The six primitives map cleanly onto game verbs", "Adjudicate, judge, fact-check, order, duel, and search become the verb set", "Any core loop forced through an awkward primitive"],
            ["A4", "Measured throughput supports responsive play", "Per-action calls are free; per-frame calls banned; queues for bursts", "Frame-time spikes in profiling at 20 KB contexts"],
            ["A5", "Entropy must come from content, since the kernel never randomizes", "JS-side seeded PRNG plus player text plus rotating corpora", "Sessions feel identical under the same seed"],
            ["A6", "Multilingual support is a playable dimension, not just localization", "Language detection confidence and unicode mode become mechanics", "Cross-language scores feel unfair without per-language ladders"],
            ["A7", "A zero-dependency UMD API in a static site is enough to ship", "No backend required for the core loop; hosting is a static file server", "A mode genuinely needs server authority (live PvP)"],
            ["A8", "The meta accounting block is stable enough to build meters on", "Work budget, truncation and detection fields drive resource UI", "Fields drift between kernel versions without notice"],
            ["A9", "Deterministic error envelopes are legitimate game events", "Status 1-4 responses map to mistrials, penalties and traps", "Players read error toasts as bugs rather than moves"],
        ]
    ));

    el.push(h2("2.3 Step Three: Constraints and Unknown Variables"));
    el.push(body("The constraint map separates hard facts, verified against the shipped kernel, from open variables that only playtesting can resolve. The hard constraints in Table 2 are non-negotiable engineering facts: the wrapper exposes exactly six primitives (the upstream learning brain, classification, decomposition, link views and model files are not reachable through the WASM binding), determinism is absolute, and the performance envelope is measured, not estimated. Figure 1 shows the measured pipeline throughput that constrains pacing design."));
    el.push(tableCaption("Table 2: Hard constraints verified against omnidecide-wasm 1.0.0"));
    el.push(dataTable(
        ["ID", "Constraint", "Implication for game design"],
        [7, 45, 48],
        [
            ["C1", "Six primitives only: choice, score, noul, rank, compare, extract; no learning, classification or model loading through the wrapper", "All mechanics must be expressible with the six verbs plus JS-side state; adaptive difficulty must live outside the kernel"],
            ["C2", "Byte-identical determinism; envelopes contain no wall-clock or environment values", "No built-in RNG; caching by request hash is always safe; replays are verifiable proofs"],
            ["C3", "compare requires exactly 2 options; extract needs topK >= 1; choice, score and rank need at least one option; language 'default' is per-call only", "Input contracts become rulebook wording; contract violations are deterministic status-1 envelopes"],
            ["C4", "Purely lexical matching; synonyms without shared tokens score low", "Glossaries, canonical tiles and dialect training are mandatory UX, not polish"],
            ["C5", "Pipeline throughput: about 13,750 decisions/s at 200 B context, 4,520 at 2 KB, 552 at 20 KB (Node v24, measured)", "One 20 KB decision per frame is affordable; dozens per frame are not; batch and cache"],
            ["C6", "Static hosting over HTTP(S) required; file:// pages unsupported", "Distribution is a static site or CDN; no server dependency unless a mode adds one"],
            ["C7", "Output caps (maxRanked, maxSnippetChars, maxTotalChars) never alter numeric decisions", "Caps are safe levers for information pricing and UI truncation; fairness is untouched"],
            ["C8", "Single-threaded module; at most 64 live kernel handles; module loads once per process", "A kernel pool with freed-handle hygiene is mandatory; leaks surface as handle exhaustion"],
            ["C9", "Apache-2.0 license with preserved notices in the vendored tree", "Commercial use is permitted; notices ship with the game"],
        ]
    ));
    el.push(...figure("/home/z/my-project/scripts/gamefoundry/throughput.png",
        "Figure 1: Measured pipeline throughput by context size, shipped kernel, Node.js v24 versus Chromium 143 (release benchmark data of omnidecide-wasm 1.0.0).", 560));
    el.push(body("The unknown variables in Table 3 are the mirror image: they cannot be resolved by reading code. Each is paired with the cheapest probe that produces a real answer, in the order they should be run. Note that U1 and U2 gate everything else; if the scoring surface cannot be taught, no proposal in Section 5 survives unchanged."));
    el.push(tableCaption("Table 3: Unknown variables and their playtest probes"));
    el.push(dataTable(
        ["ID", "Unknown variable", "Cheapest resolving probe"],
        [7, 45, 48],
        [
            ["U1", "Can novice players intuit what the kernel rewards?", "Wizard-of-Oz lab: 10 players write claims, watch live scores, rate predictability"],
            ["U2", "What confidence-to-outcome curve feels right?", "One-night prototype of P01 with three threshold profiles (linear, sigmoid, stepped)"],
            ["U3", "How fast does session context grow toward the work budget?", "Instrument P16 prototype; log meta.workUsed per move across 20 sessions"],
            ["U4", "Does determinism sustain replay interest?", "Run P08 daily puzzle for two weeks; measure return rate versus seed rotation"],
            ["U5", "Are cross-language score levels comparable enough for shared ladders?", "Score one fixed scenario across all ten languages; chart confidence spread"],
        ]
    ));

    el.push(h2("2.4 Step Four: Decomposition into Sub-Nodes"));
    el.push(body("Decomposition limits cognitive distraction by giving every later decision exactly one home. The problem splits into nine sub-nodes, Table 4; each node names its focus and the question that settles it. The proposals in Section 5 are deliberately distributed across all nine nodes so that the portfolio, not any single game, covers the space."));
    el.push(tableCaption("Table 4: Sub-node decomposition of the design problem"));
    el.push(dataTable(
        ["Node", "Focus", "Key question"],
        [10, 40, 50],
        [
            ["N1", "Decision surface: which primitives become which verbs, and through which input UX", "Free text, word tiles, or templated cards - which input form teaches fastest?"],
            ["N2", "Entropy and content: seeds, procedural generation, user-authored corpora", "What supplies variety when the judge cannot roll dice?"],
            ["N3", "Stakes and calibration: confidence-to-outcome curves, difficulty via thresholds and budgets", "How does a 0.55 versus 0.85 confidence feel different in the hands?"],
            ["N4", "Feedback and explainability: distribution bars, meta panels, verdict cards", "How much of the envelope does the player see, and when?"],
            ["N5", "Progression and modes: campaign, roguelite, async PvP, daily, speedrun", "Which mode carries retention, and which carries prestige?"],
            ["N6", "Technical runtime: kernel pool, decision queue, cache, replay recorder", "What infrastructure do all twenty proposals share?"],
            ["N7", "Content pipeline: scenario packs, glossaries, language packs", "Who authors corpora, and how are they versioned and verified?"],
            ["N8", "Trust and verification: byte-identical replay as anti-cheat and share format", "Can a leaderboard be fair with no server at all?"],
            ["N9", "Limits matrix: which proposal stresses which kernel surface", "Does the portfolio collectively touch every documented limit?"],
        ]
    ));

    /* ================= 3. Solution Paths (Steps 5-7) ================= */
    el.push(h1("3. Solution Paths and Strategic Selection (Steps 5-7)"));

    el.push(h2("3.1 Step Five: Three Architecturally Distinct Paths"));
    el.push(body([
        { t: "Path A - Kernel as Referee (adjudication core). ", b: true },
        { t: "The game world is conventional JavaScript state; every contested outcome is routed through a kernel primitive. A duel is a compare call, a trial is a noul call, a bid is settled by score, a vote by rank, a search by extract. The kernel is the rules engine; the shell owns pacing, rendering and economy. This is the lowest-risk path and the one that most naturally exposes all six primitives plus the deterministic error envelopes, because players will deliberately send malformed and adversarial text." },
    ]));
    el.push(body([
        { t: "Path B - Kernel as Physics (simulation core). ", b: true },
        { t: "The similarity function itself becomes the game's force field. Entities are text blobs; attraction between a word and an anchor is its lexical similarity; the canvas animates continuous motion that interpolates between discrete, cached kernel samples. The experience is novel and the engineering pushes throughput, caching and queueing hardest, but fun depends entirely on players feeling the field, which is the highest design risk of the three." },
    ]));
    el.push(body([
        { t: "Path C - Kernel as World (emergent narrative core). ", b: true },
        { t: "The world is a corpus; documents are the map. Exploration is extract, clue verification is noul, plot branches resolve through choice, and the meta accounting block becomes fog of war: chunks dropped by the kernel are literally the rooms the player never sees. This path naturally drives the largest contexts (20 KB and beyond) and the deepest use of work budgets, at the cost of the heaviest content authoring and the slowest pacing." },
    ]));

    el.push(h2("3.2 Step Six: Critical Trade-off Evaluation"));
    el.push(body("Table 5 evaluates the three paths on the six dimensions that actually decide web-game outcomes. The evaluation is deliberately unsentimental: Path B wins on novelty and raw limits-pushing; Path C wins on narrative depth and context-size stress; Path A wins on everything that makes a project shippable - breadth of kernel surface exercised, clarity of game verbs, content cost, and the ability to fail safely on invalid input, which is itself a verified kernel behavior (eight of the forty parity-corpus envelopes are error envelopes)."));
    el.push(tableCaption("Table 5: Trade-off evaluation of the three paths"));
    el.push(dataTable(
        ["Dimension", "Path A: Referee", "Path B: Physics", "Path C: World"],
        [22, 26, 26, 26],
        [
            ["Kernel surface breadth", "All six primitives plus error paths, naturally", "Mostly compare and choice probes", "Deep extract and noul; narrow elsewhere"],
            ["Limits pushed", "Breadth; adversarial input; replay verification", "Throughput, caching, continuous sampling", "Context size, work budget, caps, fog of war"],
            ["Fun risk", "Lowest; verbs are familiar game verbs", "Highest; the field may not feel like anything", "Medium; pacing depends on reading appetite"],
            ["Build cost", "Lowest; shell plus runtime layer", "High; animation, sampling, cache engineering", "High; corpus authoring dominates"],
            ["Failure containment", "Errors become moves (verified behavior)", "Sampling gaps break immersion", "Extraction quality failures frustrate directly"],
            ["Absorbability into others", "Absorbs both as modes", "Hard to retrofit as a base later", "Absorbable as an expedition mode"],
        ]
    ));

    el.push(h2("3.3 Step Seven: The Selected Path and the Eliminations"));
    el.push(body([
        { t: "Selection: Path A, the Kernel-as-Referee platform, is the strategically correct foundation. ", b: true },
        { t: "The request asks for a game that pushes the kernel to its absolute limits - plural. No single architecture pushes every limit; each path maximizes one axis of the constraint map. A platform whose core loop is adjudication can host the other two paths as modes: Path B becomes a sandbox mode (realized as proposal P13), Path C becomes an expedition mode (realized as P04). Choosing Path A therefore does not abandon limits-pushing; it sequences it, letting the runtime layer amortize across twenty proposals that individually stress different surfaces, which is exactly what the coverage matrix in Section 6 verifies." },
    ]));
    el.push(body([
        { t: "Elimination of Path B as the foundation", b: true },
        { t: " rests on three grounds. First, its fun hypothesis is untestable before a large animation investment; if players do not feel the field, there is no game underneath. Second, it optimizes the kernel's fastest path (small compare calls) while barely touching noul, extract, caps or error semantics - a narrow slice of the limits. Third, as a mode rather than a base it loses nothing: the runtime layer's queue and cache are precisely the pieces the mode needs." },
    ]));
    el.push(body([
        { t: "Elimination of Path C as the foundation", b: true },
        { t: " also rests on three grounds. First, it specializes early: its mechanics concentrate on two primitives, so the other four are under-exercised by construction. Second, its content cost is the highest of the three - corpora must exist before the first playtest - and extraction quality failures land directly on the player as frustration rather than as contained errors. Third, its slow, text-heavy pacing is a poor first experience for teaching the scoring surface that every other proposal depends on. As an expedition mode inside the platform, it keeps its best asset: the largest contexts and the work-budget-as-oxygen mechanic." },
    ]));

    /* ================= 4. Implementation Algorithm + Failures (Steps 8-9) ================= */
    el.push(h1("4. Implementation Algorithm and Failure Anticipation (Steps 8-9)"));

    el.push(h2("4.1 Step Eight: The Algorithmic Implementation Path"));
    el.push(body("The chosen path converts into a ten-step build algorithm. Steps 1 through 4 build the runtime layer that every proposal shares; steps 5 through 8 build the first two games as a vertical slice; steps 9 and 10 institutionalize verification and content supply. Each step names its deliverable, and the sequence is ordered so that nothing later can invalidate nothing earlier: the runtime's cache and replay recorder exist before the first game loop, because both are design commitments, not optimizations."));
    el.push(numItem("impl-steps", "Static shell: a Vite or plain-JS static site that serves the dist artifacts over HTTP(S) and calls OmniDecide.create() exactly once per page; module load measured at about 3.1 ms, first decision about 3.1 ms, so no loading screen design is needed."));
    el.push(numItem("impl-steps", "Kernel pool: wrap kernel handles in a pool of 4 to 8 live handles with strict free() hygiene, asserting Kernel.engineCount() returns to zero on scene teardown; the module caps live handles at 64 and leaks there are fatal, not degrading."));
    el.push(numItem("impl-steps", "Decision queue and cache: all evaluations flow through an async queue keyed by the SHA-256 of the canonical request JSON; identical requests return cached envelopes instantly, which is provably safe because identical inputs produce byte-identical outputs."));
    el.push(numItem("impl-steps", "Replay recorder: log every request as one JSONL line, mirroring the repository's own requests.jsonl format; this is simultaneously the bug report format, the anti-cheat proof and the share format."));
    el.push(numItem("impl-steps", "Adjudication service: map game verbs to primitives behind one interface (duel = compare, trial = noul, appraisal = score, vote = rank, search = extract, election = choice) with per-difficulty threshold configuration."));
    el.push(numItem("impl-steps", "Feedback UI: distribution bars, confidence gauges and a meta inspector that renders workUsed, chunksDropped and detectedConfidence as game meters rather than debug output."));
    el.push(numItem("impl-steps", "Vertical slice: ship P01 (duel) and P02 (court) with the three threshold profiles from probe U2; measure D1 retention and the predictability rating from U1."));
    el.push(numItem("impl-steps", "Daily infrastructure: seeded scenario generation (JS-side mulberry32 PRNG; the kernel stays deterministic), timezone-rotated seeds, shareable result grids plus replay files."));
    el.push(numItem("impl-steps", "Verification practice: a browser replay checker that re-runs any requests.jsonl and byte-compares envelopes, reusing the repository's parity methodology in-product; wire it into CI so a kernel upgrade that breaks any proposal's authored holes or cases fails loudly."));
    el.push(numItem("impl-steps", "Content pipeline: scenario packs as versioned JSON with per-pack glossaries and language tags; packs are validated by replaying their own decision logs against the pinned kernel before publication."));

    el.push(h2("4.2 Step Nine: Systemic Failure Points and Countermeasures"));
    el.push(body("Ten failure modes are systemic: each one threatens multiple proposals, and each has a countermeasure that is cheaper to build early than late. Table 6 lists them with their countermeasures and the proposals most exposed. The gravest is F2 (spoiler culture under determinism): determinism makes every puzzle reproducible, so content supply and seeded rotation are not features but survival systems. The most deceptive is F5 (keyword stuffing): because the kernel is purely lexical, repetition is a legitimate strategy, and the design decision is to embrace it as skill in some proposals and constrain it with rubric phrasing in others."));
    el.push(tableCaption("Table 6: Systemic failure points, countermeasures and exposure"));
    el.push(dataTable(
        ["ID", "Failure mode", "Countermeasure", "Most exposed"],
        [7, 34, 37, 22],
        [
            ["F1", "Vocabulary mismatch frustrates players (synonyms score low)", "Dialect lab, glossary boosts, canonical word tiles", "P01, P03, P08, P16"],
            ["F2", "Spoiler culture under determinism kills daily modes", "Timezone seeds, rotating corpora, UGC events", "P08, P10, P17"],
            ["F3", "Main-thread jank from large-context calls", "Worker + queue + cache; sample on drop, never on drag", "P04, P09, P13"],
            ["F4", "Work budget exhaustion mid-session", "Context compaction ('amendments'); budget meters always visible", "P04, P11, P16, P20"],
            ["F5", "Keyword stuffing degenerates the meta", "Embrace as skill (P10); constrain via rubric phrasing elsewhere", "P03, P10, P16"],
            ["F6", "Kernel handle leaks hit the 64-handle cap", "Pool with engineCount() assertions in tests", "P09, P13, P18"],
            ["F7", "A silent fallback violates the kernel's contract", "Fail loudly: OmniDecideError surfaces as a game error state", "All"],
            ["F8", "Cross-language score imbalance reads as unfairness", "Per-language ladders; calibrated thresholds per pack", "P05, P06, P17"],
            ["F9", "Client-side tampering with JS around the WASM module", "Replay verification: byte-identical envelopes re-checked by peers or CI", "P07, P08, P17"],
            ["F10", "Content cost exceeds team capacity", "Seeded templates, UGC packs, pack linting via replay", "P02, P14, P16, P20"],
        ]
    ));

    return el;
}

module.exports = { build };
