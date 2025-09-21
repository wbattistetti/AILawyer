type Level = 'debug' | 'info' | 'warn' | 'error'

const lastByEvent: Record<string, number> = {}

export function log(level: Level, event: string, data?: unknown, opts?: { rateMs?: number }) {
  try {
    const enabled = (window as any).__ANALYSIS_LOG || import.meta.env.DEV
    if (!enabled) return
    const now = performance.now()
    const rate = typeof opts?.rateMs === 'number' ? opts.rateMs : 120
    const last = lastByEvent[event] || 0
    if (now - last < rate) return
    lastByEvent[event] = now
    const line = `[LOG][${level.toUpperCase()}] ${event}`
    // eslint-disable-next-line no-console
    ;(console as any)[level] ? (console as any)[level](line, data ?? '') : console.log(line, data ?? '')
  } catch {}
}

export const logger = {
  debug: (e: string, d?: unknown, o?: { rateMs?: number }) => log('debug', e, d, o),
  info: (e: string, d?: unknown, o?: { rateMs?: number }) => log('info', e, d, o),
  warn: (e: string, d?: unknown, o?: { rateMs?: number }) => log('warn', e, d, o),
  error: (e: string, d?: unknown, o?: { rateMs?: number }) => log('error', e, d, o),
}


