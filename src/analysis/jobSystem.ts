export type JobType = 'ocr' | 'entities' | 'contacts' | 'vehicles' | 'events'

export type JobStatus = 'idle' | 'running' | 'success' | 'error' | 'canceled'

export type Job = {
  id: string
  docId: string
  type: JobType
  status: JobStatus
  progress: number
  error?: string
}

type QueueItem = {
  job: Job
  ctrl: AbortController
  run: (ctx: { signal: AbortSignal; report: (pct: number) => void }) => Promise<void>
}

const queues = new Map<string, { running: QueueItem | null; q: QueueItem[] }>()
const listeners = new Set<(j: Job) => void>()

function ensure(docId: string) {
  let entry = queues.get(docId)
  if (!entry) { entry = { running: null, q: [] }; queues.set(docId, entry) }
  return entry
}

function emit(j: Job) {
  for (const l of Array.from(listeners)) {
    try { l(j) } catch {}
  }
}

async function pump(docId: string) {
  const entry = ensure(docId)
  if (entry.running || entry.q.length === 0) return
  const item = entry.q.shift()!
  entry.running = item
  item.job.status = 'running'; item.job.progress = Math.max(item.job.progress, 0.0001)
  emit(item.job)
  try {
    const report = (pct: number) => { item.job.progress = Math.max(0, Math.min(1, pct)); emit(item.job) }
    await item.run({ signal: item.ctrl.signal, report })
    if (item.ctrl.signal.aborted) {
      item.job.status = 'canceled'
    } else {
      item.job.status = 'success'; item.job.progress = 1
    }
  } catch (e: any) {
    if (item.ctrl.signal.aborted) { item.job.status = 'canceled' }
    else { item.job.status = 'error'; item.job.error = String(e?.message || e || 'error') }
  } finally {
    emit(item.job)
    entry.running = null
    // next
    if (entry.q.length > 0) pump(docId)
  }
}

export const jobSystem = {
  on(listener: (j: Job) => void) { listeners.add(listener); return () => listeners.delete(listener) },
  enqueue(docId: string, type: JobType, run: (ctx: { signal: AbortSignal; report: (pct: number) => void }) => Promise<void>) {
    const id = `${docId}:${type}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`
    const job: Job = { id, docId, type, status: 'idle', progress: 0 }
    const ctrl = new AbortController()
    const qi: QueueItem = { job, ctrl, run }
    const entry = ensure(docId)
    entry.q.push(qi)
    emit(job)
    pump(docId)
    return { id, abort: () => ctrl.abort() }
  },
  cancelDoc(docId: string) {
    const entry = ensure(docId)
    if (entry.running) entry.running.ctrl.abort()
    for (const it of entry.q) it.ctrl.abort()
    entry.q = []
  },
  getDocQueue(docId: string) {
    const entry = ensure(docId)
    return { running: entry.running?.job || null, queued: entry.q.map(q => q.job) }
  }
}


