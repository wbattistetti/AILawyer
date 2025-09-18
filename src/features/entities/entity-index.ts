import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type BoxPct = { x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number };

export type OccurrenceRecord = {
  id: string;
  praticaId?: string;
  personKey: string;
  docId: string;
  docTitle: string;
  page: number;
  snippet: string;
  box: BoxPct;
  createdAt: number;
};

export type PersonRecord = {
  id: string; // personKey
  praticaId?: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  tax_code?: string;
  address?: string;
  residence_address?: string;
  domicile_address?: string;
  postal_code?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  /** Titles (normalized), e.g., "Avvocato", "Dottoressa" */
  titles?: string[];
  confidence: number; // 0..1
  occCount: number;
  updatedAt: number;
};

export type DocSnapshot = {
  key: string; // praticaId|hash
  praticaId: string;
  hash: string; // content hash
  docId: string;
  title: string;
  pages: number;
  extractedAt: number; // epoch ms
  personCount: number;
  occCount: number;
};

interface EntityDB extends DBSchema {
  persons: {
    key: string;
    value: PersonRecord;
    indexes: { 'by_name': string; 'by_conf': number };
  };
  occurrences: {
    key: string;
    value: OccurrenceRecord;
    indexes: { 'by_person': string; 'by_doc': string };
  };
  doc_snapshots: {
    key: string; // key (praticaId|hash)
    value: DocSnapshot;
  };
}

let _db: IDBPDatabase<EntityDB> | null = null;

export async function entityDB() {
  if (_db) return _db;
  _db = await openDB<EntityDB>('entity-index-v1', 2, {
    upgrade(db, oldVersion) {
      // persons
      if (!db.objectStoreNames.contains('persons')) {
        const persons = db.createObjectStore('persons', { keyPath: 'id' });
        persons.createIndex('by_name', 'full_name', { unique: false });
        persons.createIndex('by_conf', 'confidence', { unique: false });
      }

      // occurrences
      if (!db.objectStoreNames.contains('occurrences')) {
        const occ = db.createObjectStore('occurrences', { keyPath: 'id' });
        occ.createIndex('by_person', 'personKey', { unique: false });
        occ.createIndex('by_doc', 'docId', { unique: false });
      }

      // snapshots: v1 -> v2 rename keyPath from 'hash' to 'key'
      if (db.objectStoreNames.contains('doc_snapshots')) {
        try { db.deleteObjectStore('doc_snapshots') } catch {}
      }
      const snaps = db.createObjectStore('doc_snapshots', { keyPath: 'key' });
      void snaps; // silence TS unused in some runtimes
    }
  });
  return _db!;
}

// CRUD helpers
export async function upsertPersons(records: PersonRecord[]) {
  const db = await entityDB();
  const tx = db.transaction(['persons'], 'readwrite');
  const store = tx.objectStore('persons');
  for (const r of records) await store.put(r);
  await tx.done;
}

export async function upsertOccurrences(records: OccurrenceRecord[]) {
  const db = await entityDB();
  const tx = db.transaction(['occurrences'], 'readwrite');
  const store = tx.objectStore('occurrences');
  for (const r of records) await store.put(r);
  await tx.done;
}

export async function setDocSnapshot(s: DocSnapshot) {
  const db = await entityDB();
  await db.put('doc_snapshots', s);
}

export async function getDocSnapshot(praticaId: string, hash: string) {
  const db = await entityDB();
  return db.get('doc_snapshots', `${praticaId}|${hash}`);
}

export async function getPendingDocs(all: Array<{ praticaId: string; hash: string; docId: string; title: string; pages: number }>) {
  const db = await entityDB();
  const pending: typeof all = [];
  for (const d of all) {
    const s = await db.get('doc_snapshots', `${d.praticaId}|${d.hash}`);
    if (!s) pending.push(d);
  }
  return pending;
}

// Search API (client-side)
export type PersonSearchFilters = {
  praticaId?: string;
  q?: string;
  hasCF?: boolean;
  hasDOB?: boolean;
  hasAddr?: boolean;
  hasTitle?: boolean;
  confMin?: number; // e.g., 0.7
  sort?: 'name' | 'confidence' | 'occ';
  limit?: number;
  offset?: number;
};

export async function searchPersons(f: PersonSearchFilters = {}) {
  const db = await entityDB();
  let all = await db.getAll('persons');

  if (f.praticaId) {
    all = all.filter(p => p.praticaId === f.praticaId)
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    all = all.filter(p =>
      p.full_name.toLowerCase().includes(q) ||
      (p.tax_code?.toLowerCase().includes(q) ?? false) ||
      (p.address?.toLowerCase().includes(q) ?? false) ||
      (p.residence_address?.toLowerCase().includes(q) ?? false) ||
      (p.domicile_address?.toLowerCase().includes(q) ?? false) ||
      (p.city?.toLowerCase().includes(q) ?? false) ||
      (p.email?.toLowerCase().includes(q) ?? false) ||
      (p.phone?.toLowerCase().includes(q) ?? false)
    );
  }
  if (f.hasCF) all = all.filter(p => !!p.tax_code);
  if (f.hasDOB) all = all.filter(p => !!p.date_of_birth);
  if (f.hasAddr) all = all.filter(p => !!p.address);
  if (f.hasTitle) all = all.filter(p => (p.titles?.length ?? 0) > 0);
  if (f.confMin != null) all = all.filter(p => p.confidence >= f.confMin);

  switch (f.sort) {
    case 'confidence':
      all.sort((a, b) => b.confidence - a.confidence);
      break;
    case 'occ':
      all.sort((a, b) => b.occCount - a.occCount);
      break;
    default:
      all.sort((a, b) => a.full_name.localeCompare(b.full_name));
      break;
  }
  const offset = f.offset ?? 0, limit = f.limit ?? 200;
  return all.slice(offset, offset + limit);
}

export async function getOccurrencesByPerson(personKey: string, limit = 1000) {
  const db = await entityDB();
  const idx = db.transaction('occurrences').store.index('by_person');
  const rows: OccurrenceRecord[] = [];
  let cursor = await idx.openCursor(IDBKeyRange.only(personKey));
  while (cursor) {
    rows.push(cursor.value);
    if (rows.length >= limit) break;
    cursor = await cursor.continue();
  }
  return rows;
}

// Maintenance utilities
export async function clearByPratica(praticaId: string) {
  const db = await entityDB();
  // persons
  const tx1 = db.transaction('persons', 'readwrite');
  const allPersons = await tx1.store.getAll();
  for (const p of allPersons) { if (p.praticaId === praticaId) await tx1.store.delete(p.id) }
  await tx1.done;
  // occurrences
  const tx2 = db.transaction('occurrences', 'readwrite');
  const allOcc = await tx2.store.getAll();
  for (const o of allOcc) { if (o.praticaId === praticaId) await tx2.store.delete(o.id) }
  await tx2.done;
  // snapshots
  const tx3 = db.transaction('doc_snapshots', 'readwrite');
  const allSnaps = await tx3.store.getAll();
  for (const s of allSnaps) { if (s.key?.startsWith(`${praticaId}|`)) await tx3.store.delete(s.key) }
  await tx3.done;
}

export async function clearAllEntityIndex() {
  const db = await entityDB();
  await db.clear('persons');
  await db.clear('occurrences');
  await db.clear('doc_snapshots');
}


