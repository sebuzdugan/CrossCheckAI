import { useCallback, useRef, useState } from "react";
import { useCrossCheck } from "./run";
import { VoiceCard, Verdict, Positions, DissentBlock, KeyGate } from "./components";

const KEY_STORAGE = "crosscheck.openrouter.key";
const REPO = "https://github.com/sebuzdugan/CrossCheckAI";

const DOORS = [
  { label: "Web app", href: `${REPO}/tree/main/apps/web` },
  { label: "CLI (crosscheck)", href: `${REPO}/tree/main/packages/cli` },
  { label: "Library (npm)", href: `${REPO}/tree/main/packages/core` },
];

const SUGGESTIONS = [
  "Is it worth learning Rust in 2026?",
  "Take the job offer or counter for more equity?",
  "Is intermittent fasting actually effective for fat loss?",
  "Monorepo or polyrepo for a 4-person startup?",
];

const PRINCIPLES = [
  { n: "01", h: "Never claims correctness", p: "It reports where models agree and disagree. You stay the judge; the panel just makes the disagreement legible." },
  { n: "02", h: "Dissent is the feature", p: "A well-explained minority position is the most valuable output. It is elevated, never averaged away." },
  { n: "03", h: "Semantic, not string-matched", p: "A judge model clusters answers by stance, so “yes, but…” and “absolutely” land together, and opposites don't." },
  { n: "04", h: "Your key, your browser", p: "Bring-your-own OpenRouter key, stored locally. Calls go straight to the model. No backend, nothing logged." },
];

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(KEY_STORAGE));
  const [showGate, setShowGate] = useState(false);
  const [question, setQuestion] = useState("");
  const pendingRef = useRef<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { state, run, runDemo, reset } = useCrossCheck();
  const busy = state.phase === "answering" || state.phase === "clustering";

  const autosize = useCallback(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
    }
  }, []);

  const ask = useCallback(
    (q: string) => {
      const text = q.trim();
      if (!text || busy) return;
      if (!apiKey) {
        pendingRef.current = text;
        setShowGate(true);
        return;
      }
      run(text, apiKey);
    },
    [apiKey, busy, run],
  );

  const saveKey = useCallback(
    (key: string) => {
      localStorage.setItem(KEY_STORAGE, key);
      setApiKey(key);
      setShowGate(false);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) run(pending, key);
    },
    [run],
  );

  const clearKey = useCallback(() => {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey(null);
  }, []);

  const showResults = state.phase !== "idle";

  return (
    <div className="min-h-full">
      {/* nav */}
      <nav className="sticky top-0 z-20 border-b border-[#15191b] bg-[#0a0c0d]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="mono flex items-center gap-2 text-[13px] font-bold tracking-[0.12em] text-[#e7e9ea]">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[#10220f] text-[#9fe870]">{">"}</span>
            CROSSCHECKAI
          </div>
          <div className="flex items-center gap-2">
            {apiKey && (
              <button
                onClick={clearKey}
                className="mono rounded-lg border border-[#23282b] bg-[#0e1113] px-3 py-1.5 text-[12px] text-[#8a9197] transition hover:text-[#e7e9ea]"
              >
                forget key
              </button>
            )}
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="mono rounded-lg border border-[#2f5a32] bg-[#10220f] px-3 py-1.5 text-[12px] text-[#bfe8c2] transition hover:bg-[#163217]"
            >
              ★ Star on GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="grid-bg glow relative overflow-hidden border-b border-[#15191b]">
        <div className="mx-auto max-w-6xl px-5 pb-11 pt-14">
          <div className="mono text-[12px] tracking-[0.2em] text-[#9fe870]">ONE QUESTION / MANY MINDS</div>
          <h1 className="fadeup mt-3 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-[#f2f4f5] sm:text-6xl">
            Don't trust one model. <span className="text-[#9fe870]">Cross-check</span> it.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#aeb4b8]">
            Ask five frontier LLMs the same question at once. See where they agree, where they split,
            and the part that matters most: <span className="text-[#9fe870]">why the disagreement matters</span>.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {DOORS.map((d) => (
              <a
                key={d.label}
                href={d.href}
                target="_blank"
                rel="noreferrer"
                className="mono rounded-full border border-[#23282b] bg-[#0e1113] px-3 py-1 text-[11px] text-[#aeb4b8] transition hover:border-[#39424a] hover:text-[#e7e9ea]"
              >
                {d.label}
              </a>
            ))}
          </div>
          <p className="mono mt-5 text-[12px] text-[#6f767c]">
            bring your own key / runs in your browser / nothing proxied, stored, or uploaded
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {/* console */}
        <div className="rounded-xl border border-[#1d2225] bg-[#0e1113] p-4">
          <div className="flex items-end gap-3">
            <span className="mono pb-2 text-[18px] text-[#9fe870]">{">"}</span>
            <textarea
              ref={taRef}
              value={question}
              placeholder="Ask something you genuinely weren't sure about…"
              rows={1}
              className="mono max-h-[180px] min-h-[28px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-[#e7e9ea] outline-none placeholder:text-[#5b6268]"
              onChange={(e) => {
                setQuestion(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
            />
            <button
              onClick={() => ask(question)}
              disabled={busy || !question.trim()}
              className="mono rounded-lg border border-[#2f5a32] bg-[#10220f] px-4 py-2 text-[13px] text-[#bfe8c2] transition hover:bg-[#163217] disabled:opacity-40"
            >
              {busy ? "running…" : "cross-check"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#15191b] pt-3">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setQuestion(s);
                    ask(s);
                  }}
                  className="mono rounded-full border border-[#23282b] bg-[#0a0c0d] px-2.5 py-1 text-[11px] text-[#8a9197] transition hover:border-[#39424a] hover:text-[#e7e9ea]"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mono text-[11px] text-[#6f767c]">
              {apiKey ? (
                <span className="text-[#9fe870]">● key connected</span>
              ) : (
                <>
                  no key /{" "}
                  <button onClick={() => runDemo()} className="text-[#9fe870] hover:underline">
                    watch the demo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* results */}
        {showResults && (
          <div className="mt-9 space-y-9">
            <section>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="mono text-[12px] text-[#9fe870]">01</span>
                <h2 className="text-xl font-bold tracking-tight text-[#f2f4f5]">The panel</h2>
                <span className="mono ml-auto truncate text-[12px] text-[#6f767c]">
                  {state.isDemo ? "recorded demo run" : state.question}
                </span>
              </div>
              {state.isDemo && (
                <p className="mb-4 text-[14px] text-[#aeb4b8]">
                  &ldquo;In React for 2026, should I fetch data with useEffect, or is that an anti-pattern now?&rdquo;
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {state.voices.map((v, i) => (
                  <VoiceCard key={v.model} voice={v} index={i} />
                ))}
              </div>
            </section>

            {state.phase === "error" && (
              <section>
                <div className="rounded-xl border border-[#5a2f2f] bg-[#1a0f0f] p-4 text-[13px] text-[#f0b8b8]">
                  ✗ {state.error}
                </div>
                <button
                  onClick={reset}
                  className="mono mt-4 rounded-lg border border-[#23282b] bg-[#0e1113] px-3 py-1.5 text-[12px] text-[#aeb4b8] hover:text-[#e7e9ea]"
                >
                  ← try again
                </button>
              </section>
            )}

            {state.agreement && state.summary && (
              <section>
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="mono text-[12px] text-[#9fe870]">02</span>
                  <h2 className="text-xl font-bold tracking-tight text-[#f2f4f5]">The verdict</h2>
                </div>
                <Verdict agreement={state.agreement} summary={state.summary} />
                {state.clusters.length > 0 && <Positions clusters={state.clusters} />}
              </section>
            )}

            {state.dissent.length > 0 && (
              <section>
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="mono text-[12px] text-[#9fe870]">03</span>
                  <h2 className="text-xl font-bold tracking-tight text-[#f2f4f5]">The dissent</h2>
                  <span className="mono ml-auto text-[12px] text-[#6f767c]">the most valuable part</span>
                </div>
                <DissentBlock notes={state.dissent} />
              </section>
            )}

            {state.phase === "done" && (
              <button
                onClick={reset}
                className="mono rounded-lg border border-[#23282b] bg-[#0e1113] px-3 py-1.5 text-[12px] text-[#aeb4b8] hover:text-[#e7e9ea]"
              >
                ← ask another
              </button>
            )}
          </div>
        )}

        {/* principles (only on the landing state) */}
        {!showResults && (
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[#15191b] bg-[#15191b] sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((p) => (
              <div key={p.n} className="bg-[#0a0c0d] p-5">
                <span className="mono text-[11px] tracking-[0.1em] text-[#9fe870]">{p.n}</span>
                <h4 className="mt-2 text-[15px] font-bold text-[#f2f4f5]">{p.h}</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#8a9197]">{p.p}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-[#15191b] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center">
          <div className="text-[13px] text-[#aeb4b8]">
            Built by{" "}
            <a className="font-medium text-[#9fe870]" href="https://x.com/sebuzdugan" target="_blank" rel="noreferrer">
              @sebuzdugan
            </a>{" "}
            , an AI engineer, for AI engineers.
          </div>
          <div className="mono text-[11px] text-[#565c61]">
            open source / MIT licensed /{" "}
            <a className="underline hover:text-[#9fe870]" href={REPO} target="_blank" rel="noreferrer">
              github.com/sebuzdugan/CrossCheckAI
            </a>
          </div>
        </div>
      </footer>

      {showGate && (
        <KeyGate
          onSave={saveKey}
          onDemo={() => {
            setShowGate(false);
            runDemo();
          }}
        />
      )}
    </div>
  );
}
