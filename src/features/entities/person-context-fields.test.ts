/**
 * Test linking indirizzi su contesti persona isolati.
 */

import { describe, expect, it } from 'vitest'
import { extractPersonAddressFields } from './person-context-fields'
import { boundPersonContext } from './person-context-segmenter'

describe('person-context-fields', () => {
  it('non ingloba le persone successive nella residenza', () => {
    const context = boundPersonContext(
      'a Napoli il 05.11.1989 residente in Minturno (LT) in via Lungomare nr.415. ' +
      'Luca Bianchi nato a Napoli il 19.12.1985 ivi res. in via Vittorio nr.35'
    )
    const fields = extractPersonAddressFields(context)

    expect(fields.residence).toMatchObject({
      city: 'Minturno',
      province: 'LT',
      address: 'via Lungomare nr.415',
    })
    expect(fields.residence?.raw).not.toContain('Luca Bianchi')
  })

  it('supporta la forma abbreviata ivi res.', () => {
    const fields = extractPersonAddressFields(
      'a Napoli il 19.12.1985 ivi res. in via Vittorio Emanuele nr.35'
    )
    expect(fields.residence?.address).toBe('via Vittorio Emanuele nr.35')
  })

  it('supporta e res. con città e provincia', () => {
    const fields = extractPersonAddressFields(
      'a Formia (LT) il 24.11.1992 e res. In Minturno (LT) alla via Lungomare nr. 415'
    )
    expect(fields.residence).toMatchObject({
      city: 'Minturno',
      province: 'LT',
      address: 'via Lungomare nr. 415',
    })
  })

  it('separa residenza e domicilio nello stesso contesto', () => {
    const fields = extractPersonAddressFields(
      'residente in Napoli (NA) in via Pisani nr.162, di fatto domiciliato in via Torricelli nr.458'
    )
    expect(fields.residence).toMatchObject({
      city: 'Napoli',
      province: 'NA',
      address: 'via Pisani nr.162',
    })
    expect(fields.domicile?.address).toBe('via Torricelli nr.458')
  })

  it('taglia la narrativa legale successiva all’indirizzo', () => {
    const fields = extractPersonAddressFields(
      'ivi res. in via Torricelli nr.340/e.. e della denuncia in stato di libertà'
    )
    expect(fields.residence?.address).toBe('via Torricelli nr.340/e')
  })

  it('interpreta la preposizione a prima della città', () => {
    const fields = extractPersonAddressFields(
      'residente a Scauri alla via I. Balbo 9, del foro di Latina'
    )
    expect(fields.residence).toMatchObject({
      city: 'Scauri',
      address: 'via I. Balbo 9',
    })
  })

  it('rifiuta valori contaminati oltre il limite di sicurezza', () => {
    const fields = extractPersonAddressFields(
      `residente in ${'testo '.repeat(40)}`
    )
    expect(fields.residence).toBeUndefined()
  })
})

