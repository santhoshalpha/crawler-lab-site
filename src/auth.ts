// src/auth.ts

export type KeyKind = "dashboard" | "ingest";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return toHex(hash);
}

export function normalizeKey(headerVal: string | null): string {
  return String(headerVal || "").trim();
}

export function unauthorized(msg = "unauthorized"): Response {
  return new Response(
    JSON.stringify({ ok: false, error: msg }, null, 2),
    {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  );
}

export function forbidden(msg = "forbidden"): Response {
  return new Response(
    JSON.stringify({ ok: false, error: msg }, null, 2),
    {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  );
}

export async function verifyKeyOrNull(
  providedPlain: string,
  expectedHash: string | null | undefined
): Promise<boolean> {
  if (!expectedHash) return false;
  if (!providedPlain) return false;
  const h = await sha256Hex(providedPlain);
  return h === expectedHash;
}
