import { useState } from 'react';
import { type PersonRecord, type OccurrenceRecord } from './entity-index';
import { Baby, Home, Mail, Phone, Hash, Building2 } from 'lucide-react';

export function PersonAccordion({ persons }: { persons: PersonRecord[]; onOpenOccurrence?: (o: OccurrenceRecord) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y">
      {persons.map(p => (
        <div key={p.id} className="py-2">
          <button
            className="w-full flex items-center gap-3 text-left"
            onClick={() => setOpenId(openId === p.id ? null : p.id)}
            aria-expanded={openId === p.id}
          >
            <Avatar name={p.full_name} />
            <div className="flex-1">
              <div className="font-medium">
                {p.titles?.length ? (
                  <span className="mr-2 inline-block text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 align-middle">{p.titles[0]}</span>
                ) : null}
                <span className="align-middle">{properCaseName(p.full_name)}{typeof p.occCount === 'number' ? ` (${p.occCount})` : ''}</span>
              </div>
              {/* dettagli mostrati sotto */}
            </div>
            <span className="text-neutral-500">{openId === p.id ? '▾' : '▸'}</span>
          </button>

          {openId === p.id && (
            <div className="mt-2 bg-neutral-50 rounded-xl p-3">
              <FieldList person={p} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const isFemale = guessFemale(name)
  const base = 'w-9 h-9 rounded-full flex items-center justify-center'
  const cls = isFemale ? `${base} border-2 border-pink-400 bg-pink-50 text-pink-600` : `${base} border-2 border-blue-400 bg-blue-50 text-blue-600`
  return (
    <div className={cls} aria-label={isFemale ? 'Donna' : 'Uomo'}>
      {isFemale ? <FemaleIcon className="w-5 h-5" /> : <MaleIcon className="w-5 h-5" />}
    </div>
  )
}

function MaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="3" />
      <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6v1H4v-1z" />
    </svg>
  )
}

function FemaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3" />
      <path d="M7 21v-1.5c0-2.9 2.985-5 5-5s5 2.1 5 5V21H7z" />
    </svg>
  )
}

function FieldList({ person }: { person: PersonRecord }) {
  const loc = (() => {
    const parts: string[] = []
    if (person.postal_code) parts.push(person.postal_code)
    if (person.city || person.place_of_birth) parts.push((person.city || person.place_of_birth) as string)
    if (person.province) parts[parts.length - 1] = `${parts[parts.length - 1]} (${person.province})`
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
    { key: 'phone', label: 'Telefono', value: person.phone, Icon: Phone },
    { key: 'email', label: 'Email', value: person.email, Icon: Mail },
    { key: 'cf', label: 'Codice fiscale', value: person.tax_code, Icon: Hash },
  ]
  const present = rows.filter(r => !!r.value)
  if (present.length === 0) return <div className="text-sm text-neutral-500">Nessun dettaglio catturato.</div>
  return (
    <div className="space-y-2">
      {present.map(({ key, label, value, Icon }) => (
        <div key={key} className="flex items-baseline gap-2 text-sm">
          <Icon className="text-neutral-500 w-[1em] h-[1em]" title={label} aria-label={label} />
          <span className="font-medium">{value}</span>
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

function guessFemale(name: string): boolean {
  const first = (name.trim().split(/\s+/)[0] || '').toLowerCase()
  // very lightweight heuristic; extend with a proper list if needed
  const femaleSuffix = first.endsWith('a') || first.endsWith('ia') || first.endsWith('isa')
  const knownFem = new Set(['maria','giulia','anna','chiara','silvia','francesca','valentina','federica','alessia','roberta','luisa','sara','martina'])
  if (knownFem.has(first)) return true
  return femaleSuffix
}


