/**
 * Turns the runCrossCheck event stream (or a replayed demo) into flat UI state.
 * The reducer is the single source of truth; both live runs and the demo feed it.
 */
import { useCallback, useReducer, useRef } from "react";
import { runCrossCheck } from "@sebuzdugan/crosscheck";
import type {
  Agreement,
  Cluster,
  CrossCheckEvent,
  DissentNote,
} from "@sebuzdugan/crosscheck";
import { replayDemo } from "./demo";

export type VoiceStatus = "pending" | "streaming" | "done" | "failed";
export interface Voice {
  model: string;
  text: string;
  status: VoiceStatus;
  latencyMs?: number;
  error?: string;
}

export type Phase = "idle" | "answering" | "clustering" | "done" | "error";

export interface RunState {
  phase: Phase;
  isDemo: boolean;
  question: string;
  models: string[];
  voices: Voice[];
  clusters: Cluster[];
  agreement?: Agreement;
  summary?: string;
  dissent: DissentNote[];
  failures: { model: string; error: string }[];
  error?: string;
}

const empty: RunState = {
  phase: "idle",
  isDemo: false,
  question: "",
  models: [],
  voices: [],
  clusters: [],
  dissent: [],
  failures: [],
};

type Action =
  | { kind: "reset" }
  | { kind: "start"; question: string; isDemo: boolean }
  | { kind: "event"; event: CrossCheckEvent };

function patchVoice(voices: Voice[], model: string, patch: Partial<Voice>): Voice[] {
  return voices.map((v) => (v.model === model ? { ...v, ...patch } : v));
}

function reduce(state: RunState, action: Action): RunState {
  switch (action.kind) {
    case "reset":
      return empty;
    case "start":
      return { ...empty, phase: "answering", question: action.question, isDemo: action.isDemo };
    case "event": {
      const ev = action.event;
      switch (ev.type) {
        case "run_started":
          return {
            ...state,
            models: ev.models,
            question: ev.question,
            voices: ev.models.map((model) => ({ model, text: "", status: "pending" as const })),
          };
        case "model_started":
          return { ...state, voices: patchVoice(state.voices, ev.model, { status: "streaming" }) };
        case "model_token":
          return {
            ...state,
            voices: state.voices.map((v) =>
              v.model === ev.model ? { ...v, status: "streaming", text: v.text + ev.token } : v,
            ),
          };
        case "model_completed":
          return {
            ...state,
            voices: patchVoice(state.voices, ev.model, {
              status: "done",
              text: ev.answer,
              latencyMs: ev.latencyMs,
            }),
          };
        case "model_failed":
          return {
            ...state,
            voices: patchVoice(state.voices, ev.model, { status: "failed", error: ev.error }),
            failures: [...state.failures, { model: ev.model, error: ev.error }],
          };
        case "clustering_started":
          return { ...state, phase: "clustering" };
        case "cluster":
          return { ...state, clusters: [...state.clusters, ev.cluster] };
        case "consensus":
          return { ...state, agreement: ev.agreement, summary: ev.summary };
        case "dissent":
          return { ...state, dissent: [...state.dissent, ev.note] };
        case "run_completed":
          return {
            ...state,
            phase: "done",
            agreement: ev.report.agreement,
            summary: ev.report.summary,
            clusters: ev.report.clusters,
            dissent: ev.report.dissent,
            failures: ev.report.failures,
          };
        case "error":
          return { ...state, phase: "error", error: ev.message };
      }
    }
  }
}

export function useCrossCheck() {
  const [state, dispatch] = useReducer(reduce, empty);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (question: string, apiKey: string, models?: string[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ kind: "start", question, isDemo: false });
    try {
      for await (const event of runCrossCheck({
        question,
        apiKey,
        models,
        signal: ctrl.signal,
        title: "CrossCheckAI Web",
        referer: typeof location !== "undefined" ? location.origin : undefined,
      })) {
        dispatch({ kind: "event", event });
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        dispatch({
          kind: "event",
          event: { type: "error", scope: "run", message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }, []);

  const runDemo = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ kind: "start", question: "", isDemo: true });
    await replayDemo((event) => dispatch({ kind: "event", event }), ctrl.signal);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ kind: "reset" });
  }, []);

  return { state, run, runDemo, reset };
}
