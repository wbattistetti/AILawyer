// @ts-ignore Worker module entry for Vite/Cursor
export type Token = { text: string; x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number };
export type PageTokens = { page: number; tokens: Token[]; docId: string; docTitle: string };

export type WorkerIn =
  | { type: 'beginDoc'; docId: string; docTitle: string; lenient?: boolean }
  | { type: 'page'; payload: PageTokens }
  | { type: 'endDoc'; docId: string }
  | { type: 'cancel' };

export type BoxPct = { x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number };
export type OccOut = {
  personKey: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  fields: Partial<{
    date_of_birth: string;
    place_of_birth: string;
    tax_code: string;
    address: string;
    postal_code: string;
    city: string;
    province: string;
    phone: string;
    email: string;
  }>;
  // Title detected immediately before name (normalized)
  title?: string;
  confidence: number;
  snippet: string;
  page: number;
  box: BoxPct;
};

export type WorkerOut =
  | { type: 'progress'; docId: string; page: number }
  | { type: 'occurrences'; docId: string; page: number; items: OccOut[] }
  | { type: 'done'; docId: string }
  | { type: 'error'; message: string };

const MONTHS = '(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\w*';
const RX = {
  cf: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/i,
  dob1: /\b([0-3]?\d)[\/\.\-]([01]?\d)[\/\.\-]((?:19|20)\d{2})\b/i,
  dob2: new RegExp(String.raw`\b([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})\b`, 'i'),
  phone: /\b(?:\+?39\s?)?(?:0\d{1,3}|3\d{2})[\s\./-]?\d{5,8}\b/i,
  email: /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/i,
  cap: /\b\d{5}\b/,
};
// A word can be TitleCase or ALLCAPS (common in headings/lists)
const CAP = `[A-ZÀ-Ü]`;
const LOWER = `[a-zà-ü'’\\-]+`;
const ALLCAPS = `[A-ZÀ-Ü'’\\-]{2,}`;
const WORD = `(?:${CAP}${LOWER}|${ALLCAPS})`;
const PARTICLE = `(?:d'|de|di|del|della|dell'|dei|degli|delle|da|dal|van|von|mc|mac|san|santa)`;
const NAME_CHUNK = `(?:${WORD}|${PARTICLE}\\s+${WORD}|${WORD}\\s+${PARTICLE}\\s+${WORD})`;
const NAME_SEQ_SRC = String.raw`${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4}`;
const NAME_SEQ = new RegExp(NAME_SEQ_SRC, 'iu');
const TITLES = /^(sig\.?|sig\.ra|avv\.|dott\.ssa?|ing\.|geom\.|rag\.)\s+/i;
// Accept birth anchors and broader residency anchors
const ANCHORS_BIRTH = /\b(nato(?:\/a)?(?:\s+a)?|n\.)\b/iu;
const ANCHORS = /\b(nato(?:\/a)?(?:\s+a)?|n\.|residente|domiciliat[oa]|domicilio\s+eletto|residenza)\b/iu;

// Soft stopwords (to avoid false positives like "ai sensi dell'art")
const STOP_TOKENS = new Set<string>([
  'ai','al','allo','alla','alle','agli','dei','degli','delle','del','della','dell','allo','all','lo','la','il','l\'','l’',
  'art','articolo','altre','altro','persone','anno','sensi','riferimento','capo','cap','comma',
  // non-name nouns often preceding the anchor
  'convivente','coniuge','marito','moglie','figlio','figlia','persona','soggetto','comunicazione','notizia'
]);

// Frequent capitalized nouns that must not be treated as person names
const NON_NAME_WORDS = new Set<string>([
  'comunicazione','notizia','reato','oggetto','procura','tribunale','comune','questura','prefettura','ministero','direzione','centrale','servizio','sezione','sequestro','dipartimento','ufficio','protocollo','prot','numero','via','viale','piazza'
]);

function isLikelyPersonName(full: string): boolean {
  const rawParts = full.trim().split(/\s+/);
  const parts = rawParts.filter(p => p && !STOP_TOKENS.has(p.toLowerCase()));
  // Count TitleCase OR ALLCAPS as name tokens
  const nameTokens = parts.filter(p => isTitle(p) || isUpper(p));
  if (nameTokens.length < 2) return false;
  // Last token should be TitleCase or ALLCAPS
  const last = parts[parts.length - 1];
  if (!(isTitle(last) || isUpper(last))) return false;
  // Avoid cases like "Catania il" where trailing article slips in
  if (/(?:\s|^)(il|la|lo)$/i.test(full.trim())) return false;
  // Reject if contains blacklisted common nouns (except particles)
  for (const p of parts) {
    const low = p.toLowerCase();
    if (!new RegExp(`^${PARTICLE}$`, 'i').test(p) && NON_NAME_WORDS.has(low)) return false;
  }
  return true;
}

let cancelled = false;
let lenientMode = false;
const dbg = (...args: any[]) => { try { (console as any).log('[ENTITY][worker]', ...args) } catch {} }
onmessage = (e: MessageEvent<WorkerIn>) => {
  try {
    const msg = e.data;
    if (msg.type === 'cancel') { cancelled = true; return; }
    if (msg.type === 'beginDoc') { cancelled = false; lenientMode = !!(msg as any).lenient; dbg('beginDoc', { docId: msg.docId, docTitle: msg.docTitle }); return; }
    if (msg.type === 'page') {
      if (cancelled) return;
      const { page, tokens, docId } = msg.payload;
      const items = detectOnPage(tokens, page);
      dbg('page', { docId, page, tokens: tokens.length, hits: items.length })
      postMessage({ type: 'occurrences', docId, page, items } as WorkerOut);
      postMessage({ type: 'progress', docId, page } as WorkerOut);
      return;
    }
    if (msg.type === 'endDoc') {
      if (cancelled) return;
      dbg('doneDoc', { docId: msg.docId })
      postMessage({ type: 'done', docId: msg.docId } as WorkerOut);
    }
  } catch (err: any) {
    dbg('error', String(err?.message ?? err))
    postMessage({ type: 'error', message: String(err?.message ?? err) } as WorkerOut);
  }
};

function pageText(tokens: Token[]): string {
  return tokens
    .map(t => t.text)
    .join(' ')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[·•∙•·]/g, ' ')
    .replace(/[\t\r\f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// --- Token helpers for anchor windows (Step 1: names only) ---
function isPunct(tok: string): boolean { return /^(,|;|:|\.|—)$/.test(tok) }
function isUpper(tok: string): boolean { return /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’\-]+$/.test(tok) }
function isTitle(tok: string): boolean { return /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’\-]+$/.test(tok) }
function isNameTok(tok: string): boolean {
  const low = tok.toLowerCase()
  if (NON_NAME_WORDS.has(low)) return false
  return isUpper(tok) || isTitle(tok) || new RegExp(`^${PARTICLE}$`, 'i').test(tok)
}
function isLowerWord(tok: string): boolean { return /^[a-zà-öø-ÿ]+$/.test(tok) }
function unionBoxes(tokens: Token[], startTok: number, endTok: number): BoxPct {
  const slice = tokens.slice(startTok, endTok + 1)
  const x0 = Math.min(...slice.map(t => t.x0Pct))
  const x1 = Math.max(...slice.map(t => t.x1Pct))
  const y0 = Math.min(...slice.map(t => t.y0Pct))
  const y1 = Math.max(...slice.map(t => t.y1Pct))
  return { x0Pct: x0, x1Pct: x1, y0Pct: y0, y1Pct: y1 }
}
function charOffsetToTokenIndex(tokens: Token[], offset: number): number {
  let pos = 0
  for (let i = 0; i < tokens.length; i++) {
    const next = pos + tokens[i].text.length
    if (offset < next) return i
    pos = next + 1
  }
  return Math.max(0, tokens.length - 1)
}
function leftWindowString(tokens: Token[], anchorTok: number, maxTokLeft = 12, page?: number): string {
  const stop = anchorTok - 1
  const minI = Math.max(0, anchorTok - maxTokLeft)
  let i = stop
  let stopReason: 'lower' | 'punct' | 'min' | null = null
  while (i >= minI && !isPunct(tokens[i].text)) {
    const t = tokens[i].text
    if (isLowerWord(t) && !new RegExp(`^${PARTICLE}$`, 'i').test(t)) { stopReason = 'lower'; break }
    i--
  }
  if (i < minI) stopReason = 'min'
  else if (isPunct(tokens[i]?.text ?? '')) stopReason = stopReason ?? 'punct'
  const leftBound = Math.max(minI, i + 1)
  if (leftBound > stop) return ''
  try {
    dbg('leftscan', {
      page,
      anchorTok,
      stop,
      minI,
      stopAt: i,
      stopReason,
      leftBound,
      windowTokCount: stop - leftBound + 1,
      windowTokens: tokens.slice(leftBound, stop + 1).map((t, idx) => ({ idx: leftBound + idx, text: t.text }))
    })
  } catch {}
  return tokens.slice(leftBound, stop + 1).map(t => t.text).join(' ')
}
function matchTitleBefore(tokens: Token[], nameStart: number): { title?: string; span?: [number, number] } {
  const TITLE_SINGLE_RE = /^(?:avv\.?t?i?|avvocato|dott\.?ssa?|dr\.?ssa?|ing\.?|geom\.?|arch\.?|rag\.?|prof\.?|giudice|magistrato|pm|p\.?m\.?|maresciallo|isp\.?|sovr\.?|ten\.?|cap\.?)$/iu
  const TITLE_MULTI_RE = new RegExp(String.raw`^(?:pubblico\s+ministero|sost\.?\s+proc\.?|sostituto\s+procuratore)$`, 'iu')
  const normalize = (raw: string): string => {
    const r = raw.replace(/\./g, '').toLowerCase().trim()
    if (r.startsWith('avv')) return 'Avvocato'
    if (r.startsWith('dott') || r.startsWith('dr')) return r.includes('ssa') ? 'Dottoressa' : 'Dottore'
    if (r.startsWith('ing')) return 'Ingegnere'
    if (r.startsWith('geom')) return 'Geometra'
    if (r.startsWith('arch')) return 'Architetto'
    if (r.startsWith('rag')) return 'Ragioniere'
    if (r.startsWith('prof')) return 'Professore'
    if (r.includes('pubblico ministero') || r === 'pm' || r === 'p m') return 'Pubblico Ministero'
    if (r.startsWith('sost') && (r.includes('proc') || r.includes('procur'))) return 'Sostituto Procuratore'
    if (r.startsWith('giudic')) return 'Giudice'
    if (r.startsWith('magist')) return 'Magistrato'
    if (r.startsWith('marescial')) return 'Maresciallo'
    if (r === 'ten' || r.startsWith('tenent')) return 'Tenente'
    if (r === 'cap' || r.startsWith('capit')) return 'Capitano'
    if (r.startsWith('isp')) return 'Ispettore'
    if (r.startsWith('sovr')) return 'Sovrintendente'
    return raw.trim()
  }
  if (nameStart - 2 >= 0) {
    const two = `${tokens[nameStart - 2].text} ${tokens[nameStart - 1].text}`
    if (TITLE_MULTI_RE.test(two)) return { title: normalize(two), span: [nameStart - 2, nameStart - 1] }
  }
  if (nameStart - 1 >= 0) {
    const one = tokens[nameStart - 1].text
    if (TITLE_SINGLE_RE.test(one)) return { title: normalize(one), span: [nameStart - 1, nameStart - 1] }
  }
  return {}
}

function extractNameLeftOf(tokens: Token[], anchorTok: number, page?: number): { start: number; end: number; text: string; title?: string } | null {
  const stop = anchorTok - 1
  if (stop < 0) return null
  const minI = Math.max(0, anchorTok - 12)
  let i = stop
  let stopReason: 'lower' | 'punct' | 'min' | null = null
  while (i >= minI && !isPunct(tokens[i].text)) {
    const t = tokens[i].text
    if (isLowerWord(t) && !new RegExp(`^${PARTICLE}$`, 'i').test(t)) { stopReason = 'lower'; break }
    i--
  }
  if (i < minI) stopReason = 'min'
  else if (isPunct(tokens[i]?.text ?? '')) stopReason = stopReason ?? 'punct'
  const leftBound = Math.max(minI, i + 1)
  if (leftBound > stop) return null
  try {
    dbg('left-extract-window', {
      page,
      anchorTok,
      stop,
      minI,
      stopAt: i,
      stopReason,
      leftBound,
      tokens: tokens.slice(leftBound, stop + 1).map((t, idx) => ({ idx: leftBound + idx, text: t.text }))
    })
  } catch {}
  let best: { s: number; e: number } | null = null
  let s = -1
  for (let k = leftBound; k <= stop; k++) {
    if (isNameTok(tokens[k].text)) {
      if (s === -1) s = k
    } else {
      if (s !== -1) { const e = k - 1; const len = e - s + 1; try { dbg('left-extract-seg', { page, segStart: s, segEnd: e, len, segTokens: tokens.slice(s, e + 1).map((t, idx) => ({ idx: s + idx, text: t.text })) }) } catch {} ; if (len >= 2 && len <= 5) best = { s, e }; s = -1 }
    }
  }
  if (s !== -1) { const e = stop; const len = e - s + 1; try { dbg('left-extract-seg', { page, segStart: s, segEnd: e, len, segTokens: tokens.slice(s, e + 1).map((t, idx) => ({ idx: s + idx, text: t.text })) }) } catch {} ; if (len >= 2 && len <= 5) best = { s, e } }
  if (!best) { try { dbg('left-extract-noSeg', { page }) } catch {} ; return null }
  // trim leading stopwords/articles even if capitalized at line start
  let s0 = best.s
  while (s0 <= best.e) {
    const lw = tokens[s0].text.toLowerCase()
    if (STOP_TOKENS.has(lw) || NON_NAME_WORDS.has(lw)) { try { dbg('left-extract-trimLead', { page, idx: s0, word: tokens[s0].text }) } catch {} ; s0++ }
    else break
  }
  if (s0 > best.e) return null
  // cap to at most 4 tokens, prefer the closest to the anchor (right-most)
  const curLen = best.e - s0 + 1
  const keep = Math.min(4, Math.max(2, curLen))
  const startFinal = Math.max(s0, best.e - keep + 1)
  const { title } = matchTitleBefore(tokens, startFinal)
  const text = tokens.slice(startFinal, best.e + 1).map(t => t.text).join(' ').replace(/\s+,?$/, '').trim()
  // Defensive pre-check: if immediate left context contains lowercase stopwords or non-name nouns, reject
  try {
    const leftCtxStart = Math.max(0, startFinal - 3)
    const leftCtx = tokens.slice(leftCtxStart, startFinal).map(t => t.text)
    const leftCtxLower = leftCtx.map(w => w.toLowerCase())
    const hasLowerStop = leftCtxLower.some(w => isLowerWord(w) && !new RegExp(`^${PARTICLE}$`, 'i').test(w))
    const hasBlockedWord = leftCtxLower.some(w => STOP_TOKENS.has(w) || NON_NAME_WORDS.has(w))
    if (hasLowerStop || hasBlockedWord) {
      dbg('left-extract-blockedPre', { page, startFinal, leftCtx, hasLowerStop, hasBlockedWord })
      return null
    }
  } catch {}
  if (!isLikelyPersonName(text)) { try { dbg('left-extract-reject', { page, startFinal, end: best.e, text }) } catch {} ; return null }
  try { dbg('left-extract-ok', { page, startFinal, end: best.e, text, title: title || null }) } catch {}
  return { start: startFinal, end: best.e, text, title }
}

function detectOnPage(tokens: Token[], page: number): OccOut[] {
  // Normalize: collapse spaces, remove punctuation that breaks patterns (keep commas for preAnchor rule)
  const text = pageText(tokens);
  const hits: OccOut[] = [];

  // 1) Enumerated lists (most common in legal docs)
  try {
    const enumRx = new RegExp(String.raw`(?:^|[;\n])\s*\d+\.\s*(?<nome>${NAME_SEQ_SRC})\s*,\s*nato(?:\/a)?\s+a\s+(?<pob>[^,;]+?)\s+(?:il\s+)?(?<dob>[0-3]?\d[./-][01]?\d[./-](?:19|20)\d{2})`, 'giu')
    for (const m of text.matchAll(enumRx)) {
      const full = (m.groups?.nome || '').replace(TITLES, '').trim()
      if (!full || !isLikelyPersonName(full)) continue
      const off = m.index! + (m[0].indexOf(full) >= 0 ? m[0].indexOf(full) : 0)
      const bbox = bboxForSubstring(tokens, off, full.length)
      const snippet = makeSnippet(text, off, full.length)
      const { first, last } = splitName(full)
      const dob = (m.groups?.dob || '').trim()
      const pob = (m.groups?.pob || '').trim()
      hits.push({
        personKey: makeKey(full, dob || undefined, pob || undefined),
        full_name: full, first_name: first, last_name: last,
        fields: { date_of_birth: dob || undefined, place_of_birth: pob || undefined },
        // Strong confidence: enumerated lists are reliable
        confidence: Math.min(1, 0.85 + (dob ? 0.05 : 0)),
        snippet, page, box: bbox
      })
    }
  } catch {}

  // 2) Anchor-based windows (names only)
  try {
    // Birth anchors only to avoid address bleed (residenza/dom. handled later in enrichment)
    const anchorRe2 = new RegExp(ANCHORS_BIRTH.source, 'giu')
    for (const m of text.matchAll(anchorRe2)) {
      const aStr = m[0]
      if (/^n\.$/i.test(aStr)) {
        const tail = text.slice(m.index! + aStr.length).trimStart()
        if (/^\d+/.test(tail)) continue
      }
      const anchorTok = charOffsetToTokenIndex(tokens, m.index!)
      try { dbg('leftwin', { page, anchor: aStr, anchorTok, win: leftWindowString(tokens, anchorTok, page) }) } catch {}
      const name = extractNameLeftOf(tokens, anchorTok, page)
      if (!name) { try { dbg('leftwin-noName', { page, anchor: aStr }) } catch {} ; continue }
      const { start, end, text: full, title } = name
      const { first, last } = splitName(full)
      const box = unionBoxes(tokens, start, end)
      const snippet = makeSnippet(text, Math.max(0, text.indexOf(full) - 20), full.length + 40)
      try { dbg('match', { page, full, title: title || null, start, end }) } catch {}
      hits.push({
        personKey: makeKey(full, undefined, undefined),
        full_name: full,
        first_name: first,
        last_name: last,
        fields: {},
        title,
        confidence: Math.min(1, 0.75),
        snippet,
        page,
        box
      })
    }
  } catch {}

  // 3) Skip label-based enrichment at this step

  // 3) Name immediately before "nato a|n." (e.g., "BERTUCCI Concetto Alessio, nato a Catania ...")
  const preAnchorName = new RegExp(String.raw`(${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4})\s*,?\s+(?:nato(?:\/a)?(?:\s+a)?|n\.)\b`, 'giu')
  let mPre: RegExpExecArray | null
  while ((mPre = preAnchorName.exec(text))) {
    const full = mPre[1].replace(TITLES, '').trim()
    if (!full) continue
    if (!isLikelyPersonName(full)) continue
    const off = mPre.index
    // Stop-token rule: if immediate left token is lowercase non-particle or blocked, reject
    try {
      const sTok = charOffsetToTokenIndex(tokens, off)
      const prevTok = sTok - 1
      if (prevTok >= 0) {
        const w = tokens[prevTok].text
        const lw = w.toLowerCase()
        const isParticle = new RegExp(`^${PARTICLE}$`, 'i').test(w)
        const lowerStop = isLowerWord(w) && !isParticle
        const blocked = STOP_TOKENS.has(lw) || NON_NAME_WORDS.has(lw)
        if (lowerStop || blocked) { try { dbg('preanchor-blockedPre', { page, prevTok, w, lowerStop, blocked }) } catch {} ; continue }
      }
    } catch {}
    const bbox = bboxForSubstring(tokens, off, full.length)
    const snippet = makeSnippet(text, off, full.length)
    const { first, last } = splitName(full)
    const conf = Math.min(1, 0.75)
    hits.push({
      personKey: makeKey(full, undefined, undefined),
      full_name: full,
      first_name: first, last_name: last,
      fields: {},
      confidence: conf,
      snippet, page, box: bbox
    })
  }

  // 4) Lenient pass: trova sequenze Nome Cognome ovunque (con conf. più bassa)
  if (lenientMode) {
    let mAny: RegExpExecArray | null;
    const anyRe = new RegExp(NAME_SEQ.source, 'giu');
    while ((mAny = anyRe.exec(text))) {
      const full = text.slice(mAny.index, mAny.index + mAny[0].length).replace(TITLES, '').trim();
      if (!full) continue;
      if (!isLikelyPersonName(full)) continue;
      // Require an anchor within the next 120 chars to reduce false positives
      const ctx = text.slice(mAny.index, Math.min(text.length, mAny.index + mAny[0].length + 120))
      if (!/\b(nato(?:\/a)?(?:\s+a)?|n\.|residente|domiciliat[oa]|domicilio\s+eletto|residenza)\b/iu.test(ctx)) continue
      const bbox = bboxForSubstring(tokens, mAny.index, full.length);
      const snippet = makeSnippet(text, mAny.index, full.length);
      const { first, last } = splitName(full);
      const fields: any = {}; // no enrichment here
      const conf = Math.min(1, 0.6); // medium confidence if near anchor
      hits.push({
        personKey: makeKey(full, undefined, undefined),
        full_name: full,
        first_name: first,
        last_name: last,
        fields,
        confidence: conf,
        snippet,
        page,
        box: bbox
      });
    }
  }

  return dedup(hits);
}

function splitName(full: string) {
  const s = full.replace(/\s{2,}/g, ' ').trim();
  if (s.includes(',')) {
    const [l, r] = s.split(',', 2).map(x => x.trim());
    return { first: r, last: l };
  }
  const parts = s.split(/\s+/);
  const last = parts.pop() || '';
  return { first: parts.join(' '), last };
}

// kept for future enrichment (unused in step 1)
function extractFields(ctx: string) {
  const f: any = {};
  const cf = ctx.match(RX.cf); if (cf) f.tax_code = cf[0].toUpperCase();
  const d1 = ctx.match(RX.dob1); const d2 = ctx.match(RX.dob2);
  if (d1) f.date_of_birth = `${d1[3]}-${String(d1[2]).padStart(2, '0')}-${String(d1[1]).padStart(2, '0')}`;
  else if (d2) f.date_of_birth = `${d2[2]}-${monthIdx(d2[1])}-${String(d2[1]).padStart(2, '0')}`;
  const email = ctx.match(RX.email); if (email) f.email = email[0];
  const phone = ctx.match(RX.phone); if (phone) f.phone = phone[0];
  const cap = ctx.match(RX.cap); if (cap) f.postal_code = cap[0];
  const adr = ctx.match(/\b(resident[ea]|domiciliat[oa])\s+in\s+([^,;\n]+)\b/i);
  if (adr) f.address = adr[2].trim();
  const city = ctx.match(/\b(?:comune|citt[aà]|in)\s+([A-ZÀ-Ü][a-zà-ü'’-]+)\b/);
  if (city) f.city = city[1];
  const prov = ctx.match(/\b(?:prov\.?\s*[:\-]?\s*)?([A-Z]{2})\b/);
  if (prov) f.province = prov[1].toUpperCase();
  return f;
}

// kept for future enrichment (unused in step 1)
function score(full: string, f: any) {
  // Stricter baseline to reduce false positives
  let s = 0.3;
  const nameParts = full.trim().split(/\s+/).filter(Boolean);
  const capCount = nameParts.filter(p => /^[A-ZÀ-Ü][a-zà-ü'’-]+$/.test(p)).length;
  if (capCount >= 2) s += 0.25;
  if (f.tax_code) s += 0.25;
  if (f.date_of_birth) s += 0.1;
  if (f.address || f.city) s += 0.1;
  return Math.min(1, s);
}

function monthIdx(m: string) {
  const map: any = { gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06', lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12' };
  const k = m.slice(0, 3).toLowerCase();
  return map[k] ?? '01';
}

function makeSnippet(text: string, start: number, len: number) {
  const s = Math.max(0, start - 50), e = Math.min(text.length, start + len + 50);
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

function bboxForSubstring(tokens: Token[], start: number, len: number) {
  let pos = 0; const boxes: Array<BoxPct> = []; const end = start + len;
  for (const t of tokens) {
    const next = pos + t.text.length;
    const overlaps = !(next <= start || pos >= end);
    if (overlaps) boxes.push({ x0Pct: t.x0Pct, x1Pct: t.x1Pct, y0Pct: t.y0Pct, y1Pct: t.y1Pct });
    pos = next + 1; // single space between tokens
  }
  if (boxes.length === 0) return { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 };
  const x0 = Math.min(...boxes.map(b => b.x0Pct));
  const x1 = Math.max(...boxes.map(b => b.x1Pct));
  const y0 = Math.min(...boxes.map(b => b.y0Pct));
  const y1 = Math.max(...boxes.map(b => b.y1Pct));
  return { x0Pct: x0, x1Pct: x1, y0Pct: y0, y1Pct: y1 };
}

function makeKey(full: string, dob?: string, city?: string) {
  const norm = (s?: string) => (s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const raw = `${norm(full)}|${norm(dob)}|${norm(city)}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return 'p_' + (h >>> 0).toString(16);
}

function dedup(items: OccOut[], tol = 0.9) {
  const out: OccOut[] = [];
  for (const x of items) {
    if (!out.some(y => y.full_name === x.full_name && iou(y.box, x.box) > tol)) out.push(x);
  }
  return out;
}

function iou(a: BoxPct, b: BoxPct) {
  const xi0 = Math.max(a.x0Pct, b.x0Pct), yi0 = Math.max(a.y0Pct, b.y0Pct);
  const xi1 = Math.min(a.x1Pct, b.x1Pct), yi1 = Math.min(a.y1Pct, b.y1Pct);
  const iw = Math.max(0, xi1 - xi0), ih = Math.max(0, yi1 - yi0);
  const inter = iw * ih, areaA = (a.x1Pct - a.x0Pct) * (a.y1Pct - a.y0Pct), areaB = (b.x1Pct - b.x0Pct) * (b.y1Pct - b.y0Pct);
  const uni = areaA + areaB - inter; return uni ? inter / uni : 0;
}


