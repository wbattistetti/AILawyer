/**
 * Verifies Italian relationship phrases, bold-ready parts, and abstract captions.
 */
import { describe, expect, it } from 'vitest'
import {
  abstractRelationCaption,
  formatRelationPhrase,
  formatRelationPhraseParts,
} from './relation-phrase'

describe('formatRelationPhrase', () => {
  it('builds a masculine family relationship', () => {
    expect(formatRelationPhrase({
      sourceName: 'Mario',
      targetName: 'Fabio',
      sourceKind: 'male',
      relation: 'figlio',
    })).toBe('Mario è figlio di Fabio')
  })

  it('adapts gendered roles to a female source', () => {
    expect(formatRelationPhrase({
      sourceName: 'Sonia',
      targetName: 'Alberto',
      sourceKind: 'female',
      relation: 'socio',
    })).toBe('Sonia è socia di Alberto')
  })

  it('uses the dedicated friendship and business formula', () => {
    expect(formatRelationPhrase({
      sourceName: 'Marco',
      targetName: 'Carla',
      sourceKind: 'male',
      relation: 'amicizia_affari',
    })).toBe('Marco è in rapporti di amicizia e affari con Carla')
  })

  it('describes identity between two nodes of the same entity', () => {
    expect(formatRelationPhrase({
      sourceName: 'Angela Gerardi',
      targetName: 'Angela Gerardi',
      sourceKind: 'female',
      relation: 'stessa_entita',
    })).toBe('Angela Gerardi è la stessa entità di Angela Gerardi')
  })

  it('describes residence at an address', () => {
    expect(formatRelationPhrase({
      sourceName: 'Angela Gerardi',
      targetName: 'via I. Balbo 9',
      sourceKind: 'female',
      relation: 'vive_presso',
    })).toBe('Angela Gerardi vive presso via I. Balbo 9')
  })

  it('supports custom middle text', () => {
    expect(formatRelationPhrase({
      sourceName: 'Angela Gerardi',
      targetName: 'via I. Balbo 9',
      sourceKind: 'female',
      relation: 'custom',
      customMiddle: 'abita in',
    })).toBe('Angela Gerardi abita in via I. Balbo 9')
  })

  it('uses an invariant relationship where appropriate', () => {
    expect(formatRelationPhrase({
      sourceName: 'Vanessa',
      targetName: 'Marco',
      sourceKind: 'female',
      relation: 'convivente',
    })).toBe('Vanessa è convivente di Marco')
  })

  it('rejects empty node names', () => {
    expect(() => formatRelationPhrase({
      sourceName: ' ',
      targetName: 'Marco',
      sourceKind: 'female',
      relation: 'convivente',
    })).toThrow('sourceName è vuoto')
  })
})

describe('formatRelationPhraseParts', () => {
  it('keeps source and target names separate for bold rendering', () => {
    expect(formatRelationPhraseParts({
      sourceName: 'Mario',
      targetName: 'Alberto',
      sourceKind: 'male',
      relation: 'figlio',
    })).toEqual({
      sourceName: 'Mario',
      middle: 'è figlio di',
      targetName: 'Alberto',
    })
  })
})

describe('abstractRelationCaption', () => {
  it('returns a gender-aware abstract caption without names', () => {
    expect(abstractRelationCaption('marito', 'male')).toBe('Marito di')
    expect(abstractRelationCaption('socio', 'female')).toBe('Socia di')
    expect(abstractRelationCaption('figlio', 'male')).toBe('Figlio di')
  })

  it('returns a fixed caption for same-entity links', () => {
    expect(abstractRelationCaption('stessa_entita', 'female')).toBe('Stessa entità')
  })
})
