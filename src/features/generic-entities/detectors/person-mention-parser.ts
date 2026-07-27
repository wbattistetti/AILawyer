/**
 * Parsing contestuale di menzioni persona in ambito legale/giudiziario.
 * Separa titolo (Dott./Avv.), nome, ruolo/funzione (anche prima del nome) e sede.
 *
 * I nomi restano case-sensitive: la flag `i` globale faceva entrare nel nominativo
 * parole comuni. Titoli e ruoli usano classi `[Aa]`.
 */

export type ParsedPersonMention = {
  title?: string
  fullName: string
  role?: string
  office?: string
  /** Data contestuale (escussione/dichiarazione), se presente subito dopo il nome. */
  eventDate?: string
  start: number
  end: number
  confidence: number
}

/** Costruisce un pattern case-insensitive senza flag `i` (non supportata come (?i:) su Node). */
function ciLiteral(text: string): string {
  return text
    .split('')
    .map(char => {
      if (/[a-z]/i.test(char)) {
        return `[${char.toUpperCase()}${char.toLowerCase()}]`
      }
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
}

/** Titoli onorifici/professionali. Ordine: forme più lunghe prima. */
const TITLE = String.raw`(?<title>${[
  ciLiteral('sig.ra'),
  `${ciLiteral('sig')}\\.?`,
  `${ciLiteral('avv')}\\.?`,
  ciLiteral('dott.ssa'),
  `${ciLiteral('dott')}\\.?`,
  ciLiteral('dr.ssa'),
  `${ciLiteral('dr')}\\.?`,
  `${ciLiteral('ing')}\\.?`,
  `${ciLiteral('geom')}\\.?`,
  `${ciLiteral('rag')}\\.?`,
  ciLiteral('prof.ssa'),
  `${ciLiteral('prof')}\\.?`,
].join('|')})`

/** Ruoli processuali tipici (GIP, Sost. Proc., …). */
const ROLE_PHRASE = String.raw`(?<role>${[
  `${ciLiteral('sost')}(?:${ciLiteral('ituto')})?\\.?\\s*${ciLiteral('proc')}(?:${ciLiteral('uratore')})?\\.?`,
  `${ciLiteral('pubblico')}\\s+${ciLiteral('ministero')}`,
  `${ciLiteral('p')}\\.?\\s*${ciLiteral('m')}\\.?`,
  `${ciLiteral('g')}\\.?${ciLiteral('i')}\\.?${ciLiteral('p')}\\.?`,
  `${ciLiteral('g')}\\.?${ciLiteral('u')}\\.?${ciLiteral('p')}\\.?`,
  `${ciLiteral('magistrato')}(?:\\s+(?:${ciLiteral('assegnatario')}|${ciLiteral('firmatario')}))?`,
  ciLiteral('giudice'),
  `${ciLiteral('difensore')}(?:\\s+d['’]${ciLiteral('ufficio')})?`,
  ciLiteral('avvocato'),
].join('|')})`

/**
 * Funzioni/qualifiche spesso PRIMA del titolo+nome
 * (es. "Dirigente Generale Tecnico Dr. MAIORINO Vincenzo").
 */
const FUNCTION_HEAD = [
  'dirigente', 'commissario', 'ispettore', 'maresciallo', 'appuntato',
  'funzionario', 'questore', 'prefetto', 'comandante', 'capitano',
  'tenente', 'maggiore', 'colonnello', 'brigadiere', 'sovrintendente',
].map(ciLiteral).join('|')

const FUNCTION_MODIFIER = [
  'generale', 'capo', 'tecnico', 'superiore', 'aggiunto', 'principale',
  'coordinatore', 'regionale', 'provinciale', 'di', 'polizia',
].map(ciLiteral).join('|')

const FUNCTION_PHRASE =
  String.raw`(?<function>(?:${FUNCTION_HEAD})(?:\s+(?:${FUNCTION_MODIFIER})){0,4})`

/** Token anagrafico: richiede maiuscola iniziale (niente flag `i`). */
const NAME_TOKEN =
  String.raw`(?:[A-ZÀ-Ü](?:['’][A-ZÀ-Ü]+)?[A-Za-zÀ-ü]*|[A-ZÀ-Ü]{2,}(?:['’][A-ZÀ-Ü]+)?)`

const NAME_PARTICLE = String.raw`(?:d['’]|de|di|del|della|dell['’]|da|dal|van|von|mc|mac)`
const NAME_CHUNK = String.raw`(?:${NAME_TOKEN}|${NAME_PARTICLE}\s+${NAME_TOKEN})`
const PERSON_NAME = String.raw`(?<name>${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4})`

const NAME_STOP =
  /\b(?:del\s+foro|foro\s+di|con\s+studio|studio\s+legale|nato|nata|residente|domiciliato|identificato|presso|c\/o|tribunale|procura|piazzale|via|viale|tel\.?|p\.?\s*e\.?\s*c\.?|magistrato|assegnatario|firmatario|sost(?:ituto)?|gip|gup|risultava|veniva|presente|sentito|in\s+data)\b/iu

const OFFICE_AFTER =
  /(?:del\s+foro\s+di\s+(?<foro>[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]+(?:\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]+){0,2})|con\s+studio\s+legale\s+(?:in\s+)?(?<studio>[^,;.]{3,80})|c\/o\s+(?:il\s+)?(?<office>[A-ZÀ-Ü][^,;.]{3,80}))/iu

const DATE_AFTER =
  /(?:in\s+data\s+)?(?<date>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/iu

const ROLE_BEFORE_LOOKBACK = new RegExp(
  String.raw`(?:${ROLE_PHRASE}|${FUNCTION_PHRASE})\s*$`,
  'u'
)

const ROLE_WORDS = new Set([
  'magistrato', 'assegnatario', 'firmatario', 'giudice', 'procuratore',
  'sostituto', 'avvocato', 'difensore', 'gip', 'gup', 'pm',
  'dirigente', 'commissario', 'ispettore', 'maresciallo',
])

const INSTITUTION_WORDS = new Set([
  'tribunale', 'procura', 'questura', 'prefettura', 'ministero', 'comune',
  'direzione', 'repubblica', 'antimafia', 'corte', 'cassazione',
])

/** Normalizza un titolo onorifico/professionale abbreviato. */
export function normalizeHonorificTitle(raw: string): string {
  const value = raw.replace(/\s+/g, '').toLowerCase().replace(/\./g, '')
  if (value.startsWith('dottssa') || value === 'drssa') return 'Dott.ssa'
  if (value.startsWith('dott') || value === 'dr') return 'Dott.'
  if (value.startsWith('avv')) return 'Avv.'
  if (value.startsWith('sigra')) return 'Sig.ra'
  if (value.startsWith('sig')) return 'Sig.'
  if (value.startsWith('ing')) return 'Ing.'
  if (value.startsWith('profssa')) return 'Prof.ssa'
  if (value.startsWith('prof')) return 'Prof.'
  return raw.trim()
}

/** Normalizza un ruolo processuale/professionale o una funzione. */
export function normalizeLegalRole(raw: string): string {
  const value = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
  if (/^sost/.test(value) && /proc/.test(value)) return 'Sostituto Procuratore'
  if (/pubblico\s+ministero|^p\s*m$/.test(value)) return 'Pubblico Ministero'
  if (/^g\s*i\s*p$|^gip$/.test(value)) return 'GIP'
  if (/^g\s*u\s*p$|^gup$/.test(value)) return 'GUP'
  if (/difensore/.test(value)) return 'Difensore d\'ufficio'
  if (/^avvocato|^avv$/.test(value)) return 'Avvocato'
  if (/magistrato/.test(value)) return 'Magistrato'
  if (/giudice/.test(value)) return 'Giudice'
  // Funzioni di polizia/amministrazione: Title Case italiano
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-zà-ü])/gu, char => char.toUpperCase())
}

/** Pulisce il cognome/nome da code legali e ruoli erroneamente catturati. */
export function cleanPersonName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim()
  const stop = name.search(NAME_STOP)
  if (stop > 0) name = name.slice(0, stop).trim()
  const parts = name.split(/\s+/).filter(Boolean)
  while (parts.length > 0 && ROLE_WORDS.has(parts[parts.length - 1].toLowerCase().replace(/\./g, ''))) {
    parts.pop()
  }
  while (parts.length > 0 && INSTITUTION_WORDS.has(parts[0].toLowerCase())) {
    parts.shift()
  }
  if (parts.length < 2 || parts.length > 5) return null
  if (parts.some(part => INSTITUTION_WORDS.has(part.toLowerCase()))) return null
  const looksLikeName = parts.every(part =>
    /^(?:d['’]|de|di|del|della|dell['’]|da|dal|van|von|mc|mac)$/iu.test(part) ||
    /^[A-ZÀ-Ü](?:['’][A-ZÀ-Ü]+)?[A-Za-zÀ-ü]*$/u.test(part) ||
    /^[A-ZÀ-Ü]{2,}(?:['’][A-ZÀ-Ü]+)?$/u.test(part)
  )
  return looksLikeName ? parts.join(' ') : null
}

/** Costruisce l’etichetta scheda con titolo prima del nome. */
export function formatPersonLabel(title: string | undefined, fullName: string): string {
  return title ? `${title} ${fullName}` : fullName
}

/**
 * Cerca una funzione/ruolo immediatamente a sinistra di titolo+nome.
 * Es. "... Dirigente Generale Tecnico Dr. MAIORINO ..."
 */
export function findRoleBefore(text: string, matchStart: number): string | undefined {
  if (typeof text !== 'string') throw new Error('findRoleBefore: text must be a string')
  if (!Number.isInteger(matchStart) || matchStart < 0) {
    throw new Error('findRoleBefore: matchStart must be a non-negative integer')
  }
  const windowStart = Math.max(0, matchStart - 120)
  const before = text.slice(windowStart, matchStart)
  const match = before.match(ROLE_BEFORE_LOOKBACK)
  const raw = match?.groups?.role || match?.groups?.function
  return raw ? normalizeLegalRole(raw) : undefined
}

/**
 * Estrae menzioni persona tipizzate dal testo di pagina.
 * Preferisce pattern giuridici: funzione/ruolo + titolo + nome, oppure titolo + nome + ruolo.
 */
export function parsePersonMentions(text: string): ParsedPersonMention[] {
  if (typeof text !== 'string') throw new Error('parsePersonMentions: text must be a string')
  const hits: ParsedPersonMention[] = []
  const seen = new Set<string>()

  const patterns: Array<{ source: string; confidence: number }> = [
    {
      // Dirigente Generale Tecnico Dr. MAIORINO Vincenzo
      source: String.raw`${FUNCTION_PHRASE}\s+${TITLE}\s+${PERSON_NAME}`,
      confidence: 0.95,
    },
    {
      // Sost. Proc. Dott.ssa Ilaria Calò
      source: String.raw`${ROLE_PHRASE}\s*[,:]?\s*${TITLE}\s+${PERSON_NAME}`,
      confidence: 0.93,
    },
    {
      // Dott.ssa Ilaria Calò , Magistrato / GIP
      source: String.raw`${TITLE}\s+${PERSON_NAME}\s*[,:\-]?\s*${ROLE_PHRASE}`,
      confidence: 0.9,
    },
    {
      // Magistrato assegnatario : Dott.ssa Ilaria Calò
      source: String.raw`${ROLE_PHRASE}\s*[:\-]\s*${TITLE}\s+${PERSON_NAME}`,
      confidence: 0.92,
    },
    {
      // Avv. CARDILLO / Dott.ssa Chiara D'OREFICE / Dr. MAIORINO Vincenzo
      source: String.raw`\b${TITLE}\s+${PERSON_NAME}`,
      confidence: 0.82,
    },
    {
      source: String.raw`(?:(?:${ciLiteral('il')}|${ciLiteral('la')}|[Ll]['’])\s+)?(?:${ciLiteral('imputato')}|${ciLiteral('indagato')}|${ciLiteral('denunciante')}|${ciLiteral('testimone')}|${ciLiteral('parte')}\s+${ciLiteral('offesa')})\s+${PERSON_NAME}`,
      confidence: 0.8,
    },
  ]

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, 'gu')
    for (const match of text.matchAll(regex)) {
      if (match.index == null || !match.groups?.name) continue
      const fullName = cleanPersonName(match.groups.name)
      if (!fullName) continue
      const title = match.groups.title
        ? normalizeHonorificTitle(match.groups.title)
        : undefined

      const roleFromGroups = match.groups.role || match.groups.function
      let role = roleFromGroups
        ? normalizeLegalRole(roleFromGroups)
        : title === 'Avv.'
          ? 'Avvocato'
          : undefined

      // Se il pattern titolo+nome non ha catturato il ruolo, guarda a sinistra.
      if (!role || role === 'Avvocato') {
        const beforeRole = findRoleBefore(text, match.index)
        if (beforeRole && beforeRole !== 'Avvocato') role = beforeRole
      }

      const nameLocal = match[0].search(new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'))
      const nameStart = match.index + (nameLocal >= 0 ? nameLocal : 0)
      const nameEnd = nameStart + fullName.length
      const after = text.slice(nameEnd, nameEnd + 120)
      const officeMatch = after.match(OFFICE_AFTER)
      const office = officeMatch?.groups?.foro
        ? `Foro di ${officeMatch.groups.foro}`
        : officeMatch?.groups?.studio
          ? `Studio legale ${officeMatch.groups.studio.replace(/\s+/g, ' ').trim()}`
          : officeMatch?.groups?.office
            ? officeMatch.groups.office.replace(/\s+/g, ' ').trim()
            : undefined
      const eventDate = after.match(DATE_AFTER)?.groups?.date

      const key = `${nameStart}:${fullName.toLowerCase()}`
      if (seen.has(key)) {
        const existing = hits.find(
          hit => hit.start === nameStart && hit.fullName.toLowerCase() === fullName.toLowerCase()
        )
        if (existing) {
          if (!existing.title && title) existing.title = title
          if ((!existing.role || existing.role === 'Avvocato') && role) existing.role = role
          if (!existing.office && office) existing.office = office
          if (!existing.eventDate && eventDate) existing.eventDate = eventDate
          existing.confidence = Math.max(existing.confidence, pattern.confidence)
        }
        continue
      }
      seen.add(key)
      hits.push({
        title,
        fullName,
        role,
        office,
        ...(eventDate ? { eventDate } : {}),
        start: nameStart,
        end: nameEnd,
        confidence: pattern.confidence,
      })
    }
  }

  return hits.sort((a, b) => a.start - b.start)
}
