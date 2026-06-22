<div align="center">

# CrossCheckAI

### Don't trust one model. Cross-check it.

Ask multiple frontier LLMs the same question at once - then see where they agree,
where they split, and **why the disagreement matters**.

[**▶ Live demo**](https://sebuzdugan.github.io/CrossCheckAI/) · [`@sebuzdugan/crosscheck`](packages/core) · [CLI](packages/cli)

</div>

---

A single model's confident answer hides its uncertainty. Three models agreeing is weak
evidence of correctness - but **three models disagreeing is strong, legible evidence that
you shouldn't trust any single answer yet.** CrossCheckAI's job isn't to pick a winner. It
makes the *shape of the disagreement* visible and explains what hinges on it.

It's a second opinion for anything you'd otherwise take one model's word on.

## What it does

1. **Fans your question out** to a provider-diverse panel of frontier models (Anthropic,
   OpenAI, Google, xAI, DeepSeek) through a single OpenRouter key - streaming every token live.
2. **Clusters the answers by *stance*** using a judge model - so "yes, but…" and "absolutely"
   land in the same position, while genuine opposites are pulled apart.
3. **Reports a verdict** - `unanimous` · `majority` · `split` · `no consensus` - and, when the
   panel disagrees, **explains why the dissent matters and what you'd need to decide to resolve it.**

It never claims an answer is correct. It surfaces positions. You stay the judge.

## The interesting engineering problem

The whole product hinges on one hard question: *given N free-text answers, which ones take the
same position?*

- ❌ **String / fuzzy matching** fails - same stance, completely different words.
- ❌ **Embedding similarity** fails - embeddings cluster by **topic**, not **stance**. "You should
  invest" and "you should not invest" are embedding-neighbors (same topic) yet opposite positions.
  No cosine threshold separates agreement from disagreement on the same subject.
- ✅ **A judge model clustering by stance** works - it reasons about the bottom line, not the surface
  text. ([`packages/core/src/cluster.ts`](packages/core/src/cluster.ts))

This was validated against real "I wasn't sure" questions in a throwaway spike *before* any
packaging was written.

## Architecture

A monorepo with a single brain. Everything else is a thin shell around it.

```
packages/core   @sebuzdugan/crosscheck   - isomorphic (Node + browser), streaming runCrossCheck()
packages/cli    @sebuzdugan/crosscheck-cli - terminal renderer, zero logic of its own
apps/web        the live site             - React + Vite, bring-your-own-key, GitHub Pages
```

The entire product is **one streaming function**. The CLI, the web app, and tests all consume
the *same* async iterable of events:

```ts
import { runCrossCheck } from "@sebuzdugan/crosscheck";

for await (const event of runCrossCheck({ question: "Is zero a natural number?" })) {
  // run_started · model_started · model_token · model_completed/failed
  // clustering_started · cluster · consensus · dissent · run_completed
  console.log(event);
}
```

Because the core is isomorphic and OpenRouter allows browser CORS, the website is a **static
SPA with no backend**: your key lives only in your browser's `localStorage` and calls OpenRouter
directly. There's no server to leak it to.

## Quickstart

### Web (easiest)
Open the [live demo](https://sebuzdugan.github.io/CrossCheckAI/), paste an
[OpenRouter key](https://openrouter.ai/keys), and ask. Or watch the recorded run first - no key needed.

### CLI
```bash
export OPENROUTER_API_KEY=sk-or-...
npx @sebuzdugan/crosscheck-cli "Should a small team pick a monolith or microservices in 2026?"
```

### Library
```bash
npm install @sebuzdugan/crosscheck
```
```ts
import { runCrossCheck } from "@sebuzdugan/crosscheck";

for await (const ev of runCrossCheck({ question, apiKey, models /* optional */ })) {
  if (ev.type === "dissent") console.log(ev.note.whyItMatters);
}
```

## Develop

```bash
pnpm install
pnpm build                 # build core + cli
pnpm cli "your question"   # run the CLI from source (needs OPENROUTER_API_KEY)
pnpm web:dev               # run the web app locally
```

## Product principles

| | |
|---|---|
| **Never claims correctness** | Reports agreement/disagreement; the user judges. |
| **Dissent is the feature** | A well-explained minority position is the most valuable output - never averaged away. |
| **Stream everything** | Models start, tokens arrive, clusters form, the verdict assembles - live. |
| **Honest about uncertainty** | "No consensus" is said plainly; failed models are shown, not hidden. |
| **One key, zero friction** | One OpenRouter key reaches every model. |

---

<div align="center">
<sub>Built as a portfolio piece. MIT licensed.</sub>
</div>
