// src/config.ts
import { sha256Hex } from "./auth";

export type HostConfig = {
  customer: string;
  site_id: string;

  // Restrict reads/writes to these hostnames (recommended).
  // Example: ["www.adidas.com", "m.adidas.com"]
  allowed_hosts?: string[];

  // Store only hashes (SHA-256 hex)
  dashboard_key_hash?: string;
  ingest_key_hash?: string;

  updated_at?: string;
};

const keyForHost = (host: string) => `cfg:${host.toLowerCase()}`;

export async function getHostConfig(
  kv: KVNamespace,
  host: string
): Promise<HostConfig | null> {
  const raw = await kv.get(keyForHost(host));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HostConfig;
  } catch {
    return null;
  }
}

export type SetHostConfigInput = {
  customer: string;
  site_id: string;
  allowed_hosts?: string[];

  // Plain keys come in ONLY here; we hash them before storing.
  dashboard_key?: string;
  ingest_key?: string;
};

export async function setHostConfig(
  kv: KVNamespace,
  host: string,
  input: SetHostConfigInput
): Promise<HostConfig> {
  const existing = await getHostConfig(kv, host);

  const next: HostConfig = {
    customer: input.customer ?? existing?.customer ?? "",
    site_id: input.site_id ?? existing?.site_id ?? "",
    allowed_hosts: input.allowed_hosts ?? existing?.allowed_hosts,
    dashboard_key_hash: existing?.dashboard_key_hash,
    ingest_key_hash: existing?.ingest_key_hash,
    updated_at: new Date().toISOString(),
  };

  // If keys are provided, hash and store
  if (typeof input.dashboard_key === "string" && input.dashboard_key.trim()) {
    next.dashboard_key_hash = await sha256Hex(input.dashboard_key.trim());
  }
  if (typeof input.ingest_key === "string" && input.ingest_key.trim()) {
    next.ingest_key_hash = await sha256Hex(input.ingest_key.trim());
  }

  await kv.put(keyForHost(host), JSON.stringify(next));
  return next;
}

export function hostAllowed(cfg: HostConfig | null, host: string): boolean {
  if (!cfg) return false;
  const h = host.toLowerCase();

  // If allowed_hosts is not set, default to exact host only (safe).
  if (!cfg.allowed_hosts || cfg.allowed_hosts.length === 0) return true;

  return cfg.allowed_hosts.map((x) => x.toLowerCase()).includes(h);
}

// helper for responses (avoid leaking hashes)
export function toPublicConfig(cfg: HostConfig | null) {
  if (!cfg) return null;
  return {
    customer: cfg.customer,
    site_id: cfg.site_id,
    allowed_hosts: cfg.allowed_hosts ?? [],
    updated_at: cfg.updated_at ?? null,
    has_dashboard_key: Boolean(cfg.dashboard_key_hash),
    has_ingest_key: Boolean(cfg.ingest_key_hash),
  };
}
