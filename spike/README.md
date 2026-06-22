# Phase 0 spike

Throwaway. Proves the one hard idea — judge-based **semantic clustering** of
multiple models' answers into positions — before any packaging exists
(see [`../CLAUDE.md`](../CLAUDE.md) §8 Phase 0). It is deleted before Phase 2.

## Run

```bash
cd spike
npm install                      # tsx + typescript only
cp ../.env.example ../.env       # then paste your OpenRouter key into ../.env
npm run spike -- "your question"
```

Or with the key inline, from the repo root:

```bash
OPENROUTER_API_KEY=sk-or-... npx tsx spike/spike.ts "your question"
```

## The gate (do not skip)

Run it against **at least 5 of your own real "I wasn't sure" questions**. The
clustering must be obviously sane to you: genuine agreements land in one
position, genuine disagreements split into separate positions. If clustering is
wrong, iterate on the judge prompt in `spike.ts` (`buildClusterPrompt`) — cheaply,
here, before Phase 1 exists.

## Overrides

```bash
MODELS="anthropic/claude-opus-4.8,openai/gpt-5.5,x-ai/grok-4.3" npx tsx spike/spike.ts "..."
JUDGE_MODEL="google/gemini-3.1-pro-preview" npx tsx spike/spike.ts "..."
```
