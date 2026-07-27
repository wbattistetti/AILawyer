/**
 * Judicial-investigation relation catalog filtered by source/target node kinds.
 */
import type { NodeKind, RelationKind } from './types'

const isPerson = (k: NodeKind) => k === 'male' || k === 'female' || k === 'person'
const isVehicle = (k: NodeKind) => k === 'vehicle' || k === 'motorcycle'
const isCommercialPlace = (k: NodeKind) => k === 'bar' || k === 'restaurant'
const isAddressPlace = (k: NodeKind) => k === 'place'

function sortByLabel(opts: RelationKind[], labelFor: (r: RelationKind) => string): RelationKind[] {
  return [...opts].sort((a, b) => labelFor(a).localeCompare(labelFor(b), 'it'))
}

/** Short abstract label used for sorting and UI. */
export function labelFor(rel: RelationKind): string {
  const map: Record<RelationKind, string> = {
    padre: 'Padre',
    madre: 'Madre',
    figlio: 'Figlio',
    figlia: 'Figlia',
    marito: 'Marito',
    moglie: 'Moglie',
    convivente: 'Convivente/Partner',
    ex_coniuge: 'Ex coniuge',
    fidanzato: 'Fidanzato',
    fidanzata: 'Fidanzata',
    fratello: 'Fratello',
    sorella: 'Sorella',
    amicizia_affari: 'Amicizia–Affari',
    frequentazione: 'Frequentazione abituale',
    stessa_entita: 'Stessa entità',
    collega: 'Collega',
    superiore: 'Superiore',
    subordinato: 'Subordinato',
    dipendente: 'Dipendente',
    datore: 'Datore di lavoro',
    amministratore_unico: 'Amministratore unico',
    amministratore: 'Amministratore',
    consigliere: 'Consigliere',
    rappresentante_legale: 'Rappresentante legale',
    titolare_firmatario: 'Titolare firmatario',
    socio: 'Socio',
    socio_occulto: 'Socio occulto',
    accomandatario: 'Accomandatario',
    accomandante: 'Accomandante',
    gestore: 'Gestore',
    appaltatore: 'Appaltatore',
    fornitore: 'Fornitore',
    cliente: 'Cliente',
    proprietario: 'Proprietario',
    interessi: 'Interessi',
    frequentatore: 'Frequentatore abituale',
    incontro_presso: 'Incontro presso',
    vive_presso: 'Vive presso',
    residenza: 'Residenza',
    domicilio: 'Domicilio',
    recatosi: 'Si è recato',
    visto_presso: 'Visto presso',
    partecipante: 'Partecipante',
    organizzatore: 'Organizzatore',
    detiene: 'Detiene',
    utilizza_contatto: 'Utilizza',
    intestatario: 'Intestatario',
    conducente_abituale: 'Conducente abituale',
    utilizzatore: 'Utilizzatore',
    controllante: 'Controllante',
    controllata: 'Controllata',
    collegata: 'Collegata',
    joint_venture: 'Joint venture',
    acquisizione: 'Acquisizione',
    cessione: 'Cessione',
    custom: 'Personalizzata',
  }
  return map[rel] || rel
}

/**
 * Returns catalog relations allowed for the given source/target kinds.
 * Address places get residence/presence verbs; bars/restaurants get commercial roles.
 */
export function getRelationOptions(
  source: NodeKind,
  target: NodeKind,
  options?: { sameEntity?: boolean },
): RelationKind[] {
  if (options?.sameEntity) return ['stessa_entita']

  if (isPerson(source) && isPerson(target)) {
    const base: RelationKind[] = [
      'padre', 'madre', 'figlio', 'figlia', 'marito', 'moglie', 'convivente',
      'ex_coniuge', 'fidanzato', 'fidanzata', 'fratello', 'sorella',
      'collega', 'superiore', 'subordinato',
      'frequentazione', 'amicizia_affari',
    ]
    return sortByLabel(base.filter((r) => {
      if (source === 'male' && (r === 'madre' || r === 'moglie' || r === 'fidanzata' || r === 'sorella' || r === 'figlia')) return false
      if (source === 'female' && (r === 'padre' || r === 'marito' || r === 'fidanzato' || r === 'fratello' || r === 'figlio')) return false
      return true
    }), labelFor)
  }

  if (isPerson(source) && target === 'company') {
    return sortByLabel([
      'dipendente', 'amministratore_unico', 'amministratore', 'consigliere',
      'rappresentante_legale', 'titolare_firmatario', 'socio', 'socio_occulto',
      'accomandatario', 'accomandante', 'gestore', 'appaltatore', 'fornitore',
      'cliente', 'proprietario', 'interessi',
    ], labelFor)
  }

  if (source === 'company' && isPerson(target)) {
    return sortByLabel([
      'datore', 'amministratore', 'consigliere', 'rappresentante_legale',
      'titolare_firmatario', 'socio', 'socio_occulto', 'accomandatario',
      'accomandante', 'gestore', 'appaltatore', 'fornitore', 'cliente',
    ], labelFor)
  }

  if (isPerson(source) && isAddressPlace(target)) {
    return sortByLabel([
      'vive_presso', 'residenza', 'domicilio',
      'frequentatore', 'recatosi', 'visto_presso', 'incontro_presso',
    ], labelFor)
  }

  if (isPerson(source) && isCommercialPlace(target)) {
    return sortByLabel([
      'proprietario', 'gestore', 'dipendente',
      'frequentatore', 'incontro_presso', 'recatosi', 'visto_presso',
    ], labelFor)
  }

  if (isPerson(source) && isVehicle(target)) {
    return sortByLabel([
      'proprietario', 'intestatario', 'conducente_abituale', 'utilizzatore',
    ], labelFor)
  }

  if (isPerson(source) && target === 'meeting') {
    return sortByLabel(['partecipante', 'organizzatore', 'incontro_presso'], labelFor)
  }

  if (isPerson(source) && target === 'object') {
    return sortByLabel(['detiene', 'proprietario', 'utilizzatore'], labelFor)
  }

  if (isPerson(source) && (target === 'contact' || target === 'identifier')) {
    return sortByLabel(['utilizza_contatto', 'intestatario'], labelFor)
  }

  if (source === 'company' && target === 'company') {
    return sortByLabel([
      'controllante', 'controllata', 'collegata', 'joint_venture', 'acquisizione', 'cessione',
    ], labelFor)
  }

  if (source === 'company' && (isAddressPlace(target) || isCommercialPlace(target))) {
    return sortByLabel(['sede', 'proprietario', 'gestore'], labelFor)
  }

  return sortByLabel(['frequentazione'], labelFor)
}
