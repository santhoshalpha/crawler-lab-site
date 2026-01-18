import { detectBot } from "./botDetect";
import type { BotHit, BotFamily } from "./types";
import { tenantKeyFromHost, getClientIp, recordHit, readStats } from "./kv";
import { getHostConfig, setHostConfig, hostAllowed, toPublicConfig } from "./config";
import { readHourlyRollups } from "./rollups";
import { normalizeKey, unauthorized, forbidden, verifyKeyOrNull } from "./auth";

/* ---------------- helpers ---------------- */

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

function badRequest(msg: string) {
  return json({ ok: false, error: msg }, { status: 400 });
}

/* ---------------- worker ---------------- */

export default {
  async fetch(
    request: Request,
    env: {
      CRAWLER_KV: KVNamespace;

      // global admin key only you know (wrangler secret)
      ADMIN_KEY: string;

      // optional global fallback keys during transition (not required)
      INGEST_KEY?: string;
      DASHBOARD_KEY?: string;
    },
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);

    // worker host (where this worker is running)
    const host = url.hostname;

    // tenant host (can be overridden via ?host=... for querying other sites)
    const tenantHost = url.searchParams.get("host") || host;
    const hostKey = tenantKeyFromHost(tenantHost);

    /* ---------- health ---------- */
    if (url.pathname === "/api/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    /* ---------- admin auth helper ---------- */
    const requireAdmin = () => {
      const k = normalizeKey(request.headers.get("x-admin-key"));
      if (!env.ADMIN_KEY || k !== env.ADMIN_KEY) return unauthorized("admin_unauthorized");
      return null;
    };

    /* ---------- config (admin only) ---------- */
    if (url.pathname === "/api/config" && request.method === "GET") {
      // Read config should be protected too (either admin or tenant dashboard key).
      // We’ll allow admin OR dashboard key.
      const cfg = await getHostConfig(env.CRAWLER_KV, tenantHost);

      const adminErr = requireAdmin();
      if (!adminErr) {
        return json({ ok: true, host: tenantHost, config: toPublicConfig(cfg) });
      }

      // Not admin -> try dashboard key
      const dashKey = normalizeKey(request.headers.get("x-dashboard-key"));
      const okDash =
        (cfg && (await verifyKeyOrNull(dashKey, cfg.dashboard_key_hash))) ||
        (env.DASHBOARD_KEY ? await verifyKeyOrNull(dashKey, await crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(env.DASHBOARD_KEY))
          .then((b) => Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join(""))
        ) : false);

      if (!okDash) return unauthorized("dashboard_unauthorized");

      return json({ ok: true, host: tenantHost, config: toPublicConfig(cfg) });
    }

    if (url.pathname === "/api/config" && request.method === "POST") {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const body = (await request.json()) as any;
      if (!body || typeof body.customer !== "string" || typeof body.site_id !== "string") {
        return badRequest("config requires { customer: string, site_id: string }");
      }

      // Optional: keys + allowed_hosts
      const input = {
        customer: String(body.customer),
        site_id: String(body.site_id),
        allowed_hosts: Array.isArray(body.allowed_hosts)
          ? body.allowed_hosts.map((x: any) => String(x))
          : undefined,
        dashboard_key: typeof body.dashboard_key === "string" ? body.dashboard_key : undefined,
        ingest_key: typeof body.ingest_key === "string" ? body.ingest_key : undefined,
      };

      const saved = await setHostConfig(env.CRAWLER_KV, tenantHost, input);
      return json({ ok: true, host: tenantHost, config: toPublicConfig(saved) });
    }

    /* ---------- clear recent events (admin only) ---------- */
    if (url.pathname === "/api/events/clear" && request.method === "POST") {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      await env.CRAWLER_KV.put(`events:recent:${hostKey}`, JSON.stringify([]));
      return json({ ok: true, host: tenantHost, cleared: true });
    }

    /* ---------- tenant auth (dashboard) ---------- */
    async function requireDashboardFor(tenant: string): Promise<Response | null> {
      const cfg = await getHostConfig(env.CRAWLER_KV, tenant);
      if (!cfg) return unauthorized("tenant_not_configured");

      if (!hostAllowed(cfg, tenant)) return forbidden("host_not_allowed");

      const provided = normalizeKey(request.headers.get("x-dashboard-key"));
      const ok = await verifyKeyOrNull(provided, cfg.dashboard_key_hash);

      // optional transition fallback
      if (!ok && env.DASHBOARD_KEY) {
        if (provided === env.DASHBOARD_KEY) return null;
      }

      return ok ? null : unauthorized("dashboard_unauthorized");
    }

    /* ---------- events (requires dashboard key) ---------- */
    if (url.pathname === "/api/events") {
      const authErr = await requireDashboardFor(tenantHost);
      if (authErr) return authErr;

      const raw = await env.CRAWLER_KV.get(`events:recent:${hostKey}`);
      const events: BotHit[] = raw ? (JSON.parse(raw) as BotHit[]) : [];

      return json({
        ok: true,
        host: tenantHost,
        count: events.length,
        events,
      });
    }

    /* ---------- stats (requires dashboard key) ---------- */
    if (url.pathname === "/api/stats") {
      const authErr = await requireDashboardFor(tenantHost);
      if (authErr) return authErr;

      const families: BotFamily[] = ["openai", "perplexity", "anthropic", "google"];
      const stats: Record<string, any> = {};

      for (const fam of families) {
        stats[fam] = await readStats(env.CRAWLER_KV, hostKey, fam);
      }

      const cfg = await getHostConfig(env.CRAWLER_KV, tenantHost);

      return json({
        ok: true,
        host: tenantHost,
        customer: cfg?.customer ?? null,
        site_id: cfg?.site_id ?? null,
        stats,
      });
    }

    /* ---------- rollups (requires dashboard key) ---------- */
    if (url.pathname === "/api/rollups") {
      const authErr = await requireDashboardFor(tenantHost);
      if (authErr) return authErr;

      const range = (url.searchParams.get("range") || "24h") as "24h" | "7d" | "30d";
      const family = (url.searchParams.get("family") || "openai") as BotFamily;

      if (!["24h", "7d", "30d"].includes(range)) {
        return badRequest("invalid range. use 24h, 7d, or 30d");
      }
      if (!["openai", "perplexity", "anthropic", "google"].includes(family)) {
        return badRequest("invalid family. use openai, perplexity, anthropic, google");
      }

      const cfg = await getHostConfig(env.CRAWLER_KV, tenantHost);
      const data = await readHourlyRollups(env.CRAWLER_KV, hostKey, family, range);

      return json({
        ok: true,
        host: tenantHost,
        customer: cfg?.customer ?? null,
        site_id: cfg?.site_id ?? null,
        family,
        ...data,
      });
    }

    /* ---------- ingest (central endpoint) ---------- */
    if (url.pathname === "/api/ingest" && request.method === "POST") {
      const payload = (await request.json()) as any;

      if (!payload || typeof payload.ua !== "string") {
        return badRequest("payload requires at least { ua: string }");
      }

      const ingestTenantHost = typeof payload.host === "string" && payload.host.trim()
        ? payload.host.trim()
        : host;

      // tenant key for storage
      const ingestHostKey = tenantKeyFromHost(ingestTenantHost);

      const cfg = await getHostConfig(env.CRAWLER_KV, ingestTenantHost);
      if (!cfg) return unauthorized("tenant_not_configured");

      if (!hostAllowed(cfg, ingestTenantHost)) return forbidden("host_not_allowed");

      // verify ingest key
      const provided = normalizeKey(request.headers.get("x-ingest-key"));
      const okIngest = await verifyKeyOrNull(provided, cfg.ingest_key_hash);

      // optional transition fallback
      if (!okIngest && env.INGEST_KEY) {
        if (provided !== env.INGEST_KEY) return unauthorized("ingest_unauthorized");
      } else if (!okIngest && !env.INGEST_KEY) {
        return unauthorized("ingest_unauthorized");
      }

      const d = detectBot(payload.ua || "");
      if (!d) return json({ ok: true, ignored: true });

      const hit: BotHit = {
        ts: typeof payload.ts === "string" ? payload.ts : new Date().toISOString(),
        ip: payload.ip ?? null,
        ua: payload.ua || "",
        host: ingestTenantHost,
        path: typeof payload.path === "string" ? payload.path : "/",
        method: typeof payload.method === "string" ? payload.method : "GET",
        country: payload.country ?? null,
        colo: payload.colo ?? null,
        bot_family: d.family,
        bot_type: d.type,
        confidence: d.confidence,
        reason: d.reason,
      };

      ctx.waitUntil(recordHit(env.CRAWLER_KV, ingestHostKey, hit));
      return json({ ok: true, stored: true, family: d.family, type: d.type });
    }

    /* ---------- detection + logging (native cloudflare traffic) ---------- */
    const ua = request.headers.get("User-Agent") || "";
    const detected = detectBot(ua);

    if (detected) {
      const hit: BotHit = {
        ts: new Date().toISOString(),
        ip: getClientIp(request),
        ua,
        host, // native worker host
        path: url.pathname,
        method: request.method,
        country: (request as any).cf?.country ?? null,
        colo: (request as any).cf?.colo ?? null,
        bot_family: detected.family,
        bot_type: detected.type,
        confidence: detected.confidence,
        reason: detected.reason,
      };

      const nativeHostKey = tenantKeyFromHost(host);
      ctx.waitUntil(recordHit(env.CRAWLER_KV, nativeHostKey, hit));
    }

    /* ---------- site response ---------- */
    if (url.pathname === "/") return new Response("hello world", { status: 200 });
    return new Response("ok", { status: 200 });
  },
};
