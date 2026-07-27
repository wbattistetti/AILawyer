/**
 * Test del detector di pagina: falsi positivi, ristorante+indirizzo, veicolo, persona+telefono.
 */

import { describe, expect, it } from 'vitest'
import { tokenizePlainTextAsPage } from '../entities/adapters/plain-text-tokens'
import { detectGenericEntitiesOnPage } from './detect-page'

function detect(text: string, page = 1) {
  return detectGenericEntitiesOnPage({
    docId: 'doc-a',
    title: 'verbale.pdf',
    page,
    tokens: tokenizePlainTextAsPage(text),
  })
}

describe('detectGenericEntitiesOnPage', () => {
  it('evita falsi positivi su istituzioni e boilerplate legale', () => {
    const result = detect(
      'Ai sensi dell\'art. 12 del codice di procedura penale, la Procura della Repubblica di Milano dispone.'
    )
    expect(result.hits.filter(hit => hit.kind === 'person')).toHaveLength(0)
    expect(result.hits.some(hit => hit.kind === 'organization' && /procura/i.test(hit.label))).toBe(true)
  })

  it('struttura ristorante + indirizzo con relazione located-at', () => {
    const result = detect(
      'Il Ristorante Da Mario sito in via Roma 12, 00100 Roma (RM) risultava chiuso.'
    )
    const org = result.hits.find(
      hit => hit.kind === 'organization' && /ristorante/i.test(hit.label) && /mario/i.test(hit.label)
    )
    const place = result.hits.find(
      hit => hit.kind === 'place' && hit.subtype === 'address' && hit.properties.cap === '00100'
    )
    expect(org).toBeTruthy()
    expect(org?.properties.category).toBe('ristorante')
    expect(place).toBeTruthy()
    expect(place?.properties.city).toBe('Roma')
    expect(place?.properties.province).toBe('RM')
    expect(
      result.relationHints.some(
        hint =>
          hint.kind === 'located-at' &&
          hint.fromLocalId === org!.localId &&
          hint.toLocalId === place!.localId
      )
    ).toBe(true)
  })

  it('aggrega auto + targa + colore in un unico veicolo', () => {
    const result = detect(
      'L\'autovettura Fiat Panda di colore bianco targa AB123CD veniva sequestrata.'
    )
    const vehicles = result.hits.filter(hit => hit.kind === 'vehicle')
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0].properties.make?.toLowerCase()).toBe('fiat')
    expect(vehicles[0].properties.model?.toLowerCase()).toBe('panda')
    expect(vehicles[0].properties.color).toBe('bianco')
    expect(vehicles[0].properties.plate).toBe('AB123CD')
  })

  it('estrae marca, modello, colore e targa dalla forma usata nei verbali', () => {
    const result = detect(
      'Si notava un’autovettura marca Suzuki modello Swift di colore grigio targata CW692HR.'
    )
    const vehicles = result.hits.filter(hit => hit.kind === 'vehicle')
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0].properties).toMatchObject({
      make: 'Suzuki',
      model: 'Swift',
      color: 'grigio',
      plate: 'CW692HR',
    })
    expect(vehicles[0].label).toBe('Suzuki Swift grigio targa CW692HR')
  })

  it('estrae marche fuori whitelist con “modello” e colore composto', () => {
    const result = detect(
      'Si notava un’autovettura Smart modello fortwo di colore nero, targata ED252CN.'
    )
    const vehicles = result.hits.filter(hit => hit.kind === 'vehicle')
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0].properties).toMatchObject({
      make: 'Smart',
      model: 'fortwo',
      color: 'nero',
      plate: 'ED252CN',
    })
  })

  it('estrae Fiat Punto con colore composto grigio chiaro', () => {
    const result = detect(
      'la Fiat Punto di colore grigio chiaro targata CH340GW guidata da CAPUOZZO Antonio'
    )
    const vehicles = result.hits.filter(hit => hit.kind === 'vehicle')
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0].properties).toMatchObject({
      make: 'Fiat',
      model: 'Punto',
      color: 'grigio chiaro',
      plate: 'CH340GW',
    })
  })

  it('usa la targa come identità stabile anche con descrizioni parziali', () => {
    const complete = detect(
      'Autovettura Fiat Punto di colore grigio targa CH340GW.'
    ).hits.find(hit => hit.kind === 'vehicle')
    const partial = detect('Il veicolo targa CH340GW veniva seguito.').hits.find(
      hit => hit.kind === 'vehicle'
    )
    expect(complete).toBeTruthy()
    expect(partial).toBeTruthy()
    expect(complete?.entityKey).toBe(partial?.entityKey)
  })

  it('non associa marca e modello del veicolo successivo alla targa precedente', () => {
    const result = detect(
      'Un’autovettura marca Suzuki modello Swift di colore grigio targata CW692HR, ' +
      'con due persone a bordo, era seguita da un’altra autovettura Fiat Punto di colore nero.'
    )
    const vehicles = result.hits.filter(hit => hit.kind === 'vehicle')
    const registered = vehicles.find(vehicle => vehicle.properties.plate === 'CW692HR')
    expect(registered?.properties.make).toBe('Suzuki')
    expect(registered?.properties.model).toBe('Swift')
    expect(registered?.properties.color).toBe('grigio')
  })

  it('collega persona e telefono con has-contact', () => {
    const result = detect('Il sig. Mario Rossi tel. 3331234567 veniva sentito.')
    const person = result.hits.find(
      hit => hit.kind === 'person' && /Mario Rossi/i.test(hit.label)
    )
    const phone = result.hits.find(hit => hit.kind === 'contact' && hit.subtype === 'phone')
    expect(person).toBeTruthy()
    expect(person?.label).toBe('Sig. Mario Rossi')
    expect(phone).toBeTruthy()
    expect(
      result.relationHints.some(
        hint =>
          hint.kind === 'has-contact' &&
          hint.fromLocalId === person!.localId &&
          hint.toLocalId === phone!.localId
      )
    ).toBe(true)
  })

  it('estrae Dott.ssa + nome + ruolo senza contaminare il nominativo', () => {
    const result = detect(
      'Tribunale Ordinario di Roma , Sost. Proc. Dott.ssa Ilaria Calò , piazzale CLODIO'
    )
    const person = result.hits.find(hit => hit.kind === 'person' && /Ilaria Calò/i.test(hit.label))
    expect(person?.label).toBe('Dott.ssa Ilaria Calò')
    expect(person?.properties.role).toBe('Sostituto Procuratore')
    expect(person?.properties.fullName).toBe('Ilaria Calò')
    expect(person?.properties.fullName).not.toContain('Magistrato')
  })

  it('aggrega intestazione istituzionale con telefono e PEC', () => {
    const result = detect(
      'DIREZIONE INVESTIGATIVA ANTIMAFIA - CENTRO OPERATIVO DI ROMA ' +
      'VIA SICILIA 194, 00187 ROMA — TEL. 06.3229581 — P.E.C. dia.roma.rm@pecps.interno.it'
    )
    const org = result.hits.find(
      hit => hit.kind === 'organization' && /centro operativo|direzione investigativa/i.test(hit.label)
    )
    expect(org).toBeTruthy()
    expect(org?.properties.phone).toMatch(/063229581/)
    expect(org?.properties.pec).toBe('dia.roma.rm@pecps.interno.it')
    expect(org?.properties.address).toMatch(/Sicilia/i)
  })

  it('fallisce chiaramente su input invalido', () => {
    expect(() =>
      detectGenericEntitiesOnPage({
        docId: '',
        title: 'x',
        page: 1,
        tokens: [],
      })
    ).toThrow(/docId/)
  })
})
