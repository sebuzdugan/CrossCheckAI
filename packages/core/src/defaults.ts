/**
 * Default panel + judge. Model ids confirmed live from the OpenRouter /models
 * endpoint (CLAUDE.md §11). Provider-diverse on purpose: a panel drawn from one
 * lab would agree too easily and hide real disagreement.
 */
export const DEFAULT_PANEL: string[] = [
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.5",
  "google/gemini-3.1-pro-preview",
  "x-ai/grok-4.3",
  "deepseek/deepseek-v4-pro",
];

/** A strong reasoning model for stance clustering + dissent synthesis (§7). */
export const DEFAULT_JUDGE_MODEL = "anthropic/claude-opus-4.8";

/**
 * A cheaper, still provider-diverse panel — handy for tuning / high-volume use.
 * Not the default; offered as a convenience export.
 */
export const BUDGET_PANEL: string[] = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-oss-120b",
  "google/gemini-3.5-flash",
  "deepseek/deepseek-v3.2",
];
