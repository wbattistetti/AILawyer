/**
 * Validazione geometria occorrenze per le fonti documentali.
 */

import type { BoxPct } from './entity-index'

/** True se il box è abbastanza ampio da produrre un ritaglio PDF utile. */
export function isUsableOccurrenceBox(box: BoxPct | null | undefined): boolean {
  if (!box) return false
  const width = box.x1Pct - box.x0Pct
  const height = box.y1Pct - box.y0Pct
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  if (width < 0.008 || height < 0.004) return false
  // Token sintetici del testo piano: banda fissa in alto, non allineata al PDF.
  if (
    Math.abs(box.y0Pct - 0.05) < 1e-6
    && Math.abs(box.y1Pct - 0.12) < 1e-6
  ) {
    return false
  }
  return true
}
