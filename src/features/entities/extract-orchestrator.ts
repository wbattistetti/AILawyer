import { upsertOccurrences, upsertPersons, setDocSnapshot, type PersonRecord, type OccurrenceRecord, type DocSnapshot } from './entity-index';
import { normalizeAddress } from '../../services/address/client';
import type { Address } from '../../services/address/types';
import { extractEvents } from '../../services/nlp/client'
import { addBatch as addEventsToIndex } from '../events/event-index'

export interface DocAdapter {
  getDocMeta(): Promise<{ praticaId?: string; docId: string; title: string; pages: number; hash: string }>;
  streamPageTokens(): AsyncGenerator<{ page: number; tokens: Array<{ text: string; x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }> }, void>;
}

export type ProgressCb = (p: { docId: string; page: number }) => void;

// Worker module (Vite style)
const worker = new Worker(new URL('./extract.worker.ts', import.meta.url), { type: 'module' });
const log = (...args: any[]) => { try { console.log('[ENTITY][orchestrator]', ...args) } catch {} }

export async function extractPersonsFromDocs(
  adapters: DocAdapter[],
  onProgress?: ProgressCb,
  options?: { persist?: boolean; onStartDoc?: (info: { docId: string; title: string; pages: number }) => void; onDoneDoc?: (info: { docId: string }) => void; onOccurrence?: (items: any[], meta: { docId: string; title: string; pages: number; praticaId?: string }) => void }
) {
  const allPersons = new Map<string, PersonRecord>();
  const byName = new Map<string, Set<string>>(); // normalized name -> person ids
  const allOccurrences: OccurrenceRecord[] = [];
  const snapshots: DocSnapshot[] = [];

  const runDoc = async (ad: DocAdapter) => {
    const meta = await ad.getDocMeta();
    log('start', { docId: meta.docId, title: meta.title, pages: meta.pages })
    if (typeof options?.onStartDoc === 'function') {
      try { options.onStartDoc({ docId: meta.docId, title: meta.title, pages: meta.pages }) } catch {}
    }
    // Disable lenient mode to avoid false positives like brand/model strings
    worker.postMessage({ type: 'beginDoc', docId: meta.docId, docTitle: meta.title, lenient: false });

    const occForDoc: any[] = [];
    const handler = (e: MessageEvent<any>) => {
      const msg = e.data;
      if (msg?.type === 'occurrences' && msg.docId === meta.docId) {
        occForDoc.push(...msg.items);
        try { options?.onOccurrence?.(msg.items || [], { docId: meta.docId, title: meta.title, pages: meta.pages, praticaId: meta.praticaId }) } catch {}
      }
      if (msg?.type === 'progress' && msg.docId === meta.docId) {
        onProgress?.({ docId: meta.docId, page: msg.page });
        log('progress', { docId: meta.docId, page: msg.page })
      }
    };
    worker.addEventListener('message', handler);

    for await (const { page, tokens } of ad.streamPageTokens()) {
      // Optional debug page 3
      if (page === 3) {
        try {
          // @ts-ignore - we know worker's helper name
          const sampleText = (tokens as any).map?.((t:any)=>t.text).join(' ')
          console.log('[ENTITY][page3][raw]', sampleText?.slice(0, 2000) || '')
        } catch {}
      }
      // Fire person extraction
      worker.postMessage({ type: 'page', payload: { page, tokens, docId: meta.docId, docTitle: meta.title } });

      // Fire event extraction (best-effort, short timeout, non-blocking)
      try {
        const text = tokens.map(t => t.text).join(' ').replace(/\s+/g,' ').trim()
        if (text.length > 24) {
          extractEvents(text, { doc_id: meta.docId, page, title: meta.title }, { timeoutMs: 800 })
            .then(res => {
              if (!res.ok || !res.events?.length) return;
              addEventsToIndex(meta.docId, res.events, meta.praticaId)
            })
            .catch(() => {})
        }
      } catch {}
    }
    worker.postMessage({ type: 'endDoc', docId: meta.docId });

    await new Promise<void>((resolve) => {
      const done = (e: MessageEvent<any>) => {
        if (e.data?.type === 'done' && e.data.docId === meta.docId) {
          worker.removeEventListener('message', done);
          worker.removeEventListener('message', handler as any);
          resolve();
        }
      };
      worker.addEventListener('message', done);
    });
    if (typeof options?.onDoneDoc === 'function') {
      try { options.onDoneDoc({ docId: meta.docId }) } catch {}
    }
    log('done', { docId: meta.docId, occ: occForDoc.length })

    // Merge occurrences into persons and occurrence list
    for (const it of occForDoc) {
      const normalizedName = normalizeName(it.full_name)
      // Try to find an existing person with same normalized name and compatible fields; choose most complete
      const candidateIds = Array.from(byName.get(normalizedName) ?? [])
      let pid = it.personKey as string
      let bestId: string | null = null
      let bestScore = -1
      for (const id of candidateIds) {
        const p = allPersons.get(id)
        if (!p) continue
        if (!areFieldsCompatible(p, it.fields || {})) continue
        const s = completenessScore(p)
        if (s > bestScore) { bestScore = s; bestId = id }
      }
      if (bestId) pid = bestId

      const now = Date.now();
      const prev = allPersons.get(pid);
      const titlesSet = new Set<string>(prev?.titles ?? []);
      if ((it as any).title) titlesSet.add((it as any).title as string);
      const person = prev ?? {
        id: pid,
        praticaId: meta.praticaId,
        full_name: it.full_name,
        first_name: it.first_name,
        last_name: it.last_name,
        date_of_birth: it.fields?.date_of_birth,
        place_of_birth: it.fields?.place_of_birth,
        tax_code: it.fields?.tax_code,
        address: it.fields?.address,
        postal_code: it.fields?.postal_code,
        city: it.fields?.city,
        province: it.fields?.province,
        phone: it.fields?.phone,
        email: it.fields?.email,
        confidence: it.confidence,
        occCount: 0,
        updatedAt: now,
        titles: [],
      } as PersonRecord;
      person.confidence = Math.max(person.confidence, it.confidence);
      // Enrich missing fields if compatible
      mergePersonFields(person, it.fields || {})
      person.occCount += 1;
      person.updatedAt = now;
      person.titles = Array.from(titlesSet);
      allPersons.set(pid, person);
      // async address hydration (fire-and-forget)
      try {
        // residence
        if (it.fields?.raw_residence_text) {
          try { if ((window as any).__ADDR_LOG) console.log('[ADDR][start][res]', { docId: meta.docId, name: it.full_name, page: it.page, raw: it.fields.raw_residence_text }); } catch {}
          normalizeAddress('residence', it.fields.raw_residence_text as string, { last_place: it.fields?.place_of_birth })
            .then((addr: Address | null) => {
              if (!addr) return;
              const p = allPersons.get(pid); if (!p) return;
              p.residence_address = p.residence_address || addr.norm || p.address;
              p.address = p.address || addr.components.road ? addr.norm : p.address;
              if (addr.components.municipality) p.city = addr.components.municipality;
              if (addr.components.postcode) p.postal_code = addr.components.postcode;
              if (addr.components.province) p.province = addr.components.province;
              try { if ((window as any).__ADDR_LOG) console.log('[ADDR][ok][res]', { docId: meta.docId, norm: addr.norm, comps: addr.components }); } catch {}
              try {
                options?.onOccurrence?.([
                  {
                    personKey: pid,
                    full_name: it.full_name,
                    first_name: it.first_name,
                    last_name: it.last_name,
                    page: it.page,
                    snippet: it.snippet,
                    box: it.box,
                    confidence: it.confidence,
                    fields: {
                      address: addr.norm,
                      city: addr.components.municipality,
                      postal_code: addr.components.postcode,
                      province: addr.components.province,
                    },
                  }
                ] as any[], { docId: meta.docId, title: meta.title, pages: meta.pages, praticaId: meta.praticaId })
              } catch {}
            }).catch(()=>{});
        }
        // domicile
        if ((it.fields as any)?.raw_domicile_text) {
          try { if ((window as any).__ADDR_LOG) console.log('[ADDR][start][dom]', { docId: meta.docId, name: it.full_name, page: it.page, raw: (it.fields as any).raw_domicile_text }); } catch {}
          normalizeAddress('domicile', (it.fields as any).raw_domicile_text as string, { last_place: it.fields?.place_of_birth })
            .then((addr: Address | null) => {
              if (!addr) { try { if ((window as any).__ADDR_LOG) console.warn('[ADDR][miss][dom]', { docId: meta.docId }); } catch {} ; return; }
              const p = allPersons.get(pid); if (!p) return;
              p.domicile_address = p.domicile_address || addr.norm || p.domicile_address;
              try { if ((window as any).__ADDR_LOG) console.log('[ADDR][ok][dom]', { docId: meta.docId, norm: addr.norm, comps: addr.components }); } catch {}
              try {
                options?.onOccurrence?.([
                  {
                    personKey: pid,
                    full_name: it.full_name,
                    first_name: it.first_name,
                    last_name: it.last_name,
                    page: it.page,
                    snippet: it.snippet,
                    box: it.box,
                    confidence: it.confidence,
                    fields: {
                      domicile: addr.norm,
                    },
                  }
                ] as any[], { docId: meta.docId, title: meta.title, pages: meta.pages, praticaId: meta.praticaId })
              } catch {}
            }).catch(()=>{});
        }
      } catch {}
      const set = byName.get(normalizedName) ?? new Set<string>()
      set.add(pid)
      byName.set(normalizedName, set)

      allOccurrences.push({
        id: cryptoRandom(),
        praticaId: meta.praticaId,
        personKey: pid,
        docId: meta.docId,
        docTitle: meta.title,
        page: it.page,
        snippet: it.snippet,
        box: it.box,
        createdAt: now,
      });
    }

    snapshots.push({
      key: `${meta.praticaId || ''}|${meta.hash}`,
      praticaId: meta.praticaId || '',
      hash: meta.hash,
      docId: meta.docId,
      title: meta.title,
      pages: meta.pages,
      extractedAt: Date.now(),
      personCount: allPersons.size,
      occCount: allOccurrences.length,
    })
  };

  for (const ad of adapters) {
    await runDoc(ad);
  }

  if (options?.persist) {
    await upsertPersons(Array.from(allPersons.values()));
    await upsertOccurrences(allOccurrences);
    for (const s of snapshots) await setDocSnapshot(s);
  }

  return { persons: Array.from(allPersons.values()), occurrences: allOccurrences, snapshots };
}

function cryptoRandom() {
  try {
    // Prefer UUID if available
    return (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Math.random()).slice(2);
  } catch {
    return String(Math.random()).slice(2);
  }
}

// --- Helpers for realtime dedup/merge ---
function normalizeName(s: string): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()
}

function completenessScore(p: Partial<PersonRecord>): number {
  let s = 0
  if (p.date_of_birth) s += 3
  if (p.place_of_birth) s += 2
  if (p.tax_code) s += 3
  if (p.address) s += 2
  if (p.city) s += 1
  if (p.province) s += 1
  if (p.email) s += 1
  if (p.phone) s += 1
  return s
}

function areFieldsCompatible(p: Partial<PersonRecord>, f: any): boolean {
  // If both have a value for the same key and they differ, treat as incompatible homonyms
  const keys: Array<keyof PersonRecord> = ['date_of_birth','place_of_birth','tax_code','city','province']
  for (const k of keys) {
    let a: any = (p as any)[k]
    let b: any = (f as any)[k]
    if (k === 'date_of_birth') { a = normDob(a); b = normDob(b) }
    if (a && b && String(a).trim() !== String(b).trim()) return false
  }
  return true
}

function mergePersonFields(p: PersonRecord, f: any) {
  const setIfEmpty = (k: keyof PersonRecord, v?: string) => { if (!p[k] && v) (p as any)[k] = v }
  setIfEmpty('date_of_birth', normDob(f?.date_of_birth))
  setIfEmpty('place_of_birth', f?.place_of_birth)
  setIfEmpty('tax_code', f?.tax_code)
  setIfEmpty('address', f?.address)
  setIfEmpty('postal_code', f?.postal_code)
  setIfEmpty('city', f?.city)
  setIfEmpty('province', f?.province)
  setIfEmpty('phone', f?.phone)
  setIfEmpty('email', f?.email)
}

function normDob(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m1 = raw.match(/([0-3]?\d)[\.\/-]([01]?\d)[\.\/-]((?:19|20)\d{2})/);
  if (m1) return `${m1[3]}-${String(m1[2]).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  return raw;
}


