/**
 * A baked, realistic run so the deployed page is alive without a key. Replayed
 * through the SAME CrossCheckEvent contract the live runner uses — the UI can't
 * tell the difference. This is a recorded panel on a genuinely contested question.
 */
import type { CrossCheckEvent } from "@sebuzdugan/crosscheck";

const QUESTION =
  "In React for 2026, should I fetch data with useEffect, or is that an anti-pattern now?";

interface DemoAnswer {
  model: string;
  latencyMs: number;
  text: string;
}

const ANSWERS: DemoAnswer[] = [
  {
    model: "anthropic/claude-opus-4.8",
    latencyMs: 9120,
    text: "Avoid raw useEffect for data fetching in 2026. It's not banned, but it's the wrong default: you hand-roll loading/error state, you get request waterfalls, and you have to guard against race conditions on fast re-renders. Reach for your framework's data layer first — Server Components / route loaders if you have them, or a library like TanStack Query for client-driven data. Keep useEffect for synchronizing with non-React systems (subscriptions, the DOM, timers), which is what it's actually for.",
  },
  {
    model: "openai/gpt-5.5",
    latencyMs: 7400,
    text: "Treat useEffect-based fetching as a last resort. The modern answer is to move data fetching to the server (React Server Components, framework loaders) or to a caching client library (React Query, SWR) that handles dedup, retries, and stale-while-revalidate for you. Manual useEffect fetching tends to reintroduce bugs those tools already solved — particularly the cleanup/abort dance and double-fetch in Strict Mode.",
  },
  {
    model: "google/gemini-3.1-pro-preview",
    latencyMs: 11200,
    text: "Prefer your framework's data-loading mechanism. If you're on a modern stack, fetch in Server Components or route loaders so data resolves before render and you avoid client waterfalls. For purely client-side state, use TanStack Query. useEffect fetching should be reserved for cases where none of that applies. So: not 'never', but it shouldn't be your first reach.",
  },
  {
    model: "x-ai/grok-4.3",
    latencyMs: 5300,
    text: "Honestly? For a small component it's completely fine. The 'useEffect is an anti-pattern' framing is overstated. If you're fetching one thing in one place and you handle cleanup with an AbortController, useEffect works and ships. Don't pull in a data library or restructure around Server Components just to load a list on a hobby project — that's over-engineering. Scale up to those tools when the app's data needs actually grow.",
  },
  {
    model: "deepseek/deepseek-v4-pro",
    latencyMs: 6800,
    text: "It depends on scale, and the dogma is unhelpful. For a simple app or a single widget, a useEffect with proper cleanup is perfectly acceptable and keeps your dependency tree small. The anti-pattern label really applies to large apps where you're re-implementing caching, dedup, and synchronization by hand — there, a real data layer earns its keep. Match the tool to the size of the problem.",
  },
];

const CLUSTERS = [
  {
    clusterId: "c1",
    label: "Use a data layer, not useEffect",
    stance:
      "useEffect fetching is the wrong default; prefer Server Components / loaders or a caching library.",
    memberModels: [
      "anthropic/claude-opus-4.8",
      "openai/gpt-5.5",
      "google/gemini-3.1-pro-preview",
    ],
  },
  {
    clusterId: "c2",
    label: "Fine for simple cases",
    stance:
      "For a small component with proper cleanup, useEffect fetching is fine; reaching for a data layer can be over-engineering.",
    memberModels: ["x-ai/grok-4.3", "deepseek/deepseek-v4-pro"],
  },
];

const SUMMARY = "3 of 5 models agreed (Use a data layer, not useEffect), with 2 dissenting.";

const DISSENT = [
  {
    clusterId: "c2",
    models: ["x-ai/grok-4.3", "deepseek/deepseek-v4-pro"],
    summary:
      "For a small component with proper cleanup, useEffect fetching is fine; reaching for a data layer can be over-engineering.",
    whyItMatters:
      "The disagreement isn't really about useEffect — it's about the scale of your app. The majority is optimizing for apps where hand-rolled caching and race-condition handling become a liability; the dissenters are warning against adding heavy tooling to something small. What you should decide: how much data your app actually manages, and whether you already have a framework data layer to lean on.",
  },
];

function chunk(text: string): string[] {
  // split into word-ish tokens so the stream feels like real generation
  return text.match(/\S+\s*/g) ?? [text];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

export async function replayDemo(
  emit: (ev: CrossCheckEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const models = ANSWERS.map((a) => a.model);
  try {
    emit({ type: "run_started", runId: "cc_demo", question: QUESTION, models, mode: "consensus" });
    await sleep(280, signal);
    for (const a of ANSWERS) emit({ type: "model_started", model: a.model });

    // stream all five "concurrently" by interleaving their token chunks
    const streams = ANSWERS.map((a) => ({ model: a.model, tokens: chunk(a.text), i: 0 }));
    let remaining = streams.filter((s) => s.tokens.length > 0);
    while (remaining.length) {
      for (const s of remaining) {
        const tok = s.tokens[s.i++];
        if (tok !== undefined) emit({ type: "model_token", model: s.model, token: tok });
      }
      await sleep(34, signal);
      remaining = streams.filter((s) => s.i < s.tokens.length);
    }

    for (const a of ANSWERS) {
      emit({ type: "model_completed", model: a.model, answer: a.text, latencyMs: a.latencyMs });
    }

    await sleep(520, signal);
    emit({ type: "clustering_started" });
    await sleep(1100, signal);
    for (const c of CLUSTERS) {
      emit({ type: "cluster", cluster: c });
      await sleep(260, signal);
    }
    emit({ type: "consensus", agreement: "majority", summary: SUMMARY });
    await sleep(420, signal);
    for (const note of DISSENT) {
      emit({ type: "dissent", note });
      await sleep(200, signal);
    }
    emit({
      type: "run_completed",
      report: {
        runId: "cc_demo",
        question: QUESTION,
        models,
        answers: ANSWERS.map((a) => ({ model: a.model, answer: a.text, latencyMs: a.latencyMs })),
        failures: [],
        clusters: CLUSTERS,
        agreement: "majority",
        summary: SUMMARY,
        dissent: DISSENT,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw err;
  }
}
