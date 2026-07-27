/**
 * Test qualità confini organization/venue/company (casi delle figure + regressioni).
 */

import { describe, expect, it } from 'vitest'
import { tokenizePlainTextAsPage } from '../entities/adapters/plain-text-tokens'
import { detectGenericEntitiesOnPage } from './detect-page'
import { assessOrganizationQuality } from './organization-quality'

function detect(text: string) {
  return detectGenericEntitiesOnPage({
    docId: 'doc-fig',
    title: 'atti.pdf',
    page: 1,
    tokens: tokenizePlainTextAsPage(text),
  })
}

function orgHits(text: string) {
  return detect(text).hits.filter(hit => hit.kind === 'organization' || (hit.kind === 'place' && hit.subtype === 'venue'))
}

describe('organization-quality / confini stretti', () => {
  it('non estrae bar descrittivo senza nome proprio', () => {
    const hits = orgHits(
      'non esclude di averlo incontrato presso il bar ubicato nelle vicinanze della sede del citato Ente.'
    )
    expect(hits.some(hit => /ubicato|vicinanze/i.test(hit.label))).toBe(false)
  })

  it('non estrae locale + boilerplate legale come venue', () => {
    const hits = orgHits(
      'Verbale di perquisizione personale e locale ai sensi dell\'art. 103 comma 3 D.P.R.'
    )
    expect(hits.some(hit => /ai sensi/i.test(hit.label))).toBe(false)
    expect(hits.some(hit => hit.subtype === 'locale')).toBe(false)
  })

  it('non allunga Carabinieri con "specie durante le"', () => {
    const hits = orgHits(
      'Commissariato di Senigallia o della Stazione dei Carabinieri specie durante le ore notturne.'
    )
    const carabinieri = hits.filter(hit => /carabinieri/i.test(hit.label))
    expect(carabinieri.length).toBeGreaterThan(0)
    for (const hit of carabinieri) {
      expect(hit.label.toLowerCase()).not.toMatch(/specie|durante/)
    }
  })

  it('non tratta snc di indirizzo come società', () => {
    const hits = orgHits(
      'abbiamo proceduto a perquisire l\'abitazione di via Pizzobalordo snc in Minturno (LT) con esito NEGATIVO.'
    )
    expect(hits.some(hit => hit.subtype === 'company' && /pizzobalordo|perquisire/i.test(hit.label))).toBe(
      false
    )
  })

  it('non confonde Pubblico Ministero OCR con pub/venue', () => {
    const hits = orgHits(
      'L\'Ufficiale di Polizia Giudiziaria Il Pub ylico-Ministero Dottisag aria Calò Mi'
    )
    expect(hits.some(hit => hit.subtype === 'pub' || /^pub\b/i.test(hit.label))).toBe(false)
  })

  it('estrae ristorante con nome proprio valido', () => {
    const hits = orgHits('Il Ristorante Da Mario sito in via Roma 12 risultava chiuso.')
    expect(hits.some(hit => /ristorante/i.test(hit.label) && /Mario/i.test(hit.label))).toBe(true)
  })

  it('non tratta locale + Commissariato come venue', () => {
    const hits = orgHits(
      'sala operativa del locale Commissariato di Senigallia per sopperire alla cronica carenza'
    )
    expect(hits.some(hit => hit.subtype === 'locale' && /commissariato/i.test(hit.label))).toBe(false)
  })

  it('marca incompleteInstitution su Procura della tronca', () => {
    const quality = assessOrganizationQuality({
      kind: 'institution',
      rawText: 'Procura della',
      baseConfidence: 0.9,
    })
    expect(quality.accept).toBe(true)
    expect(quality.flags).toContain('incompleteInstitution')
    expect(quality.needsReview).toBe(true)
  })

  it('reject companySuffixInAddress', () => {
    const quality = assessOrganizationQuality({
      kind: 'company',
      rawText: 'Pizzobalordo snc',
      namePart: 'Pizzobalordo',
      legalForm: 'SNC',
      textBefore: 'via ',
      baseConfidence: 0.88,
    })
    expect(quality.accept).toBe(false)
    expect(quality.rejectReason).toBe('companySuffixInAddress')
  })
})
