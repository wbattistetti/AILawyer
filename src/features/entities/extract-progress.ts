/**
 * Stima e formattazione del progresso estrazione anagrafiche / entità.
 */

const DEFAULT_SAMPLE_WINDOW = 8
const DEFAULT_MIN_PAGES_FOR_ETA = 5

/** Progresso compatto da mostrare sulla tab del dock. */
export type ExtractionTabProgress = {
  pct: number
  label: string
  done: number
  total: number
}

/** Formatta millisecondi in stringa compatta (es. `45s`, `2m 05s`). */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** Aggiunge un campione di durata pagina, mantenendo solo gli ultimi N. */
export function pushPageSample(
  samples: number[],
  durationMs: number,
  max = DEFAULT_SAMPLE_WINDOW
): number[] {
  if (!Number.isFinite(durationMs) || durationMs < 0) return samples
  const next = [...samples, durationMs]
  return next.length > max ? next.slice(-max) : next
}

/** Media aritmetica dei campioni, oppure null se vuoti. */
export function averageMs(samples: number[]): number | null {
  if (samples.length === 0) return null
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

/**
 * Stima i ms rimanenti con media mobile sulle pagine.
 * Restituisce null finché non ci sono abbastanza campioni.
 */
export function estimateRemainingMs(
  pagesDone: number,
  pagesTotal: number,
  avgMsPerPage: number | null,
  minPagesForEta = DEFAULT_MIN_PAGES_FOR_ETA
): number | null {
  if (avgMsPerPage == null || pagesDone < minPagesForEta) return null
  if (pagesTotal <= 0) return null
  const remaining = Math.max(0, pagesTotal - pagesDone)
  return remaining * avgMsPerPage
}

/**
 * Calcola percentuale e etichetta per la progress bar della tab.
 * Preferisce le pagine quando disponibili, altrimenti i documenti.
 */
export function computeExtractionTabProgress(input: {
  docsDone: number
  docsTotal: number
  pagesDone?: number
  pagesTotal?: number
  currentTitle?: string
  phaseLabel?: string
}): ExtractionTabProgress {
  const docsTotal = Math.max(0, input.docsTotal)
  const docsDone = Math.max(0, Math.min(input.docsDone, docsTotal || input.docsDone))
  const pagesTotal = Math.max(0, input.pagesTotal ?? 0)
  const pagesDone = Math.max(0, Math.min(input.pagesDone ?? 0, pagesTotal || (input.pagesDone ?? 0)))

  const usePages = pagesTotal > 0
  const done = usePages ? pagesDone : docsDone
  const total = usePages ? pagesTotal : Math.max(1, docsTotal)
  const pct = Math.max(0, Math.min(100, Math.round((done / Math.max(1, total)) * 100)))

  const phase = input.phaseLabel?.trim() || 'Estrazione'
  const counter = usePages
    ? `pag. ${pagesDone}/${pagesTotal}`
    : `doc. ${docsDone}/${Math.max(1, docsTotal)}`
  const current = input.currentTitle?.trim()
  const label = current ? `${phase} ${counter} · ${current}` : `${phase} ${counter}`

  return { pct, label, done, total }
}
