/**
 * Aggiorna il titolo della tab (e badge app se disponibile) in base alla % dei task in corso.
 * Approssimazione web della progress bar sull'icona taskbar (non esposta dalle API web).
 */

export const APP_NAME = 'AI Lawyer'

export type ActiveTaskProgress = {
  activeCount: number
  /** Media aritmetica delle percentuali dei task attivi (0–99). */
  averagePct: number
}

/**
 * Considera attivi i task con percentuale in [0, 100).
 */
export function computeActiveTaskProgress(
  progressById: Record<string, number>
): ActiveTaskProgress {
  const active = Object.values(progressById).filter(
    (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p < 100
  )
  if (active.length === 0) {
    return { activeCount: 0, averagePct: 0 }
  }
  const sum = active.reduce((acc, p) => acc + p, 0)
  return {
    activeCount: active.length,
    averagePct: Math.round(sum / active.length),
  }
}

/**
 * Costruisce il titolo tab: "OCR 30% · AI Lawyer" oppure con conteggio multi-task.
 */
export function formatTaskProgressTitle(
  progressById: Record<string, number>,
  baseTitle: string = APP_NAME
): string {
  const base = baseTitle.trim() || APP_NAME
  const { activeCount, averagePct } = computeActiveTaskProgress(progressById)
  if (activeCount === 0) return base
  if (activeCount === 1) return `OCR ${averagePct}% · ${base}`
  return `OCR ${activeCount} task · ${averagePct}% · ${base}`
}

let capturedIdleTitle: string | null = null

function getIdleTitle(): string {
  if (typeof document === 'undefined') return APP_NAME
  if (capturedIdleTitle == null) {
    const current = document.title?.trim()
    capturedIdleTitle = current && !current.startsWith('OCR ') ? current : APP_NAME
  }
  return capturedIdleTitle
}

/** Solo per test: resetta il titolo idle catturato. */
export function resetTaskProgressTitleStateForTests(): void {
  capturedIdleTitle = null
}

/**
 * Imposta document.title e, se supportato, l'app badge con la % media dei task.
 */
export function syncTaskProgressTitle(progressById: Record<string, number>): void {
  if (typeof document === 'undefined') return

  const idle = getIdleTitle()
  const { activeCount, averagePct } = computeActiveTaskProgress(progressById)
  document.title = formatTaskProgressTitle(progressById, idle)

  const nav = typeof navigator !== 'undefined' ? navigator : null
  const setBadge = nav && 'setAppBadge' in nav
    ? (nav as Navigator & { setAppBadge: (n?: number) => Promise<void> }).setAppBadge.bind(nav)
    : null
  const clearBadge = nav && 'clearAppBadge' in nav
    ? (nav as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge.bind(nav)
    : null

  if (activeCount > 0 && setBadge) {
    void setBadge(averagePct).catch(() => {})
  } else if (clearBadge) {
    void clearBadge().catch(() => {})
  }
}
