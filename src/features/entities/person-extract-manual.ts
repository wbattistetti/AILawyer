import type { PersonRecord } from './entity-index';
import { searchPersons } from './entity-index';
import {
  linkPersonFields,
  type ExtractedPersonWithIndices,
  type FieldWithIndices,
  type PersonExtractionResult,
} from './person-field-linker';

export type { ExtractedPersonWithIndices, FieldWithIndices, PersonExtractionResult };

function normalizeName(s: string): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()
}

function normDob(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m1 = raw.match(/([0-3]?\d)[\.\/-]([01]?\d)[\.\/-]((?:19|20)\d{2})/);
  if (m1) return `${m1[3]}-${String(m1[2]).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  const m2 = raw.match(/([0-3]?\d)\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\w*\s+((?:19|20)\d{2})/i);
  if (m2) {
    const monthMap: Record<string, string> = {
      'gen': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'mag': '05', 'giu': '06', 'lug': '07', 'ago': '08',
      'set': '09', 'ott': '10', 'nov': '11', 'dic': '12'
    };
    const month = monthMap[m2[2].toLowerCase()] || '01';
    return `${m2[3]}-${month}-${String(m2[1]).padStart(2,'0')}`;
  }
  return raw;
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
  setIfEmpty('profession', f?.profession)
}

function generatePersonKey(fullName: string, dateOfBirth?: string, taxCode?: string): string {
  const raw = [normalizeName(fullName), normDob(dateOfBirth), taxCode?.toUpperCase()].filter(Boolean).join('|');
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `person-${(hash >>> 0).toString(16)}`;
}

/**
 * ✅ NUOVA VERSIONE: Analizza un testo e estrae dati anagrafici con indici
 * @param text Testo da analizzare
 * @returns Risultato con persone e indici per ogni campo
 */
export async function analyzeTextForPerson(text: string): Promise<PersonExtractionResult> {
  return linkPersonFields(text);
}

/**
 * ✅ Funzione helper per convertire ExtractedPersonWithIndices in PersonRecord
 * (per compatibilità con codice esistente)
 */
export function convertToPersonRecord(extracted: ExtractedPersonWithIndices): PersonRecord {
  const normalizedDateOfBirth = extracted.birthDate ? normDob(extracted.birthDate.value) : undefined;
  return {
    id: generatePersonKey(extracted.fullName, normalizedDateOfBirth, extracted.taxCode?.value),
    full_name: extracted.fullName,
    date_of_birth: normalizedDateOfBirth,
    place_of_birth: extracted.birthPlace?.value,
    residence_address: extracted.residence?.value,
    domicile_address: extracted.domicile?.value,
    tax_code: extracted.taxCode?.value,
    phone: extracted.phone?.value,
    email: extracted.email?.value,
    postal_code: extracted.postalCode?.value,
    city: extracted.city?.value,
    province: extracted.province?.value,
    profession: extracted.profession?.value,
    titles: extracted.titles,
    confidence: 0.7,
    occCount: 1,
    updatedAt: Date.now(),
  } as PersonRecord;
}

export type DifferentialResult = {
  newPersons: PersonRecord[];
  updatePersons: Array<{
    existing: PersonRecord;
    merged: PersonRecord;
    newFields: string[];
  }>;
  stats: {
    totalNew: number;
    totalUpdates: number;
  };
};

/**
 * Calcola il differenziale confrontando persone estratte con quelle esistenti
 * @param extractedPersons Persone estratte dal testo
 * @param praticaId ID della pratica
 * @param currentPersons Schede correnti in memoria; se omesse usa la cache locale
 * @returns Differenziale (nuovi vs aggiornamenti)
 */
export async function computeDifferential(
  extractedPersons: PersonRecord[],
  praticaId: string,
  currentPersons?: PersonRecord[]
): Promise<DifferentialResult> {
  // 1. Query batch: tutte le persone della pratica
  const existingPersons = currentPersons
    ?? await searchPersons({ praticaId, limit: 1000 });

  // 2. Crea Map per lookup veloce (nome normalizzato -> PersonRecord[])
  const byNormalizedName = new Map<string, PersonRecord[]>();
  for (const p of existingPersons) {
    const norm = normalizeName(p.full_name);
    if (!byNormalizedName.has(norm)) {
      byNormalizedName.set(norm, []);
    }
    byNormalizedName.get(norm)!.push(p);
  }

  const newPersons: PersonRecord[] = [];
  const updatePersons: Array<{
    existing: PersonRecord;
    merged: PersonRecord;
    newFields: string[];
  }> = [];

  // 3. Per ogni persona estratta, cerca match
  for (const extracted of extractedPersons) {
    const normalizedName = normalizeName(extracted.full_name);
    const candidates = byNormalizedName.get(normalizedName) || [];

    if (candidates.length === 0) {
      // Nessun match: nuova persona
      newPersons.push(extracted);
      continue;
    }

    // Match trovati: verifica compatibilità
    let bestMatch: PersonRecord | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      if (!areFieldsCompatible(candidate, extracted)) continue;
      const score = completenessScore(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (candidates.length > 1 && bestMatch) {
      // Log per debug: match multipli
      console.log('[PERSON-EXTRACT] Match multipli per', extracted.full_name, {
        chosen: bestMatch.id,
        candidates: candidates.map(c => ({
          id: c.id,
          name: c.full_name,
          score: completenessScore(c)
        }))
      });
    }

    if (bestMatch) {
      // Match compatibile: merge
      const merged: PersonRecord = { ...bestMatch };
      mergePersonFields(merged, extracted);

      // Calcola campi nuovi
      const newFields: string[] = [];
      if (extracted.tax_code && !bestMatch.tax_code) newFields.push('CF');
      if (extracted.date_of_birth && !bestMatch.date_of_birth) newFields.push('Data nascita');
      if (extracted.place_of_birth && !bestMatch.place_of_birth) newFields.push('Luogo nascita');
      if (extracted.address && !bestMatch.address) newFields.push('Indirizzo');
      if (extracted.residence_address && !bestMatch.residence_address) newFields.push('Residenza');
      if (extracted.domicile_address && !bestMatch.domicile_address) newFields.push('Domicilio');
      if (extracted.phone && !bestMatch.phone) newFields.push('Telefono');
      if (extracted.email && !bestMatch.email) newFields.push('Email');
      if (extracted.city && !bestMatch.city) newFields.push('Città');
      if (extracted.province && !bestMatch.province) newFields.push('Provincia');
      if (extracted.postal_code && !bestMatch.postal_code) newFields.push('CAP');
      if (extracted.profession && !bestMatch.profession) newFields.push('Professione');

      if (newFields.length > 0) {
        updatePersons.push({
          existing: bestMatch,
          merged,
          newFields,
        });
      }
    } else {
      // Nessun match compatibile: nuova persona (omonymo)
      newPersons.push(extracted);
    }
  }

  return {
    newPersons,
    updatePersons,
    stats: {
      totalNew: newPersons.length,
      totalUpdates: updatePersons.length,
    },
  };
}
