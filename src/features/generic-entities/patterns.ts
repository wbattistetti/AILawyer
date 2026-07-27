/**
 * Pattern e lessici condivisi dai detector di entità generiche.
 */

export const TITLE_PREFIX =
  /^(?:sig(?:\.ra)?\.?|avv\.?|dott\.ssa?|dr\.ssa?|ing\.?|geom\.?|rag\.?|prof\.ssa?|maresciallo|ispettore|appuntato)\s+/iu

export const ROLE_BEFORE_NAME =
  /\b(?:il|la|l['’])?\s*(?:sig(?:\.ra)?\.?|avv\.?|dott\.ssa?|imputato|indagato|denunciante|testimone|parte\s+offesa|difensore)\s+/giu

export const NAME_TOKEN = String.raw`(?:[A-ZÀ-Ü][a-zà-ü'’\-]+|[A-ZÀ-Ü]{2,})`
export const NAME_PARTICLE = String.raw`(?:d'|de|di|del|della|dell'|da|dal|van|von|mc|mac)`
export const NAME_CHUNK = String.raw`(?:${NAME_TOKEN}|${NAME_PARTICLE}\s+${NAME_TOKEN})`
export const PERSON_NAME = new RegExp(
  String.raw`\b(${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,3})\b`,
  'gu'
)

export const INSTITUTION_WORDS = new Set([
  'tribunale',
  'procura',
  'questura',
  'prefettura',
  'ministero',
  'comune',
  'regione',
  'guardia',
  'carabinieri',
  'polizia',
  'finanza',
  'direzione',
  'dipartimento',
  'ufficio',
  'sezione',
  'repubblica',
  'antimafia',
  'corte',
  'cassazione',
  'consiglio',
])

export const LEGAL_BOILERPLATE =
  /\b(?:ai\s+sensi|di\s+cui\s+all['’]?art|comma|protocollo|prot\.|oggetto|comunicazione|notizia\s+di\s+reato)\b/iu

export const ROAD_START =
  /\b(?:via|viale|v\.le|corso|c\.so|piazza|p\.zza|piazzale|largo|vicolo|strada|località|loc\.)\b/giu

/**
 * Venue: keyword case-insensitive via classe, nome proprio case-sensitive.
 * Senza flag `i`: altrimenti "bar ubicato…" matcha parole minuscole come nome.
 */
export const VENUE_CATEGORY = new RegExp(
  String.raw`\b(?<cat>[Rr]istorante|[Tt]rattoria|[Oo]steria|[Pp]izzeria|[Bb]ar|[Cc]aff[eè]|[Hh]otel|[Aa]lbergo|[Pp]ub|[Dd]iscoteca|[Ll]ocale)\s+(?:(?:il|la|lo|l['’]|da|di)\s+)?(?<name>[A-ZÀ-Ü][\wÀ-ü'’.\-]+(?:\s+[A-ZÀ-Ü][\wÀ-ü'’.\-]*){0,4})`,
  'gu'
)

/**
 * Società: nome con iniziale maiuscola (no flag `i`) + forma sociale flessibile.
 */
export const COMPANY_SUFFIX = new RegExp(
  String.raw`\b(?<name>[A-ZÀ-Ü][\wÀ-ü'’.\-]+(?:\s+[A-ZÀ-Ü][\wÀ-ü'’.\-]*){0,5})\s+(?<form>S\.?\s?[Pp]\.?\s?A\.?|S\.?\s?[Rr]\.?\s?[Ll]\.?\s?|S\.?\s?[Aa]\.?\s?[Ss]\.?\s?|S\.?\s?[Nn]\.?\s?[Cc]\.?\s?|[Cc]oop(?:erativa)?)`,
  'gu'
)

/**
 * Istituzioni: keyword Title Case / ALL CAPS / minuscolo; coda geografica solo Title/ALL CAPS.
 * Niente flag `i`: evita di inglobare "specie durante le" dopo Carabinieri.
 */
export const INSTITUTION_PHRASE = new RegExp(
  String.raw`\b(?<name>(?:` +
    String.raw`(?:[Pp]rocura|PROCURA)(?:\s+(?:[Dd]ella|DELLA)\s+(?:[Rr]epubblica|REPUBBLICA))?` +
    String.raw`|(?:[Tt]ribunale|TRIBUNALE)` +
    String.raw`|(?:[Qq]uestura|QUESTURA)` +
    String.raw`|(?:[Pp]refettura|PREFETTURA)` +
    String.raw`|(?:[Gg]uardia|GUARDIA)\s+(?:[Dd]i|DI)\s+(?:[Ff]inanza|FINANZA)` +
    String.raw`|(?:[Cc]arabinieri|CARABINIERI)` +
    String.raw`|(?:[Pp]olizia|POLIZIA)\s+(?:[Dd]i|DI)\s+(?:[Ss]tato|STATO)` +
    String.raw`|(?:[Mm]inistero|MINISTERO)\s+(?:[Dd]ell['’]|DELL['’])(?:[Ii]nterno|INTERNO)` +
    String.raw`|(?:[Dd]irezione|DIREZIONE)\s+(?:[Dd]istrettuale|DISTRETTUALE)\s+(?:[Aa]ntimafia|ANTIMAFIA)` +
    String.raw`)` +
    String.raw`(?:\s+(?:di|DI|presso\s+il|PRESSO\s+IL)(?:\s+(?:[Tt]ribunale|TRIBUNALE))?(?:\s+(?:di|DI))?\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’.\-]*){0,2})`,
  'gu'
)

/**
 * Solo il nome dell’ente in intestazione (DIA / Centro Operativo / Procura / Tribunale).
 * Indirizzo, tel e PEC si agganciano in finestra nel detector organizzazioni.
 */
export const INSTITUTION_LETTERHEAD_ORG = new RegExp(
  String.raw`\b(?<org>(?:` +
    String.raw`(?:[Dd]irezione|DIREZIONE)\s+(?:[Ii]nvestigativa|INVESTIGATIVA)\s+(?:[Aa]ntimafia|ANTIMAFIA)` +
    String.raw`(?:\s*[-–—]?\s*(?:[Cc]entro|CENTRO)\s+(?:[Oo]perativo|OPERATIVO)` +
    String.raw`(?:\s+(?:[Dd]i|DI)\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]*)?)?` +
    String.raw`|(?:[Cc]entro|CENTRO)\s+(?:[Oo]perativo|OPERATIVO)(?:\s+(?:[Dd]i|DI)\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]*)?` +
    String.raw`|(?:[Pp]rocura|PROCURA)(?:\s+(?:[Dd]ella|DELLA)\s+(?:[Rr]epubblica|REPUBBLICA))?` +
    String.raw`(?:\s+(?:di|DI|presso\s+il|PRESSO\s+IL)\s+(?:[Tt]ribunale|TRIBUNALE)\s+(?:di|DI)\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]*)?` +
    String.raw`|(?:[Tt]ribunale|TRIBUNALE)(?:\s+(?:[Oo]rdinario|ORDINARIO))?` +
    String.raw`(?:\s+(?:[Dd]i|DI)\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]*)?` +
    String.raw`))`,
  'gu'
)

/** @deprecated Usare INSTITUTION_LETTERHEAD_ORG + parse a finestra. */
export const INSTITUTION_LETTERHEAD = INSTITUTION_LETTERHEAD_ORG

export const PLATE = /\b(?<plate>[A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/g
export const VIN = /\b(?<vin>[A-HJ-NPR-Z0-9]{17})\b/g

export const VEHICLE_MAKES = [
  'fiat',
  'alfa romeo',
  'lancia',
  'ferrari',
  'audi',
  'bmw',
  'mercedes',
  'volkswagen',
  'volvo',
  'peugeot',
  'citroen',
  'renault',
  'toyota',
  'suzuki',
  'nissan',
  'honda',
  'kia',
  'hyundai',
  'ford',
  'opel',
  'seat',
  'skoda',
  'jeep',
]

export const VEHICLE_ANCHOR =
  /\b(?:autovettura|automobile|auto|veicolo|motoveicolo|motociclo|moto|ciclomotore|targa)\b/iu

export const COLOR_PATTERN =
  /\b(?:di\s+colore|colore|di\s+col\.)\s+(?<color>[A-Za-zÀ-ü]+(?:\s+(?:chiaro|scuro|metallizzato|metallico))?)/iu

/**
 * Forma tipica dei verbali: `(marca)? X modello Y`.
 * Non dipende dalla whitelist marche.
 */
export const VEHICLE_MAKE_MODEL = new RegExp(
  String.raw`\b(?:marca\s+)?(?<make>[A-Za-zÀ-ü][\wÀ-ü.-]{1,24})\s+modello\s+(?<model>[A-Za-z0-9À-ü-]{1,24})`,
  'giu'
)

/**
 * Forma senza parola "modello": `Fiat Punto di colore…` / `Smart fortwo targata…`.
 */
export const VEHICLE_MAKE_MODEL_INLINE = new RegExp(
  String.raw`\b(?<make>[A-Za-zÀ-ü][\wÀ-ü.-]{1,24})\s+(?<model>[A-Za-z0-9À-ü-]{1,24})\s+(?:di\s+colore|colore|targat[aoei])`,
  'giu'
)

export const VEHICLE_MAKE_MODEL_STOPWORDS = new Set([
  'di',
  'da',
  'del',
  'della',
  'dello',
  'un',
  'una',
  'uno',
  'la',
  'il',
  'lo',
  'le',
  'i',
  'a',
  'in',
  'su',
  'per',
  'con',
  'tra',
  'fra',
  'dal',
  'dalla',
  'auto',
  'autovettura',
  'veicolo',
  'motoveicolo',
  'targa',
  'targata',
  'targato',
  'colore',
])

export const PHONE =
  /\b(?:(?:tel(?:efono)?|cell(?:ulare)?|fax)\s*[.:]?\s*)?(?<phone>(?:\+?39[\s./-]?)?(?:3\d{2}|0\d{1,3})[\s./-]?\d{5,8})\b/giu

export const EMAIL = /\b(?<email>[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})\b/giu

export const TAX_CODE =
  /\b(?<cf>[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b/giu

export const PIVA =
  /(?:partita\s*iva|p\.?\s*iva|piva)\s*[:\-]?\s*\b(?<piva>\d{11})\b/giu

export const IBAN = /\b(?<iban>IT\d{2}[A-Z]\d{10,30})\b/giu

export const OBJECT_PATTERN =
  /\b(?<kind>arma|pistola|revolver|coltello|telefono\s+cellulare|smartphone|computer|notebook|borsa|zaino)\b(?:\s+(?:marca|modello)\s+(?<brand>[A-Za-z0-9À-ü\-]+))?/giu

export const LINK_MAX_DISTANCE = 90
export const VEHICLE_CONTEXT_RADIUS = 100
