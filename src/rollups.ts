import type { BotFamily } from "./types";

export function hourBucketUTC(isoTs: string) {
  // "2026-01-17T16:29:03.416Z" -> "2026-01-17T16"
  return isoTs.slice(0, 13);
}

export async function incrHourlyRollup(
  kv: KVNamespace,
  hostKey: string,
  fam: BotFamily,
  isoTs: string
) {
  const hour = hourBucketUTC(isoTs);
  const key = `rollup:${hostKey}:${fam}:${hour}`;

  const cur = Number((await kv.get(key)) || "0");
  await kv.put(key, String(cur + 1));
}

function hoursBackUTC(n: number) {
  const out: string[] = [];
  const now = new Date();

  for (let i = 0; i < n; i++) {
    const t = new Date(now.getTime() - i * 3600_000);
    out.push(t.toISOString().slice(0, 13)); // "YYYY-MM-DDTHH"
  }
  return out.reverse();
}

export async function readHourlyRollups(
  kv: KVNamespace,
  hostKey: string,
  fam: BotFamily,
  range: "24h" | "7d" | "30d"
) {
  const hours = range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 24;

  const buckets = hoursBackUTC(hours);
  const series: Array<{ hour: string; count: number }> = [];

  for (const b of buckets) {
    const key = `rollup:${hostKey}:${fam}:${b}`;
    const count = Number((await kv.get(key)) || "0");
    series.push({ hour: b, count });
  }

  const total = series.reduce((sum, x) => sum + x.count, 0);

  return { range, total, series };
}
