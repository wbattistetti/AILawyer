/**
 * Normalizzazione delle coordinate match per overlay e scroll PDF.
 */

export interface MatchBoxPct {
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
}

/**
 * Converte un bbox API (0-100) in coordinate normalizzate (0-1) per scroll e overlay legacy.
 */
export function matchBoxToUnit(box: MatchBoxPct): MatchBoxPct {
  const values = [box.x0Pct, box.y0Pct, box.x1Pct, box.y1Pct]
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Coordinate match non valide: attesi numeri finiti')
  }
  if (values.some((value) => value < 0 || value > 100)) {
    throw new Error('Coordinate match non valide: atteso range 0-100')
  }

  // Compatibilità: valori già in 0-1 (legacy) restano invariati.
  const scale = Math.max(...values) > 1 ? 100 : 1
  return {
    x0Pct: box.x0Pct / scale,
    y0Pct: box.y0Pct / scale,
    x1Pct: box.x1Pct / scale,
    y1Pct: box.y1Pct / scale
  }
}
