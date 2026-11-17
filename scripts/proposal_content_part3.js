// Content Part 3: Part III (coverage matrix, build order, shared substrate) + Appendix

const part3 = [
  { h1: "Part III — Coverage, Sequencing and Shared Substrate" },

  { h2: "Primitive Coverage Across the Catalog" },
  { p: "Coverage was a design input, not an afterthought. The matrix below records, for each of the six primitives, which proposals use it as their primary mechanic and which exercise it as a supporting surface. Every primitive is primary in at least two proposals, no proposal passes the kernel-null test (replace the kernel with a random generator and the game collapses), and the supporting column demonstrates composition — pipelines, juries and oracles — rather than isolated use." },
  { table: {
    caption: "Table 4: Primitive coverage matrix",
    header: ["Primitive", "Primary in", "Supporting in", "What the coverage proves"],
    widths: [14, 30, 28, 28],
    rows: [
      ["choice", "01 The Judge's Mind; 02 Confidence Market; 08 Envelope Golf; 09 Babel Ladder; 11 Und Observatory; 16 The Jury", "07 Trigram Tactician; 18 The Explainer", "Distribution numerics and confidence as economy, reveal and fingerprint"],
      ["score", "05 Score Surgeon; 10 Glyph Forge", "02 Confidence Market (hedge contracts); 08 Envelope Golf; 19 The Librarian", "Rubric semantics and sensitivity of the 0.35/0.35/0.30 formula"],
      ["noul", "12 Noul Gates", "13 The Contract; 15 Forbidden Seeds", "The binary affirm/deny surface and error-boundary content"],
      ["rank", "03 Rank Riot; 17 Shadow Council", "09 Babel Ladder (rung five); 19 The Librarian", "Full-order reconstruction and oracle economics"],
      ["compare", "04 Bracket of Twins; 17 Shadow Council", "03 Rank Riot (explainers); 10 Glyph Forge (forge chains)", "Pairwise judgment at volume; parity as anti-tamper"],
      ["extract", "06 Extract Hunt; 19 The Librarian", "13 The Contract; 15 Forbidden Seeds", "Long-context attention prediction; pipeline composition"],
    ],
  } },
  { p: "Beyond the primitives, the limit dimensions each have at least one designated stress surface: determinism is load-bearing in 01, 02, 04, 17 and 18; explainability is the core loop of 01, 03, 05 and 18; the language matrix is the content of 09, 10, 11 and 16; unicode mode and code-point accounting are exercised end-to-end in 10 and the hard tier of 06; caps semantics are taught by 13 and used in 03; error envelopes are the material of 12, 13, 15 and 20; the lifecycle and the 64-handle ceiling are the boards of 14 and 20; and throughput under budget is the currency of 08 and 19. The failure register F1-F10 is materialized as gameplay in 06, 08, 12, 13, 14, 17 and 20 — the limits are not just respected by the design; they are the design." },

  { h2: "Recommended Build Order" },
  { p: "The build order sequences the catalog by dependency and by risk retirement, not by flashiness. Phase 0 builds the substrate every proposal shares; Phase 1 ships a minimum lovable product spanning three different primitives and one full daily loop, and its playtest gate is the single most important decision point in the project; later phases only scale what the gate validated." },
  { table: {
    caption: "Table 5: Five-phase build order",
    header: ["Phase", "Content", "Proposals", "Exit gate"],
    widths: [12, 34, 24, 30],
    rows: [
      ["0", "Substrate: serving, pool, seeds, descriptors, par tooling, proof strings, reveal UI", "—", "Descriptor par diff passes in CI; parity inherited from repository gates"],
      ["1", "Minimum lovable product: one daily loop, three primitives", "01, 03, 12", "Playtest gate: retention signal and comprehension of the reveal economy"],
      ["2", "Economic and forensic depth on the validated loop", "02, 04, 05, 06", "Weekly content pipeline runs on schedule for four consecutive weeks"],
      ["3", "Language matrix and formula literacy", "09, 10, 07, 08", "Multilingual authoring cost measured and within budget"],
      ["4", "Contract games and configuration play (Lab opens)", "13, 14, 15, 11, 16", "Lab unlock flow live; contract level bank CI-gated"],
      ["5", "Oracles, forensics, pipelines, finale", "17, 18, 19, 20", "Proof-string economy verified at scale; boss rush content re-measured against pinned kernel version"],
    ],
  } },
  { p: "Phase 1 deliberately spans choice (01), rank (03) and noul (12) so the playtest verdict covers three different judgment shapes rather than one polished case. Phase 2 deepens the formats that proved out before any new surface is touched. Phases 3 and 4 expand the kernel surface in the direction the playtest data supports — languages if players liked the reveal economy, contract play if they liked mastery. Phase 5 completes the Lab and the finale. At every phase, the repository's existing CI gates (functional suite, parity corpus, browser acceptance) continue to run unchanged; the game adds exactly one gate of its own, descriptor par diffing, in Phase 0." },

  { h2: "Shared Technical Substrate" },
  { p: "Three mechanisms carry every proposal, and they are worth specifying once, precisely. First, the descriptor: every puzzle in the catalog — daily cases, ladders, contract levels, vaults, boss scripts — is a JSON descriptor of the same schema, committed to the repository with its measured par block. The par block records the expected envelope fields and the FNV-1a-64 hash of the envelope string as returned by WASM. Authoring computes pars; CI diffs them; content cannot drift from kernel behavior." },
  { code: { lines: [
    "// Descriptor schema (one JSON object per puzzle, per level, per vault):",
    "{",
    "  \"id\": \"2026-11-15-judges-mind\",",
    "  \"date\": \"2026-11-15\",",
    "  \"primitive\": \"choice\",          // one of the six",
    "  \"mode\": \"ascii\",               // ascii | unicode",
    "  \"language\": \"und\",             // en..ur, auto, und",
    "  \"instruction\": \"...\",",
    "  \"options\": [\"...\"],            // or \"rubric\": [...] for score",
    "  \"context\": \"...\",",
    "  \"topK\": null,                   // extract only",
    "  \"caps\": null,                   // { maxRanked, maxSnippetChars, maxTotalChars }",
    "  \"par\": {",
    "    \"result\": \"restart the service\",",
    "    \"confidence\": 0.6312,",
    "    \"distribution\": [0.6312, 0.2035, 0.1653],",
    "    \"envelopeHash\": \"fnv1a64:...\"",
    "  }",
    "}",
  ] } },
  { p: "Second, the proof string. Every scored attempt serializes as seed | descriptor id | moves | envelope-hash. Because envelopes are byte-identical across hosts, anyone can verify any proof by re-running it; the hash is computed over the envelope string exactly as returned by the module — never over a re-serialized JavaScript object, which is where cross-engine key-order drift would enter. This one rule is what makes Proposals 04, 17 and 18 possible without a server." },
  { p: "Third, the pool. All kernel creation flows through one manager with acquire/release semantics and an engineCount() telemetry hook; hot loops never create kernels; free() runs on shutdown. The pool exists because of the registry's compile-time ceiling of sixty-four handles, and Proposal 14 turns that same manager into a game board. Errors follow one contract everywhere: OmniDecideError is caught, its status and envelope are read, and status codes map to named game states — Forbidden Input reveals — never to suppressed console lines." },
];

const appendix = [
  { h1: "Appendix — Verified Kernel Facts Cited in This Dossier" },
  { p: "All facts below were verified directly in the analysis sandbox on 15 November 2026 against the uploaded release (WASM integration 1.0.0, vendored kernel 2.0.0): the 78-check functional suite passed, the 40-case parity corpus passed byte-exactly against a locally rebuilt native binary, the 54-check native smoke suite passed, and the README quickstart reproduced byte-exactly. They are recorded here because every design decision in Parts I-III rests on them." },
  { table: {
    caption: "Table 6: Verified facts register",
    header: ["Fact", "Verified value", "Design consequence"],
    widths: [30, 36, 34],
    rows: [
      ["UMD export shape", "module.exports = { OmniDecide, OmniDecideError }; kernels via OmniDecide.create({ mode, language })", "Bootstrap pattern in Step 8; pool wrapper owns instances"],
      ["Six primitives, exactly", "choice, score, noul, rank, compare, extract; unknown names rejected wrapper-side", "Coverage matrix is closed under the real surface"],
      ["noul shape", "Result boolean with distribution { affirm, deny }; \"this statement is true\" denied at 0.982", "Noul Gates reveal economy (Proposal 12)"],
      ["noul empty statement", "Error envelope status 2: \"noul evaluation requires a non-empty statement\"", "Error-or-verdict rounds in Proposal 12"],
      ["Caps guarantee", "maxRanked, maxSnippetChars, maxTotalChars and topK shape output only; caps never alter a numeric decision", "Caps as presentation control (03) and contract teaching (13)"],
      ["Modes", "ascii (byte-limited, default) and unicode (code-point accounting, boundary-safe truncation)", "Unicode tier design in 06 and 10"],
      ["Languages", "en, zh, hi, es, ar, fr, bn, pt, id, ur, plus auto and und; fixed at kernel creation", "Pinned language per descriptor (F5); pool per rung (09)"],
      ["Registry ceiling", "64 concurrent kernel handles (compile-time cap); engineCount() reports live handles, returns 0 after free with no open-check", "Pool manager (Step 8); 64 Temples (14); failure F1/F8"],
      ["Byte-parity", "40/40 parity corpus identical between local native build and shipped WASM, including Chinese unicode cases", "Proof strings and server-less fairness (01, 04, 17, 18)"],
      ["Quickstart envelope", "result \"restart the service\", confidence 0.6312, distribution [0.6312, 0.2035, 0.1653]; zh case 0.8616", "Descriptor par example; tutorial case in 01"],
      ["Envelope determinism", "No wall-clock or environment values in envelopes; three consecutive runs byte-identical", "Seeded calendar owned by the game (Step 3)"],
      ["Scoring formula", "0.35·tf-cosine + 0.35·Jaccard + 0.30·trigram; experimental feature set 1 disabled in the release configuration", "Trigram Tactician content (07); version-pinned re-measurement policy"],
      ["Throughput", "Node snapshot ~5,618 evaluate calls/s (host benchmark, not an SLA)", "Interactive loops safe; brute-force search ruled out"],
      ["Serving requirement", "HTTP(S) with application/wasm MIME; file:// unsupported; CI blocks silent fallback", "Serve-first rule (Step 8 item 1); failure F4"],
      ["Known wrapper edges", "append_excerpt multibyte boundary (odk_wasm.c:69); caps.maxRanked int32 coercion via | 0", "Failure register F2/F3; design dodges in 06 and 13/20"],
    ],
  } },
  { p: "Where this dossier cites a number — the parity count, the confidence values, the handle ceiling — the citation is to the verification work summarized above rather than to documentation claims alone. Any future kernel upgrade changes this table first, and with it, the descriptor pars and boss content; the version-pinning policy in Step 9 and Proposal 20 exists for exactly that eventuality." },
];

module.exports = { part3, appendix };
