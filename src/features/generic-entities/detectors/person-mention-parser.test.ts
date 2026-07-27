/**
 * Test del parser menzioni persona in ambito legale.
 */

import { describe, expect, it } from 'vitest'
import {
  cleanPersonName,
  formatPersonLabel,
  parsePersonMentions,
} from './person-mention-parser'

describe('person-mention-parser', () => {
  it('mette il titolo prima del nome e il ruolo sotto', () => {
    const hits = parsePersonMentions(
      'Sost. Proc. Dott.ssa Ilaria Calò , piazzale CLODIO - 00195 ROMA'
    )
    expect(hits[0]).toMatchObject({
      title: 'Dott.ssa',
      fullName: 'Ilaria Calò',
      role: 'Sostituto Procuratore',
    })
    expect(formatPersonLabel(hits[0].title, hits[0].fullName)).toBe('Dott.ssa Ilaria Calò')
  })

  it('supporta apostrofi nei cognomi e non taglia D\'OREFICE', () => {
    const hits = parsePersonMentions(
      'c.a. Dott.ssa Chiara D\'OREFICE — Sost. Con riferimento al procedimento'
    )
    expect(hits.some(hit => hit.fullName === 'Chiara D\'OREFICE' && hit.title === 'Dott.ssa')).toBe(true)
  })

  it('non include del Foro o Magistrato nel nome', () => {
    expect(cleanPersonName('CARDILLO CUPO Pasquale del Foro')).toBe('CARDILLO CUPO Pasquale')
    expect(cleanPersonName('Ilaria Calò Magistrato')).toBe('Ilaria Calò')

    const hits = parsePersonMentions(
      'difensore d\'Ufficio nella persona dell\'Avv. CARDILLO CUPO Pasquale del Foro di Roma , con studio legale in Formia'
    )
    const person = hits.find(hit => /cardillo/i.test(hit.fullName))
    expect(person?.fullName).toBe('CARDILLO CUPO Pasquale')
    expect(person?.title).toBe('Avv.')
    expect(person?.role).toMatch(/Avvocato|Difensore/i)
    expect(person?.office).toMatch(/Foro di Roma|Studio legale/i)
  })

  it('riconosce magistrato come ruolo e non come parte del nome', () => {
    const hits = parsePersonMentions(
      'Magistrato assegnatario : Dott.ssa Ilaria Calò e Dott. Giuseppe Cascini GIP'
    )
    const ilaria = hits.find(hit => hit.fullName === 'Ilaria Calò')
    expect(ilaria?.title).toBe('Dott.ssa')
    expect(ilaria?.role).toBe('Magistrato')
    expect(ilaria?.fullName).not.toContain('Magistrato')

    const giuseppe = hits.find(hit => hit.fullName === 'Giuseppe Cascini')
    expect(giuseppe?.title).toBe('Dott.')
    expect(giuseppe?.role).toBe('GIP')
  })

  it('riconosce sig. + nome senza inglobare verbi successivi', () => {
    const hits = parsePersonMentions('Anche il sig. Mario Rossi risultava presente.')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      title: 'Sig.',
      fullName: 'Mario Rossi',
    })
    expect(formatPersonLabel(hits[0].title, hits[0].fullName)).toBe('Sig. Mario Rossi')
  })

  it('cattura funzione prima del titolo: Dirigente Generale Tecnico Dr. MAIORINO', () => {
    const hits = parsePersonMentions(
      'RESE DAI TESTI : Dirigente Generale Tecnico Dr. MAIORINO Vincenzo in data 08.06.2021 escusso'
    )
    const person = hits.find(hit => /maiorino/i.test(hit.fullName))
    expect(person).toMatchObject({
      title: 'Dott.',
      fullName: 'MAIORINO Vincenzo',
      role: 'Dirigente Generale Tecnico',
      eventDate: '08.06.2021',
    })
    expect(formatPersonLabel(person?.title, person!.fullName)).toBe('Dott. MAIORINO Vincenzo')
  })

  it('cattura Commissario Capo Tecnico prima di Dr. Antonio PINTAUDI', () => {
    const hits = parsePersonMentions(
      'Commissario Capo Tecnico Dr. Antonio PINTAUDI 08.06.2021 Dall\'esame delle dichiarazioni'
    )
    const person = hits.find(hit => /pintaudi/i.test(hit.fullName))
    expect(person).toMatchObject({
      title: 'Dott.',
      fullName: 'Antonio PINTAUDI',
      role: 'Commissario Capo Tecnico',
      eventDate: '08.06.2021',
    })
  })
})
