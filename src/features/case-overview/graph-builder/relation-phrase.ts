/**
 * Builds natural Italian descriptions and abstract captions for graph relationships.
 */
import type { NodeKind, RelationKind } from './types'

type RelationPhraseInput = {
  sourceName: string
  targetName: string
  sourceKind: NodeKind
  relation: RelationKind
  customMiddle?: string
}

export type RelationPhraseParts = {
  sourceName: string
  middle: string
  targetName: string
}

type MiddleTemplate = (sourceKind: NodeKind) => string

const isFemale = (kind: NodeKind): boolean => kind === 'female'

const gendered = (kind: NodeKind, masculine: string, feminine: string): string =>
  isFemale(kind) ? feminine : masculine

const is = (
  masculine: string,
  feminine = masculine,
  preposition: 'di' | 'a' | 'con' = 'di',
): MiddleTemplate => (kind) =>
  `è ${gendered(kind, masculine, feminine)} ${preposition}`

const middleTemplates: Record<Exclude<RelationKind, 'custom'>, MiddleTemplate> = {
  padre: is('padre'),
  madre: is('madre'),
  figlio: is('figlio', 'figlia'),
  figlia: is('figlio', 'figlia'),
  marito: is('marito', 'moglie'),
  moglie: is('marito', 'moglie'),
  convivente: is('convivente'),
  ex_coniuge: is('ex coniuge'),
  fidanzato: is('fidanzato', 'fidanzata'),
  fidanzata: is('fidanzato', 'fidanzata'),
  fratello: is('fratello', 'sorella'),
  sorella: is('fratello', 'sorella'),
  amicizia_affari: () => 'è in rapporti di amicizia e affari con',
  frequentazione: () => 'frequenta abitualmente',
  stessa_entita: () => 'è la stessa entità di',
  collega: is('collega'),
  superiore: is('superiore'),
  subordinato: is('subordinato', 'subordinata', 'a'),
  dipendente: is('dipendente'),
  datore: (kind) => `è ${gendered(kind, 'datore', 'datrice')} di lavoro di`,
  amministratore_unico: is('amministratore unico', 'amministratrice unica'),
  amministratore: is('amministratore', 'amministratrice'),
  consigliere: is('consigliere', 'consigliera'),
  rappresentante_legale: is('rappresentante legale'),
  titolare_firmatario: is('titolare firmatario', 'titolare firmataria'),
  socio: is('socio', 'socia'),
  socio_occulto: is('socio occulto', 'socia occulta'),
  accomandatario: is('accomandatario', 'accomandataria'),
  accomandante: is('accomandante'),
  gestore: is('gestore', 'gestrice'),
  appaltatore: is('appaltatore', 'appaltatrice'),
  fornitore: is('fornitore', 'fornitrice'),
  cliente: is('cliente'),
  proprietario: is('proprietario', 'proprietaria'),
  interessi: () => 'ha interessi in',
  frequentatore: is('frequentatore abituale', 'frequentatrice abituale'),
  incontro_presso: () => 'ha partecipato a un incontro presso',
  vive_presso: () => 'vive presso',
  residenza: () => 'ha la residenza in',
  domicilio: () => 'ha il domicilio in',
  recatosi: (kind) => `si è ${gendered(kind, 'recato', 'recata')} presso`,
  visto_presso: (kind) => `è ${gendered(kind, 'stato visto', 'stata vista')} presso`,
  sede: () => 'ha sede in',
  partecipante: is('partecipante', 'partecipante', 'a'),
  organizzatore: is('organizzatore', 'organizzatrice'),
  detiene: () => 'detiene',
  utilizza_contatto: () => 'utilizza',
  intestatario: is('intestatario', 'intestataria'),
  conducente_abituale: is('conducente abituale'),
  utilizzatore: is('utilizzatore', 'utilizzatrice'),
  controllante: is('controllante'),
  controllata: () => 'è controllata da',
  collegata: is('collegata', 'collegata', 'a'),
  joint_venture: () => 'è in joint venture con',
  acquisizione: () => 'ha acquisito',
  cessione: () => 'ha ceduto attività a',
}

type AbstractCaptionTemplate = (sourceKind: NodeKind) => string

const titleCaseWords = (value: string): string =>
  value.replace(/\b([a-zà-ü])/gu, char => char.toUpperCase())

const abstractRole = (
  masculine: string,
  feminine = masculine,
  suffix = ' di',
): AbstractCaptionTemplate => (kind) =>
  `${titleCaseWords(gendered(kind, masculine, feminine))}${suffix}`

const abstractCaptions: Record<Exclude<RelationKind, 'custom'>, AbstractCaptionTemplate> = {
  padre: abstractRole('padre'),
  madre: abstractRole('madre'),
  figlio: abstractRole('figlio', 'figlia'),
  figlia: abstractRole('figlio', 'figlia'),
  marito: abstractRole('marito', 'moglie'),
  moglie: abstractRole('marito', 'moglie'),
  convivente: abstractRole('convivente'),
  ex_coniuge: abstractRole('ex coniuge'),
  fidanzato: abstractRole('fidanzato', 'fidanzata'),
  fidanzata: abstractRole('fidanzato', 'fidanzata'),
  fratello: abstractRole('fratello', 'sorella'),
  sorella: abstractRole('fratello', 'sorella'),
  amicizia_affari: () => 'Amicizia–Affari',
  frequentazione: () => 'Frequentazione abituale',
  stessa_entita: () => 'Stessa entità',
  collega: abstractRole('collega'),
  superiore: abstractRole('superiore'),
  subordinato: abstractRole('subordinato', 'subordinata', ' a'),
  dipendente: abstractRole('dipendente'),
  datore: (kind) => `${titleCaseWords(gendered(kind, 'datore', 'datrice'))} di lavoro di`,
  amministratore_unico: abstractRole('amministratore unico', 'amministratrice unica'),
  amministratore: abstractRole('amministratore', 'amministratrice'),
  consigliere: abstractRole('consigliere', 'consigliera'),
  rappresentante_legale: abstractRole('rappresentante legale'),
  titolare_firmatario: abstractRole('titolare firmatario', 'titolare firmataria'),
  socio: abstractRole('socio', 'socia'),
  socio_occulto: abstractRole('socio occulto', 'socia occulta'),
  accomandatario: abstractRole('accomandatario', 'accomandataria'),
  accomandante: abstractRole('accomandante'),
  gestore: abstractRole('gestore', 'gestrice'),
  appaltatore: abstractRole('appaltatore', 'appaltatrice'),
  fornitore: abstractRole('fornitore', 'fornitrice'),
  cliente: abstractRole('cliente'),
  proprietario: abstractRole('proprietario', 'proprietaria'),
  interessi: () => 'Interessi in',
  frequentatore: abstractRole('frequentatore abituale', 'frequentatrice abituale'),
  incontro_presso: () => 'Incontro presso',
  vive_presso: () => 'Vive presso',
  residenza: () => 'Residenza',
  domicilio: () => 'Domicilio',
  recatosi: () => 'Si è recato/a',
  visto_presso: () => 'Visto/a presso',
  sede: () => 'Sede',
  partecipante: abstractRole('partecipante', 'partecipante', ' a'),
  organizzatore: abstractRole('organizzatore', 'organizzatrice'),
  detiene: () => 'Detiene',
  utilizza_contatto: () => 'Utilizza',
  intestatario: abstractRole('intestatario', 'intestataria'),
  conducente_abituale: abstractRole('conducente abituale'),
  utilizzatore: abstractRole('utilizzatore', 'utilizzatrice'),
  controllante: abstractRole('controllante'),
  controllata: () => 'Controllata da',
  collegata: abstractRole('collegata', 'collegata', ' a'),
  joint_venture: () => 'Joint venture',
  acquisizione: () => 'Acquisizione',
  cessione: () => 'Cessione',
}

function requireName(value: string, field: 'sourceName' | 'targetName'): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Impossibile descrivere la relazione: ${field} è vuoto`)
  }
  return normalized
}

/**
 * Returns source/target names plus the discursive middle segment for rich UI rendering.
 */
export function formatRelationPhraseParts({
  sourceName,
  targetName,
  sourceKind,
  relation,
  customMiddle,
}: RelationPhraseInput): RelationPhraseParts {
  const source = requireName(sourceName, 'sourceName')
  const target = requireName(targetName, 'targetName')
  if (relation === 'custom') {
    const middle = (customMiddle || '').trim()
    if (!middle) {
      throw new Error('Tipo di relazione non supportato: custom senza testo')
    }
    return { sourceName: source, middle, targetName: target }
  }
  const template = middleTemplates[relation]
  if (!template) {
    throw new Error(`Tipo di relazione non supportato: ${String(relation)}`)
  }
  return {
    sourceName: source,
    middle: template(sourceKind),
    targetName: target,
  }
}

/**
 * Returns a complete, directed Italian sentence describing a graph relationship.
 */
export function formatRelationPhrase(input: RelationPhraseInput): string {
  const parts = formatRelationPhraseParts(input)
  return `${parts.sourceName} ${parts.middle} ${parts.targetName}`
}

/**
 * Returns the abstract relation caption shown on the graph edge (no entity names).
 */
export function abstractRelationCaption(
  relation: RelationKind,
  sourceKind: NodeKind,
  customCaption?: string,
): string {
  if (relation === 'custom') {
    const caption = (customCaption || '').trim()
    if (!caption) {
      throw new Error('Tipo di relazione non supportato: custom senza caption')
    }
    return caption
  }
  const template = abstractCaptions[relation]
  if (!template) {
    throw new Error(`Tipo di relazione non supportato: ${String(relation)}`)
  }
  return template(sourceKind)
}
