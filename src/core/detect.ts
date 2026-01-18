// src/core/detect.ts
import type { BotFamily } from "../types";

export type BotType = "training" | "search" | "user";
export type Confidence = "high" | "medium" | "low";

export type DetectionResult = {
  family: BotFamily;
  type: BotType;
  confidence: Confidence;
  reason: "ua_match";
};

const RULES: Array<{
  family: BotFamily;
  type: BotType;
  patterns: RegExp[];
  confidence?: Confidence;
}> = [
  // --- OpenAI ---
  { family: "openai", type: "training", patterns: [/gptbot/i], confidence: "high" },
  { family: "openai", type: "search", patterns: [/oai-searchbot/i], confidence: "high" },
  { family: "openai", type: "user", patterns: [/chatgpt-user/i], confidence: "high" },

  // --- Perplexity ---
  { family: "perplexity", type: "search", patterns: [/perplexitybot/i], confidence: "high" },
  { family: "perplexity", type: "user", patterns: [/perplexity-user/i], confidence: "high" },

  // --- Anthropic (Claude) ---
  { family: "anthropic", type: "training", patterns: [/claudebot/i], confidence: "high" },

  // --- Google (Gemini / AI training controls) ---
  { family: "google", type: "training", patterns: [/google-extended/i], confidence: "high" },
];

export function detectBot(userAgent: string): DetectionResult | null {
  const ua = String(userAgent || "");
  for (const r of RULES) {
    for (const p of r.patterns) {
      if (p.test(ua)) {
        return {
          family: r.family,
          type: r.type,
          confidence: r.confidence ?? "medium",
          reason: "ua_match",
        };
      }
    }
  }
  return null;
}
