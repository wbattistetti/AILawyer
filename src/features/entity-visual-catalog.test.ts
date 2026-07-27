/**
 * Verifica la coerenza del catalogo visivo condiviso delle entità.
 */
import { describe, expect, it } from 'vitest'
import {
  GRAPH_TOOL_KINDS,
  getEntityColor,
  getEntityLabel,
  getEntityPluralLabel,
  getEntityVisual,
} from './entity-visual-catalog'

describe('entity visual catalog', () => {
  it('assegna colori distinti alle categorie principali del grafo', () => {
    const colors = GRAPH_TOOL_KINDS.map(getEntityColor)
    expect(new Set(colors).size).toBe(GRAPH_TOOL_KINDS.length)
  })

  it('allinea organizzazione e impresa senza perdere il lessico del contesto', () => {
    expect(getEntityVisual('organization').icon).toBe(getEntityVisual('company').icon)
    expect(getEntityColor('organization')).toBe(getEntityColor('company'))
    expect(getEntityLabel('organization')).toBe('Organizzazione')
    expect(getEntityLabel('company')).toBe('Impresa')
  })

  it('espone le etichette plurali usate dai filtri', () => {
    expect(getEntityPluralLabel('person')).toBe('Persone')
    expect(getEntityPluralLabel('vehicle')).toBe('Veicoli')
  })

  it('mantiene distinti i colori dei sottotipi persona', () => {
    expect(getEntityColor('male')).not.toBe(getEntityColor('female'))
    expect(getEntityColor('person')).not.toBe(getEntityColor('male'))
  })

  it('fallisce chiaramente per tipi non supportati', () => {
    expect(() => getEntityVisual('unknown' as never)).toThrow(
      'Tipo entità visivo non supportato: unknown',
    )
  })
})
