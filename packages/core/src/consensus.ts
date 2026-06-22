/**
 * Pure-logic agreement level (CLAUDE.md §7 decision table) + the dissent
 * explanation, which is the product's headline (§2.2). We never assert correctness.
 */
import { chat, type OpenRouterOpts } from "./openrouter.js";
import { extractJsonSafe } from "./json.js";
import type { Agreement, Cluster, DissentNote } from "./types.js";

export function computeAgreement(clusters: Cluster[], n: number): Agreement {
  if (clusters.length === 1) return "unanimous";
  const sizes = clusters.map((c) => c.memberModels.length).sort((a, b) => b - a);
  if ((sizes[0] ?? 0) > n / 2) return "majority";
  if (clusters.length === 2) return "split";
  return "no_consensus";
}

/** A plain-language, correctness-neutral summary of where the panel landed. */
export function buildSummary(agreement: Agreement, clusters: Cluster[], n: number): string {
  const ordered = [...clusters].sort((a, b) => b.memberModels.length - a.memberModels.length);
  const top = ordered[0];
  switch (agreement) {
    case "unanimous":
      return `All ${n} models reached the same position: ${top?.stance ?? top?.label ?? ""}`.trim();
    case "majority": {
      const k = top?.memberModels.length ?? 0;
      return `${k} of ${n} models agreed (${top?.label ?? "majority"}), with ${n - k} dissenting.`;
    }
    case "split":
      return `The panel split between two positions: ${ordered.map((c) => c.label).join("  vs.  ")}.`;
    case "no_consensus":
      return `No majority — the ${n} models scattered across ${clusters.length} distinct positions.`;
  }
}

interface RawNote {
  clusterId?: string;
  whyItMatters?: string;
}

/**
 * For every non-plurality cluster, explain why that position matters and what it
 * hinges on. One batched judge call (with a templated fallback so a run never
 * dies on a bad JSON response).
 */
export async function buildDissentNotes(
  question: string,
  clusters: Cluster[],
  agreement: Agreement,
  judgeModel: string,
  o: OpenRouterOpts,
): Promise<DissentNote[]> {
  if (agreement === "unanimous" || clusters.length < 2) return [];

  const ordered = [...clusters].sort((a, b) => b.memberModels.length - a.memberModels.length);
  const plurality = ordered[0]!;
  const minorities = ordered.slice(1);

  const positions = ordered
    .map((c) => `- ${c.clusterId} (${c.memberModels.length} model(s)): ${c.stance}`)
    .join("\n");

  const prompt = [
    "A panel of AI models was asked the question below and did NOT fully agree.",
    "Here are the distinct positions they took:",
    "",
    `Question: ${question}`,
    "",
    positions,
    "",
    `The most-supported position is ${plurality.clusterId}. For EACH of the following`,
    `minority positions [${minorities.map((c) => c.clusterId).join(", ")}], explain in 1-2`,
    "sentences WHY that disagreement matters: what underlying crux or assumption it turns on,",
    "and what the user would need to decide or check. Do NOT say which position is correct.",
    "",
    'Respond with ONLY JSON: { "notes": [ { "clusterId": "<id>", "whyItMatters": "<1-2 sentences>" } ] }',
  ].join("\n");

  let byId = new Map<string, string>();
  try {
    const { content } = await chat(judgeModel, [{ role: "user", content: prompt }], o);
    const parsed = extractJsonSafe(content) as { notes?: RawNote[] } | null;
    for (const note of parsed?.notes ?? []) {
      if (note.clusterId && note.whyItMatters) byId.set(note.clusterId, note.whyItMatters.trim());
    }
  } catch {
    byId = new Map();
  }

  return minorities.map((c) => ({
    clusterId: c.clusterId,
    models: c.memberModels,
    summary: c.stance,
    whyItMatters:
      byId.get(c.clusterId) ??
      `This position diverges from the most-supported view (${plurality.label}). Check which assumption applies to your situation before relying on either.`,
  }));
}
