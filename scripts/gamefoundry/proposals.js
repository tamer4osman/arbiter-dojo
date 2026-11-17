/* Chapter 5: The Twenty Game Proposals, grouped into six families. */
const H = require("./helpers");
const { h1, h2, h3, body, specTable, tableCaption } = H;

function proposal(code, title, paras, rows) {
    const el = [];
    el.push(h3(code + " - " + title));
    paras.forEach(p => el.push(body(p)));
    el.push(tableCaption("Table 5." + code.slice(1) + " Specification card: " + title));
    el.push(specTable(rows));
    return el;
}

function build() {
    const el = [];
    el.push(h1("5. The Twenty Game Proposals"));
    el.push(body("The twenty proposals follow in six families, ordered from adversarial to flagship. Each proposal is written to the same standard: a concept with its fiction, the core loop a player actually repeats, the precise kernel mapping (which primitive, which envelope fields), the kernel limits it deliberately stresses, and its primary risk with the mitigation. Family-level introductions state what the group collectively proves about the engine. Every proposal assumes the runtime layer of Section 4.1 (pool, queue, cache, replay recorder) already exists."));

    /* ---------------- 5.1 Arena ---------------- */
    el.push(h2("5.1 Arena, Adversarial and Real-Time Games (P01, P09, P13, P17)"));
    el.push(body("This family proves that the kernel can host head-to-head competition. All four games make adversarial text the contest itself, and all four lean on the byte-identical envelope to keep competition trustworthy without a referee server."));

    el.push(...proposal("P01", "Claim and Compare: The Lexical Duel Arena",
        [
            "Concept. Two players receive the same evidence pool and the same instruction (for example: which candidate should lead the expedition, and why). Each composes one claim per exchange from a limited bag of word tiles, which forces creative phrasing under scarcity. The compare primitive - which accepts exactly two options - adjudicates the exchange, and the confidence margin between the winner and loser converts to damage through the difficulty's threshold profile: graze, hit, or critical.",
            "Core loop. Draft a claim from tiles; submit; watch the verdict card render the envelope as distribution bars; take or deal damage; repeat best-of-three. Between duels, players spend earnings on glossary cards that teach which constructions the kernel reads strongly, which is where the skill expression lives.",
            "Limits and risk. The design stresses adversarial input, the strict two-option contract of compare, and verdict-card UX over raw envelopes; the cache makes rematch previews instant. The primary risk is the classic F1 frustration: a synonym with no shared tokens scores low. Mitigation is the tile system itself - tiles are pre-tested vocabulary - plus the practice lab where players see live scores before risking rating points.",
        ],
        [
            ["Kernel surface", "compare (exactly 2 options); envelope.confidence and distribution; caps to trim long claims; status-1 envelopes forfeit the exchange"],
            ["Limits pushed", "Adversarial phrasing under a tile economy; verdict-card feedback; cache hit rate in rematches"],
            ["Session shape", "3 to 8 minutes per duel; asynchronous; no server required"],
            ["Primary risk and mitigation", "Vocabulary mismatch (F1) - pre-tested tiles and a live-score practice lab"],
        ]
    ));

    el.push(...proposal("P09", "Fog of Warlord: Adjudicated Real-Time Strategy",
        [
            "Concept. A deliberately slow real-time strategy in which the kernel owns every combat outcome. Armies are doctrine descriptions rather than unit counts; each engagement is a compare call between the two doctrines under a battlefield context (terrain, weather and recent events as one text log). Scouting is extract over intercepted dispatches; counter-intelligence is noul, testing whether a captured report is actually supported by known facts.",
            "Core loop. Issue orders; engagements enter the decision queue and drain at measured throughput; battle reports render the envelope as a war dispatch with the distribution shown as morale bars. The HUD exposes decisions-per-second headroom, making the kernel's throughput a visible strategic resource.",
            "Limits and risk. This is the throughput and queueing showcase: doctrine texts are capped near 2 KB (about 4,520 decisions per second measured), engagements are batched per second, and the cache absorbs repeated matchups. The primary risk is pacing: real-time players expect faster feedback than a queue can give. Mitigation is the design stance that the delay is diegetic - commanders genuinely need time to assess - and that reports arrive as written dispatches, not instant health bars.",
        ],
        [
            ["Kernel surface", "compare (battles), extract (scouting), noul (counter-intel), choice (auto-resolved skirmishes); decision-per-second HUD"],
            ["Limits pushed", "Sustained throughput under continuous play; queue engineering; multi-primitive orchestration"],
            ["Session shape", "20 to 40 minutes; single device; optional async ladder"],
            ["Primary risk and mitigation", "Pacing mismatch (F3) - 2 KB doctrine cap, per-second batching, diegetic delay framing"],
        ]
    ));

    el.push(...proposal("P13", "Semantic Gravity: The Similarity Field Sandbox",
        [
            "Concept. This is Path B realized as a mode: a physics sandbox where words drift in a two-dimensional field and anchor phrases exert attraction measured by lexical similarity. Players place and pin words into constellations, then take challenges: group these ten words into two beliefs, and the engine adjudicates whether the arrangement beats a baseline arrangement through rank and choice calls.",
            "Core loop. Drag words; the field samples similarity only on drop (never mid-drag), caches every probe, and interpolates the animation between discrete samples so motion feels continuous while every decision stays discrete and deterministic; submit an arrangement; receive the verdict envelope; browse a gallery of other players' constellations by shared seed.",
            "Limits and risk. The design pushes cache-hit-rate engineering, sampling discipline and the continuous-over-discrete illusion - the hardest UX problem in the dossier, because the kernel is a step function and the screen wants a curve. Mitigation is the drop-only sampling rule plus interpolation, which keeps the kernel's decisions sovereign while the renderer handles smoothness. Challenges are authored against the shipped kernel version and verified by replay, pinning the mode per season.",
        ],
        [
            ["Kernel surface", "compare, choice and rank as field probes; heavy cache; interpolated rendering over discrete envelopes"],
            ["Limits pushed", "Cache engineering; throughput discipline; continuous-feel UX over a step-function judge"],
            ["Session shape", "Open-ended sandbox; 5-minute challenge episodes"],
            ["Primary risk and mitigation", "The field feels wrong mid-drag (F3, F7) - sample on drop only; replay-pinned challenges per season"],
        ]
    ));

    el.push(...proposal("P17", "Scripted Fists: Unicode Martial Ladder",
        [
            "Concept. A martial-arts tournament whose techniques are phrases in Chinese, Arabic, Hindi and Spanish, fought entirely in unicode mode. Each bout is a compare call between two fighters' technique strings under a bout context; tournaments seed through rank; and because envelopes are byte-identical across machines, ranked ladders are trustless - any client can re-run a reported bout and confirm the result byte for byte.",
            "Core loop. Learn techniques through glossary drills; compose combos as best-of-five exchanges; climb one ladder per language; visit the dojo, where training dummies expose the three scoring channels (term-frequency cosine, Jaccard, trigram) through measurable reactions, teaching what each channel rewards.",
            "Limits and risk. This is the multilingual depth showcase: ten languages, unicode accounting with code-point-boundary truncation, per-language ladders, and replay verification as ranked integrity. The primary risk is F8, cross-language imbalance: confidence levels differ by language for equivalent content. Mitigation is language-locked ladders plus a daily neutral ladder whose mode and language rotate, so no permanent imbalance forms.",
        ],
        [
            ["Kernel surface", "compare (bouts), rank (seeding); unicode mode; per-language ladders; replay verification for ranking integrity"],
            ["Limits pushed", "Multilingual depth; unicode throughput (about 10,900 decisions per second measured at 2 KB); determinism as anti-cheat"],
            ["Session shape", "4-minute bouts; daily ladder rotation"],
            ["Primary risk and mitigation", "Cross-language imbalance (F8) - locked ladders and rotating neutral play"],
        ]
    ));

    /* ---------------- 5.2 Investigation ---------------- */
    el.push(h2("5.2 Investigation, Testimony and Trust (P02, P12, P14, P19)"));
    el.push(body("This family proves that noul - the statement-support test - can carry entire games. All four titles make truth-checking the verb, and all four treat the kernel's deterministic error envelopes as legitimate moves rather than failures, which is a verified behavior of the engine (error envelopes participate in the same byte-parity guarantee as success envelopes)."));

    el.push(...proposal("P02", "The Null Court: Testimony Trials",
        [
            "Concept. A courtroom drama where the jury is the kernel. Each case ships as a testimony corpus; prosecution and defense draft statements, and noul returns whether each statement is supported by the evidence, with confidence. Players choose a side per case: build a narrative that clears the conviction threshold, or dismantle the opponent's key statement until it fails the support test.",
            "Core loop. Examine exhibits through extract; draft a statement; receive the noul verdict as a jury-conviction bar; endure cross-examination; win a case when your key statement clears threshold while the opponent's key statement fails. Malformed indictments produce status-1 envelopes, which the rules of court call mistrials - a real cost, not a crash.",
            "Limits and risk. The design makes error-path gameplay central and uses meta accounting as court time. Difficulty scales by thresholds, by corpus size, and by unicode testimony packs in mixed-language cases. The primary risk is swinginess: binary verdicts feel harsh. Mitigation is scoring by confidence margin rather than pure pass-fail, so a near-miss conviction still earns points and reads as a hung jury.",
        ],
        [
            ["Kernel surface", "noul as the core verb; extract for exhibits; status-1 envelopes as mistrials; meta as court time"],
            ["Limits pushed", "Error-path gameplay; noul thresholds as difficulty; multilingual case packs"],
            ["Session shape", "10 to 15 minutes per case; episodic packs"],
            ["Primary risk and mitigation", "Swingy binary verdicts - score by confidence margin; frame near-misses as hung juries"],
        ]
    ));

    el.push(...proposal("P12", "Trust Chain: Audited Social Deduction",
        [
            "Concept. Asynchronous multiplayer social deduction for five to twelve players. Claims enter an append-only chain, and every new claim must cite prior claims. Any player may spend an audit action: noul checks whether the audited claim is supported by the chain's accumulated evidence, and a failed audit marks the link broken, collapsing every downstream claim that cited it.",
            "Core loop. Submit claims with citations; audit rivals; watch the chain render as a dependency graph where broken links propagate visibly; win either by having your own claim chain survive every audit or by being the auditor who breaks the pivotal lie.",
            "Limits and risk. The design pushes noul into adversarial user-generated content, long accumulating contexts, and multi-kernel pooling, since audits for different players' turns can run in parallel through the pool. The primary risk is UGC quality variance: some claims will be gibberish. Mitigation is audit pricing - auditing costs reputation if you fail - plus a reputation ladder that matches players of comparable calibration.",
        ],
        [
            ["Kernel surface", "noul (audits), extract (citation retrieval); meta for provenance display; kernel pool for parallel audits"],
            ["Limits pushed", "noul under adversarial UGC; long accumulating contexts; async multiplayer scale"],
            ["Session shape", "Multi-day async rounds; 5 to 12 players"],
            ["Primary risk and mitigation", "Low-quality UGC (F10) - audit pricing, reputation ladder, seeded starter chains"],
        ]
    ));

    el.push(...proposal("P14", "Room Four: The Interrogation Engine",
        [
            "Concept. Detective vignettes that chain four primitives per case. Two suspects' statements accumulate into one dossier; the player crafts confrontation questions; the engine then runs compare to test which statement fits the evidence worse, noul to check alibi support, extract to reconstruct timelines, and score to grade internal consistency against a rubric. The case clears when the guilty statement's support collapses below the case threshold.",
            "Core loop. Gather through extract; confront through compare; verify through noul; close with choice - charge or release. A wrong charge fails the case; the full envelope chain renders afterward as the interrogation transcript, showing the player exactly which sentence broke which suspect's story.",
            "Limits and risk. This is the orchestration showcase: one game loop, four primitives, one narrative frame, with meta accounting managing dossier bloat. The primary risk is authoring cost: cases must be internally consistent across four decision surfaces. Mitigation is a case linter that replays every authored decision path at build time against the pinned kernel, so impossible cases cannot ship.",
        ],
        [
            ["Kernel surface", "compare, noul, extract, score chained; choice for the closing decision; meta for dossier management"],
            ["Limits pushed", "Multi-primitive orchestration; narrative pacing over deterministic outputs"],
            ["Session shape", "15 to 25 minutes per case"],
            ["Primary risk and mitigation", "Authoring cost (F10) - case linter replays all decision paths at build time"],
        ]
    ));

    el.push(...proposal("P19", "The Paraphrase Gambit: Plagiarism Laundering Puzzle",
        [
            "Concept. A puzzle built on channel divergence, the deepest mechanics in this dossier. The player receives a source claim that is strongly supported (noul high) but forbidden: any trigram-channel resemblance above the audit bar fails. The goal is to paraphrase the claim until it keeps support above one bar while dropping trigram overlap below another. The game lives in the disagreement between the three similarity channels - term-frequency cosine, Jaccard and trigram - which respond differently to word swaps, reorderings and restructures.",
            "Core loop. Read the source; edit the paraphrase; the audit panel shows noul support and the resemblance estimate; pass when support exceeds bar A and resemblance falls under bar B within the edit budget; star ratings reward edit economy. Later levels run in unicode mode with Chinese and Arabic source claims.",
            "Limits and risk. The design exploits interplay between scoring channels and between primitives - the closest a game can get to teaching the kernel's internals. The primary risk is honesty: per-channel values are not directly exposed by the wrapper, so the audit panel shows envelope-derived estimates plus shipped, per-language calibration charts measured offline. This is stated openly in the rules, keeping the game's contract with the player clean.",
        ],
        [
            ["Kernel surface", "noul (support), compare (self-versus-source resemblance), unicode mode; envelope-derived estimates with shipped calibration data"],
            ["Limits pushed", "Channel interplay as mechanics; the teaching game for kernel internals"],
            ["Session shape", "5-minute puzzles; 60-level campaign"],
            ["Primary risk and mitigation", "Indirect channel visibility - open calibration charts per language pack, shipped as static data"],
        ]
    ));

    /* ---------------- 5.3 Economy ---------------- */
    el.push(h2("5.3 Economy, Markets and Management (P03, P07, P11, P15)"));
    el.push(body("This family proves that the envelope's numeric payload can drive economies. Four different economic genres - auction, market, heist and tycoon - are built on the same three signals: score for appraisal, distribution for settlement prices, and the meta work budget as the resource every manager actually fights over."));

    el.push(...proposal("P03", "Rubric and Ledger: The Appraisal Auction",
        [
            "Concept. An auction house where value is defined by a hidden rubric. Artifacts arrive with rich text dossiers; a secret rubric of score items defines true value; players bid against three fixed-curve NPC bidders (the NPCs are seeded JavaScript, keeping adjudication purely with the kernel). After settlement, score reveals per-item appraisals, and profit is the gap between the hammer price and the kernel's grading.",
            "Core loop. Read the dossier; estimate value; bid; settle; study the revealed appraisal lines; return richer. Long-term progression is learning how the judge reads - which dossier phrasings raise which rubric lines - which is precisely the A1 skill surface wearing an auction coat.",
            "Limits and risk. The design stresses score with many rubric items and turns caps.maxRanked into information pricing: players can pay for more revealed appraisal lines, and because caps never alter numeric decisions, the paid information is provably identical in kind to the free information. The primary risk is F5, keyword stuffing the dossier. Mitigation is rubric phrasing that rewards coherent dossiers, making stuffing visibly inferior in the appraisal reveal.",
        ],
        [
            ["Kernel surface", "score over a multi-item rubric; caps.maxRanked as information pricing; meta truncation signals"],
            ["Limits pushed", "Rubric breadth; caps as economy; appraisal-reveal teaching UX"],
            ["Session shape", "8-minute auction rounds; persistent collection meta"],
            ["Primary risk and mitigation", "Keyword stuffing (F5) - rubric phrasing rewards coherent prose, revealed at settlement"],
        ]
    ));

    el.push(...proposal("P07", "The Confidence Exchange: A Prediction Market on a Deterministic Judge",
        [
            "Concept. A market whose underlying asset is a future kernel decision. A public event is announced - instruction, options and sealed evidence. Players trade shares in each option at prices derived from a partially obscured pre-reveal distribution; at settlement, the full envelope publishes, and shares pay out proportionally to the actual distribution. Anyone can verify settlement by replaying the event, because the envelope is byte-identical on every machine.",
            "Core loop. Research events with limited extract peeks at the sealed evidence; take positions; hedge across options; watch the settlement reveal. Because high-confidence options pay predictably, alpha lives in finding under-priced options - which means reading evidence the way the kernel does.",
            "Limits and risk. The design makes the distribution payload an economy and determinism the market's integrity mechanism (F9 without needing a server). The primary risk is that a solved market stops being fun: once everyone reads evidence well, prices converge. Mitigation is sealed rotating evidence plus player-authored events - user-generated entropy that keeps the market inefficiency alive.",
        ],
        [
            ["Kernel surface", "envelope.distribution as the payout function; extract for research; replay verification as settlement proof"],
            ["Limits pushed", "Distribution as economy; determinism as trust; UGC event entropy"],
            ["Session shape", "Daily settlement cycles; persistent portfolio"],
            ["Primary risk and mitigation", "Solved-market staleness - sealed evidence rotation and player-authored events"],
        ]
    ));

    el.push(...proposal("P11", "The Minifier's Apprentice: Compression Heist",
        [
            "Concept. A heist game where the plan document is the bomb. Each round, every crew member adds a paragraph to the plan; the meta block's workUsed against workBudget is your heat meter; a plan that blows the budget (workExceeded) executes degraded. Between rounds, players rewrite and compress the plan - merging clauses, cutting hedging, collapsing evidence - and then execute.",
            "Core loop. Rounds add text; check heat; spend actions compressing; execute through a score or choice call; the envelope reveals whether the plan held. Scoring rewards low workUsed with high confidence, which teaches players exactly what the kernel's attention actually consumes.",
            "Limits and risk. The design turns the meta accounting block into the primary tension system and contextTruncated and contextUnitsDropped into lost-intel events. The primary risk is tedium: manual compression can feel like homework. Mitigation is auto-minify power-ups with explicit quality costs, so the player chooses between hand-crafting and paying for a blunt instrument - a choice about attention, which is the game's actual subject.",
        ],
        [
            ["Kernel surface", "meta.workUsed, workBudget, workExceeded as meters; contextTruncated and contextUnitsDropped as events; score or choice for execution"],
            ["Limits pushed", "Budget accounting as tension; teaching what the kernel reads"],
            ["Session shape", "12-minute heists; escalating plan sizes"],
            ["Primary risk and mitigation", "Compression tedium - auto-minify tools with quality costs"],
        ]
    ));

    el.push(...proposal("P15", "The Deadline Desk: Editorial Judgment Tycoon",
        [
            "Concept. A newsroom tycoon in which the aggregator is the kernel. Wire stories flood in as context; the player drafts candidate headlines as options; the choice primitive decides which headline the algorithmic feed picks up, and its confidence is the click-through estimate. The day's work budget is the deadline: every story processed consumes budget, and exhausted desks produce truncation-driven errors that cost reputation.",
            "Core loop. Triage the wire; draft headlines; spend the budget; publish; earnings follow confidence; hire copy editors (JavaScript-side helpers) who compress stories to protect the budget. Weekly difficulty raises story volume and lowers budget, forcing triage discipline.",
            "Limits and risk. The design stresses high-frequency choice calls - the highest in the dossier - an economy run entirely on confidence values, caps.maxTotalChars shaping feed previews, and budget-as-deadline. The primary risk is staleness under determinism: the same wire picks the same winner every time. Mitigation is daily seeded wires plus rotating beat packs, and the budget itself forcing different triage decisions even over familiar content.",
        ],
        [
            ["Kernel surface", "choice at high frequency; confidence as revenue; meta.workBudget as the day clock; caps for feed previews"],
            ["Limits pushed", "Call frequency; economy-on-confidence; budget pressure"],
            ["Session shape", "10-minute days; weekly difficulty arcs"],
            ["Primary risk and mitigation", "Deterministic staleness - seeded wires, rotating beats, budget-driven triage variety"],
        ]
    ));

    /* ---------------- 5.4 Exploration ---------------- */
    el.push(h2("5.4 Exploration, Survival and Language Frontiers (P04, P06, P16)"));
    el.push(body("This family proves that the kernel's accounting internals - work budgets, dropped chunks, truncation counts, language detection - are not diagnostics but survival mechanics. Three genres take the fields a dashboard would hide and make them the threats the player manages."));

    el.push(...proposal("P04", "Depth 20K: The Context Diver",
        [
            "Concept. A salvage expedition into documents of 20 to 100 KB - wrecked encyclopedias, ship logs, abandoned wikis. The diver descends into one enormous context; extract with a chosen topK returns salvage; oxygen is the work budget (meta.workUsed against workBudget); hazards are the chunks the kernel had to drop (chunksDropped, contextUnitsDropped) - the rooms of the wreck that this dive never sees.",
            "Core loop. Choose the dive instruction and topK; watch oxygen burn as workUsed climbs; surface before workExceeded ends the dive with whatever was emitted. Deeper dives - larger contexts, larger topK - yield rarer finds but burn oxygen faster and widen the fog. Loot quality follows caps.maxSnippetChars and caps.maxTotalChars.",
            "Limits and risk. This is the large-context showcase: one 20 KB decision costs about 1.8 ms measured, so dives are batched between frames through the queue, and worker isolation keeps the main thread clean. The primary risk is that fog frustrates: dropped chunks are invisible losses. Mitigation is the sonar metaphor - the meta block is rendered as a sonar readout, so players learn to read partial information as information, which is the game's central skill.",
        ],
        [
            ["Kernel surface", "extract with variable topK; meta.workUsed, workBudget, workExceeded, chunksDropped, contextTruncated; caps shaping loot size"],
            ["Limits pushed", "Largest-context throughput (20 KB and beyond); meta accounting as survival meters"],
            ["Session shape", "6-minute dives; a persistent wreck atlas"],
            ["Primary risk and mitigation", "Fog frustration - sonar framing of dropped chunks as readable information"],
        ]
    ));

    el.push(...proposal("P06", "Babel Border: Customs of Ten Languages",
        [
            "Concept. A border-officer game where language detection is the polygraph. Travelers present documents in any of the ten supported languages; the meta block's detected and detectedConfidence fields are the officer's instrument; the player stamps admit, deny or detain, and the day's ledger settles against ground truth.",
            "Core loop. Inspect the document; watch the detection readout; decide; face forgeries - text dressed as another language, mixed scripts, and overstuffed passports whose contextTruncated flag reveals truncation under load. Day cycles shorten documents and mix scripts to raise difficulty.",
            "Limits and risk. The design makes language detection itself the gameplay signal, exercises auto and und modes, and uses the per-call language override (with 'default' rejected at creation time, exactly as the wrapper enforces). The primary risk is misreading: detection confidence is a subtle signal. Mitigation is a tutorial day with revealed ground truth and a casebook that teaches typical confidence bands per language pair.",
        ],
        [
            ["Kernel surface", "meta.detected and detectedConfidence as instruments; unicode mode; auto and und; per-call language override"],
            ["Limits pushed", "Detection as gameplay; mixed-script adversarial input; truncation flags as evidence"],
            ["Session shape", "8-minute days; career ladder with stamps"],
            ["Primary risk and mitigation", "Confidence misreading - tutorial day with ground truth, casebook of confidence bands"],
        ]
    ));

    el.push(...proposal("P16", "Dungeon of Dossiers: Lexical Roguelite",
        [
            "Concept. A roguelite where rooms are text corpora and weapons are instruction phrasings. Monsters are option sets guarded by adversarial evidence - this troll's testimony supports it - and combat means crafting an instruction and choosing options; damage is the confidence margin. Traps are malformed requests: a status-1 envelope deals trap damage. Boss rooms are five-lock doors, one lock per primitive: choice, score, noul, rank, compare.",
            "Core loop. Descend through seeded rooms (JavaScript PRNG; runs with the same seed replay identically); fight; loot instruction cards and evidence shards; manage the dossier bag, because a bloated context burns the work budget - and death is workExceeded mid-boss.",
            "Limits and risk. This is the only proposal that exercises every primitive, caps as loot quality, meta as a health-like resource, and error envelopes as damage in one loop. The primary risk is combat feel: phrasing under pressure is hard for new players. Mitigation is weapon cards with pre-tested instruction templates, so the roguelite's randomness lives in room composition while the skill lives in template selection and adaptation.",
        ],
        [
            ["Kernel surface", "All six primitives; caps as loot quality; meta as resource; status-1 envelopes as trap damage"],
            ["Limits pushed", "Full primitive coverage; procedural content under determinism; budget-as-health"],
            ["Session shape", "20 to 30 minute seeded runs"],
            ["Primary risk and mitigation", "Phrasing under pressure - pre-tested weapon templates plus the dialect lab"],
        ]
    ));

    /* ---------------- 5.5 Negotiation ---------------- */
    el.push(h2("5.5 Negotiation and Collective Judgment (P05, P18)"));
    el.push(body("This family proves that one kernel call can stand in for a crowd. Both titles aggregate many judgments into collective outcomes - a senate of factions, a jury of twelve - and both depend on the pool and the cache from the runtime layer to make aggregation cheap."));

    el.push(...proposal("P05", "The Council of Nine: Coalition Senate",
        [
            "Concept. Political negotiation with nine factions, each communicating in its own language style - English, Chinese, Arabic, Spanish, French and more. Each turn the player crafts a proposal text; the rank primitive orders all nine factions' preferences at once; the envelope's distribution apportions seats as voting weights; laws pass above seat thresholds.",
            "Core loop. Draft a proposal; receive the faction ordering and seat apportionment; bargain in follow-up turns with factions that remember prior treatment (JavaScript-side relationship state); build coalitions across the language divide before the session ends.",
            "Limits and risk. The design stresses rank with nine options, unicode mode across factions, and detectedConfidence rendered as the foreign minister's certainty when a faction reads a foreign-language proposal. The primary risk is F8, cross-language imbalance in how factions score the same proposal. Mitigation is per-faction calibrated thresholds and a practice chamber that reveals each faction's scoring tendencies before ranked play.",
        ],
        [
            ["Kernel surface", "rank over nine options; distribution as seat apportionment; unicode mode; detectedConfidence as a character beat"],
            ["Limits pushed", "Wide-rank ordering; multilingual negotiation; calibration per language faction"],
            ["Session shape", "15-minute senate sessions; campaign arc"],
            ["Primary risk and mitigation", "Cross-language imbalance (F8) - per-faction thresholds and a practice chamber"],
        ]
    ));

    el.push(...proposal("P18", "Twelve Envelopes: Jury Duty Simulator",
        [
            "Concept. A courtroom seen from counsel's bench, where the jury is twelve kernel calls. Each juror is a persona implemented as a differently-instructed choice call over the same trial context - the skeptical retiree, the literalist accountant, the empath - so the verdict is the aggregation of twelve distinct envelopes rather than one.",
            "Core loop. Examine evidence through extract; draft per-juror instructions; the deliberation view shows twelve miniature distribution bars updating as exhibits are admitted; a verdict requires at least nine jurors whose result agrees above their persona threshold; a juror whose call errors forces a mistrial motion.",
            "Limits and risk. The design is the parallel fan-out showcase: twelve calls per action, pooled and cached (identical exhibit-plus-instruction pairs replay instantly), with measured sub-millisecond latency at trial-context sizes. The primary risk is instruction engineering feeling abstract. Mitigation is that instructions are written as persuasive addresses in each juror's register, so the skill reads as advocacy, not configuration.",
        ],
        [
            ["Kernel surface", "choice fan-out times twelve with distinct instructions; extract for evidence; caching; meta.detectedConfidence as juror doubt"],
            ["Limits pushed", "Parallel fan-out; cache economics; instruction engineering as the core skill"],
            ["Session shape", "18-minute trials; weekly court calendar"],
            ["Primary risk and mitigation", "Abstract instruction UX - instructions as persuasive addresses in juror registers"],
        ]
    ));

    /* ---------------- 5.6 Craft and flagship ---------------- */
    el.push(h2("5.6 Craft, Daily Play and the Flagship (P08, P10, P20)"));
    el.push(body("This family carries the two hardest design bets and the summit. P08 and P10 turn determinism itself into the product - a shareable daily ritual and a mastery craft game - while P20 is the campaign that exercises everything at once and closes the limits matrix."));

    el.push(...proposal("P08", "Seedbreak: The Daily Deterministic Puzzle",
        [
            "Concept. A Wordle-style daily ritual built on determinism as content. A date-derived seed generates, through JavaScript-side PRNG, a scenario: one instruction, five options, and an evidence corpus with a planted true answer. Players do not try to predict the kernel; they try to drive it - each attempt is a rewritten instruction (up to three), and the winner is the attempt that pulls the envelope's planted-option confidence closest to a target band using the fewest characters.",
            "Core loop. Read the scenario; edit the instruction; see the kernel's pick and the planted option's confidence; score margin-to-band plus brevity; share the result grid and the replay file - a requests.jsonl that anyone can re-run to confirm byte-identical behavior. Error envelopes count as strikes.",
            "Limits and risk. The design makes determinism the share mechanic and minimal-input scoring the skill; caching makes live previews free. The primary risk is F2, spoilers: the same seed yields the same puzzle worldwide. Mitigation is timezone-rotated seeds and per-language variants, so communities solve in parallel rather than in series, and the replay format keeps every shared solution verifiable.",
        ],
        [
            ["Kernel surface", "choice; envelope.confidence as scoring; replay files as shares; status-1 envelopes as strikes"],
            ["Limits pushed", "Determinism-as-content; minimal input craft; replay verification"],
            ["Session shape", "One puzzle per player per day; 4 minutes"],
            ["Primary risk and mitigation", "Spoilers (F2) - timezone seeds, language variants, verifiable replays"],
        ]
    ));

    el.push(...proposal("P10", "Par Golf: Byte-Golf for the Kernel",
        [
            "Concept. Code golf transposed onto the kernel. Each hole fixes a corpus, an option set and a target verdict - make 'restart the service' win with confidence above 0.60 using at most 80 instruction characters, or produce an extract whose top snippet lands within a character budget. Fewest bytes and cleanest envelope wins; pars per hole; seasons pin the kernel version so holes stay solvable.",
            "Core loop. Edit the instruction; watch the live envelope preview (instant through the cache); submit; score as bytes plus confidence margin against par; collect replays as proof; climb a global board whose entries are verified by byte-identical replay rather than by trust.",
            "Limits and risk. The design stresses minimal-input craft at its purest: caps.maxSnippetChars as hole constraints, error paths as hazards, and replay-verified leaderboards across all six primitives. The primary risk is authoring: hole solvability depends on kernel internals that only measurement can confirm. Mitigation is season-pinned holes verified by replay at authoring time, with the season's parity suite re-run in CI.",
        ],
        [
            ["Kernel surface", "All six primitives across holes; caps.maxSnippetChars as constraints; error envelopes as hazards; replay-verified scores"],
            ["Limits pushed", "Minimal-input mastery; caps; error-path literacy; season-pinned solvability"],
            ["Session shape", "3-minute holes; season ladders"],
            ["Primary risk and mitigation", "Hole solvability drift - season-pinned holes, replay verification in CI"],
        ]
    ));

    el.push(...proposal("P20", "The Determinism Engine: Grand Campaign",
        [
            "Concept. The flagship that chains all six primitives as branches of one government. Act I, the Council: rank forges coalitions. Act II, the Court: noul settles legitimacy. Act III, the Expedition: extract maps the frontier. Act IV, the Treasury: score sets the budgets. Act V, the Election: choice picks the executive. Act VI, the War: compare decides the border. The constitution is one persistent context that grows every act, and amendments - compaction edits the player authors - are what keep the work budget alive to the endgame.",
            "Core loop. Acts alternate verbs; each act's envelope feeds the persistent constitution; crises inject adversarial text between acts; the final act's verdict is sealed as the national archive - the campaign's complete request log, which replays byte-identically on any machine, is itself the endgame achievement and the share format.",
            "Limits and risk. This is the limits manifesto: every primitive, both text modes, multiple languages across acts, caps, budgets, error paths and a three-hour byte-identical replay. The primary risk is scope - the largest build in the dossier by a wide margin. Mitigation is architecture: acts ship as episodic modules on the shared runtime, each independently playable, with the campaign as their composition rather than a monolith.",
        ],
        [
            ["Kernel surface", "All six primitives as acts; persistent growing context with player-authored compaction; caps, meta, error paths, both modes, multiple languages"],
            ["Limits pushed", "Everything simultaneously; the three-hour replay as the proof of determinism"],
            ["Session shape", "Episodic acts of 25 to 35 minutes; six-act campaign"],
            ["Primary risk and mitigation", "Scope (F10) - episodic modules on the shared runtime; campaign as composition"],
        ]
    ));

    return el;
}

module.exports = { build };
