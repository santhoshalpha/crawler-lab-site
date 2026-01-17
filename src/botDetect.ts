import type { BotFamily, BotType, Confidence } from "./types";

const BOT_RULES: Array<{
  family: BotFamily;
  type: BotType;
  tokens: string[];
}> = [
  { family: "openai", type: "training", tokens: ["GPTBot"] },
  { family: "openai", type: "search", tokens: ["OAI-SearchBot"] },
  { family: "openai", type: "user", tokens: ["ChatGPT-User"] },

  { family: "perplexity", type: "search", tokens: ["PerplexityBot"] },
  { family: "perplexity", type: "user", tokens: ["Perplexity-User"] },

  { family: "anthropic", type: "training", tokens: ["ClaudeBot"] },
  { family: "anthropic", type: "search", tokens: ["Claude-SearchBot"] },
  { family: "anthropic", type: "user", tokens: ["Claude-User"] },
];

export function detectBot(uaRaw: string | null): null | {
  family: BotFamily;
  type: BotType;
  confidence: Confidence;
  reason: string;
} {
  const ua = (uaRaw || "").toLowerCase();
  for (const r of BOT_RULES) {
    if (r.tokens.some(t => ua.includes(t.toLowerCase()))) {
      // v1: UA match only -> medium confidence
      return { family: r.family, type: r.type, confidence: "medium", reason: "ua_match" };
    }
  }
  return null;
}
