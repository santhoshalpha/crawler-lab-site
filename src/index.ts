import { detectBot } from "./botDetect";
import type { BotHit, BotFamily } from "./types";
import { tenantKeyFromHost, getClientIp, recordHit, readStats } from "./kv";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

export default {
  async fetch(request: Request, env: { CRAWLER_KV: KVNamespace }, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // APIs
    if (url.pathname === "/api/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    const hostKey = tenantKeyFromHost(url.hostname);

    if (url.pathname === "/api/events") {
      const raw = await env.CRAWLER_KV.get(`events:recent:${hostKey}`);
      const events = raw ? JSON.parse(raw) : [];
      return json({ ok: true, host: url.hostname, count: events.length, events });
    }

    if (url.pathname === "/api/stats") {
      const families: BotFamily[] = ["openai", "perplexity", "anthropic"];
      const stats: Record<string, any> = {};
      for (const fam of families) stats[fam] = await readStats(env.CRAWLER_KV, hostKey, fam);
      return json({ ok: true, host: url.hostname, stats });
    }

    // Detect + log
    const ua = request.headers.get("User-Agent") || "";
    const d = detectBot(ua);

    if (d) {
      const hit: BotHit = {
        ts: new Date().toISOString(),
        ip: getClientIp(request),
        ua,
        host: url.hostname,
        path: url.pathname,
        method: request.method,
        country: (request as any).cf?.country ?? null,
        colo: (request as any).cf?.colo ?? null,
        bot_family: d.family,
        bot_type: d.type,
        confidence: d.confidence,
        reason: d.reason,
      };

      ctx.waitUntil(recordHit(env.CRAWLER_KV, hostKey, hit));
    }

    // Site response (keep it simple for now)
    if (url.pathname === "/") return new Response("hello world", { status: 200 });
    return new Response("ok", { status: 200 });
  },
};
