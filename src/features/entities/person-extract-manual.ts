import type { PersonRecord } from './entity-index';
import { searchPersons } from './entity-index';

// ✅ Nuovo tipo per campo con indici
export type FieldWithIndices = {
  value: string;
  startIndex: number;
  endIndex: number;
};

// ✅ Nuovo tipo per persona estratta con indici
export type ExtractedPersonWithIndices = {
  fullName: string;
  fullNameIndices: { startIndex: number; endIndex: number };
  birthDate: FieldWithIndices | null;
  birthPlace: FieldWithIndices | null;
  residence: FieldWithIndices | null;
  domicile: FieldWithIndices | null;
  taxCode: FieldWithIndices | null;
  phone: FieldWithIndices | null;
  email: FieldWithIndices | null;
  postalCode: FieldWithIndices | null;
  city: FieldWithIndices | null;
  province: FieldWithIndices | null;
  // Campi generici per altri dati trovati
  fields: Array<{
    label: string;
    value: string;
    startIndex: number;
    endIndex: number;
  }>;
};

// ✅ Nuovo tipo di ritorno per analyzeTextForPerson
export type PersonExtractionResult = {
  persons: ExtractedPersonWithIndices[];
};

// Riutilizza pattern regex da extract.worker.ts
const MONTHS = '(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\w*';
const RX = {
  cf: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi, // ✅ Aggiunto 'g'
  dob1: /\b([0-3]?\d)[\/\.\-]([01]?\d)[\/\.\-]((?:19|20)\d{2})\b/gi, // ✅ Aggiunto 'g'
  dob2: new RegExp(String.raw`\b([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})\b`, 'gi'), // ✅ Aggiunto 'g'
  phone: /\b(?:\+?39\s?)?(?:0\d{1,3}|3\d{2})[\s\./-]?\d{5,8}\b/gi, // ✅ Aggiunto 'g'
  email: /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/gi, // ✅ Aggiunto 'g'
  cap: /\b\d{5}\b/g, // ✅ Aggiunto 'g'
};

const CAP = `[A-ZÀ-Ü]`;
const LOWER = `[a-zà-ü''-]+`;
const ALLCAPS = `[A-ZÀ-Ü'’-]{2,}`;
const WORD = `(?:${CAP}${LOWER}|${ALLCAPS})`;
const PARTICLE = `(?:d'|de|di|del|della|dell'|dei|degli|delle|da|dal|van|von|mc|mac|san|santa)`;
const NAME_CHUNK = `(?:${WORD}|${PARTICLE}\\s+${WORD}|${WORD}\\s+${PARTICLE}\\s+${WORD})`;
const NAME_SEQ_SRC = String.raw`${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4}`;
const NAME_SEQ = new RegExp(NAME_SEQ_SRC, 'giu'); // ✅ Aggiunto flag 'g' per matchAll()
const TITLES = /^(sig\.?|sig\.ra|avv\.|dott\.ssa?|ing\.|geom\.|rag\.)\s+/i;
const ANCHORS = /\b(nato(?:\/a)?(?:\s+a)?|n\.|residente|domiciliat[oa]|domicilio\s+eletto|residenza)\b/giu; // ✅ Aggiunto 'g'

const STOP_TOKENS = new Set<string>([
  'ai','al','allo','alla','alle','agli','dei','degli','delle','del','della','dell','allo','all','lo','la','il','l\'','l\'',
  'art','articolo','altre','altro','persone','anno','sensi','riferimento','capo','cap','comma',
  'convivente','coniuge','marito','moglie','figlio','figlia','persona','soggetto','comunicazione','notizia'
]);

const NON_NAME_WORDS = new Set<string>([
  'comunicazione','notizia','reato','oggetto','procura','tribunale','comune','questura','prefettura','ministero','direzione','centrale','servizio','sezione','sequestro','dipartimento','ufficio','protocollo','prot','numero','via','viale','piazza'
]);

// Riutilizza helper functions da extract-orchestrator.ts
function normalizeName(s: string): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()
}

function normDob(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m1 = raw.match(/([0-3]?\d)[\.\/-]([01]?\d)[\.\/-]((?:19|20)\d{2})/);
  if (m1) return `${m1[3]}-${String(m1[2]).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  const m2 = raw.match(new RegExp(String.raw`([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})`, 'i'));
  if (m2) {
    const monthMap: Record<string, string> = {
      'gen': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'mag': '05', 'giu': '06', 'lug': '07', 'ago': '08',
      'set': '09', 'ott': '10', 'nov': '11', 'dic': '12'
    };
    const month = monthMap[m2[1].toLowerCase().substring(0, 3)] || '01';
    return `${m2[2]}-${month}-${String(m2[1]).padStart(2,'0')}`;
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
}

function isLikelyPersonName(full: string): boolean {
  const rawParts = full.trim().split(/\s+/);
  const parts = rawParts.filter(p => p && !STOP_TOKENS.has(p.toLowerCase()));
  const nameTokens = parts.filter(p => {
    const isTitle = /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ''-]+$/.test(p);
    const isUpper = /^[A-ZÀ-Ü][A-ZÀ-Ü'’-]+$/.test(p);
    return isTitle || isUpper;
  });
  const hasTwoNames = nameTokens.length >= 2;
  const last = parts[parts.length - 1] ?? '';
  const lastOk = /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ''-]+$/.test(last) || /^[A-ZÀ-Ü][A-ZÀ-Ü'’-]+$/.test(last);
  const hasTrailingArticle = /(\s|^)(il|la|lo)$/i.test(full.trim());
  let containsBlacklisted = false;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (!new RegExp(`^${PARTICLE}$`, 'i').test(p) && NON_NAME_WORDS.has(low)) {
      containsBlacklisted = true;
      break;
    }
  }
  return hasTwoNames && lastOk && !hasTrailingArticle && !containsBlacklisted;
}

// ✅ Nuova funzione per estrarre contesto nascita con indici
function extractBirthContextWithIndices(text: string, nameIndex: number): {
  pob?: FieldWithIndices;
  dob?: FieldWithIndices;
} {
  const out: { pob?: FieldWithIndices; dob?: FieldWithIndices } = {};
  const afterName = text.substring(nameIndex);

  // Pattern migliorati per data di nascita
  // "nato il DD/MM/YYYY" o "nato il DD MM YYYY"
  const dobPattern1 = /\b(?:nato(?:\/a)?(?:\s+(?:il|a))?\s+)?([0-3]?\d)[\/\.\-]([01]?\d)[\/\.\-]((?:19|20)\d{2})\b/gi;
  const dobPattern2 = new RegExp(String.raw`\b(?:nato(?:\/a)?(?:\s+(?:il|a))?\s+)?([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})\b`, 'gi');

  // Cerca data dopo il nome
  const dobMatch1 = dobPattern1.exec(afterName);
  const dobMatch2 = dobPattern2.exec(afterName);

  let dobMatch = dobMatch1;
  if (dobMatch2 && (!dobMatch1 || dobMatch2.index < dobMatch1.index)) {
    dobMatch = dobMatch2;
  }

  if (dobMatch) {
    const startIndex = nameIndex + dobMatch.index;
    const endIndex = startIndex + dobMatch[0].length;
    out.dob = {
      value: dobMatch[0].trim(),
      startIndex,
      endIndex,
    };
  }

  // Pattern migliorati per luogo di nascita
  // "nato a ..." o "nato in ..." o "n. a ..."
  const pobPatterns = [
    /\b(?:nato(?:\/a)?(?:\s+a)?|n\.)\s+(?:a|in)\s+([^,;\n\.]+?)(?:\s*,\s*il|\s*$)/gi,
    /\b(?:nato(?:\/a)?\s+il\s+[^,;\n]+?,\s+(?:a|in)\s+)([^,;\n\.]+?)(?:\s*$)/gi,
  ];

  for (const pattern of pobPatterns) {
    const match = pattern.exec(afterName);
    if (match && match[1]) {
      const startIndex = nameIndex + match.index + match[0].indexOf(match[1]);
      const endIndex = startIndex + match[1].length;
      out.pob = {
        value: match[1].trim(),
        startIndex,
        endIndex,
      };
      break;
    }
  }

  return out;
}

// ✅ Nuova funzione per estrarre residenza/domicilio con indici
function extractResidenceContextWithIndices(text: string): {
  residence?: FieldWithIndices;
  domicile?: FieldWithIndices;
} {
  const out: { residence?: FieldWithIndices; domicile?: FieldWithIndices } = {};

  // Pattern migliorati per residenza
  const resPatterns = [
    /\bresident[ea]\s+(?:in\s+)?([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
    /\bres\.\s+(?:in\s+)?([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
    /\bivi\s+res\.\s*([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
  ];

  for (const pattern of resPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const startIndex = match.index + match[0].indexOf(match[1]);
      const endIndex = startIndex + match[1].length;
      out.residence = {
        value: match[1].trim(),
        startIndex,
        endIndex,
      };
      break;
    }
  }

  // Pattern migliorati per domicilio
  const domPatterns = [
    /\bdomiciliat[oa]\s+(?:in\s+)?([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
    /\bdomicilio\s+(?:in\s+)?([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
    /\bdomicilio\s+eletto\s+(?:in\s+)?([^,;\n\.]+?)(?:\s*,\s*|$)/gi,
  ];

  for (const pattern of domPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const startIndex = match.index + match[0].indexOf(match[1]);
      const endIndex = startIndex + match[1].length;
      out.domicile = {
        value: match[1].trim(),
        startIndex,
        endIndex,
      };
      break;
    }
  }

  return out;
}

function generatePersonKey(fullName: string): string {
  const normalized = normalizeName(fullName);
  return `person-${normalized.replace(/\s+/g, '-').substring(0, 50)}-${Date.now()}`;
}

/**
 * ✅ NUOVA VERSIONE: Analizza un testo e estrae dati anagrafici con indici
 * @param text Testo da analizzare
 * @returns Risultato con persone e indici per ogni campo
 */
export async function analyzeTextForPerson(text: string): Promise<PersonExtractionResult> {
  if (!text || !text.trim()) return { persons: [] };

  const normalizedText = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const persons: ExtractedPersonWithIndices[] = [];
  const processedNames = new Set<string>();

  // 1. Estrai nomi con pattern NAME_SEQ
  const nameMatches = Array.from(normalizedText.matchAll(NAME_SEQ));

  for (const match of nameMatches) {
    const fullName = match[0].trim();
    const nameIndex = match.index || 0;
    const nameEndIndex = nameIndex + fullName.length;

    // Filtra nomi non validi
    if (!isLikelyPersonName(fullName)) continue;

    // Rimuovi titoli
    const cleanName = fullName.replace(TITLES, '').trim();
    if (!cleanName) continue;

    const normalizedName = normalizeName(cleanName);

    // Evita duplicati
    if (processedNames.has(normalizedName)) continue;
    processedNames.add(normalizedName);

    // ✅ Crea persona estratta con indici
    const person: ExtractedPersonWithIndices = {
      fullName: cleanName,
      fullNameIndices: { startIndex: nameIndex, endIndex: nameEndIndex },
      birthDate: null,
      birthPlace: null,
      residence: null,
      domicile: null,
      taxCode: null,
      phone: null,
      email: null,
      postalCode: null,
      city: null,
      province: null,
      fields: [],
    };

    // 2. Estrai CF con indici
    const cfMatches = Array.from(normalizedText.matchAll(RX.cf));
    for (const cfMatch of cfMatches) {
      if (cfMatch.index != null) {
        person.taxCode = {
          value: cfMatch[0].toUpperCase(),
          startIndex: cfMatch.index,
          endIndex: cfMatch.index + cfMatch[0].length,
        };
        break; // Prendi il primo
      }
    }

    // 3. Estrai data e luogo di nascita con indici
    const birthContext = extractBirthContextWithIndices(normalizedText, nameIndex);
    if (birthContext.dob) {
      person.birthDate = birthContext.dob;
    }
    if (birthContext.pob) {
      person.birthPlace = birthContext.pob;
    }

    // 4. Estrai residenza/domicilio con indici
    const addrContext = extractResidenceContextWithIndices(normalizedText);
    if (addrContext.residence) {
      person.residence = addrContext.residence;
    }
    if (addrContext.domicile) {
      person.domicile = addrContext.domicile;
    }

    // 5. Estrai telefono con indici
    const phoneMatches = Array.from(normalizedText.matchAll(RX.phone));
    for (const phoneMatch of phoneMatches) {
      if (phoneMatch.index != null) {
        person.phone = {
          value: phoneMatch[0],
          startIndex: phoneMatch.index,
          endIndex: phoneMatch.index + phoneMatch[0].length,
        };
        break;
      }
    }

    // 6. Estrai email con indici
    const emailMatches = Array.from(normalizedText.matchAll(RX.email));
    for (const emailMatch of emailMatches) {
      if (emailMatch.index != null) {
        person.email = {
          value: emailMatch[0].toLowerCase(),
          startIndex: emailMatch.index,
          endIndex: emailMatch.index + emailMatch[0].length,
        };
        break;
      }
    }

    // 7. Estrai CAP con indici
    const capMatches = Array.from(normalizedText.matchAll(RX.cap));
    for (const capMatch of capMatches) {
      if (capMatch.index != null) {
        person.postalCode = {
          value: capMatch[0],
          startIndex: capMatch.index,
          endIndex: capMatch.index + capMatch[0].length,
        };
        break;
      }
    }

    persons.push(person);
  }

  return { persons };
}

/**
 * ✅ Funzione helper per convertire ExtractedPersonWithIndices in PersonRecord
 * (per compatibilità con codice esistente)
 */
export function convertToPersonRecord(extracted: ExtractedPersonWithIndices): PersonRecord {
  return {
    id: generatePersonKey(extracted.fullName),
    full_name: extracted.fullName,
    date_of_birth: extracted.birthDate ? normDob(extracted.birthDate.value) : undefined,
    place_of_birth: extracted.birthPlace?.value,
    residence_address: extracted.residence?.value,
    domicile_address: extracted.domicile?.value,
    tax_code: extracted.taxCode?.value,
    phone: extracted.phone?.value,
    email: extracted.email?.value,
    postal_code: extracted.postalCode?.value,
    city: extracted.city?.value,
    province: extracted.province?.value,
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
 * @returns Differenziale (nuovi vs aggiornamenti)
 */
export async function computeDifferential(
  extractedPersons: PersonRecord[],
  praticaId: string
): Promise<DifferentialResult> {
  // 1. Query batch: tutte le persone della pratica
  const existingPersons = await searchPersons({ praticaId, limit: 1000 });

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
