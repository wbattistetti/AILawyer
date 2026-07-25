/**
 * Verifica che tab dock e cassetto Correlato condividano la stessa icona/colore per i comparti.
 */
import { describe, expect, it } from 'vitest'
import { Users, Landmark, Search, Calendar, Mail } from 'lucide-react'
import { colorFor, iconFor } from './drawerPalette'

describe('drawerPalette', () => {
  it('mappa Parti & Anagrafiche a Users (nome e chiave)', () => {
    expect(iconFor('Parti & Anagrafiche')).toBe(Users)
    expect(iconFor('parti_anagrafiche')).toBe(Users)
    expect(iconFor('O.C.C.C. ANAGRAFICA INQUISITO')).toBe(Users)
  })

  it('usa blu per Parti & Anagrafiche', () => {
    expect(colorFor('Parti & Anagrafiche')).toBe('#3b82f6')
    expect(colorFor('parti_anagrafiche')).toBe('#3b82f6')
  })

  it('mappa altri comparti noti in modo coerente', () => {
    expect(iconFor('Admin & Procure')).toBe(Landmark)
    expect(iconFor('Indagini preliminari')).toBe(Search)
    expect(iconFor('Elenco Utenze Scadenze Proroghe')).toBe(Calendar)
    expect(iconFor('Trascrizioni Intercettazioni Telefoniche')).toBe(Mail)
  })
})
