/**
 * The hard part (CLAUDE.md §7): group answers into POSITIONS by stance, using a
 * judge model — not string matching, not embedding similarity (both fail because
 * opposite stances on the same topic look similar). Prompt validated in Phase 0.
 */
import { chat, type OpenRouterOpts } from "./openrouter.js";
import { extractJson } from "./json.js";
import type { Cluster, ModelAnswer } from "./types.js";

export function buildClusterPrompt(question: string, answers: ModelAnswer[]): string {
  const indexed = answers
    .map((a, i) => `[${i}] (from ${a.model})\n${a.answer}`)
    .join("\n\n");
  return [
    "You are grouping independent answers to the SAME question by the POSITION each one takes.",
    "",
    "Question:",
    question,
    "",
    "Answers (indexed):",
    indexed,
    "",
    "Group the answers into distinct positions. Two answers belong to the SAME cluster",
    "if and only if a careful reader would conclude they reach the same bottom-line",
    "position — even if worded very differently, even if their reasoning or caveats differ.",
    "Answers that reach OPPOSITE or materially different conclusions MUST be in different",
    "clusters, even when they discuss the same topic. Do not cluster by topic similarity;",
    "cluster by stance.",
    "",
    "Respond with ONLY a JSON object of exactly this shape (no prose, no code fences):",
    '{ "clusters": [ { "label": "<3-6 word name>", "stance": "<one sentence stating the position>", "members": [<answer indices>] } ] }',
    "",
    "Every answer index must appear in exactly one cluster.",
  ].join("\n");
}

interface RawCluster {
  label?: string;
  stance?: string;
  members?: number[];
}

/** Returns an error string if the judge's clustering is structurally invalid, else null. */
function validateAssignment(clusters: RawCluster[], n: number): string | null {
  if (!Array.isArray(clusters) || clusters.length === 0) return "no clusters";
  const seen = new Set<number>();
  for (const c of clusters) {
    if (!Array.isArray(c.members)) return "cluster missing members[]";
    for (const idx of c.members) {
      if (typeof idx !== "number" || idx < 0 || idx >= n) return `index ${idx} out of range`;
      if (seen.has(idx)) return `index ${idx} assigned twice`;
      seen.add(idx);
    }
  }
  if (seen.size !== n) return `assigned ${seen.size}/${n} answers`;
  return null;
}

/**
 * Cluster the panel's answers by stance. Returns clusters with stable ids and the
 * member model names (mapped from the indices the judge returns). One repair retry
 * if the judge's first response is malformed.
 */
export async function clusterAnswers(
  question: string,
  answers: ModelAnswer[],
  judgeModel: string,
  o: OpenRouterOpts,
): Promise<Cluster[]> {
  const prompt = buildClusterPrompt(question, answers);
  let lastErr = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response was invalid (${lastErr}). Return ONLY the JSON object, with every answer index 0..${answers.length - 1} assigned to exactly one cluster.`;

    const { content: raw } = await chat(judgeModel, [{ role: "user", content }], o);
    try {
      const parsed = extractJson(raw) as { clusters?: RawCluster[] };
      const clusters = parsed.clusters ?? [];
      const problem = validateAssignment(clusters, answers.length);
      if (problem) {
        lastErr = problem;
        continue;
      }
      return clusters.map((c, i) => ({
        clusterId: `c${i + 1}`,
        label: c.label?.trim() || `Position ${i + 1}`,
        stance: c.stance?.trim() || "",
        memberModels: (c.members ?? []).map((idx) => answers[idx]!.model),
      }));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`judge clustering failed: ${lastErr}`);
}
