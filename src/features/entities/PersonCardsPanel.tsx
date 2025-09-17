import { useEffect, useMemo, useState } from 'react';
import { PersonSearchBar, type Filters } from './PersonSearchBar';
import { PersonAccordion } from './PersonAccordion';
import {
  getPendingDocs,
  searchPersons,
  clearByPratica,
  type PersonRecord,
  type OccurrenceRecord
} from './entity-index';
import { extractPersonsFromDocs, type DocAdapter, type ProgressCb } from './extract-orchestrator';

export type DocMeta = { praticaId: string; hash: string; docId: string; title: string; pages: number };

export function PersonCardsPanel({
  getAllDocsMeta,
  buildAdapters,
  onOpenOccurrence
}: {
  getAllDocsMeta: () => Promise<DocMeta[]>;
  buildAdapters: (docs: DocMeta[]) => Promise<DocAdapter[]>;
  onOpenOccurrence: (o: OccurrenceRecord) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'in_progress' | 'updated'>('idle');
  const [pending, setPending] = useState<DocMeta[]>([]);
  const [filters, setFilters] = useState<Filters>({ sort: 'name', confMin: 0.7 });
  const [persons, setPersons] = useState<PersonRecord[]>([]);
  // progress now tracked via docProgress
  const setBusyDoc = (_v: any) => {};
  const [loading, setLoading] = useState<boolean>(false);
  const [praticaId, setPraticaId] = useState<string | null>(null);
  const [docProgress, setDocProgress] = useState<{ total: number; done: number; current?: { docId: string; title: string; pages: number; page: number } } | null>(null)
  const [previewPersons, setPreviewPersons] = useState<PersonRecord[] | null>(null)

  useEffect(() => { refreshPending(); }, []);

  useEffect(() => { runSearch(filters); }, [filters]);
  // Re-run filtering when streaming preview changes
  useEffect(() => { if (previewPersons) runSearch(filters) }, [previewPersons]);

  async function refreshPending() {
    const all = await getAllDocsMeta();
    const pend = await getPendingDocs(all);
    setPending(pend);
    setPraticaId(all[0]?.praticaId ?? null);
    setStatus(pend.length > 0 ? 'pending' : (status === 'idle' ? 'updated' : status));
  }

  async function runSearch(f: Filters) {
    setLoading(!previewPersons);
    try {
      // If we have a fresh in-memory preview, filter it locally
      if (previewPersons) {
        let rows = [...previewPersons]
        if (f.q) {
          const q = f.q.toLowerCase()
          rows = rows.filter(p =>
            p.full_name.toLowerCase().includes(q) ||
            (p.tax_code?.toLowerCase().includes(q) ?? false) ||
            (p.address?.toLowerCase().includes(q) ?? false) ||
            (p.city?.toLowerCase().includes(q) ?? false) ||
            (p.email?.toLowerCase().includes(q) ?? false) ||
            (p.phone?.toLowerCase().includes(q) ?? false)
          )
        }
        if (f.hasCF) rows = rows.filter(p => !!p.tax_code)
        if (f.hasDOB) rows = rows.filter(p => !!p.date_of_birth)
        if (f.hasAddr) rows = rows.filter(p => !!p.address)
        if (typeof f.confMin === 'number') rows = rows.filter(p => p.confidence >= (f.confMin ?? 0))
        if (f.hasTitle) rows = rows.filter(p => (p.titles?.length ?? 0) > 0)
        switch (f.sort) {
          case 'confidence': rows.sort((a,b)=> b.confidence - a.confidence); break;
          case 'occ': rows.sort((a,b)=> b.occCount - a.occCount); break;
          default: rows.sort((a,b)=> a.full_name.localeCompare(b.full_name));
        }
        setPersons(rows)
      } else {
        // Otherwise query IndexedDB
        const rows = await searchPersons({
          praticaId: praticaId ?? (await getAllDocsMeta())[0]?.praticaId,
          q: f.q,
          hasCF: f.hasCF,
          hasDOB: f.hasDOB,
          hasAddr: f.hasAddr,
          hasTitle: f.hasTitle,
          confMin: f.confMin,
          sort: f.sort,
          limit: 500
        });
        setPersons(rows);
      }
    } finally {
      setLoading(false);
    }
  }

  const tip = useMemo(() => {
    if (pending.length === 0) return '';
    const names = pending.slice(0, 10).map(d => `• ${d.title}`).join('\n');
    return pending.length > 10 ? `${names}\n… e altri ${pending.length - 10}` : names;
  }, [pending]);

  async function onExtractClick() {
    setStatus('in_progress');
    const toProcess = pending.length ? pending : await getAllDocsMeta();
    const adapters = await buildAdapters(toProcess);
    setDocProgress({ total: adapters.length, done: 0, current: undefined })
    const onProgress: ProgressCb = ({ docId: _docId, page }) => {
      setBusyDoc(null)
      setDocProgress((prev: { total: number; done: number; current?: { docId: string; title: string; pages: number; page: number } } | null) => prev ? { ...prev, current: prev.current ? { ...prev.current, page } : prev.current } : prev)
    }
    // Non persistere finché l’utente non salva esplicitamente
    const result = await extractPersonsFromDocs(adapters, onProgress, {
      persist: false,
      onOccurrence: (items: any[]) => {
        // items are OccOut[]; map to PersonRecord preview entries and append incrementally
        setPreviewPersons((prev) => {
          const arr = prev ? [...prev] : []
          for (const it of items as any[]) {
            const pid = it.personKey
            const now = Date.now()
            const idx = arr.findIndex(p => p.id === pid)
            if (idx >= 0) {
              arr[idx].confidence = Math.max(arr[idx].confidence, it.confidence)
              arr[idx].occCount += 1
              arr[idx].updatedAt = now
              if (it.title) {
                const set = new Set(arr[idx].titles ?? [])
                set.add(it.title)
                arr[idx].titles = Array.from(set)
              }
            } else {
              arr.push({
                id: pid,
                praticaId: praticaId || '',
                full_name: it.full_name,
                first_name: it.first_name,
                last_name: it.last_name,
                titles: it.title ? [it.title] : [],
                confidence: it.confidence,
                occCount: 1,
                updatedAt: now,
              } as any)
            }
          }
          return arr
        })
        // no explicit runSearch here (useEffect on previewPersons will react)
      },
      onStartDoc: (info) => setDocProgress((prev: { total: number; done: number; current?: { docId: string; title: string; pages: number; page: number } } | null) => {
        if (!prev) return prev
        return { ...prev, current: { ...info, page: 0 } }
      }),
      onDoneDoc: () => setDocProgress((prev: { total: number; done: number; current?: { docId: string; title: string; pages: number; page: number } } | null) => {
        if (!prev) return prev
        const nextDone = Math.min(prev.done + 1, prev.total)
        const nextCurrent = prev.current ? { ...prev.current, page: prev.current.pages } : prev.current
        return { ...prev, done: nextDone, current: nextCurrent }
      })
    });
    setPreviewPersons(result.persons || [])
    await runSearch(filters)
    setStatus('updated');
    setDocProgress(null)
  }

  async function onSaveClick() {
    // Riesegue l'estrazione veloce per costruire i dati e poi persiste
    setStatus('in_progress');
    const toProcess = await getAllDocsMeta();
    const adapters = await buildAdapters(toProcess);
    const onProgress: ProgressCb = () => setBusyDoc(null);
    await extractPersonsFromDocs(adapters, onProgress, { persist: true });
    setPreviewPersons(null)
    await refreshPending();
    await runSearch(filters);
    setStatus('updated');
  }

  async function onClearClick() {
    if (!praticaId) return;
    setStatus('in_progress');
    await clearByPratica(praticaId);
    setPreviewPersons(null)
    setPersons([])
    await refreshPending();
    await runSearch(filters);
    setStatus('updated');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <button
            className="px-3 py-1 rounded-lg border hover:bg-neutral-50"
            onClick={onExtractClick}
            title={tip || 'Analizza i documenti di questa pratica'}
          >
            Analizza
          </button>
          <button
            className="px-3 py-1 rounded-lg border hover:bg-neutral-50"
            onClick={onSaveClick}
            title="Salva risultati in questa pratica"
          >
            Salva
          </button>
          <button
            className="px-3 py-1 rounded-lg border hover:bg-neutral-50"
            onClick={onClearClick}
            title="Pulisci indice (solo questa pratica)"
          >
            Pulisci
          </button>
          {pending.length > 0 && (
            <span className="text-xs text-neutral-500 ml-1">Da analizzare: {pending.length}</span>
          )}
        </div>
        {/* Progress area was on the right; we'll also show it just below for visibility */}
      </div>

      {docProgress && (
        <div className="px-2 py-2 border-b bg-white">
          <div className="max-w-[640px]">
            <div className="text-xs text-neutral-500 mb-1">Documenti: {docProgress.done}/{docProgress.total}</div>
            <div className="w-full h-2 bg-neutral-200 rounded mb-2">
              <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.round((docProgress.done / Math.max(1, docProgress.total)) * 100)}%` }} />
            </div>
            {docProgress.current && (
              <>
                <div className="text-xs text-neutral-500 mb-1 truncate" title={docProgress.current.title}>Pagina: {docProgress.current.page}/{docProgress.current.pages} — {docProgress.current.title}</div>
                <div className="w-full h-2 bg-neutral-200 rounded">
                  <div className="h-2 bg-amber-500 rounded" style={{ width: `${Math.round((docProgress.current.page / Math.max(1, docProgress.current.pages)) * 100)}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <PersonSearchBar value={filters} onChange={setFilters} />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-neutral-500">Caricamento…</div>
        ) : (
          <PersonAccordion persons={persons} onOpenOccurrence={onOpenOccurrence} />
        )}
        {!loading && persons.length === 0 && (
          <div className="p-6 text-sm text-neutral-500">Nessuna persona trovata. Prova a estrarre o cambia filtri.</div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'idle' | 'pending' | 'in_progress' | 'updated' }) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    idle: { label: 'Non analizzato', cls: 'bg-neutral-100 text-neutral-700' },
    pending: { label: 'Da analizzare', cls: 'bg-amber-100 text-amber-800' },
    in_progress: { label: 'In corso', cls: 'bg-blue-100 text-blue-800' },
    updated: { label: 'Aggiornato', cls: 'bg-green-100 text-green-800' },
  } as any;
  const cfg = map[status];
  return (
    <span className={`px-2 py-1 rounded-full text-xs ${cfg.cls}`}>{cfg.label}</span>
  );
}

export default PersonCardsPanel;


