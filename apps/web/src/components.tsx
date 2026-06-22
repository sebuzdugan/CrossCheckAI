/** Presentational pieces for CrossCheckAI, styled 1-on-1 with AIEngineerCV. */
import { useEffect, useRef } from "react";
import type { Agreement, Cluster, DissentNote } from "@sebuzdugan/crosscheck";
import type { Voice } from "./run";

const VERDICT_META: Record<
  Agreement,
  { label: string; text: string; border: string; bg: string }
> = {
  unanimous: { label: "Unanimous", text: "#9fe870", border: "#2f5a32", bg: "#10220f" },
  majority: { label: "Majority, with dissent", text: "#e8cf94", border: "#5a4f2f", bg: "#1a160f" },
  split: { label: "Split", text: "#9fc0ec", border: "#2f3f5a", bg: "#0f131a" },
  no_consensus: { label: "No consensus", text: "#f0b8b8", border: "#5a2f2f", bg: "#1a0f0f" },
};

export function splitModel(id: string): { vendor: string; name: string } {
  const [vendor, ...rest] = id.split("/");
  return { vendor: vendor ?? id, name: rest.join("/") || id };
}

function Chip({ model }: { model: string }) {
  const { vendor, name } = splitModel(model);
  return (
    <span className="mono rounded-md border border-[#23282b] bg-[#0a0c0d] px-2 py-1 text-[11px] text-[#cdd2d5]">
      <span className="text-[#6f767c]">{vendor}/</span>
      {name}
    </span>
  );
}

const STATUS_DOT: Record<Voice["status"], string> = {
  pending: "bg-[#3a4248]",
  streaming: "bg-[#9fe870] pulse",
  done: "bg-[#9fe870]",
  failed: "bg-[#e08a8a]",
};
const STATUS_BORDER: Record<Voice["status"], string> = {
  pending: "border-[#1d2225]",
  streaming: "border-[#2f5a32]",
  done: "border-[#1d2225]",
  failed: "border-[#5a2f2f]",
};

/* ---- a single model's streaming answer ---- */
export function VoiceCard({ voice, index }: { voice: Voice; index: number }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { vendor, name } = splitModel(voice.model);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && voice.status === "streaming") el.scrollTop = el.scrollHeight;
  }, [voice.text, voice.status]);

  const statusLabel =
    voice.status === "streaming"
      ? "thinking"
      : voice.status === "done"
        ? voice.latencyMs != null
          ? `${(voice.latencyMs / 1000).toFixed(1)}s`
          : "done"
        : voice.status === "failed"
          ? "failed"
          : "queued";

  return (
    <div
      className={`fadeup flex min-h-[180px] flex-col rounded-xl border ${STATUS_BORDER[voice.status]} bg-[#0e1113] p-4`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-2 border-b border-[#15191b] pb-3">
        <span className="mono text-[10px] uppercase tracking-[0.08em] text-[#6f767c]">{vendor}</span>
        <span className="mono text-[13px] text-[#e7e9ea]">{name}</span>
        <span className="mono ml-auto flex items-center gap-1.5 text-[11px] text-[#8a9197]">
          <span className={`h-[7px] w-[7px] rounded-full ${STATUS_DOT[voice.status]}`} />
          {statusLabel}
        </span>
      </div>
      <div
        ref={bodyRef}
        className="answer-body mt-3 max-h-[230px] flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#aeb4b8]"
      >
        {voice.status === "failed" ? (
          <span className="text-[#cf9a9a]">{voice.error ?? "request failed"}</span>
        ) : (
          voice.text || (voice.status === "streaming" ? "" : <span className="text-[#5b6268]">waiting…</span>)
        )}
        {voice.status === "streaming" && <span className="caret" />}
      </div>
    </div>
  );
}

/* ---- the verdict banner ---- */
export function Verdict({ agreement, summary }: { agreement: Agreement; summary: string }) {
  const m = VERDICT_META[agreement];
  return (
    <div
      className="fadeup rounded-xl border border-[#1d2225] bg-[#0e1113] p-6"
      style={{ borderTopColor: m.text, borderTopWidth: "2px" }}
    >
      <span
        className="mono inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] uppercase tracking-[0.14em]"
        style={{ color: m.text, borderColor: m.border, background: m.bg }}
      >
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: m.text }} />
        {m.label}
      </span>
      <p className="mt-4 max-w-3xl text-2xl font-bold leading-snug tracking-tight text-[#f2f4f5]">
        {summary}
      </p>
      <p className="mono mt-4 text-[12px] text-[#6f767c]">
        CrossCheckAI reports positions. It never claims an answer is correct.
      </p>
    </div>
  );
}

/* ---- the positions list ---- */
export function Positions({ clusters }: { clusters: Cluster[] }) {
  const ordered = [...clusters].sort((a, b) => b.memberModels.length - a.memberModels.length);
  const total = ordered.reduce((n, c) => n + c.memberModels.length, 0);
  return (
    <div className="mt-4 flex flex-col gap-3">
      {ordered.map((c, i) => (
        <div
          key={c.clusterId}
          className="fadeup grid grid-cols-[42px_1fr] gap-4 rounded-xl border border-[#1d2225] bg-[#0e1113] p-5"
          style={{ animationDelay: `${100 + i * 70}ms` }}
        >
          <div className={`text-3xl font-bold leading-none ${i === 0 ? "text-[#9fe870]" : "text-[#3a4248]"}`}>
            {i + 1}
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <div className="text-lg font-bold tracking-tight text-[#f2f4f5]">{c.label}</div>
              <span className="mono ml-auto text-[11px] text-[#6f767c]">
                {c.memberModels.length}/{total}
              </span>
            </div>
            {c.stance && <p className="mt-1 text-[14px] leading-relaxed text-[#aeb4b8]">{c.stance}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.memberModels.map((m) => (
                <Chip key={m} model={m} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- dissent: the headline ---- */
export function DissentBlock({ notes }: { notes: DissentNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      {notes.map((note) => (
        <div
          key={note.clusterId}
          className="fadeup relative overflow-hidden rounded-xl border border-[#2f5a32] bg-[#0e150d] p-6 pl-7"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-[#9fe870]" />
          <div className="mono mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#9fe870]">
            ✦ why the dissent matters
          </div>
          <p className="max-w-3xl text-[17px] leading-relaxed text-[#e7e9ea]">{note.whyItMatters}</p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mono mr-1 text-[11px] text-[#6f767c]">dissenting:</span>
            {note.models.map((m) => (
              <Chip key={m} model={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- bring-your-own-key gate ---- */
export function KeyGate({ onSave, onDemo }: { onSave: (key: string) => void; onDemo: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#06080a]/80 p-6 backdrop-blur-sm">
      <div className="fadeup w-full max-w-md rounded-xl border border-[#1d2225] bg-[#0e1113] p-7">
        <h3 className="text-xl font-bold tracking-tight text-[#f2f4f5]">Bring your own key</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[#aeb4b8]">
          CrossCheckAI runs entirely in your browser. Paste an{" "}
          <a className="text-[#9fe870] hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            OpenRouter key
          </a>{" "}
          and one key reaches every model on the panel.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            ref={ref}
            type="password"
            placeholder="sk-or-v1-…"
            spellCheck={false}
            autoComplete="off"
            className="mono flex-1 rounded-lg border border-[#23282b] bg-[#0a0c0d] px-3 py-2.5 text-[13px] text-[#dfe3e5] outline-none placeholder:text-[#5b6268] focus:border-[#39424a]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = ref.current?.value.trim();
                if (v) onSave(v);
              }
            }}
          />
          <button
            className="mono rounded-lg border border-[#2f5a32] bg-[#10220f] px-4 text-[13px] text-[#bfe8c2] transition hover:bg-[#163217]"
            onClick={() => {
              const v = ref.current?.value.trim();
              if (v) onSave(v);
            }}
          >
            Save
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-[#2f5a32]/50 bg-[#10220f]/40 p-3 text-[12px] leading-relaxed text-[#bfe8c2]">
          Your key is stored only in this browser's localStorage and sent straight to OpenRouter. It
          never touches a server of ours; there isn't one.
        </div>
        <button className="mono mt-4 w-full text-center text-[12px] text-[#7d858b] hover:text-[#9fe870]" onClick={onDemo}>
          or watch a recorded run first →
        </button>
      </div>
    </div>
  );
}
