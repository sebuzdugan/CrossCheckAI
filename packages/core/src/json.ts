/** Pull a JSON object out of a model response that may include fences or prose. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/** Like {@link extractJson} but returns null instead of throwing. */
export function extractJsonSafe(text: string): unknown | null {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}
