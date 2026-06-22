/**
 * @sebuzdugan/crosscheck — ask multiple frontier LLMs the same question; see
 * where they agree, disagree, and why the disagreement matters.
 *
 * CrossCheckAI never claims an answer is correct. It surfaces positions and
 * explains dissent. The user judges.
 */
export { runCrossCheck } from "./runCrossCheck.js";
export {
  DEFAULT_PANEL,
  DEFAULT_JUDGE_MODEL,
  BUDGET_PANEL,
} from "./defaults.js";
export type {
  CrossCheckInput,
  CrossCheckEvent,
  CrossCheckReport,
  ModelAnswer,
  Cluster,
  DissentNote,
  Agreement,
  TokenUsage,
} from "./types.js";
