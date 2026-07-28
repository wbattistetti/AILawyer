import { describe, expect, it } from 'vitest'
import {
  countPagesFromOcrText,
  formatPageCountLabel,
  normalizePageCount,
  resolveDocumentPageCount,
} from './pageCountLabel'

describe('formatPageCountLabel', () => {
  it('formatta singolare e plurale', () => {
    expect(formatPageCountLabel(1)).toBe('1 pagina')
    expect(formatPageCountLabel(5)).toBe('5 pagine')
  })

  it('rifiuta conteggi non validi', () => {
    expect(() => formatPageCountLabel(0)).toThrow(/non valido/)
    expect(() => formatPageCountLabel(1.5)).toThrow(/non valido/)
    expect(() => formatPageCountLabel(-2)).toThrow(/non valido/)
  })
})

describe('normalizePageCount', () => {
  it('accetta interi >= 1 e tronca decimali', () => {
    expect(normalizePageCount(3)).toBe(3)
    expect(normalizePageCount(3.9)).toBe(3)
  })

  it('rifiuta valori non validi', () => {
    expect(normalizePageCount(0)).toBeNull()
    expect(normalizePageCount(NaN)).toBeNull()
    expect(normalizePageCount('3')).toBeNull()
  })
})

describe('countPagesFromOcrText', () => {
  it('conta con separatore backend \\n\\f\\n', () => {
    expect(countPagesFromOcrText('a\n\f\nb\n\f\nc')).toBe(3)
  })

  it('conta con form-feed semplice', () => {
    expect(countPagesFromOcrText('a\fb')).toBe(2)
  })

  it('restituisce null senza separatori', () => {
    expect(countPagesFromOcrText('solo testo')).toBeNull()
  })
})

describe('resolveDocumentPageCount', () => {
  it('preferisce pageCount esplicito', () => {
    expect(resolveDocumentPageCount({
      pageCount: 12,
      ocrLayout: [{ page: 1 }, { page: 2 }],
    })).toBe(12)
  })

  it('usa ocrLayout quando disponibile', () => {
    expect(resolveDocumentPageCount({
      ocrLayout: [{ page: 1 }, { page: 2 }, { page: 3 }],
    })).toBe(3)
  })

  it('usa ocrText con separatori', () => {
    expect(resolveDocumentPageCount({
      ocrText: 'p1\n\f\np2',
    })).toBe(2)
  })

  it('per immagini restituisce 1', () => {
    expect(resolveDocumentPageCount({ mime: 'image/png' })).toBe(1)
  })

  it('OCR completed senza separatori → 1 pagina', () => {
    expect(resolveDocumentPageCount({
      ocrStatus: 'completed',
      ocrText: 'testo unico',
    })).toBe(1)
  })

  it('restituisce null se non determinabile', () => {
    expect(resolveDocumentPageCount({
      mime: 'application/pdf',
      ocrStatus: 'pending',
    })).toBeNull()
  })
})
