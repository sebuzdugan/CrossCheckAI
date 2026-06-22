/**
 * Thin OpenRouter client. Isomorphic: relies only on global `fetch`,
 * `ReadableStream`, and `TextDecoder`, all present in Node 18+ and modern browsers.
 * One key → every model.
 */
import type { TokenUsage } from "./types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterOpts {
  apiKey: string;
  signal?: AbortSignal;
  referer?: string;
  title?: string;
  timeoutMs?: number;
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

function buildHeaders(o: OpenRouterOpts): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${o.apiKey}`,
    "Content-Type": "application/json",
  };
  // Optional attribution (shown on the OpenRouter dashboard).
  if (o.title) h["X-Title"] = o.title;
  if (o.referer) h["HTTP-Referer"] = o.referer;
  return h;
}

function normalizeUsage(u?: RawUsage): TokenUsage | undefined {
  if (!u) return undefined;
  return { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0 };
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  const detail = body ? ` — ${body.slice(0, 240)}` : "";
  return `OpenRouter HTTP ${res.status} ${res.statusText}${detail}`;
}

/**
 * Merge a caller-supplied AbortSignal with an internal timeout. Returns the
 * combined signal and a cleanup function to clear the timer.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: ctrl.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** Non-streaming completion. Used for the judge (clustering + dissent). */
export async function chat(
  model: string,
  messages: ChatMessage[],
  o: OpenRouterOpts,
): Promise<{ content: string; usage?: TokenUsage }> {
  const { signal, cleanup } = withTimeout(o.signal, o.timeoutMs ?? 120_000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: buildHeaders(o),
      body: JSON.stringify({ model, messages }),
      signal,
    });
    if (!res.ok) throw new Error(await errorText(res));
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: RawUsage;
    };
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("empty completion");
    return { content, usage: normalizeUsage(data.usage) };
  } finally {
    cleanup();
  }
}

/**
 * Streaming completion. Used for panelists so tokens reach the UI live.
 * Yields content deltas; the caller concatenates them into the final answer.
 */
export async function* streamChat(
  model: string,
  messages: ChatMessage[],
  o: OpenRouterOpts,
): AsyncGenerator<string> {
  const { signal, cleanup } = withTimeout(o.signal, o.timeoutMs ?? 120_000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: buildHeaders(o),
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
    if (!res.ok) throw new Error(await errorText(res));
    if (!res.body) throw new Error("no response body for stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.startsWith("data:")) continue; // skip SSE comments / keep-alives
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // partial/non-JSON frame — ignore
        }
      }
    }
  } finally {
    cleanup();
  }
}
