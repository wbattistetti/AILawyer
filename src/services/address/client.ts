import { preclean } from './preclean';
import { lru } from './lru';
import type { Address, AddressType } from './types';

const cache = lru<string, Address>(500);
const SVC = 'http://127.0.0.1:8099/normalize';

async function fetchWithTimeout(input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 120, ...rest } = init as any;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(rest as any), signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

let failures = 0, openUntil = 0;

export async function normalizeAddress(type: AddressType, text: string, ctx?: { last_place?: string }): Promise<Address | null> {
  const cleaned = preclean(text);
  const key = `${type}|${cleaned}|${ctx?.last_place ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const now = Date.now();
  if (now < openUntil) return null;

  try {
    const r = await fetchWithTimeout(SVC, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ type, text, context: { last_place: ctx?.last_place } }),
      timeoutMs: 150
    } as any);
    if (!r.ok) throw new Error(`svc ${r.status}`);
    const j = await r.json();
    failures = 0;
    if (j?.ok && j.address) { cache.set(key, j.address as Address); return j.address as Address; }
  } catch {
    failures++;
    if (failures >= 3) { openUntil = now + 60_000; failures = 0; }
  }
  return null;
}




