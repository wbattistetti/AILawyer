/**
 * Test del piano incrementale di estrazione documenti.
 */

import { describe, expect, it } from 'vitest'
import {
  createDocumentExtractionPlan,
  createPracticeDocumentSignature,
  updatePracticeDocumentSignature,
} from './document-extraction-plan'

describe('document-extraction-plan', () => {
  it('produce una firma stabile indipendente dall’ordine', () => {
    expect(createPracticeDocumentSignature([
      { id: 'doc-b', hash: 'hash-b' },
      { id: 'doc-a', hash: 'hash-a' },
    ])).toBe(createPracticeDocumentSignature([
      { id: 'doc-a', hash: 'hash-a' },
      { id: 'doc-b', hash: 'hash-b' },
    ]))
  })

  it('estrae soltanto documenti aggiunti o modificati', () => {
    const signature = createPracticeDocumentSignature([
      { id: 'unchanged', hash: 'same' },
      { id: 'changed', hash: 'old' },
    ])

    expect(createDocumentExtractionPlan(signature, [
      { id: 'unchanged', hash: 'same' },
      { id: 'changed', hash: 'new' },
      { id: 'added', hash: 'hash' },
    ])).toEqual({
      documentIdsToExtract: ['changed', 'added'],
      removedDocumentIds: [],
    })
  })

  it('identifica i documenti rimossi senza riestrarre quelli invariati', () => {
    const signature = createPracticeDocumentSignature([
      { id: 'kept', hash: 'same' },
      { id: 'removed', hash: 'old' },
    ])

    expect(createDocumentExtractionPlan(signature, [
      { id: 'kept', hash: 'same' },
    ])).toEqual({
      documentIdsToExtract: [],
      removedDocumentIds: ['removed'],
    })
  })

  it('richiede una estrazione completa quando la firma non è disponibile', () => {
    expect(createDocumentExtractionPlan(null, [
      { id: 'doc-a', hash: 'a' },
      { id: 'doc-b', hash: 'b' },
    ])).toEqual({
      documentIdsToExtract: ['doc-a', 'doc-b'],
      removedDocumentIds: [],
    })
  })

  it('aggiorna la firma senza marcare come elaborati i documenti falliti', () => {
    const previousSignature = createPracticeDocumentSignature([
      { id: 'kept', hash: 'same' },
      { id: 'removed', hash: 'old' },
    ])
    const nextSignature = updatePracticeDocumentSignature({
      previousSignature,
      currentDocuments: [
        { id: 'kept', hash: 'same' },
        { id: 'processed', hash: 'new' },
        { id: 'failed', hash: 'retry' },
      ],
      processedDocumentIds: ['processed'],
      removedDocumentIds: ['removed'],
    })

    expect(createDocumentExtractionPlan(nextSignature, [
      { id: 'kept', hash: 'same' },
      { id: 'processed', hash: 'new' },
      { id: 'failed', hash: 'retry' },
    ])).toEqual({
      documentIdsToExtract: ['failed'],
      removedDocumentIds: [],
    })
  })
})
