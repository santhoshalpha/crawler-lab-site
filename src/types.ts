export type BotFamily = "openai" | "perplexity" | "anthropic";
export type BotType = "training" | "search" | "user";
export type Confidence = "high" | "medium" | "low";

export type BotHit = {
  ts: string;
  ip: string | null;
  ua: string;
  host: string;
  path: string;
  method: string;
  country?: string | null;
  colo?: string | null;
  bot_family: BotFamily;
  bot_type: BotType;
  confidence: Confidence;
  reason: string;
};
