import type { EventRecord } from './types'

const NLP_BASE = (import.meta as any).env?.VITE_NLP_BASE || 'http://127.0.0.1:8098'

function linkSignals(userSignal?: AbortSignal, timeoutMs = 800) {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs)
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort()
    else userSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return { signal: ctrl.signal, dispose: () => clearTimeout(timeoutId) }
}

export async function extractEvents(
  text: string,
  meta?: Record<string, any>,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ ok: boolean; events: EventRecord[]; latency_ms?: number }> {
  const { signal, dispose } = linkSignals(opts?.signal, opts?.timeoutMs ?? 800)
  try {
    const res = await fetch(`${NLP_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, meta }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const events: EventRecord[] = (data?.events || []).map((e: any, i: number) => ({ id: e.id || `evt_${i}`, ...e }))
    return { ok: true, events, latency_ms: data?.latency_ms }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[NLP][client] error', e)
    return { ok: false, events: [] }
  } finally {
    dispose()
  }
}

export async function extractEventsBatch(
  items: { text: string; meta?: Record<string, any> }[],
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ ok: boolean; results: Array<{ ok: boolean; events: EventRecord[]; meta: Record<string, any> }>; latency_ms?: number }>{
  const { signal, dispose } = linkSignals(opts?.signal, opts?.timeoutMs ?? 800)
  try {
    const res = await fetch(`${NLP_BASE}/events/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const results = (data?.results || []).map((r: any) => ({ ok: !!r.ok, events: (r.events || []).map((e: any) => ({ ...e })), meta: r.meta || {} }))
    return { ok: true, results, latency_ms: data?.latency_ms }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[NLP][client] error', e)
    return { ok: false, results: [] as any[] }
  } finally {
    dispose()
  }
}
