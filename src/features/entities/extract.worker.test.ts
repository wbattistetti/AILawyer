/**
 * Test del motore batch per l’estrazione di persone da token PDF.
 */

import { describe, expect, it } from 'vitest'
import { detectOnPage, type Token } from './extract.worker'

function tokensFromText(text: string): Token[] {
  return text.split(/\s+/).map((word, index) => ({
    text: word,
    x0Pct: index / 100,
    x1Pct: (index + 1) / 100,
    y0Pct: 0.1,
    y1Pct: 0.12
  }))
}

describe('detectOnPage', () => {
  it('estrae campi validati e professione dalla finestra della persona', () => {
    const [occurrence] = detectOnPage(tokensFromText(
      '1. Mario Rossi, nato a Roma il 10/01/1985, di professione insegnante, ' +
      'residente in Via Verdi 10, 00100 Roma (RM), codice fiscale RSSMRA85T10A562G'
    ), 1)

    expect(occurrence).toMatchObject({
      full_name: 'Mario Rossi',
      page: 1,
      fields: {
        date_of_birth: '1985-01-10',
        place_of_birth: 'Roma',
        tax_code: 'RSSMRA85T10A562G',
        profession: 'insegnante'
      }
    })
  })

  it('supporta la forma femminile nata', () => {
    const occurrences = detectOnPage(tokensFromText(
      '1. Anna Bianchi, nata a Milano il 02/03/1990'
    ), 2)

    expect(occurrences.some(item =>
      item.full_name === 'Anna Bianchi' &&
      item.fields.place_of_birth === 'Milano' &&
      item.fields.date_of_birth === '1990-03-02'
    )).toBe(true)
  })

  it('estrae il nome dopo un ruolo legale e prima della virgola di nascita', () => {
    const occurrences = detectOnPage(tokensFromText(
      'L’incarico veniva affidato al cognato Mario Rossi, nato a Roma il 10/01/1985'
    ), 3)

    expect(occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        full_name: 'Mario Rossi',
        fields: expect.objectContaining({
          place_of_birth: 'Roma',
          date_of_birth: '1985-01-10',
        }),
      }),
    ]))
  })

  it('ricompone una data OCR separata senza usare date documentali successive', () => {
    const occurrences = detectOnPage(tokensFromText(
      'Mario Rossi nato a Napoli il 17.08 , 1971 ivi res. in via Verdi 10, ' +
      'identificato con documento rilasciato il 07.05.2010'
    ), 4)

    expect(occurrences[0]?.fields.date_of_birth).toBe('1971-08-17')
  })

  it('normalizza gli anni di nascita a due cifre', () => {
    const occurrences = detectOnPage(tokensFromText(
      'Mario Rossi nato a Napoli il 17.08.71 residente in via Verdi 10'
    ), 5)
    expect(occurrences[0]?.fields.date_of_birth).toBe('1971-08-17')
  })

  it('non include intestazioni narrative nel nominativo', () => {
    const occurrences = detectOnPage(tokensFromText(
      'verbale di arresto di Mario Rossi nato a Roma il 10.01.1985'
    ), 6)
    expect(occurrences.some(item => item.full_name.includes('verbale'))).toBe(false)
  })

  it('rifiuta date calendario impossibili', () => {
    const occurrences = detectOnPage(tokensFromText(
      'Mario Rossi nato a Roma il 16.19.1983 residente in via Verdi 10'
    ), 7)
    expect(occurrences[0]?.fields.date_of_birth).toBeUndefined()
  })

  it('normalizza correttamente le date con mese testuale', () => {
    const occurrences = detectOnPage(tokensFromText(
      'Mario Rossi nato a Roma il 16 maggio 1983 residente in via Verdi 10'
    ), 8)
    expect(occurrences[0]?.fields.date_of_birth).toBe('1983-05-16')
  })

  it('non espone codici fiscali con checksum errato', () => {
    const occurrences = detectOnPage(tokensFromText(
      '1. Mario Rossi, nato a Roma il 10/01/1985, codice fiscale RSSMRA85T10A562S'
    ), 1)

    expect(occurrences.some(item => item.fields.tax_code != null)).toBe(false)
  })
})
