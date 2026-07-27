import { useMemo, useState } from 'react';
import { type PersonRecord, type OccurrenceRecord } from './entity-index';
import { Baby, Home, Mail, Phone, Hash, Building2, Briefcase, Trash2 } from 'lucide-react';
import { EntityTypeIcon } from '../EntityTypeIcon'
import { inferPersonKind } from '../person-icon-kind'
import { getPersonSummary } from '../events/event-index'
import { OccurrenceEvidenceSection } from './OccurrenceEvidenceSection'

type PersonAccordionProps = {
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  onOpenOccurrence?: (
    occurrence: OccurrenceRecord,
    context?: { highlightQuery?: string; highlightTerms?: string[] }
  ) => void
  getOccurrencePdfUrl?: (occurrence: OccurrenceRecord) => string | undefined
  isOccurrenceScanned?: (occurrence: OccurrenceRecord) => boolean
  onDeletePerson?: (personId: string) => void
}

/** Restituisce un nuovo insieme alternando l'apertura della persona indicata. */
export function togglePersonExpansion(
  current: ReadonlySet<string>,
  personId: string
): Set<string> {
  const next = new Set(current)
  if (next.has(personId)) next.delete(personId)
  else next.add(personId)
  return next
}

/** Mostra le schede anagrafiche espandibili e le relative azioni. */
export function PersonAccordion({
  persons,
  occurrences,
  onOpenOccurrence,
  getOccurrencePdfUrl,
  isOccurrenceScanned,
  onDeletePerson,
}: PersonAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const occurrencesByPerson = useMemo(() => {
    const grouped = new Map<string, OccurrenceRecord[]>()
    occurrences.forEach(occurrence => {
      const current = grouped.get(occurrence.personKey) ?? []
      current.push(occurrence)
      grouped.set(occurrence.personKey, current)
    })
    return grouped
  }, [occurrences])

  const togglePerson = (personId: string) => {
    setOpenIds(current => togglePersonExpansion(current, personId))
  }

  return (
    <div className="divide-y">
      {persons.map(p => {
        const isOpen = openIds.has(p.id)
        return (
        <div key={p.id} className="py-2">
          <div className="flex items-center gap-2">
            <button
              className="flex-1 flex items-center gap-3 text-left"
              onClick={() => togglePerson(p.id)}
              aria-expanded={isOpen}
            >
              <Avatar person={p} />
              <div className="flex-1">
                <div className="font-medium">
                  {p.titles?.length ? (
                    <span className="mr-2 inline-block text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 align-middle">{p.titles[0]}</span>
                  ) : null}
                  <span className="align-middle">{properCaseName(p.full_name)}{typeof p.occCount === 'number' ? ` (${p.occCount})` : ''}</span>
                  <EventBadge name={p.full_name} />
                </div>
              </div>
              <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>
            </button>
            {onDeletePerson && (
              <button
                type="button"
                className="p-2 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                title={`Elimina la scheda di ${properCaseName(p.full_name)}`}
                aria-label={`Elimina la scheda di ${properCaseName(p.full_name)}`}
                onClick={() => {
                  if (window.confirm(`Eliminare la scheda anagrafica di ${properCaseName(p.full_name)}?`)) {
                    onDeletePerson(p.id)
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {isOpen && (
            <div className="mt-2 bg-neutral-50 rounded-xl p-3">
              <FieldList person={p} />
              <OccurrenceEvidenceSection
                occurrences={occurrencesByPerson.get(p.id) ?? []}
                onOpenOccurrence={
                  onOpenOccurrence
                    ? (occurrence) => {
                        const highlightTerms = [
                          p.full_name,
                          p.first_name ?? '',
                          p.last_name ?? '',
                          p.tax_code ?? '',
                        ].filter(term => term.trim().length >= 2)
                        onOpenOccurrence(occurrence, {
                          highlightQuery: properCaseName(p.full_name),
                          highlightTerms,
                        })
                      }
                    : undefined
                }
                getPdfUrl={getOccurrencePdfUrl}
                isScanned={isOccurrenceScanned}
                highlightTerms={[
                  p.full_name,
                  p.first_name ?? '',
                  p.last_name ?? '',
                  p.tax_code ?? '',
                ]}
              />
            </div>
          )}
        </div>
      )})}
    </div>
  );
}

function EventBadge({ name }: { name: string }) {
  const s = getPersonSummary(name)
  if (!s.total) return null
  const kinds = Object.entries(s.byType).map(([k,v]) => `${k}:${v}`).join(' · ')
  return <span className="ml-2 text-xs text-neutral-600 align-middle">Eventi {s.total} ({kinds})</span>
}

function Avatar({ person }: { person: PersonRecord }) {
  const kind = inferPersonKind(person.titles?.[0], person.tax_code)
  const label = kind === 'female' ? 'Donna' : kind === 'male' ? 'Uomo' : 'Persona'
  return <EntityTypeIcon kind={kind} iconSize={20} label={label} />
}

function FieldList({ person }: { person: PersonRecord }) {
  const loc = (() => {
    const parts: string[] = []
    if (person.postal_code) parts.push(person.postal_code)
    if (person.city) {
      parts.push(person.province ? `${person.city} (${person.province})` : person.city)
    } else if (person.province) {
      parts.push(`(${person.province})`)
    }
    return parts.length ? parts.join(' ') : ''
  })()
  const withCity = (addr?: string) => {
    if (!addr) return undefined
    return loc ? `${addr}, ${loc}` : addr
  }
  const rows: Array<{ key: string; label: string; value?: string; Icon: any }> = [
    { key: 'pob', label: 'Luogo di nascita', value: person.place_of_birth, Icon: Baby },
    { key: 'dob', label: 'Data di nascita', value: person.date_of_birth, Icon: Baby },
    { key: 'raddr', label: 'Residenza', value: withCity(person.residence_address || person.address), Icon: Home },
    { key: 'daddr', label: 'Domicilio', value: withCity(person.domicile_address), Icon: Home },
    { key: 'city', label: 'Città', value: person.city, Icon: Building2 },
    { key: 'prov', label: 'Provincia', value: person.province, Icon: Building2 },
    { key: 'cap', label: 'CAP', value: person.postal_code, Icon: Hash },
    { key: 'profession', label: 'Professione', value: person.profession, Icon: Briefcase },
    { key: 'phone', label: 'Telefono', value: person.phone, Icon: Phone },
    { key: 'email', label: 'Email', value: person.email, Icon: Mail },
    { key: 'cf', label: 'Codice fiscale', value: person.tax_code, Icon: Hash },
  ]
  const present = rows.filter(r => !!r.value)
  if (present.length === 0) return <div className="text-sm text-neutral-500">Nessun dettaglio catturato.</div>
  return (
    <div className="space-y-2">
      {present.map(({ key, label, value, Icon }) => (
        <div key={key} className="grid grid-cols-[1em_8rem_1fr] items-baseline gap-2 text-sm">
          <Icon className="text-neutral-500 w-[1em] h-[1em]" title={label} aria-label={label} />
          <span className="text-neutral-500">{label}</span>
          <span className="font-medium break-words">{value}</span>
        </div>
      ))}
    </div>
  )
}

// initials helper no longer used

function properCaseName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b([a-zà-ü])([a-zà-ü']*)/g, (_m, a: string, b: string) => a.toUpperCase() + b)
}


