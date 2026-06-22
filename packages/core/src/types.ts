/**
 * CrossCheckAI — public data contract (CLAUDE.md §6).
 * The entire product is one streaming function, `runCrossCheck`. The CLI, the web
 * app, tests, and any future UI all consume the SAME async iterable of events.
 */

export interface CrossCheckInput {
  /** The question to put to the panel. */
  question: string;
  /** OpenRouter model ids. Defaults to {@link DEFAULT_PANEL}. */
  models?: string[];
  /** Only 'consensus' exists in v1. Field exists so the contract is forward-compatible. */
  mode?: "consensus";
  /** Model used for semantic clustering + dissent synthesis (§7). Defaults to {@link DEFAULT_JUDGE_MODEL}. */
  judgeModel?: string;
  /** OpenRouter key. Falls back to process.env.OPENROUTER_API_KEY (Node only). */
  apiKey?: string;
  /** Standard cancellation. Aborts in-flight panelist + judge calls. */
  signal?: AbortSignal;
  /** Optional attribution headers OpenRouter shows on its dashboard. */
  referer?: string;
  title?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

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

export type Agreement = "unanimous" | "majority" | "split" | "no_consensus";

export interface DissentNote {
  clusterId: string;
  models: string[];
  /** What the minority said. */
  summary: string;
  /** WHY this disagreement matters to the user — the most valuable sentence we produce. */
  whyItMatters: string;
}

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

export type CrossCheckEvent =
  | { type: "run_started"; runId: string; question: string; models: string[]; mode: "consensus" }
  | { type: "model_started"; model: string }
  | { type: "model_token"; model: string; token: string }
  | { type: "model_completed"; model: string; answer: string; latencyMs: number; usage?: TokenUsage }
  | { type: "model_failed"; model: string; error: string }
  | { type: "clustering_started" }
  | { type: "cluster"; cluster: Cluster }
  | { type: "consensus"; agreement: Agreement; summary: string }
  | { type: "dissent"; note: DissentNote }
  | { type: "run_completed"; report: CrossCheckReport }
  | { type: "error"; scope: "run" | "model" | "judge"; message: string };
