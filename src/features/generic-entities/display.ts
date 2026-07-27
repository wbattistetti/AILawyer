/**
 * Etichette e formattazione UI per schede entità tipizzate.
 */

import type { EntityReviewStatus } from './organization-quality'
import type { GenericEntity, GenericEntityKind, GenericRelation, RelationKind } from './types'
import {
  getEntityLabel,
  getEntityPluralLabel,
} from '../entity-visual-catalog'

export const ENTITY_KIND_FILTERS: Array<{ id: 'all' | GenericEntityKind; label: string }> = [
  { id: 'all', label: 'Tutti' },
  ...(['person', 'place', 'organization', 'vehicle', 'contact', 'identifier', 'object'] as const)
    .map(id => ({ id, label: getEntityPluralLabel(id) })),
]

const REVIEW_STATUS_LABELS: Record<EntityReviewStatus, string> = {
  ok: 'Verificato',
  needs_review: 'Da verificare',
  ner_verified: 'Verificato NER',
  ner_corrected: 'Corretto NER',
  ner_uncertain: 'NER incerto',
  ner_unavailable: 'NER non disponibile',
  llm_verified: 'Verificato IA',
  llm_corrected: 'Corretto IA',
  review_failed: 'Review non riuscita',
}

const PROPERTY_LABELS: Record<string, string> = {
  fullName: 'Nome',
  title: 'Titolo',
  role: 'Ruolo',
  office: 'Sede',
  eventDate: 'Data',
  address: 'Indirizzo',
  city: 'Città',
  province: 'Provincia',
  postalCode: 'CAP',
  cap: 'CAP',
  placeName: 'Denominazione',
  organizationName: 'Nome',
  legalName: 'Ragione sociale',
  legalForm: 'Forma giuridica',
  institutionName: 'Istituzione',
  category: 'Categoria',
  make: 'Marca',
  model: 'Modello',
  color: 'Colore',
  plate: 'Targa',
  vin: 'Telaio / VIN',
  phone: 'Telefono',
  email: 'Email',
  pec: 'PEC',
  taxCode: 'Codice fiscale',
  vatNumber: 'Partita IVA',
  iban: 'IBAN',
  objectType: 'Tipo',
  description: 'Descrizione',
}

const SUBTYPE_LABELS: Record<string, string> = {
  address: 'Indirizzo',
  venue: 'Locale',
  institution: 'Ente pubblico',
  company: 'Società',
  phone: 'Telefono',
  email: 'Email',
  'legal-role': 'Ruolo giuridico',
}

const RELATION_LABELS: Record<RelationKind, string> = {
  'has-contact': 'Contatto collegato',
  'located-at': 'Collocazione',
  'owns-vehicle': 'Veicolo di proprietà',
  'uses-vehicle': 'Veicolo utilizzato',
  mentions: 'Menzione',
}

/** Etichetta italiana del tipo entità. */
export function kindLabel(kind: GenericEntityKind): string {
  return getEntityLabel(kind)
}

/**
 * Etichetta italiana del sottotipo, omessa quando ripete il contenuto della tab.
 */
export function entitySubtypeLabel(entity: GenericEntity): string | undefined {
  if (!entity.subtype || entity.subtype === 'mention') return undefined
  if (entity.kind === 'vehicle' && (
    entity.subtype === 'registered' || entity.subtype === 'described'
  )) {
    return undefined
  }
  const category = entity.properties.category?.trim()
  if (category) {
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()
  }
  return SUBTYPE_LABELS[entity.subtype] ?? entity.subtype
}

/** Etichetta badge review (Fase A/B). */
export function reviewStatusLabel(status: EntityReviewStatus | undefined): string | undefined {
  if (!status || status === 'ok') return undefined
  return REVIEW_STATUS_LABELS[status]
}

/** True se la scheda deve mostrare il badge “Da verificare”. */
export function entityNeedsReviewBadge(entity: GenericEntity): boolean {
  return Boolean(
    entity.needsReview
    || entity.reviewStatus === 'needs_review'
    || entity.reviewStatus === 'ner_uncertain'
    || entity.reviewStatus === 'ner_unavailable'
    || entity.reviewStatus === 'review_failed'
  )
}

/** Etichetta italiana di una proprietà tipizzata. */
export function propertyLabel(key: string): string {
  return PROPERTY_LABELS[key] ?? key
}

/** Etichetta italiana di una relazione. */
export function relationLabel(kind: RelationKind): string {
  return RELATION_LABELS[kind] ?? kind
}

/** Normalizza un nome proprio per la visualizzazione. */
export function properCaseLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b([a-zà-ü])([a-zà-ü']*)/gu, (_match, head: string, rest: string) =>
      head.toUpperCase() + rest
    )
}

/**
 * Etichetta scheda: per le persone mantiene titolo+nome già composto dal detector
 * (es. "Dott.ssa Ilaria Calò").
 */
export function entityDisplayLabel(entity: GenericEntity): string {
  return entity.label
}

/**
 * Sottotitolo sotto il nome: ruolo, sede e contatti correlati (non il titolo onorifico).
 */
export function entityCardSubtitle(entity: GenericEntity): string | undefined {
  const keys =
    entity.kind === 'person'
      ? ['role', 'office', 'eventDate', 'phone', 'email']
      : entity.kind === 'organization'
        ? ['role', 'address', 'city', 'phone', 'pec']
        : entity.kind === 'place' && entity.subtype === 'address'
          ? []
          : ['address', 'city', 'phone', 'email']
  const parts = keys
    .map(key => entity.properties[key]?.trim())
    .filter((value): value is string => Boolean(value))
  if (parts.length === 0) return undefined
  return parts.slice(0, 3).join(' · ')
}

/** Elenco proprietà presenti, ordinate per leggibilità. */
export function listEntityProperties(entity: GenericEntity): Array<{ key: string; label: string; value: string }> {
  const preferred = [
    'role', 'office', 'eventDate',
    'make', 'model', 'plate', 'color', 'vin',
    'organizationName', 'legalName', 'legalForm', 'institutionName', 'category',
    'address', 'city', 'province', 'postalCode', 'cap', 'placeName',
    'phone', 'email', 'pec', 'taxCode', 'vatNumber', 'iban',
    'objectType', 'description',
  ]
  const skip = new Set<string>(['title'])
  // Il nome è già nel titolo della scheda (es. "Dott.ssa Ilaria Calò").
  if (entity.kind === 'person') skip.add('fullName')
  if (entity.kind === 'organization' && entity.properties.institutionName === entity.label) {
    skip.add('institutionName')
  }

  const keys = Object.keys(entity.properties).filter(key => !skip.has(key))
  const ordered = [
    ...preferred.filter(key => keys.includes(key)),
    ...keys.filter(key => !preferred.includes(key)).sort(),
  ]
  return ordered
    .filter(key => Boolean(entity.properties[key]))
    .map(key => ({
      key,
      label: propertyLabel(key),
      value: entity.properties[key],
    }))
}

/** Relazioni uscenti e entranti relative a una scheda. */
export function relationsForEntity(
  entityId: string,
  relations: GenericRelation[],
  entitiesById: Map<string, GenericEntity>
): Array<{ id: string; label: string; targetLabel: string; kind: RelationKind }> {
  const rows: Array<{ id: string; label: string; targetLabel: string; kind: RelationKind }> = []
  for (const relation of relations) {
    if (relation.fromEntityId === entityId) {
      const target = entitiesById.get(relation.toEntityId)
      // Evita relazioni ridondanti già fuse nelle proprietà della scheda.
      if (relation.kind === 'has-contact' && target && (
        (target.properties.phone && entitiesById.get(entityId)?.properties.phone === target.properties.phone) ||
        (target.properties.email && entitiesById.get(entityId)?.properties.email === target.properties.email)
      )) continue
      if (relation.kind === 'located-at' && target &&
        entitiesById.get(entityId)?.properties.office === target.label) continue
      rows.push({
        id: relation.id,
        label: relationLabel(relation.kind),
        targetLabel: target?.label ?? relation.toEntityId,
        kind: relation.kind,
      })
    } else if (relation.toEntityId === entityId) {
      const source = entitiesById.get(relation.fromEntityId)
      rows.push({
        id: `${relation.id}:in`,
        label: relationLabel(relation.kind),
        targetLabel: source?.label ?? relation.fromEntityId,
        kind: relation.kind,
      })
    }
  }
  return rows.sort((left, right) => left.label.localeCompare(right.label))
}
