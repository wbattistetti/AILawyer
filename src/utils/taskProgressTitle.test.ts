/**
 * Test per titolo tab / progresso task OCR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_NAME,
  computeActiveTaskProgress,
  formatTaskProgressTitle,
  resetTaskProgressTitleStateForTests,
  syncTaskProgressTitle,
} from './taskProgressTitle'

describe('taskProgressTitle', () => {
  beforeEach(() => {
    resetTaskProgressTitleStateForTests()
    vi.stubGlobal('document', {
      title: 'LegalFlow - Gestione Documentale per Studi Legali',
    })
  })

  afterEach(() => {
    resetTaskProgressTitleStateForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ignora task al 100% e calcola la media degli attivi', () => {
    expect(
      computeActiveTaskProgress({ a: 20, b: 40, c: 100 })
    ).toEqual({ activeCount: 2, averagePct: 30 })
  })

  it('formatta un solo task', () => {
    expect(formatTaskProgressTitle({ a: 30 }, APP_NAME)).toBe('OCR 30% · AI Lawyer')
  })

  it('formatta più task con conteggio', () => {
    expect(formatTaskProgressTitle({ a: 10, b: 50 }, APP_NAME)).toBe(
      'OCR 2 task · 30% · AI Lawyer'
    )
  })

  it('in idle restituisce il titolo base', () => {
    expect(formatTaskProgressTitle({ a: 100 }, 'LegalFlow')).toBe('LegalFlow')
  })

  it('syncTaskProgressTitle aggiorna document.title', () => {
    syncTaskProgressTitle({ doc1: 42 })
    expect(document.title).toBe('OCR 42% · LegalFlow - Gestione Documentale per Studi Legali')

    syncTaskProgressTitle({ doc1: 100 })
    expect(document.title).toBe('LegalFlow - Gestione Documentale per Studi Legali')
  })
})
