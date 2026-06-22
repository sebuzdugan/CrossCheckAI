/** Presentational pieces for CrossCheckAI. State lives in App / run.ts. */
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, type CSSProperties } from "react";
import type { Agreement, Cluster, DissentNote } from "@sebuzdugan/crosscheck";
import type { Voice } from "./run";

const VERDICT_META: Record<Agreement, { label: string; color: string }> = {
  unanimous: { label: "Unanimous", color: "var(--unanimous)" },
  majority: { label: "Majority · with dissent", color: "var(--majority)" },
  split: { label: "Split", color: "var(--split)" },
  no_consensus: { label: "No consensus", color: "var(--nocon)" },
};

export function splitModel(id: string): { vendor: string; name: string } {
  const [vendor, ...rest] = id.split("/");
  return { vendor: vendor ?? id, name: rest.join("/") || id };
}

/* ---- a single model's streaming answer ---- */
export function VoiceCard({ voice, index }: { voice: Voice; index: number }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { vendor, name } = splitModel(voice.model);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && voice.status === "streaming") el.scrollTop = el.scrollHeight;
  }, [voice.text, voice.status]);

  return (
    <motion.div
      className={`voice ${voice.status}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="voice-head">
        <span className="vendor">{vendor}</span>
        <span className="name">{name}</span>
        <span className="voice-status">
          <span className={`status-dot ${voice.status}`} />
          {voice.status === "streaming" && "thinking"}
          {voice.status === "done" && voice.latencyMs != null && `${(voice.latencyMs / 1000).toFixed(1)}s`}
          {voice.status === "failed" && "failed"}
          {voice.status === "pending" && "queued"}
        </span>
      </div>
      <div ref={bodyRef} className={`voice-body ${voice.text ? "" : "empty"}`}>
        {voice.status === "failed"
          ? voice.error ?? "request failed"
          : voice.text || (voice.status === "streaming" ? "" : "waiting…")}
        {voice.status === "streaming" && <span className="caret" />}
      </div>
    </motion.div>
  );
}

/* ---- the verdict banner ---- */
export function Verdict({ agreement, summary }: { agreement: Agreement; summary: string }) {
  const meta = VERDICT_META[agreement];
  return (
    <motion.div
      className="verdict"
      style={{ "--verdict-color": meta.color } as CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="level">
        <span className="pip" />
        {meta.label}
      </span>
      <div className="summary">{summary}</div>
      <div className="disclaimer">
        <span>◇</span> CrossCheckAI reports positions. It never claims an answer is correct.
      </div>
    </motion.div>
  );
}

/* ---- the positions list ---- */
export function Positions({ clusters }: { clusters: Cluster[] }) {
  const ordered = [...clusters].sort((a, b) => b.memberModels.length - a.memberModels.length);
  const total = ordered.reduce((n, c) => n + c.memberModels.length, 0);
  return (
    <div className="positions">
      {ordered.map((c, i) => (
        <motion.div
          key={c.clusterId}
          className={`position ${i === 0 ? "lead" : ""}`}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1 + i * 0.08 }}
        >
          <div className="rank">{i + 1}</div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div className="label">{c.label}</div>
              <span className="share">
                {c.memberModels.length}/{total}
              </span>
            </div>
            {c.stance && <div className="stance">{c.stance}</div>}
            <div className="members">
              {c.memberModels.map((m) => {
                const { vendor, name } = splitModel(m);
                return (
                  <span className="member" key={m}>
                    <span className="v">{vendor}/</span>
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ---- dissent: the headline ---- */
export function DissentBlock({ notes }: { notes: DissentNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="dissent-wrap">
      <AnimatePresence>
        {notes.map((note) => (
          <motion.div
            key={note.clusterId}
            className="dissent"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tag">✦ Why the dissent matters</div>
            <div className="why">{note.whyItMatters}</div>
            <div className="from">
              <span className="lbl">dissenting:</span>
              {note.models.map((m) => {
                const { vendor, name } = splitModel(m);
                return (
                  <span className="member" key={m}>
                    <span className="v">{vendor}/</span>
                    {name}
                  </span>
                );
              })}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const SHIELD = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

/* ---- bring-your-own-key gate ---- */
export function KeyGate({
  onSave,
  onDemo,
}: {
  onSave: (key: string) => void;
  onDemo: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-scrim">
      <motion.div
        className="modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3>Bring your own key</h3>
        <p>
          CrossCheckAI runs entirely in your browser. Paste an{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            OpenRouter key
          </a>{" "}
          — one key reaches every model on the panel.
        </p>
        <div className="field">
          <input ref={ref} type="password" placeholder="sk-or-v1-…" spellCheck={false} autoComplete="off" />
          <button
            className="save"
            onClick={() => {
              const v = ref.current?.value.trim();
              if (v) onSave(v);
            }}
          >
            Save
          </button>
        </div>
        <div className="privacy">
          {SHIELD}
          <span>
            Your key is stored only in this browser's <code>localStorage</code> and sent straight to
            OpenRouter. It never touches a server of ours — there isn't one.
          </span>
        </div>
        <button className="demo-link" onClick={onDemo}>
          or watch a recorded run first →
        </button>
      </motion.div>
    </div>
  );
}
