import type { BotFamily, BotHit, BotType } from "./types";
import { incrHourlyRollup } from "./rollups";

export function tenantKeyFromHost(host: string) {
  // v1: each hostname = one tenant/site
  return host.toLowerCase();
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    null
  );
}

export async function kvNumGet(kv: KVNamespace, key: string) {
  return Number((await kv.get(key)) || "0");
}

export async function kvIncr(kv: KVNamespace, key: string, by = 1) {
  const next = (await kvNumGet(kv, key)) + by;
  await kv.put(key, String(next));
  return next;
}

export async function kvPushEvent(kv: KVNamespace, key: string, event: BotHit, max = 200) {
  const raw = await kv.get(key);
  const arr: BotHit[] = raw ? JSON.parse(raw) : [];
  arr.push(event);
  const sliced = arr.length > max ? arr.slice(arr.length - max) : arr;
  await kv.put(key, JSON.stringify(sliced));
}

export async function recordHit(kv: KVNamespace, hostKey: string, hit: BotHit) {
  const fam = hit.bot_family;
  const type = hit.bot_type;

  await kvIncr(kv, `stats:${hostKey}:${fam}:total`);
  await kvIncr(kv, `stats:${hostKey}:${fam}:${type}`);
  await kv.put(`stats:${hostKey}:${fam}:last_seen`, hit.ts);
await incrHourlyRollup(kv, hostKey, fam, hit.ts);
  // per-path
  await kvIncr(kv, `stats:${hostKey}:${fam}:path:${hit.path}`);

  // top paths (approx map)
  const rawMap = await kv.get(`stats:${hostKey}:${fam}:top_paths_raw`);
  const map: Record<string, number> = rawMap ? JSON.parse(rawMap) : {};
  map[hit.path] = (map[hit.path] || 0) + 1;
  await kv.put(`stats:${hostKey}:${fam}:top_paths_raw`, JSON.stringify(map));

  const top = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));
  await kv.put(`stats:${hostKey}:${fam}:top_paths`, JSON.stringify(top));

  await kvPushEvent(kv, `events:recent:${hostKey}`, hit, 200);
}

export async function readStats(kv: KVNamespace, hostKey: string, fam: BotFamily) {
  return {
    total: await kvNumGet(kv, `stats:${hostKey}:${fam}:total`),
    training: await kvNumGet(kv, `stats:${hostKey}:${fam}:training`),
    search: await kvNumGet(kv, `stats:${hostKey}:${fam}:search`),
    user: await kvNumGet(kv, `stats:${hostKey}:${fam}:user`),
    last_seen: await kv.get(`stats:${hostKey}:${fam}:last_seen`),
    top_paths: await kv.get(`stats:${hostKey}:${fam}:top_paths`)
      ? JSON.parse((await kv.get(`stats:${hostKey}:${fam}:top_paths`))!)
      : [],
  };
}
