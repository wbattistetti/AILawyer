import { useEffect, useState } from 'react';
import { getOccurrencesByPerson, type PersonRecord, type OccurrenceRecord } from './entity-index';

export function PersonAccordion({ persons, onOpenOccurrence }: { persons: PersonRecord[]; onOpenOccurrence: (o: OccurrenceRecord) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [occ, setOcc] = useState<Record<string, OccurrenceRecord[]>>({});

  useEffect(() => { if (openId && !occ[openId]) loadOcc(openId); }, [openId]);

  async function loadOcc(personKey: string) {
    const rows = await getOccurrencesByPerson(personKey, 500);
    setOcc(o => ({ ...o, [personKey]: rows }));
  }

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
                <span className="align-middle">{properCaseName(p.full_name)}</span>
              </div>
              <div className="text-xs text-neutral-500 flex gap-3">
                {p.tax_code && <span>CF: {p.tax_code}</span>}
                <span>Conf.: {(p.confidence * 100 | 0)}%</span>
                <span>Occorrenze: {p.occCount}</span>
              </div>
            </div>
            <span className="text-neutral-500">{openId === p.id ? '▾' : '▸'}</span>
          </button>

          {openId === p.id && (
            <div className="mt-2 bg-neutral-50 rounded-xl p-3">
              <FieldGrid person={p} />
              <div className="mt-3">
                <div className="text-sm font-medium mb-2">Occorrenze</div>
                <div className="max-h-64 overflow-auto border rounded-lg">
                  {(occ[p.id] ?? []).map(o => (
                    <div key={o.id} className="px-3 py-2 flex items-center justify-between border-b last:border-0">
                      <div className="text-sm">
                        <div className="text-neutral-700">{o.docTitle} — pag. {o.page}</div>
                        <div className="text-neutral-500 text-xs truncate max-w-[60ch]">… {o.snippet} …</div>
                      </div>
                      <button
                        className="px-2 py-1 border rounded-lg text-sm hover:bg-white"
                        onClick={() => onOpenOccurrence(o)}
                        title="Apri nel viewer"
                      >Apri</button>
                    </div>
                  ))}
                  {(!occ[p.id] || occ[p.id].length === 0) && (
                    <div className="px-3 py-6 text-sm text-neutral-500">Nessuna occorrenza caricata.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const isFemale = guessFemale(name)
  const base = 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold'
  const cls = isFemale ? `${base} border-2 border-pink-400 bg-pink-50 text-pink-700` : `${base} border-2 border-blue-400 bg-blue-50 text-blue-700`
  // simple silhouette using initials fallback
  const mark = initials(name) || '?'
  return <div className={cls}>{mark}</div>
}

function FieldGrid({ person }: { person: PersonRecord }) {
  const fields: Array<[string, string | undefined]> = [
    ['Data di nascita', person.date_of_birth],
    ['Luogo di nascita', person.place_of_birth],
    ['Indirizzo', person.address],
    ['CAP', person.postal_code],
    ['Città', person.city],
    ['Provincia', person.province],
    ['Telefono', person.phone],
    ['Email', person.email],
    ['CF', person.tax_code],
  ];
  const present = fields.filter(([, v]) => !!v);
  if (present.length === 0) return <div className="text-sm text-neutral-500">Nessun dettaglio catturato.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
      {present.map(([label, value]) => (
        <div key={label} className="text-sm">
          <div className="text-neutral-500">{label}</div>
          <div className="font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const take = parts.filter(Boolean).slice(0, 2)
  return take.map(p => p[0] ? p[0].toUpperCase() : '').join('')
}

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


