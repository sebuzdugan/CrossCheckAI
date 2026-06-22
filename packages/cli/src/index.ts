#!/usr/bin/env node
/**
 * CrossCheckAI CLI — thin (CLAUDE.md §4). All it does is render the event stream
 * from `runCrossCheck`. Zero clustering / OpenRouter logic lives here.
 */
import { runCrossCheck, type Agreement, type Cluster } from "@sebuzdugan/crosscheck";

// ---------------------------------------------------------------------------
// color (no deps; respects NO_COLOR and non-TTY)
// ---------------------------------------------------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  gray: wrap("90"),
};

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
interface Args {
  question: string;
  models?: string[];
  judge?: string;
  raw: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let models: string[] | undefined;
  let judge: string | undefined;
  let raw = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--raw") raw = true;
    else if (a === "--models") models = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--models=")) models = a.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--judge") judge = argv[++i];
    else if (a.startsWith("--judge=")) judge = a.slice(8);
    else positional.push(a);
  }
  return { question: positional.join(" ").trim(), models, judge, raw, help };
}

const HELP = `
${c.bold("crosscheck")} — ask multiple frontier LLMs the same question; see where they
agree, disagree, and ${c.bold("why the disagreement matters")}.

${c.bold("Usage")}
  crosscheck "your question"
  crosscheck --raw "your question"
  crosscheck --models "anthropic/claude-opus-4.8,openai/gpt-5.5" "your question"
  crosscheck --judge "google/gemini-3.1-pro-preview" "your question"

${c.bold("Setup")}
  Set ${c.cyan("OPENROUTER_API_KEY")} in your environment. One key → every model.

${c.bold("Flags")}
  --raw       print each model's full answer
  --models    comma-separated OpenRouter model ids (overrides the default panel)
  --judge     OpenRouter model id used for clustering + dissent
  -h, --help  this help

CrossCheckAI never tells you which answer is correct. It shows you the positions.
`;

// ---------------------------------------------------------------------------
// live panel renderer (in-place on TTY, line-by-line otherwise)
// ---------------------------------------------------------------------------
type Status = "pending" | "streaming" | "done" | "failed";
interface PanelState {
  status: Status;
  tokens: number;
  latencyMs: number;
  error: string;
}
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Panel {
  private states = new Map<string, PanelState>();
  private printed = 0;
  private tick = 0;
  private lastRender = 0;

  constructor(private models: string[]) {
    for (const m of models) this.states.set(m, { status: "pending", tokens: 0, latencyMs: 0, error: "" });
  }

  set(model: string, patch: Partial<PanelState>): void {
    const s = this.states.get(model);
    if (s) Object.assign(s, patch);
  }

  addToken(model: string): void {
    const s = this.states.get(model);
    if (s) {
      s.status = "streaming";
      s.tokens++;
    }
  }

  private line(model: string): string {
    const s = this.states.get(model)!;
    switch (s.status) {
      case "pending":
        return `  ${c.gray("○")} ${model} ${c.gray("· waiting")}`;
      case "streaming":
        return `  ${c.cyan(SPINNER[this.tick % SPINNER.length]!)} ${c.cyan(model)} ${c.gray(`· ${s.tokens} tokens`)}`;
      case "done":
        return `  ${c.green("✓")} ${model} ${c.gray(`· ${(s.latencyMs / 1000).toFixed(1)}s`)}`;
      case "failed":
        return `  ${c.red("✗")} ${model} ${c.gray(`· ${s.error.slice(0, 60)}`)}`;
    }
  }

  render(force = false): void {
    this.tick++;
    if (!useColor) return; // non-TTY: rely on discrete logs in event loop
    const now = Date.now();
    if (!force && now - this.lastRender < 70) return;
    this.lastRender = now;
    const lines = this.models.map((m) => this.line(m));
    if (this.printed > 0) process.stdout.write(`\x1b[${this.printed}A`);
    for (const l of lines) process.stdout.write(`\x1b[2K${l}\n`);
    this.printed = lines.length;
  }
}

// ---------------------------------------------------------------------------
// verdict presentation
// ---------------------------------------------------------------------------
function badge(a: Agreement): string {
  switch (a) {
    case "unanimous":
      return c.green(c.bold(" UNANIMOUS "));
    case "majority":
      return c.yellow(c.bold(" MAJORITY · with dissent "));
    case "split":
      return c.magenta(c.bold(" SPLIT "));
    case "no_consensus":
      return c.red(c.bold(" NO CONSENSUS "));
  }
}

const hr = () => console.log(c.gray("─".repeat(74)));

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.question) {
    console.error(c.yellow('\nGive me a question:  ') + c.bold('crosscheck "your question"') + c.gray("   (--help for more)\n"));
    process.exit(1);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(c.red("\n✗ OPENROUTER_API_KEY is not set.") + " Get a key at https://openrouter.ai and export it.\n");
    process.exit(1);
  }

  console.log();
  hr();
  console.log(`${c.bold("CrossCheckAI")}  ${c.gray("· one question, many minds")}`);
  console.log(`${c.bold("Q:")} ${args.question}`);
  hr();

  let panel: Panel | null = null;
  const clusters: Cluster[] = [];
  const rawAnswers: { model: string; answer: string }[] = [];
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;

  for await (const ev of runCrossCheck({
    question: args.question,
    models: args.models,
    judgeModel: args.judge,
    title: "CrossCheckAI CLI",
  })) {
    switch (ev.type) {
      case "run_started":
        panel = new Panel(ev.models);
        console.log(c.blue("Asking the panel…\n"));
        panel.render(true);
        // animate spinners while streaming
        spinnerTimer = setInterval(() => panel?.render(true), 90);
        break;
      case "model_started":
        panel?.set(ev.model, { status: "streaming" });
        if (!useColor) console.log(`  … ${ev.model}`);
        break;
      case "model_token":
        panel?.addToken(ev.model);
        panel?.render();
        break;
      case "model_completed":
        panel?.set(ev.model, { status: "done", latencyMs: ev.latencyMs });
        panel?.render(true);
        rawAnswers.push({ model: ev.model, answer: ev.answer });
        if (!useColor) console.log(`  ✓ ${ev.model} (${(ev.latencyMs / 1000).toFixed(1)}s)`);
        break;
      case "model_failed":
        panel?.set(ev.model, { status: "failed", error: ev.error });
        panel?.render(true);
        if (!useColor) console.log(`  ✗ ${ev.model}: ${ev.error}`);
        break;
      case "clustering_started":
        if (spinnerTimer) clearInterval(spinnerTimer), (spinnerTimer = null);
        panel?.render(true);
        console.log(`\n${c.blue("Clustering answers by position…")}`);
        break;
      case "cluster":
        clusters.push(ev.cluster);
        break;
      case "consensus": {
        console.log();
        hr();
        console.log(`${c.bold("VERDICT")}  ${badge(ev.agreement)}`);
        console.log(c.gray(ev.summary));
        hr();
        const ordered = [...clusters].sort((a, b) => b.memberModels.length - a.memberModels.length);
        ordered.forEach((cl, i) => {
          console.log(`\n${c.bold(`Position ${i + 1}`)} ${c.gray(`· ${cl.memberModels.length} model(s)`)}`);
          console.log(`  ${c.cyan(cl.label)}`);
          if (cl.stance) console.log(`  ${cl.stance}`);
          console.log(`  ${c.gray(cl.memberModels.join(", "))}`);
        });
        break;
      }
      case "dissent":
        console.log(`\n${c.bold(c.yellow("Why it matters"))} ${c.gray(`(${ev.note.models.join(", ")})`)}`);
        console.log(`  ${c.yellow(ev.note.whyItMatters)}`);
        break;
      case "run_completed":
        if (ev.report.agreement === "unanimous") {
          console.log(`\n${c.gray("The panel agreed — but agreement is not proof of correctness.")}`);
        }
        if (ev.report.failures.length) {
          console.log(`\n${c.gray("Failed panelists:")}`);
          for (const f of ev.report.failures) console.log(c.gray(`  ${f.model}: ${f.error.slice(0, 80)}`));
        }
        if (args.raw) {
          console.log(`\n${c.gray("Raw answers:")}`);
          for (const a of rawAnswers) {
            console.log(`\n${c.cyan(a.model)}`);
            console.log(a.answer);
          }
        }
        console.log();
        break;
      case "error":
        if (spinnerTimer) clearInterval(spinnerTimer), (spinnerTimer = null);
        console.error(c.red(`\n✗ ${ev.scope} error: ${ev.message}\n`));
        process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(c.red(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
