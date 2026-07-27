/**
 * Catalogo visivo canonico per i tipi di entità mostrati nell'interfaccia.
 */
import {
  Bike,
  Building2,
  Car,
  Coffee,
  Gavel,
  Hash,
  MapPin,
  Package,
  Phone,
  User,
  UserRound,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export type EntityVisualKind =
  | 'person'
  | 'male'
  | 'female'
  | 'organization'
  | 'company'
  | 'place'
  | 'bar'
  | 'restaurant'
  | 'vehicle'
  | 'motorcycle'
  | 'contact'
  | 'identifier'
  | 'object'
  | 'meeting'
  | 'other_investigation'

export type EntityVisualDefinition = {
  icon: LucideIcon
  label: string
  pluralLabel: string
  color: string
  softColor: string
}

const ENTITY_VISUALS: Record<EntityVisualKind, EntityVisualDefinition> = {
  person: {
    icon: UserRound,
    label: 'Persona',
    pluralLabel: 'Persone',
    color: '#64748b',
    softColor: '#f1f5f9',
  },
  male: {
    icon: User,
    label: 'Persona',
    pluralLabel: 'Persone',
    color: '#3b82f6',
    softColor: '#eff6ff',
  },
  female: {
    icon: UserRound,
    label: 'Persona',
    pluralLabel: 'Persone',
    color: '#ec4899',
    softColor: '#fdf2f8',
  },
  organization: {
    icon: Building2,
    label: 'Organizzazione',
    pluralLabel: 'Organizzazioni',
    color: '#d97706',
    softColor: '#fffbeb',
  },
  company: {
    icon: Building2,
    label: 'Impresa',
    pluralLabel: 'Imprese',
    color: '#d97706',
    softColor: '#fffbeb',
  },
  place: {
    icon: MapPin,
    label: 'Luogo',
    pluralLabel: 'Luoghi',
    color: '#0f766e',
    softColor: '#f0fdfa',
  },
  bar: {
    icon: Coffee,
    label: 'Bar',
    pluralLabel: 'Bar',
    color: '#92400e',
    softColor: '#fffbeb',
  },
  restaurant: {
    icon: UtensilsCrossed,
    label: 'Ristorante',
    pluralLabel: 'Ristoranti',
    color: '#dc2626',
    softColor: '#fef2f2',
  },
  vehicle: {
    icon: Car,
    label: 'Veicolo',
    pluralLabel: 'Veicoli',
    color: '#475569',
    softColor: '#f8fafc',
  },
  motorcycle: {
    icon: Bike,
    label: 'Moto',
    pluralLabel: 'Moto',
    color: '#0284c7',
    softColor: '#f0f9ff',
  },
  contact: {
    icon: Phone,
    label: 'Contatto',
    pluralLabel: 'Contatti',
    color: '#0891b2',
    softColor: '#ecfeff',
  },
  identifier: {
    icon: Hash,
    label: 'Identificatore',
    pluralLabel: 'Identificatori',
    color: '#57534e',
    softColor: '#fafaf9',
  },
  object: {
    icon: Package,
    label: 'Oggetto',
    pluralLabel: 'Oggetti',
    color: '#a16207',
    softColor: '#fefce8',
  },
  meeting: {
    icon: Users,
    label: 'Incontro',
    pluralLabel: 'Incontri',
    color: '#7c3aed',
    softColor: '#f5f3ff',
  },
  other_investigation: {
    icon: Gavel,
    label: 'Altra indagine',
    pluralLabel: 'Altre indagini',
    color: '#be123c',
    softColor: '#fff1f2',
  },
}

/** Tipi mostrati nella palette principale del grafo, nell'ordine canonico. */
export const GRAPH_TOOL_KINDS = [
  'person',
  'company',
  'place',
  'meeting',
  'vehicle',
  'other_investigation',
] as const satisfies readonly EntityVisualKind[]

/** Restituisce icona, testi e colori canonici di un tipo entità. */
export function getEntityVisual(kind: EntityVisualKind): EntityVisualDefinition {
  const visual = ENTITY_VISUALS[kind]
  if (!visual) throw new Error(`Tipo entità visivo non supportato: ${String(kind)}`)
  return visual
}

/** Restituisce l'icona canonica di un tipo entità. */
export function getEntityIcon(kind: EntityVisualKind): LucideIcon {
  return getEntityVisual(kind).icon
}

/** Restituisce il colore canonico di un tipo entità. */
export function getEntityColor(kind: EntityVisualKind): string {
  return getEntityVisual(kind).color
}

/** Restituisce l'etichetta italiana singolare di un tipo entità. */
export function getEntityLabel(kind: EntityVisualKind): string {
  return getEntityVisual(kind).label
}

/** Restituisce l'etichetta italiana plurale di un tipo entità. */
export function getEntityPluralLabel(kind: EntityVisualKind): string {
  return getEntityVisual(kind).pluralLabel
}
