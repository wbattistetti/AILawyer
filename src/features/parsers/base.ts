import type { PageInput, ThingOut, DetectFn } from './types'

export type JobType = 'ocr' | 'entities' | 'contacts' | 'vehicles' | 'events'

export interface Parser<T = ThingOut> {
  id: JobType | string
  init?(ctx: { praticaId?: string }): Promise<void> | void
  parsePage(ctx: PageInput, signal: AbortSignal): Promise<T[] | void> | (T[] | void)
  finalize?(ctx: { praticaId?: string }): Promise<void> | void
}

export function fromDetectFn(id: JobType | string, fn: DetectFn): Parser<ThingOut> {
  return {
    id,
    async parsePage(ctx: PageInput, signal: AbortSignal) {
      if (signal.aborted) return []
      try { return fn(ctx) } catch { return [] }
    }
  }
}


