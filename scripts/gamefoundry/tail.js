/* Chapters 6-8: Kernel Limits Coverage Matrix, Delivery Roadmap, Conclusion. */
const H = require("./helpers");
const { h1, h2, body, dataTable, tableCaption } = H;

function build() {
    const el = [];

    /* ================= 6. Coverage Matrix ================= */
    el.push(h1("6. Kernel Limits Coverage Matrix"));
    el.push(body("The request's core demand - push the kernel to its absolute limits - is answered by the portfolio, not by any single proposal. Table 7 makes that verifiable: for each proposal it lists the primitives exercised and the specific kernel surfaces stressed. Reading the columns vertically confirms full coverage: all six primitives appear as primary verbs (choice in P08, P15 and P18; score in P03 and P11; noul in P02, P12, P14 and P19; rank in P05; compare in P01, P09 and P17; extract in P04), every meta accounting field becomes a mechanic somewhere, both text modes are load-bearing (P06, P17, P19), all ten languages are addressed by the multilingual group, error envelopes are moves in P02, P08, P10 and P16, and byte-identical replay is an economy, an anti-cheat or a share format in P07, P08, P09, P10, P17 and P20."));
    el.push(tableCaption("Table 7: Proposal-to-limits coverage matrix"));
    el.push(dataTable(
        ["No.", "Proposal", "Primitives exercised", "Kernel limits stressed"],
        [8, 24, 26, 42],
        [
            ["P01", "Claim and Compare", "compare", "Adversarial input; 2-option contract; verdict UX; cache"],
            ["P02", "The Null Court", "noul, extract", "Error envelopes as moves; thresholds as difficulty; multilingual packs"],
            ["P03", "Rubric and Ledger", "score", "Rubric breadth; caps.maxRanked as information pricing"],
            ["P04", "Depth 20K", "extract", "Largest contexts (20-100 KB); work budget; chunksDropped fog"],
            ["P05", "The Council of Nine", "rank", "Wide-rank ordering; unicode mode; cross-language calibration"],
            ["P06", "Babel Border", "choice (+ detection)", "Language detection confidence; auto/und; mixed-script input"],
            ["P07", "The Confidence Exchange", "extract, choice", "Distribution as economy; replay-verified settlement"],
            ["P08", "Seedbreak", "choice", "Determinism as content; minimal input; strike-path errors"],
            ["P09", "Fog of Warlord", "compare, extract, noul, choice", "Sustained throughput; queue engineering; orchestration"],
            ["P10", "Par Golf", "all six", "Caps as constraints; error paths as hazards; replay-verified boards"],
            ["P11", "The Minifier's Apprentice", "score, choice", "meta.workUsed/workBudget/workExceeded as tension"],
            ["P12", "Trust Chain", "noul, extract", "noul under adversarial UGC; accumulating contexts; pooling"],
            ["P13", "Semantic Gravity", "compare, choice, rank", "Cache engineering; sampling discipline; continuous-over-discrete UX"],
            ["P14", "Room Four", "compare, noul, extract, score, choice", "Four-primitive chaining; case-linted authoring"],
            ["P15", "The Deadline Desk", "choice", "Highest call frequency; confidence as money; budget as deadline"],
            ["P16", "Dungeon of Dossiers", "all six", "Full coverage in one loop; caps as loot; budget-as-health; traps"],
            ["P17", "Scripted Fists", "compare, rank", "Unicode depth; ten languages; determinism as ranked integrity"],
            ["P18", "Twelve Envelopes", "choice (fan-out x12)", "Parallel fan-out; cache economics; instruction engineering"],
            ["P19", "The Paraphrase Gambit", "noul, compare", "Scoring-channel interplay; unicode puzzles; kernel internals teaching"],
            ["P20", "The Determinism Engine", "all six", "Everything simultaneously; three-hour byte-identical campaign replay"],
        ],
        { centerCols: new Set([0]) }
    ));

    /* ================= 7. Roadmap ================= */
    el.push(h1("7. Delivery Roadmap and Verification Practice"));
    el.push(body("The roadmap sequences the portfolio so that every milestone produces a playable artifact and a verified claim. It reuses the repository's own discipline: content is validated by replaying decision logs against the pinned kernel, exactly as the release verifies its parity corpus, and no milestone advances while a mandatory check fails. Milestones M1 through M5 correspond to the runtime steps of Section 4.1, with the flagship P20 deliberately last so that it composes tested parts rather than betting on unproven ones."));
    el.push(tableCaption("Table 8: Milestones, scope and exit gates"));
    el.push(dataTable(
        ["Milestone", "Scope", "Playable outcome", "Exit gate"],
        [12, 34, 26, 28],
        [
            ["M0", "Runtime layer: static shell, kernel pool, decision queue with hash cache, replay recorder, feedback UI components", "Test bench that renders any envelope", "engineCount() returns to zero on teardown; cache correctness test passes"],
            ["M1", "P01 duel plus P02 court vertical slice; three threshold profiles", "Two playable games", "U1 predictability rating and U2 profile choice resolved with 10+ playtesters"],
            ["M2", "Daily infrastructure: seeded generation, timezone rotation, share grids, replay checker in CI", "P08 live as a daily ritual", "Two-week return rate measured; replay byte-compare green on every build"],
            ["M3", "Meta-accounting mechanics and the field mode: P04, P11, P13", "Expedition, heist and sandbox modes", "No main-thread jank at 20 KB contexts in profiling; budget meters readable"],
            ["M4", "Collective and language modes: P05, P06, P18; language ladder for P17", "Multi-agent and multilingual play", "U5 cross-language spread charted; per-language thresholds calibrated"],
            ["M5", "Craft, chain and flagship: P10, P12, P14, P19, P20 (episodic acts)", "Season ladders plus the six-act campaign", "Three-hour campaign replay byte-identical on two independent hosts"],
        ]
    ));
    el.push(body([
        { t: "Verification practice. ", b: true },
        { t: "Three standing rules carry the repository's honesty into the game. First, every authored scenario pack ships with its own decision log, and the CI replay checker byte-compares that log on the pinned kernel before publication - the pack linter of P14 and the hole verification of P10 are special cases of this one rule. Second, performance claims in-game (the decisions-per-second HUD of P09, the oxygen meter of P04) are measured against the same benchmark methodology the release uses, not against optimistic estimates. Third, the kernel version is pinned per season: an upgrade re-runs every pack's log under the new version, and any envelope that changes is surfaced to players as a season boundary rather than silently rewriting history." },
    ]));

    /* ================= 8. Conclusion ================= */
    el.push(h1("8. Conclusion and Recommended Next Steps"));
    el.push(body([
        { t: "The protocol's answer is now complete. The core problem was framed as an adjudication loop over a deterministic lexical kernel; its assumptions and constraints were made explicit, including the measured performance envelope (about 13,750 decisions per second at small contexts, 552 at 20 KB) and the verified guarantee of byte-identical envelopes across hosts. Three architectural paths were generated and critically traded off; the Kernel-as-Referee platform was selected, with the physics and world paths absorbed as modes. The twenty proposals then distribute the limits-pushing across the portfolio, and Table 7 verifies that coverage: all six primitives as primary verbs, all meta fields as mechanics, both text modes load-bearing, error envelopes as moves, and replay verification wherever competition or sharing needs trust." },
    ]));
    el.push(body([
        { t: "Recommended next steps, in order. ", b: true },
        { t: "First, build M0 - the runtime layer is four small, testable modules (pool, queue with cache, replay recorder, feedback components) and every later decision depends on it. Second, run the two cheap probes that gate everything: the U1 predictability lab and the U2 threshold-profile prototype, both buildable in days on top of M0 with the P01 slice. Third, ship P01 and P02 as the vertical slice and take them to ten players before committing to any further family. The two bets that deserve early skepticism are A1 (can players learn the scoring surface) and F2 (whether seeded rotation outpaces spoilers); if either fails, the portfolio still holds, but P08, P10 and P17 would need redesign around content rotation, and that is a conversation best had in week two rather than month six." },
    ]));

    return el;
}

module.exports = { build };
