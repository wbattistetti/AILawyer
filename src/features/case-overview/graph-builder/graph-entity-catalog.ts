/**
 * Adapts extracted practice entities to selectable graph-node records.
 */
import type { PersonRecord } from '../../../types/person'
import { entityCardSubtitle } from '../../generic-entities/display'
import type { GenericEntity, GenericEntityKind } from '../../generic-entities/types'
import { inferPersonKind } from '../../person-icon-kind'
import type { NodeKind } from './types'

export { inferPersonKind } from '../../person-icon-kind'

export type GraphEntityOption = {
  id: string
  category: GenericEntityKind
  kind: NodeKind
  label: string
  subtitle: string
  details?: {
    dob?: string
    hasPs?: boolean
  }
}

const italianCollator = new Intl.Collator('it', { sensitivity: 'base' })

function normalizedPersonName(value: string): string {
  return value
    .replace(/^(?:sig\.?ra|sig\.?|dott\.?ssa|dott\.?|dr\.?ssa|dr\.?|prof\.?ssa|prof\.?|avv\.?)\s+/iu, '')
    .normalize('NFKC')
    .toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ')
    .trim()
}

function nodeKindForEntity(entity: GenericEntity): NodeKind {
  if (entity.kind === 'person') {
    return inferPersonKind(entity.properties.title, entity.properties.taxCode)
  }
  if (entity.kind === 'organization') return 'company'
  if (entity.kind === 'place') {
    const discriminator = `${entity.subtype} ${entity.label} ${entity.properties.category ?? ''}`
    if (/\b(?:bar|caffè|cafe)\b/iu.test(discriminator)) return 'bar'
    if (/\b(?:ristorante|trattoria|pizzeria)\b/iu.test(discriminator)) return 'restaurant'
    return 'place'
  }
  if (entity.kind === 'vehicle') {
    const discriminator = `${entity.subtype} ${entity.label} ${entity.properties.make ?? ''} ${entity.properties.model ?? ''}`
    return /\b(?:moto|motociclo|scooter)\b/iu.test(discriminator) ? 'motorcycle' : 'vehicle'
  }
  return entity.kind
}

function personSubtitle(person: PersonRecord, generic?: GenericEntity): string {
  const parts = [
    generic?.properties.role,
    person.profession,
    ...(person.titles ?? []),
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value))
  return [...new Set(parts)].join(' · ') || 'Persona'
}

/**
 * Creates an alphabetically sorted catalog, merging detailed person records with generic mentions.
 */
export function buildGraphEntityCatalog(
  persons: PersonRecord[],
  entities: GenericEntity[]
): GraphEntityOption[] {
  const genericPersons = new Map(
    entities
      .filter(entity => entity.kind === 'person')
      .map(entity => [normalizedPersonName(entity.properties.fullName || entity.label), entity])
  )
  const matchedGenericIds = new Set<string>()
  const options: GraphEntityOption[] = persons.map(person => {
    const generic = genericPersons.get(normalizedPersonName(person.full_name))
    if (generic) matchedGenericIds.add(generic.id)
    const title = generic?.properties.title || person.titles?.[0]
    return {
      id: `person:${person.id}`,
      category: 'person',
      kind: inferPersonKind(title, person.tax_code),
      label: person.full_name.trim(),
      subtitle: personSubtitle(person, generic),
      details: person.date_of_birth ? { dob: person.date_of_birth } : undefined,
    }
  })

  for (const entity of entities) {
    if (entity.kind === 'person' && matchedGenericIds.has(entity.id)) continue
    options.push({
      id: `entity:${entity.id}`,
      category: entity.kind,
      kind: nodeKindForEntity(entity),
      label: (entity.properties.fullName || entity.label).trim(),
      subtitle: entityCardSubtitle(entity) || entity.properties.title || entity.subtype,
    })
  }

  return options
    .filter(option => Boolean(option.label))
    .sort((left, right) => italianCollator.compare(left.label, right.label))
}

/** Filters catalog entries for the dropped palette category. */
export function filterCatalogByPaletteKind(
  catalog: GraphEntityOption[],
  paletteKind: NodeKind,
): GraphEntityOption[] {
  if (paletteKind === 'person' || paletteKind === 'male' || paletteKind === 'female') {
    return catalog.filter(option => option.category === 'person')
  }
  if (paletteKind === 'company') {
    return catalog.filter(option => option.category === 'organization')
  }
  if (paletteKind === 'place' || paletteKind === 'bar' || paletteKind === 'restaurant') {
    return catalog.filter(option => option.category === 'place')
  }
  if (paletteKind === 'vehicle' || paletteKind === 'motorcycle') {
    return catalog.filter(option => option.category === 'vehicle')
  }
  if (
    paletteKind === 'contact'
    || paletteKind === 'identifier'
    || paletteKind === 'object'
  ) {
    return catalog.filter(option => option.category === paletteKind)
  }
  return []
}

/** Whether dropping this palette kind requires selecting an extracted entity. */
export function requiresEntitySelection(paletteKind: NodeKind): boolean {
  return !(paletteKind === 'meeting' || paletteKind === 'other_investigation')
}
