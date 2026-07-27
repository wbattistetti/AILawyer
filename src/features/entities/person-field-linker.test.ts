/**
 * Test del linking contestuale dei dati anagrafici.
 */

import { describe, expect, it } from 'vitest'
import { convertToPersonRecord } from './person-extract-manual'
import { isValidItalianTaxCode, linkPersonFields } from './person-field-linker'

const MARIO_TAX_CODE = 'RSSMRA85T10A562G'

describe('linkPersonFields', () => {
  it('associa ogni campo alla persona corretta nei testi multi-soggetto', () => {
    const result = linkPersonFields(
      `Prof. Mario Rossi, nato a Roma il 10/01/1985, di professione insegnante, ` +
      `residente in Via Verdi 10, 00100 Roma (RM), codice fiscale ${MARIO_TAX_CODE}, tel. 3331234567; ` +
      `Anna Bianchi, nata a Milano il 02/03/1990, residente in Via Blu 4, 20100 Milano (MI), ` +
      `email anna.bianchi@example.it`
    )

    expect(result.persons).toHaveLength(2)
    expect(result.persons[0]).toMatchObject({
      fullName: 'Mario Rossi',
      taxCode: { value: MARIO_TAX_CODE },
      birthPlace: { value: 'Roma' },
      birthDate: { value: '10/01/1985' },
      city: { value: 'Roma' },
      province: { value: 'RM' },
      postalCode: { value: '00100' },
      profession: { value: 'insegnante' },
      titles: ['Professore']
    })
    expect(result.persons[0].email).toBeNull()
    expect(result.persons[1]).toMatchObject({
      fullName: 'Anna Bianchi',
      birthPlace: { value: 'Milano' },
      birthDate: { value: '02/03/1990' },
      city: { value: 'Milano' },
      province: { value: 'MI' },
      postalCode: { value: '20100' },
      email: { value: 'anna.bianchi@example.it' }
    })
    expect(result.persons[1].taxCode).toBeNull()
    expect(result.persons[1].phone).toBeNull()
  })

  it('mantiene gli indici riferiti al testo originale con righe multiple', () => {
    const text = 'Mario Rossi,\n nato a Roma il 10/01/1985'
    const [person] = linkPersonFields(text).persons

    expect(text.slice(person.fullNameIndices.startIndex, person.fullNameIndices.endIndex)).toBe('Mario Rossi')
    expect(text.slice(person.birthDate!.startIndex, person.birthDate!.endIndex)).toBe('10/01/1985')
    expect(text.slice(person.birthPlace!.startIndex, person.birthPlace!.endIndex)).toBe('Roma')
  })

  it('rifiuta codici fiscali con carattere di controllo errato', () => {
    expect(isValidItalianTaxCode(MARIO_TAX_CODE)).toBe(true)
    expect(isValidItalianTaxCode('RSSMRA85T10A562S')).toBe(false)

    const [person] = linkPersonFields(
      'Mario Rossi, nato a Roma il 10/01/1985, codice fiscale RSSMRA85T10A562S'
    ).persons
    expect(person.taxCode).toBeNull()
  })

  it('genera identificativi stabili a parità di identità estratta', () => {
    const [extracted] = linkPersonFields(
      `Mario Rossi, nato a Roma il 10/01/1985, codice fiscale ${MARIO_TAX_CODE}`
    ).persons

    expect(convertToPersonRecord(extracted).id).toBe(convertToPersonRecord(extracted).id)
  })
})
