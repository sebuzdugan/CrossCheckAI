/**
 * CrossCheckAI — Phase 0 SPIKE.  THROWAWAY.  Not the real library.
 * -----------------------------------------------------------------------------
 * Purpose (per CLAUDE.md §8 Phase 0): prove the one hard idea cheaply, before any
 * packaging exists — judge-based SEMANTIC clustering of multiple models' answers
 * into positions, then an agreement level and an explanation of why the
 * disagreement matters.
 *
 * Run:   OPENROUTER_API_KEY=... npx tsx spike/spike.ts "your question"
 *   or:  put the key in a .env file (see .env.example) and: npx tsx spike/spike.ts "your question"
 *
 * This file deliberately does NOT match the §6 streaming contract — that is
 * Phase 1. Here we keep it minimal: parallel panelist calls, one judge cluster
 * call, pure-logic agreement level, one crux call, pretty print. Iterate on the
 * JUDGE PROMPT here until clustering is obviously sane on the user's own
 * "I wasn't sure" questions. Then, and only then, move to Phase 1.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// minimal .env loader (so the spike runs with zero deps beyond tsx)
// ---------------------------------------------------------------------------
function loadEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "spike/.env"),
    resolve(here, ".env"),
    resolve(here, "../.env"),
  ];
  for (const path of candidates) {
    let txt: string;
    try {
      txt = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, key] = m;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// config (hardcoded for the spike; the real lib makes these inputs — §6)
// Model ids confirmed live from the OpenRouter /models endpoint (§11).
// Override the panel with MODELS="a,b,c" and the judge with JUDGE_MODEL=...
// ---------------------------------------------------------------------------
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";

const PANEL: string[] = (process.env.MODELS
  ? process.env.MODELS.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "anthropic/claude-opus-4.8",
      "openai/gpt-5.5",
      "google/gemini-3.1-pro-preview",
      "x-ai/grok-4.3",
      "deepseek/deepseek-v4-pro",
    ]);

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "anthropic/claude-opus-4.8";

// ---------------------------------------------------------------------------
// tiny ANSI helpers (no deps)
// ---------------------------------------------------------------------------
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const paint = (s: string, color: keyof typeof C) => `${C[color]}${s}${C.reset}`;

// ---------------------------------------------------------------------------
// types (loose — this is a spike, not the contract)
// ---------------------------------------------------------------------------
interface ChatResult {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
interface PanelAnswer {
  model: string;
  answer: string;
  latencyMs: number;
}
interface PanelFailure {
  model: string;
  error: string;
}
interface Cluster {
  label: string;
  stance: string;
  members: number[]; // indices into the successful-answers array
}

// ---------------------------------------------------------------------------
// OpenRouter chat call (non-streaming for the spike)
// ---------------------------------------------------------------------------
async function chat(
  model: string,
  messages: { role: "system" | "user"; content: string }[],
  timeoutMs = 90_000,
): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "CrossCheckAI (spike)",
      },
      body: JSON.stringify({ model, messages }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 240)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: ChatResult["usage"];
    };
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("empty completion");
    return { content, usage: data?.usage };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// step 1 — ask every panelist in parallel
// ---------------------------------------------------------------------------
async function askPanel(
  question: string,
): Promise<{ answers: PanelAnswer[]; failures: PanelFailure[] }> {
  const answers: PanelAnswer[] = [];
  const failures: PanelFailure[] = [];

  await Promise.all(
    PANEL.map(async (model) => {
      const started = Date.now();
      try {
        const { content } = await chat(model, [
          {
            role: "system",
            content:
              "Answer the user's question directly and concisely. State your bottom-line position clearly. If you are uncertain, say so.",
          },
          { role: "user", content: question },
        ]);
        const latencyMs = Date.now() - started;
        answers.push({ model, answer: content.trim(), latencyMs });
        console.log(
          `  ${paint("✓", "green")} ${paint(model, "cyan")} ${paint(
            `(${(latencyMs / 1000).toFixed(1)}s)`,
            "gray",
          )}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ model, error: message });
        console.log(`  ${paint("✗", "red")} ${paint(model, "cyan")} ${paint(message, "gray")}`);
      }
    }),
  );

  return { answers, failures };
}

// ---------------------------------------------------------------------------
// step 2 — the hard part: judge-based SEMANTIC clustering (§7)
// group by STANCE, not topic and not surface wording.
// ---------------------------------------------------------------------------
function buildClusterPrompt(question: string, answers: PanelAnswer[]): string {
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

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function validateClusters(clusters: Cluster[], n: number): string | null {
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

async function clusterAnswers(question: string, answers: PanelAnswer[]): Promise<Cluster[]> {
  const prompt = buildClusterPrompt(question, answers);
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response was invalid (${lastErr}). Return ONLY the JSON object, with every answer index 0..${answers.length - 1} assigned exactly once.`;
    const { content } = await chat(JUDGE_MODEL, [{ role: "user", content: userContent }]);
    try {
      const parsed = extractJson(content) as { clusters?: Cluster[] };
      const clusters = parsed.clusters ?? [];
      const problem = validateClusters(clusters, answers.length);
      if (problem) {
        lastErr = problem;
        continue;
      }
      return clusters;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`judge clustering failed: ${lastErr}`);
}

// ---------------------------------------------------------------------------
// step 3 — agreement level: pure logic over clusters (§7 decision table)
// ---------------------------------------------------------------------------
type Agreement = "unanimous" | "majority" | "split" | "no_consensus";

function computeAgreement(clusters: Cluster[], n: number): Agreement {
  if (clusters.length === 1) return "unanimous";
  const sizes = clusters.map((c) => c.members.length).sort((a, b) => b - a);
  if (sizes[0] > n / 2) return "majority";
  if (clusters.length === 2) return "split";
  return "no_consensus";
}

// ---------------------------------------------------------------------------
// step 4 — the headline: explain WHY the disagreement matters (§2.2)
// ---------------------------------------------------------------------------
async function explainCrux(question: string, clusters: Cluster[]): Promise<string> {
  const positions = clusters
    .map((c, i) => `Position ${i + 1} (${c.members.length} model(s)): ${c.stance}`)
    .join("\n");
  const { content } = await chat(JUDGE_MODEL, [
    {
      role: "user",
      content: [
        "A panel of AI models was asked the question below and did NOT fully agree.",
        "Here are the distinct positions they took:",
        "",
        `Question: ${question}`,
        "",
        positions,
        "",
        "In 2-3 sentences, explain to the user WHY this disagreement matters: what underlying",
        "crux or assumption the positions actually differ on, and what the user would need to",
        "decide or check to resolve it. Do NOT say which position is correct.",
      ].join("\n"),
    },
  ]);
  return content.trim();
}

// ---------------------------------------------------------------------------
// pretty print
// ---------------------------------------------------------------------------
function agreementBadge(a: Agreement): string {
  switch (a) {
    case "unanimous":
      return paint(" UNANIMOUS ", "green");
    case "majority":
      return paint(" MAJORITY (with dissent) ", "yellow");
    case "split":
      return paint(" SPLIT ", "magenta");
    case "no_consensus":
      return paint(" NO CONSENSUS ", "red");
  }
}

function hr(): void {
  console.log(paint("─".repeat(78), "gray"));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error(
      `\n${paint("Usage:", "bold")} npx tsx spike/spike.ts "your question"\n\n` +
        `Set OPENROUTER_API_KEY in the environment or in a .env file (see .env.example).\n`,
    );
    process.exit(1);
  }
  if (!API_KEY) {
    console.error(
      paint("\n✗ OPENROUTER_API_KEY is not set.", "red") +
        " Put it in the environment or a .env file (see .env.example).\n",
    );
    process.exit(1);
  }

  console.log();
  hr();
  console.log(`${paint("CrossCheckAI", "bold")} ${paint("· phase-0 spike", "gray")}`);
  console.log(`${paint("Q:", "bold")} ${question}`);
  console.log(`${paint("Panel:", "gray")} ${PANEL.join(", ")}`);
  console.log(`${paint("Judge:", "gray")} ${JUDGE_MODEL}`);
  hr();

  console.log(paint("Asking the panel…", "blue"));
  const { answers, failures } = await askPanel(question);

  if (answers.length < 2) {
    console.error(
      paint(
        `\n✗ Need at least 2 successful answers to cross-check; got ${answers.length}.\n`,
        "red",
      ),
    );
    if (failures.length) {
      for (const f of failures) console.error(`   ${f.model}: ${f.error}`);
    }
    process.exit(1);
  }

  console.log(`\n${paint("Clustering answers by position…", "blue")}`);
  const clusters = await clusterAnswers(question, answers);
  const agreement = computeAgreement(clusters, answers.length);

  // ---- report ----
  console.log();
  hr();
  console.log(`${paint("VERDICT", "bold")}  ${agreementBadge(agreement)}`);
  hr();

  const ordered = [...clusters].sort((a, b) => b.members.length - a.members.length);
  ordered.forEach((c, i) => {
    const members = c.members.map((idx) => answers[idx].model).join(", ");
    console.log(
      `\n${paint(`Position ${i + 1}`, "bold")} ${paint(`· ${c.members.length} model(s)`, "gray")}`,
    );
    console.log(`  ${paint(c.label, "cyan")}`);
    console.log(`  ${c.stance}`);
    console.log(`  ${paint(members, "gray")}`);
  });

  if (agreement !== "unanimous") {
    console.log(`\n${paint("Why the disagreement matters:", "bold")}`);
    try {
      const crux = await explainCrux(question, ordered);
      console.log(`  ${paint(crux, "yellow")}`);
    } catch (e) {
      console.log(paint(`  (could not generate crux: ${e instanceof Error ? e.message : e})`, "gray"));
    }
  } else {
    console.log(
      `\n${paint("Note:", "gray")} the panel agreed — but agreement is not proof of correctness.`,
    );
  }

  if (failures.length) {
    console.log(`\n${paint("Failed panelists:", "gray")}`);
    for (const f of failures) console.log(paint(`  ${f.model}: ${f.error}`, "gray"));
  }

  // raw answers last, for the human gate (read them, judge the clustering)
  console.log(`\n${paint("Raw answers (verify the clustering against these):", "gray")}`);
  answers.forEach((a, i) => {
    console.log(`\n${paint(`[${i}] ${a.model}`, "cyan")}`);
    console.log(a.answer);
  });
  console.log();
}

main().catch((err) => {
  console.error(paint(`\n✗ ${err instanceof Error ? err.stack ?? err.message : String(err)}`, "red"));
  process.exit(1);
});
