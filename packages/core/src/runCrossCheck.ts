/**
 * The one public entry point (CLAUDE.md §6). Streaming-first: an async iterable
 * of events that the CLI, the web app, and tests all consume identically.
 *
 *   for await (const ev of runCrossCheck({ question })) { ... }
 */
import { streamChat, type ChatMessage, type OpenRouterOpts } from "./openrouter.js";
import { clusterAnswers } from "./cluster.js";
import { computeAgreement, buildSummary, buildDissentNotes } from "./consensus.js";
import { DEFAULT_PANEL, DEFAULT_JUDGE_MODEL } from "./defaults.js";
import type {
  CrossCheckEvent,
  CrossCheckInput,
  CrossCheckReport,
  ModelAnswer,
} from "./types.js";

function resolveApiKey(input: CrossCheckInput): string {
  const envKey =
    typeof process !== "undefined" ? process.env?.OPENROUTER_API_KEY : undefined;
  const key = input.apiKey ?? envKey;
  if (!key) {
    throw new Error(
      "Missing OpenRouter API key. Pass { apiKey } or set OPENROUTER_API_KEY.",
    );
  }
  return key;
}

function makeRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cc_${Date.now().toString(36)}${rand}`;
}

function panelMessages(question: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Answer the user's question directly and concisely. State your bottom-line position clearly up front. If you are genuinely uncertain, say so.",
    },
    { role: "user", content: question },
  ];
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A single-consumer async event bus. Concurrent panelist tasks `push` events;
 * the generator drains them in order, then `finish` ends the iteration.
 */
function createEventBus<T>() {
  const buffer: T[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  return {
    push(value: T) {
      buffer.push(value);
      wake?.();
      wake = null;
    },
    finish() {
      finished = true;
      wake?.();
      wake = null;
    },
    async *drain(): AsyncGenerator<T> {
      while (true) {
        if (buffer.length) {
          yield buffer.shift()!;
          continue;
        }
        if (finished) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}

export async function* runCrossCheck(
  input: CrossCheckInput,
): AsyncGenerator<CrossCheckEvent> {
  const apiKey = resolveApiKey(input);
  const models = input.models?.length ? input.models : DEFAULT_PANEL;
  const judgeModel = input.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const runId = makeRunId();
  const orOpts: OpenRouterOpts = {
    apiKey,
    signal: input.signal,
    referer: input.referer,
    title: input.title ?? "CrossCheckAI",
  };

  yield { type: "run_started", runId, question: input.question, models, mode: "consensus" };

  // ---- 1. fan out to the panel, streaming tokens live ----
  const bus = createEventBus<CrossCheckEvent>();
  const answerByModel = new Map<string, ModelAnswer>();
  const failures: { model: string; error: string }[] = [];

  const tasks = models.map(async (model) => {
    bus.push({ type: "model_started", model });
    const started = Date.now();
    try {
      let text = "";
      for await (const token of streamChat(model, panelMessages(input.question), orOpts)) {
        text += token;
        bus.push({ type: "model_token", model, token });
      }
      const answer = text.trim();
      if (!answer) throw new Error("empty completion");
      const latencyMs = Date.now() - started;
      answerByModel.set(model, { model, answer, latencyMs });
      bus.push({ type: "model_completed", model, answer, latencyMs });
    } catch (err) {
      const message = errMessage(err);
      failures.push({ model, error: message });
      bus.push({ type: "model_failed", model, error: message });
    }
  });

  void Promise.allSettled(tasks).then(() => bus.finish());
  for await (const ev of bus.drain()) yield ev;

  // Stable order: present answers in the panel's input order, not completion order.
  const answers: ModelAnswer[] = models
    .map((m) => answerByModel.get(m))
    .filter((a): a is ModelAnswer => a !== undefined);

  // ---- run-level failure: not enough to cross-check ----
  if (answers.length < 2) {
    yield {
      type: "error",
      scope: "run",
      message: `Need at least 2 successful answers to cross-check; got ${answers.length}.`,
    };
    return;
  }

  // ---- 2. cluster by stance (the hard part) ----
  yield { type: "clustering_started" };
  let clusters;
  try {
    clusters = await clusterAnswers(input.question, answers, judgeModel, orOpts);
  } catch (err) {
    yield { type: "error", scope: "judge", message: errMessage(err) };
    return;
  }
  for (const cluster of clusters) yield { type: "cluster", cluster };

  // ---- 3. agreement level (pure logic) ----
  const agreement = computeAgreement(clusters, answers.length);
  const summary = buildSummary(agreement, clusters, answers.length);
  yield { type: "consensus", agreement, summary };

  // ---- 4. explain the dissent (the headline) ----
  const dissent =
    agreement === "unanimous"
      ? []
      : await buildDissentNotes(input.question, clusters, agreement, judgeModel, orOpts);
  for (const note of dissent) yield { type: "dissent", note };

  // ---- 5. final report ----
  const report: CrossCheckReport = {
    runId,
    question: input.question,
    models,
    answers,
    failures,
    clusters,
    agreement,
    summary,
    dissent,
  };
  yield { type: "run_completed", report };
}
