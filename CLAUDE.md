# CrossCheckAI — Project Brief

> **Read this first, then start at Phase 0.** This file is the complete, self-contained
> spec for building CrossCheckAI. Every product decision below is already made — do not
> re-open them. Two things are deliberately left open (§11); ask the user, do not invent.
>
> **Do not scaffold the full monorepo yet.** Phase 0 is a single throwaway spike script.
> You validate the core idea against real questions *before* you build any packaging,
> workspaces, or public API. Resist the urge to `npm init -w` your way to a pretty tree
> on day one.

---

## 1. What CrossCheckAI is

CrossCheckAI asks the **same question to multiple frontier LLMs at once**, then shows you
where they **agree, where they disagree, and — most importantly — *why the disagreement
matters***. It is a second opinion for anything you'd otherwise take a single model's word
on: "I wasn't sure, so I asked five models and here's where they split."

The product is shipped as an npm package, `@sebuzdugan/crosscheck`, plus a thin CLI/demo.
The brain is a single core library; everything else is a shell around it.

### The core insight

A single model's confident answer hides its uncertainty. Three models agreeing is weak
evidence of correctness, but **three models disagreeing is strong, legible evidence that
you should not trust any single answer yet**. CrossCheckAI's job is not to pick a winner —
it is to make the shape of the disagreement visible and actionable.

---

## 2. Product principles (non-negotiable)

These override convenience, cleverness, and "it would be cool if." If a feature violates one
of these, it does not ship.

1. **Never claim correctness.** CrossCheckAI does not tell the user which answer is "right."
   It reports agreement and disagreement. The word "correct" / "verified" / "true" must not
   appear in any consensus output as a property the system asserts. We surface positions; the
   user judges.

2. **Dissent is the feature, not noise.** The single most valuable output is a well-explained
   minority position. Never collapse, hide, or average away a dissenting answer. A run where
   one model disagrees and we explain *why* is more valuable than five models agreeing.

3. **Stream everything.** The user sees models start, tokens arrive, clusters form, and the
   verdict assemble — live. Nothing blocks on "wait for all five then show a wall of text."
   Perceived latency is a product feature; the streaming event contract (§6) is load-bearing.

4. **Honest about uncertainty.** If models split with no majority, say "no consensus" plainly.
   If a model fails or times out, show it as failed — never silently drop it and pretend the
   panel was smaller.

5. **One key, zero friction.** A user brings exactly one OpenRouter API key and gets access to
   every model. No per-provider key juggling. (See §3.)

---

## 3. Locked decisions

Do not relitigate these. They are the result of the design conversation that produced this brief.

| Decision | Choice | Why |
|---|---|---|
| **Product name** | CrossCheckAI | — |
| **npm package** | `@sebuzdugan/crosscheck` (scoped) | Owns the namespace; room for `@sebuzdugan/crosscheck-cli` etc. |
| **Model access** | **OpenRouter, single key** | One key → all frontier models. No multi-provider auth. `OPENROUTER_API_KEY`. |
| **First mode** | **Consensus mode** | Ship one mode well. Other modes (debate, escalation) come later, not now. |
| **Repo shape** | **Monorepo, core-as-brain** | `packages/core` holds all logic; CLI/web/demo are thin consumers. |
| **Language** | TypeScript, ESM | Modern, typed event contract is central to the product. |
| **Public entry point** | `runCrossCheck()` async iterable (§6) | Streaming-first. The CLI and any UI consume the same generator. |

---

## 4. Architecture

```
crosscheck/                     # repo root
├── CLAUDE.md                   # this file
├── package.json                # workspace root (pnpm/npm workspaces) — NOT created until Phase 2
├── packages/
│   ├── core/                   # @sebuzdugan/crosscheck — the brain. All logic lives here.
│   │   ├── src/
│   │   │   ├── index.ts        # exports runCrossCheck + public types
│   │   │   ├── runCrossCheck.ts# the streaming orchestrator (§6)
│   │   │   ├── openrouter.ts   # thin OpenRouter client (panelist calls + judge calls)
│   │   │   ├── cluster.ts      # judge-based semantic clustering (§7) — the hard part
│   │   │   ├── consensus.ts    # turn clusters → agreement level + dissent events
│   │   │   └── types.ts        # CrossCheckInput, CrossCheckEvent, Cluster, Report
│   │   └── package.json
│   └── cli/                    # @sebuzdugan/crosscheck-cli — thin. Renders the event stream.
│       └── src/index.ts
└── spike/                      # Phase 0 ONLY. Throwaway. Deleted or ignored before Phase 2.
    └── spike.ts
```

**Core-as-brain rule:** if you find yourself putting clustering, consensus, or OpenRouter logic
anywhere other than `packages/core`, stop. The CLI must contain *only* presentation: read events
off the async iterable, print them. A future web UI must be able to consume the identical stream
with zero logic duplication.

---

## 5. Data flow (consensus mode)

```
question
   │
   ├──▶ fan out to N panelist models (OpenRouter), all in parallel, all streaming
   │        each emits: model_started → model_token* → model_completed | model_failed
   │
   ├──▶ collect the N final answers
   │
   ├──▶ JUDGE: cluster answers by *meaning* into positions  (clustering_started → cluster*)
   │        this is the hard problem — see §7
   │
   ├──▶ derive agreement level + write the dissent explanations  (consensus, dissent*)
   │
   └──▶ assemble final report  (run_completed)
```

---

## 6. The data contract (this is the spec — build to it)

The entire product is one streaming function. The CLI, a web UI, tests, and the demo all consume
the *same* async iterable. Get this contract right and everything else is plumbing.

```ts
// packages/core/src/types.ts

export interface CrossCheckInput {
  question: string;
  /** OpenRouter model ids. Defaults: SEE §11 — confirm current strings with the user, do not invent. */
  models?: string[];
  /** Only 'consensus' exists in v1. The field exists so the contract is forward-compatible. */
  mode?: 'consensus';
  /** Model used for semantic clustering + dissent synthesis (§7). Default: SEE §11. */
  judgeModel?: string;
  /** OpenRouter key. Falls back to process.env.OPENROUTER_API_KEY. */
  apiKey?: string;
  /** Standard cancellation. Aborts in-flight panelist + judge calls. */
  signal?: AbortSignal;
}

export interface TokenUsage { promptTokens: number; completionTokens: number; }

export interface ModelAnswer {
  model: string;
  answer: string;
  latencyMs: number;
  usage?: TokenUsage;
}

export interface Cluster {
  clusterId: string;
  /** Short human label for the position, written by the judge. e.g. "Yes, with caveats". */
  label: string;
  /** One-sentence statement of the stance this cluster represents. */
  stance: string;
  /** Which panelist models landed in this cluster. */
  memberModels: string[];
}

export type Agreement = 'unanimous' | 'majority' | 'split' | 'no_consensus';

export interface CrossCheckReport {
  runId: string;
  question: string;
  models: string[];
  answers: ModelAnswer[];
  failures: { model: string; error: string }[];
  clusters: Cluster[];
  agreement: Agreement;
  /** Plain-language summary of where the panel landed. Never asserts correctness (§2.1). */
  summary: string;
  /** The headline of the product — the explained dissent. Empty only on true unanimity. */
  dissent: DissentNote[];
}

export interface DissentNote {
  clusterId: string;
  models: string[];
  /** What the minority said. */
  summary: string;
  /** WHY this disagreement matters to the user — the most valuable sentence we produce. */
  whyItMatters: string;
}

export type CrossCheckEvent =
  | { type: 'run_started'; runId: string; question: string; models: string[]; mode: 'consensus' }
  | { type: 'model_started'; model: string }
  | { type: 'model_token'; model: string; token: string }
  | { type: 'model_completed'; model: string; answer: string; latencyMs: number; usage?: TokenUsage }
  | { type: 'model_failed'; model: string; error: string }
  | { type: 'clustering_started' }
  | { type: 'cluster'; cluster: Cluster }
  | { type: 'consensus'; agreement: Agreement; summary: string }
  | { type: 'dissent'; note: DissentNote }
  | { type: 'run_completed'; report: CrossCheckReport }
  | { type: 'error'; scope: 'run' | 'model' | 'judge'; message: string };

/**
 * The one public entry point. Streaming-first.
 * Consumers: `for await (const ev of runCrossCheck(input)) { ... }`
 */
export function runCrossCheck(input: CrossCheckInput): AsyncIterable<CrossCheckEvent>;
```

**Contract rules:**
- Panelist token streams (`model_token`) interleave freely across models — consumers key by `model`.
- `clustering_started` is emitted only after all panelists have `model_completed` or `model_failed`.
- A run with zero successful panelists ends in `error` (scope `'run'`), not a fake empty report.
- `run_completed.report` is the single source of truth; every earlier event is a live preview of it.
- The function never throws for *model-level* problems — those are `model_failed` events. It throws
  (or emits `error`) only for run-level problems: no API key, all panelists down, judge unreachable.

---

## 7. The one hard problem — and its solution

**Problem:** After N models answer, you must group their answers into *positions*. "Yes." / "Yeah,
I think so." / "Affirmative, though it depends on X." are the *same* position. "No." is a different
one. Getting this wrong destroys the product: split clusters that are really agreement, or merged
clusters that hide a real dissent.

**What does NOT work — do not use these:**
- ❌ **String/lexical matching** (exact, fuzzy, edit distance). Same meaning, totally different words.
- ❌ **Embedding similarity + a threshold.** Embeddings cluster by *topic*, not *stance*. "Yes you
  should invest" and "No you should not invest" are embedding-near (same topic) but are opposite
  positions. A cosine threshold cannot separate agreement from disagreement on the same subject.

**What works — the locked approach:**
- ✅ **Judge-based semantic clustering.** A judge model receives the question and all N answers and
  is asked to group them into distinct *positions/stances*, label each, and assign each panelist to
  exactly one cluster. The judge reasons about stance, not surface text or topic proximity.

`cluster.ts` calls the judge model with a structured prompt: *"Here is a question and N independent
answers. Group the answers by the position they take. Two answers share a cluster iff a careful
reader would say they reach the same conclusion, even if worded differently. Return clusters with a
short label, a one-sentence stance, and the member indices."* Force structured/JSON output and
validate it (every panelist assigned exactly once; cluster ids unique).

Then `consensus.ts` is pure logic over the clusters:
- 1 cluster → `unanimous`
- one cluster holds > half the panelists → `majority` (the rest are dissent)
- two clusters of equal/near-equal size → `split`
- many small clusters, no majority → `no_consensus`

The **dissent explanation** (`whyItMatters`) is a second judge call — given the majority stance and
a minority stance, explain to the user what hinges on the difference. This sentence is the product.

---

## 8. Build phases

Each phase has a hard acceptance gate. Do not advance until the gate is green.

### Phase 0 — Spike (no packaging, prove the idea)
A single `spike/spike.ts` you run with `tsx`. Hardcode an OpenRouter key from env, hardcode 3–4
model strings, hardcode one judge model. Send a question to all panelists, collect answers, do one
judge clustering call, print clusters + agreement level to the console.

**Gate:** Run it against **at least 5 of the user's own real "I wasn't sure" questions** (ask the
user for these — they are the whole point). The clustering must be *obviously sane* to the user on
those questions: genuine agreements land in one cluster, genuine disagreements split. If clustering
is wrong, iterate on the judge prompt here — cheaply, before any packaging exists. **Do not proceed
to Phase 1 until the user agrees the spike's clustering is trustworthy.**

### Phase 1 — Core library, streaming (the real `runCrossCheck`)
Build `packages/core` to the §6 contract. Async generator, parallel streaming panelists, the
`clustering_started`/`cluster`/`consensus`/`dissent`/`run_completed` event sequence. Port the
validated judge prompt from the spike. Real `AbortSignal`, real `model_failed` handling.

**Gate:** `for await` consuming `runCrossCheck()` produces the full, correctly-ordered event stream
for a live question, including at least one run that yields a `dissent` note. One panelist
artificially failed still produces a valid report from the rest.

### Phase 2 — Monorepo + CLI
Set up workspaces (root `package.json`, `packages/core`, `packages/cli`). The CLI is *thin*: it only
renders the event stream (live token output per model, then clusters, then the verdict and the
explained dissent). Delete or `.gitignore` the `spike/` folder.

**Gate:** `crosscheck "<question>"` from a clean checkout streams a readable, live, color-coded run
and ends with a clear verdict + dissent. CLI contains zero clustering/OpenRouter logic (§4 rule).

### Phase 3 — Hardening
Retries/timeouts on OpenRouter calls; judge-output validation with a repair retry; graceful
"no consensus" rendering; cost/usage surfaced from `usage`; sensible default model panel (§11);
README with the one-key setup and a real example transcript.

**Gate:** Survives a flaky network and a malformed judge response without crashing; "no consensus"
renders cleanly; a new user can go from `npm i -g @sebuzdugan/crosscheck` + one key to a good run
using only the README.

### Phase 4 — Publish
Publish `@sebuzdugan/crosscheck` (and the CLI). Verify the npm name and that nothing about correctness
is over-claimed in the published copy (§2.1).

**Gate:** `npx @sebuzdugan/crosscheck "<question>"` works for a stranger with only an OpenRouter key.

---

## 9. Testing notes
- The event-ordering contract (§6) is the thing most worth testing. Drive `runCrossCheck` with a
  mocked OpenRouter client and assert the event sequence, including the failure and no-consensus paths.
- `consensus.ts` is pure logic over clusters — unit-test the agreement-level decision table directly.
- Don't try to unit-test the judge's semantic quality with assertions; that's what the Phase 0 human
  gate is for. Do validate the judge's *structural* output (assignment completeness, id uniqueness).

## 10. Definition of done (whole project)
A stranger installs the package, brings one OpenRouter key, asks a question they're unsure about,
watches multiple models answer live, and ends with: a clear statement of where the panel agreed,
where it split, and a plain-language explanation of *why the disagreement matters* — with the system
never once claiming to know the right answer.

---

## 11. Open questions — ASK THE USER, DO NOT INVENT

These were deliberately not guessed in this brief because guessing them produces silent rot.

1. **Current OpenRouter model strings.** The exact ids for the default panelist set and the judge
   model change often. Confirm the live, currently-valid OpenRouter model strings with the user (or
   pull them from the OpenRouter models endpoint) before hardcoding any default. Do not paste
   plausible-looking ids from memory.

2. **npm name + any domain.** Confirm `@sebuzdugan/crosscheck` (and `-cli`) is available/owned on
   npm before Phase 4, and whether a domain is wanted. Check; don't assume.

If you hit a third genuinely-unresolved decision mid-build, add it here and ask — don't paper over it.

---

## 12. Handoff
Start at **Phase 0**. Build the spike, get the user's real "I wasn't sure" questions, and earn the
user's trust in the clustering before writing a single line of packaging. The temptation will be to
scaffold the monorepo first because it feels like progress — it isn't. The spike is the progress.
