import { upsertOccurrences, upsertPersons, setDocSnapshot, type PersonRecord, type OccurrenceRecord, type DocSnapshot } from './entity-index';

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
  const allOccurrences: OccurrenceRecord[] = [];
  const snapshots: DocSnapshot[] = [];

  const runDoc = async (ad: DocAdapter) => {
    const meta = await ad.getDocMeta();
    log('start', { docId: meta.docId, title: meta.title, pages: meta.pages })
    if (typeof options?.onStartDoc === 'function') {
      try { options.onStartDoc({ docId: meta.docId, title: meta.title, pages: meta.pages }) } catch {}
    }
    worker.postMessage({ type: 'beginDoc', docId: meta.docId, docTitle: meta.title, lenient: true });

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
      // Dump page 3 normalized text for debugging
      if (page === 3) {
        try {
          // @ts-ignore - we know worker's helper name
          const sampleText = (tokens as any).map?.((t:any)=>t.text).join(' ')
          console.log('[ENTITY][page3][raw]', sampleText?.slice(0, 2000) || '')
        } catch {}
      }
      worker.postMessage({ type: 'page', payload: { page, tokens, docId: meta.docId, docTitle: meta.title } });
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
      const pid = it.personKey as string;
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
      person.occCount += 1;
      person.updatedAt = now;
      person.titles = Array.from(titlesSet);
      allPersons.set(pid, person);

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


