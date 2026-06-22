import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCrossCheck } from "./run";
import { VoiceCard, Verdict, Positions, DissentBlock, KeyGate } from "./components";

const KEY_STORAGE = "crosscheck.openrouter.key";

const SUGGESTIONS = [
  "Is it worth learning Rust in 2026?",
  "Should I take the job offer or counter for more equity?",
  "Is intermittent fasting actually effective for fat loss?",
  "Monorepo or polyrepo for a 4-person startup?",
];

const PRINCIPLES = [
  { n: "01", h: "Never claims correctness", p: "It reports where models agree and disagree. You stay the judge — the panel just makes the disagreement legible." },
  { n: "02", h: "Dissent is the feature", p: "A well-explained minority position is the most valuable output. It's elevated, never averaged away." },
  { n: "03", h: "Semantic, not string-matched", p: "A judge model clusters answers by stance, so “yes, but…” and “absolutely” land together — and opposites don't." },
  { n: "04", h: "Your key, your browser", p: "Bring-your-own OpenRouter key, stored locally. Calls go straight to the model. No backend, nothing logged." },
];

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(KEY_STORAGE));
  const [showGate, setShowGate] = useState(false);
  const [question, setQuestion] = useState("");
  const pendingRef = useRef<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // scroll results into view once a run starts
  useEffect(() => {
    if (state.phase !== "idle") resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.phase === "idle"]); // eslint-disable-line react-hooks/exhaustive-deps

  const showResults = state.phase !== "idle";

  return (
    <div className="app">
      <div className="bg" />
      <div className="grain" />

      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="dot" />
            CrossCheck<span style={{ color: "var(--signal)" }}>AI</span>
          </div>
          <nav>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              get a key
            </a>
            <a href="https://github.com/sebuzdugan/CrossCheckAI" target="_blank" rel="noreferrer">
              source
            </a>
            {apiKey && (
              <button className="reset-btn" onClick={clearKey} style={{ padding: "6px 12px" }}>
                forget key
              </button>
            )}
          </nav>
        </header>

        {/* hero */}
        <section className="hero">
          <motion.span
            className="kicker"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            one question · many minds
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            Don't trust one
            <br />
            model. <span className="em">Cross-check</span> it.
          </motion.h1>
          <motion.p
            className="lede"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
          >
            Ask five frontier LLMs the same question at once. See where they agree, where they
            split, and — the part that matters — <b>why the disagreement matters</b>.
          </motion.p>

          {/* console */}
          <motion.div
            className="console"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22 }}
          >
            <div className="console-inner">
              <span className="prompt-sigil">›</span>
              <textarea
                ref={taRef}
                value={question}
                placeholder="Ask something you genuinely weren't sure about…"
                rows={1}
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
              <button className="ask-btn" disabled={busy || !question.trim()} onClick={() => ask(question)}>
                {busy ? "running…" : "cross-check"}
              </button>
            </div>
            <div className="console-foot">
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="chip"
                    onClick={() => {
                      setQuestion(s);
                      ask(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="keyline">
                {apiKey ? (
                  <>
                    <span className="ok">●</span> key connected
                  </>
                ) : (
                  <>
                    <span>no key —</span>
                    <button onClick={() => runDemo()}>watch the demo</button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {/* results */}
        <div ref={resultsRef}>
          {showResults && (
            <>
              <section className="section">
                <div className="section-head">
                  <span className="idx">01</span>
                  <h2>The panel</h2>
                  <span className="meta">
                    {state.isDemo && <span className="demo-banner">▸ recorded demo run</span>}
                    {!state.isDemo && state.question}
                  </span>
                </div>
                {state.isDemo && (
                  <p style={{ color: "var(--muted)", marginTop: "-8px", marginBottom: 18, fontSize: 15 }}>
                    “{"In React for 2026, should I fetch data with useEffect, or is that an anti-pattern now?"}”
                  </p>
                )}
                <div className="voices">
                  {state.voices.map((v, i) => (
                    <VoiceCard key={v.model} voice={v} index={i} />
                  ))}
                </div>
              </section>

              {state.phase === "error" && (
                <section className="section">
                  <div className="err">✗ {state.error}</div>
                  <button className="reset-btn" style={{ marginTop: 16 }} onClick={reset}>
                    ← try again
                  </button>
                </section>
              )}

              {state.agreement && state.summary && (
                <section className="section">
                  <div className="section-head">
                    <span className="idx">02</span>
                    <h2>The verdict</h2>
                  </div>
                  <Verdict agreement={state.agreement} summary={state.summary} />
                  {state.clusters.length > 0 && <Positions clusters={state.clusters} />}
                </section>
              )}

              {state.dissent.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <span className="idx">03</span>
                    <h2>The dissent</h2>
                    <span className="meta">the most valuable part</span>
                  </div>
                  <DissentBlock notes={state.dissent} />
                </section>
              )}

              {state.phase === "done" && (
                <div style={{ marginTop: 28 }}>
                  <button className="reset-btn" onClick={reset}>
                    ← ask another
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* principles */}
        {!showResults && (
          <section className="section">
            <div className="principles">
              {PRINCIPLES.map((p) => (
                <div className="principle" key={p.n}>
                  <span className="n">{p.n}</span>
                  <h4>{p.h}</h4>
                  <p>{p.p}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="foot">
          <span>CrossCheckAI — a second opinion for anything you'd take one model's word on.</span>
          <span>
            <a href="https://www.npmjs.com/package/@sebuzdugan/crosscheck" target="_blank" rel="noreferrer">
              @sebuzdugan/crosscheck
            </a>
          </span>
        </footer>
      </div>

      {showGate && <KeyGate onSave={saveKey} onDemo={() => {
        setShowGate(false);
        runDemo();
      }} />}
    </div>
  );
}
