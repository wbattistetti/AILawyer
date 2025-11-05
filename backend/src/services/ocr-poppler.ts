import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execa } from 'execa'
import { imageSize } from 'image-size'
import type { OcrResult } from '../types/index.js'

const POPPLER = process.env.POPPLER_PATH || ''
const TESSERACT = (() => {
  const envSet = process.env.TESSERACT_PATH
  if (envSet && envSet.trim()) return envSet
  // Try common Windows install path
  const win = 'C\\\x3a\\\\Program Files\\\\Tesseract-OCR\\\\tesseract.exe'.replace(/\\x3a/g, ':').replace(/\\\\/g, '\\')
  try { if (fss.existsSync(win)) return win } catch {}
  // Try simple exe name on Windows shells
  const exe = process.platform === 'win32' ? 'tesseract.exe' : 'tesseract'
  return exe
})()
const OCR_LANG = process.env.OCR_LANG || 'ita+eng'
const DPI_BASE = Number(process.env.OCR_DPI_BASE || 300)
const DPI_MAX = Number(process.env.OCR_DPI_MAX || 450)
// Soglie più realistiche per scansioni legali
const CONF_PAGE = Number(process.env.OCR_CONF_PAGE || 65)
const CONF_LOWWORD = 55
const LOW_RATIO_LIMIT = 0.30
const CONF_TEXT_THRESHOLD = Number(process.env.OCR_CONF_TEXT_THRESHOLD || 200)
// NOTE: LIMIT_PAGES and FORCE_FIRST_PAGE must be read at runtime per-run (see extract)

/**
 * ✅ Ricostruzione geometrica del testo OCR basata su coordinate
 * Raggruppa parole in righe basandosi su posizione verticale (y0)
 * e inserisce spazi basandosi su distanza orizzontale tra parole
 *
 * @param words Array di parole con coordinate normalizzate (x0, y0, x1, y1)
 * @param width Larghezza della pagina (per calcoli di distanza)
 * @param height Altezza della pagina (per calcoli di distanza)
 * @returns Testo ricostruito fedele al layout visivo
 */
export function reconstructTextFromGeometry(
  words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>,
  width: number,
  height: number
): string {
  if (!words || words.length === 0) return ''
  if (!width || !height) return words.map(w => w.text).join(' ') // Fallback se dimensioni mancanti

  // 1. Raggruppa parole in righe basandosi su y0Pct (posizione verticale)
  // Soglia verticale: ±1% di y0Pct per considerare parole sulla stessa riga
  const VERTICAL_THRESHOLD = 0.01 // 1% di altezza pagina
  const lines: Array<Array<{ text: string; x0: number; x1: number; y0: number; y1: number }>> = []

  // Ordina prima per y0 (dall'alto in basso), poi per x0 (da sinistra a destra)
  const sortedWords = [...words]
    .filter(w => w.text && w.text.trim()) // Rimuovi parole vuote
    .sort((a, b) => {
      const yDiff = a.y0 - b.y0
      if (Math.abs(yDiff) > VERTICAL_THRESHOLD) return yDiff // Prima ordina per riga (y)
      return a.x0 - b.x0 // Poi ordina per posizione orizzontale (x)
    })

  // Raggruppa in righe
  for (const word of sortedWords) {
    // Trova riga esistente dove questa parola potrebbe appartenere
    let foundLine = false
    for (const line of lines) {
      if (line.length > 0) {
        const firstWordInLine = line[0]
        // Se la differenza verticale è minore della soglia, è sulla stessa riga
        if (Math.abs(word.y0 - firstWordInLine.y0) <= VERTICAL_THRESHOLD) {
          line.push(word)
          // Mantieni ordinamento orizzontale all'interno della riga
          line.sort((a, b) => a.x0 - b.x0)
          foundLine = true
          break
        }
      }
    }
    if (!foundLine) {
      // Crea nuova riga
      lines.push([word])
    }
  }

  // 2. Costruisci testo riga per riga, inserendo spazi basati su distanza orizzontale
  const textLines: string[] = []

  for (const line of lines) {
    if (line.length === 0) continue

    const lineParts: string[] = []

    // Calcola larghezza media delle lettere per questa riga (per soglia dinamica)
    let totalCharWidth = 0
    let totalChars = 0
    for (const word of line) {
      const wordWidth = word.x1 - word.x0 // Larghezza normalizzata della parola
      const charCount = word.text.trim().length
      if (charCount > 0) {
        totalCharWidth += wordWidth / charCount
        totalChars += charCount
      }
    }
    const avgCharWidth = totalChars > 0 ? totalCharWidth / totalChars : 0.01 // Fallback: 1% se non calcolabile

    // Soglia dinamica: 1.5x la larghezza media di una lettera
    // Convertita in percentuale della larghezza pagina
    const SPACE_THRESHOLD = avgCharWidth * 1.5

    // Costruisci la riga inserendo spazi basati su distanza
    for (let i = 0; i < line.length; i++) {
      const word = line[i]

      if (i > 0) {
        // Calcola distanza tra fine parola precedente e inizio parola corrente
        const prevWord = line[i - 1]
        const horizontalDistance = word.x0 - prevWord.x1

        // Se la distanza è maggiore della soglia, inserisci uno spazio
        if (horizontalDistance > SPACE_THRESHOLD) {
          lineParts.push(' ')
        } else if (horizontalDistance > avgCharWidth * 0.3) {
          // Distanza piccola ma non zero: potrebbe essere lettere separate della stessa parola
          // Inserisci spazio solo se la distanza è significativa (> 0.3x larghezza lettera)
          lineParts.push(' ')
        }
        // Se la distanza è molto piccola (< 0.3x), considera le parole attaccate (no spazio)
      }

      lineParts.push(word.text.trim())
    }

    // Unisci la riga
    const lineText = lineParts.join('').trim()
    if (lineText) {
      textLines.push(lineText)
    }
  }

  // 3. Unisci tutte le righe con \n
  const reconstructedText = textLines.join('\n')

  // Normalizza spazi multipli e rimuovi spazi eccessivi intorno ai \n
  return reconstructedText
    .replace(/[ \t]+/g, ' ') // Spazi multipli → singolo spazio
    .replace(/\s+\n/g, '\n')  // Spazi prima di \n → solo \n
    .replace(/\n\s+/g, '\n')  // Spazi dopo \n → solo \n
    .replace(/\n{3,}/g, '\n\n') // Più di 2 \n consecutivi → massimo 2 (paragrafo)
    .trim()
}

// Resolve tessdata directory robustly (Windows/local installs)
const TESSERACT_DIR = (() => {
  try { return path.dirname(TESSERACT) } catch { return '' }
})()
const CANDIDATE_TESSDATA = [
  process.env.TESSDATA_DIR,
  (TESSERACT_DIR ? path.join(TESSERACT_DIR, 'tessdata') : undefined),
  'C\\Program Files\\Tesseract-OCR\\tessdata'.replace('\\\\', '\\'),
].filter(Boolean) as string[]
function resolveTessdataDir(langList: string) {
  const langs = (langList || 'ita').split('+').map(s => s.trim()).filter(Boolean)
  for (const cand of CANDIDATE_TESSDATA) {
    try {
      const ok = langs.every(l => fss.existsSync(path.join(cand, `${l}.traineddata`)))
      if (ok) return cand
    } catch {}
  }
  return CANDIDATE_TESSDATA[0]
}
const TESSDATA_DIR = resolveTessdataDir(OCR_LANG)
if (!TESSDATA_DIR || !fss.existsSync(path.join(TESSDATA_DIR, `${(OCR_LANG.split('+')[0]||'ita')}.traineddata`))) {
  throw new Error(`[OCR] tessdata non trovata o incompleta. Imposta TESSDATA_DIR o copia i modelli in ${path.join(TESSERACT_DIR,'tessdata')}`)
}

type ProgressMeta = { currentPage?: number; totalPages?: number; phase?: 'RASTER'|'OCR'|'RETRY' }

export interface IOcrPoppler {
  extract(
    s3Key: string,
    onProgress?: (progress01: number, meta?: ProgressMeta) => void | Promise<void>
  ): Promise<OcrResult & { layout: any[] }>
}

function bin(name: string) {
  return POPPLER ? path.join(POPPLER, name) : name
}

async function runStdout(cmd: string, args: string[], opts?: { cwd?: string }) {
  const { stdout } = await execa(cmd, args, { ...opts, shell: false, windowsHide: true, maxBuffer: 1024 * 1024 * 100 })
  return stdout
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

async function pdfPageCount(pdfPath: string) {
  try {
    const info = await runStdout(bin('pdfinfo'), [pdfPath])
    const m = info.match(/Pages:\s+(\d+)/)
    return m ? Number(m[1]) : 0
  } catch { return 0 }
}

async function bornDigitalCheck(pdfPath: string, totalPages: number) {
  let text = ''
  try { text = await runStdout(bin('pdftotext'), ['-layout', pdfPath, '-']) } catch {}
  let fontsOut = ''
  try { fontsOut = await runStdout(bin('pdffonts'), [pdfPath]) } catch {}

  const fontsUsed = fontsOut.split('\n').filter(l => l && !l.startsWith('name') && !l.startsWith('---')).length > 0

  const cleaned = text.replace(/\s+/g, ' ')
  const len = cleaned.length
  const uniq = new Set(cleaned).size
  const nonWs = cleaned.replace(/\s/g, '').length
  const uniqRatio = len ? uniq / len : 0
  const nonWsRatio = len ? nonWs / len : 0

  const perPage = totalPages || 1
  const charsPerPage = len / perPage
  const hasEnoughText = charsPerPage > CONF_TEXT_THRESHOLD
  const notGarbage = uniqRatio >= 0.15 && nonWsRatio >= 0.6

  const bornDigital = hasEnoughText && fontsUsed && notGarbage
  return { bornDigital, text }
}

async function rasterizeAll(pdfPath: string, outBase: string, dpi: number) {
  const args: string[] = []
  if (!process.env.OCR_RASTER_COLOR) args.push('-gray')
  args.push('-r', String(dpi), '-png', '-cropbox', '-aa', 'no', '-aaVector', 'no', pdfPath, outBase)
  const proc = execa(bin('pdftoppm'), args, { shell: false, windowsHide: true })
  const jobId = process.env.BULLMQ_JOB_ID || ''
  const tick = setInterval(() => {
    try { const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined; if (jobId && mem && mem.has(String(jobId))) { try { proc.kill('SIGTERM') } catch {} } } catch {}
  }, 200)
  await proc.finally(() => { try { clearInterval(tick) } catch {} })
}

const RASTER_RETRIES = Math.max(1, Number(process.env.OCR_RASTER_RETRIES || 2))
async function rasterizePage(pdfPath: string, page: number, outBase: string, dpi: number) {
  const tryOnce = async (color: boolean) => {
    const args: string[] = []
    if (!color) args.push('-gray')
    args.push('-f', String(page), '-l', String(page), '-r', String(dpi), '-png', '-cropbox', '-aa', 'no', '-aaVector', 'no', pdfPath, outBase)
    // Log rimosso per ridurre verbosità
    const proc = execa(bin('pdftoppm'), args, { shell: false, windowsHide: true })
    const jobId = process.env.BULLMQ_JOB_ID || ''
    const tick = setInterval(() => {
      try { const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined; if (jobId && mem && mem.has(String(jobId))) { try { proc.kill('SIGTERM') } catch {} } } catch {}
    }, 200)
    await proc.finally(() => { try { clearInterval(tick) } catch {} })
    const name3 = `${outBase}-${String(page).padStart(3, '0')}.png`
    const namePlain = `${outBase}-${page}.png`
    const found3 = await waitFor(name3, 80, 25)
    const foundPlain = !found3 && await waitFor(namePlain, 40, 25)
    let picked = found3 ? name3 : (foundPlain ? namePlain : '')
    if (!picked) {
      try {
        const dir = path.dirname(outBase)
        const base = path.basename(outBase)
        const rx = new RegExp(`^${base}-0*${page}\\.png$`, 'i')
        const files = fss.readdirSync(dir)
        const hit = files.find(f => rx.test(f))
        if (hit) picked = path.join(dir, hit)
      } catch {}
    }
    // Log rimosso per ridurre verbosità
    if (!picked || !fss.existsSync(picked)) {
      throw new Error('[OCR][raster] PNG non trovato dopo pdftoppm')
    }

    // Se OCR_CROP_TOP_THIRD è attivo, ritaglia l'immagine al primo terzo
    const shouldCrop = String(process.env.OCR_CROP_TOP_THIRD || '').toLowerCase() === 'true'
    if (shouldCrop) {
      try {
        // Crop silenzioso (log rimosso)
        const { cropImageTopThird } = await import('../lib/extractObject.js')
        picked = await cropImageTopThird(picked)
      } catch (cropError: any) {
        console.error('[OCR][raster][crop-error]', {
          page,
          error: String(cropError?.message || cropError),
          stack: cropError?.stack,
          originalPath: picked
        });
        // Continua anche se il crop fallisce
      }
    }

    return picked
  }

  const preferColor = !!process.env.OCR_RASTER_COLOR
  let attempt = 0
  let lastErr: any
  for (attempt = 0; attempt < RASTER_RETRIES; attempt++) {
    const useColor = attempt === 0 ? preferColor : !preferColor // toggle color on retry
    try {
      return await tryOnce(useColor)
    } catch (e: any) {
      lastErr = e
      // Log retry rimosso (solo log finale se fallisce)
      await new Promise(r => setTimeout(r, 120 + attempt * 80))
    }
  }
  try { console.error('[OCR][raster][failed]', { page, dpi, attempts: RASTER_RETRIES, err: String(lastErr?.message || lastErr) }) } catch {}
  throw lastErr || new Error('[OCR][raster] fallita dopo retry')
}

type Word = { text: string; conf: number; x: number; y: number; w: number; h: number; b?: number; p?: number; l?: number; wi?: number }
function parseTsv(tsv: string): Word[] {
  const lines = tsv.split('\n')
  if (!lines.length) return []
  const header = (lines[0] || '').split('\t')
  const ix = {
    level: header.indexOf('level'),
    left: header.indexOf('left'),
    top: header.indexOf('top'),
    width: header.indexOf('width'),
    height: header.indexOf('height'),
    conf: header.indexOf('conf'),
    text: header.indexOf('text'),
    block: header.indexOf('block_num'),
    par: header.indexOf('par_num'),
    line: header.indexOf('line_num'),
    word: header.indexOf('word_num'),
  }
  const words: Word[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]?.split('\t')
    if (!cols?.length) continue
    const level = Number(cols[ix.level] || 0)
    if (level !== 5) continue
    const text = cols[ix.text] || ''
    const conf = Number(cols[ix.conf] || -1)
    if (conf === -1 || !text) continue
    const left = Number(cols[ix.left] || 0)
    const top = Number(cols[ix.top] || 0)
    const width = Number(cols[ix.width] || 0)
    const height = Number(cols[ix.height] || 0)
    const b = Number(cols[ix.block] || 0)
    const p = Number(cols[ix.par] || 0)
    const l = Number(cols[ix.line] || 0)
    const wi = Number(cols[ix.word] || 0)
    words.push({ text, conf, x: left, y: top, w: width, h: height, b, p, l, wi })
  }
  return words
}

// Evita di impostare TESSDATA_PREFIX in modo errato (può indurre Tesseract a cercare tessdata/tessdata)
const tessEnv = { ...process.env }
const baseArgsCommon = ['-l', OCR_LANG, '--oem', '1', '-c', 'preserve_interword_spaces=1', '--tessdata-dir', TESSDATA_DIR]

// Attende la comparsa del file prodotto da Tesseract (Windows/AV lock)
async function waitFor(p: string, tries = 40, ms = 25) {
  for (let i = 0; i < tries; i++) {
    try { await fs.access(p); return true } catch { await new Promise(r => setTimeout(r, ms)) }
  }
  return false
}

async function ocrTsv(pngPath: string, psm: number, dpi: number) {
  const outBase = path.join(path.dirname(pngPath), `out-${path.basename(pngPath, '.png')}-${psm}-${dpi}-${Date.now()}`)
  try {
    const args = [pngPath, outBase, ...baseArgsCommon, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, '-c', 'tessedit_create_tsv=1']
    // Log comando rimosso
    const proc = execa(TESSERACT, args, {
      shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
    })
    // Kill on cancel signal (inline mode)
    const jobId = process.env.BULLMQ_JOB_ID || ''
    const onTick = setInterval(() => {
      try {
        const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined
        if (jobId && mem && mem.has(String(jobId))) {
          try { proc.kill('SIGTERM') } catch {}
        }
      } catch {}
    }, 200)
    const { stderr } = await proc.finally(() => { try { clearInterval(onTick) } catch {} })
    if (stderr && stderr.trim()) console.warn('[OCR][tesseract][tsv][stderr]', stderr.slice(0, 500))
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e)
    console.warn('[OCR][tesseract][tsv][error]', String(msg).slice(0, 500))
  }
  const tsvPath = `${outBase}.tsv`
  if (!(await waitFor(tsvPath))) { return '' }
  // Log file tsv rimosso
  try { return await fs.readFile(tsvPath, 'utf-8') } catch { return '' }
}

async function ocrHocr(pngPath: string, psm: number, dpi: number) {
  const outBase = path.join(path.dirname(pngPath), `out-${path.basename(pngPath, '.png')}-${psm}-${dpi}-${Date.now()}`)
  try {
    const args = [pngPath, outBase, ...baseArgsCommon, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, '-c', 'tessedit_create_hocr=1']
    // Log comando rimosso
    const proc = execa(TESSERACT, args, {
      shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
    })
    const jobId = process.env.BULLMQ_JOB_ID || ''
    const onTick = setInterval(() => {
      try {
        const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined
        if (jobId && mem && mem.has(String(jobId))) {
          try { proc.kill('SIGTERM') } catch {}
        }
      } catch {}
    }, 200)
    const { stderr } = await proc.finally(() => { try { clearInterval(onTick) } catch {} })
    if (stderr && stderr.trim()) console.warn('[OCR][tesseract][hocr][stderr]', stderr.slice(0, 500))
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e)
    console.warn('[OCR][tesseract][hocr][error]', String(msg).slice(0, 500))
  }
  const hocrPath = `${outBase}.hocr`
  if (!(await waitFor(hocrPath))) { return '' }
  // Log file hocr rimosso
  try { return await fs.readFile(hocrPath, 'utf-8') } catch { return '' }
}

async function ocrTxt(pngPath: string, psm: number, dpi: number) {
  // Use stdout renderer to avoid file race on Windows: outputbase=stdout + renderer 'txt'
  const args = [pngPath, 'stdout', ...baseArgsCommon, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, 'txt']
  // Log comando rimosso
  const { stdout } = await execa(TESSERACT, args, {
    shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
  })
  return stdout
}

function parseHocrWords(hocr: string): Word[] {
  // Prefer pattern with x_wconf; fallback to pattern without x_wconf (default conf=60)
  const rx1 = /class=['"]ocrx_word['"][^>]*title=['"][^"']*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+);[^"']*x_wconf\s+(\d+)[^"']*['"][^>]*>(.*?)<\/span>/gsi
  const rx2 = /class=['"]ocrx_word['"][^>]*title=['"][^"']*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^"']*['"][^>]*>(.*?)<\/span>/gsi
  const words: Word[] = []
  let m: RegExpExecArray | null
  while ((m = rx1.exec(hocr))) {
    const [, x0, y0, x1, y1, conf, raw] = m
    if (!x0 || !y0 || !x1 || !y1 || !conf || !raw) continue
    const text = String(raw).replace(/<[^>]+>/g, '').trim()
    if (!text) continue
    words.push({ text, conf: Number(conf), x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
  }
  if (words.length === 0) {
    while ((m = rx2.exec(hocr))) {
      const [, x0, y0, x1, y1, raw] = m
      if (!x0 || !y0 || !x1 || !y1 || !raw) continue
      const text = String(raw).replace(/<[^>]+>/g, '').trim()
      if (!text) continue
      words.push({ text, conf: 60, x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
    }
  }
  return words
}

const PSM_CHAIN = [6, 4, 3, 11, 12] as const

async function tryBoxes(png: string, dpi: number) {
  // Log png rimosso
  for (const psm of PSM_CHAIN) {
    const tsv = await ocrTsv(png, psm, dpi).catch(() => '')
    let words = parseTsv(tsv)
    // Log psm rimosso
    if (words.length) return { words, psmUsed: psm }
    const hocr = await ocrHocr(png, psm, dpi).catch(() => '')
    if (hocr) {
      words = parseHocrWords(hocr)
      // Log psm hocr rimosso
      if (words.length) return { words, psmUsed: psm }
    } else {
      // Log psm hocr vuoto rimosso
    }
  }
  return { words: [] as Word[], psmUsed: 6 }
}

export class PopplerOcrService implements IOcrPoppler {
  constructor(private getFile: (s3Key: string) => Promise<Buffer>) {}

  async extract(s3Key: string, onProgress?: (p: number, meta?: ProgressMeta)=>void): Promise<OcrResult & { layout: any[] }> {
    const tStartAll = Date.now()
    // Log inizializzazione OCR rimossi (troppo verbosi)
    // Preflight: versione e lang data (silenzioso)
    try {
      await execa(TESSERACT, ['--version'], { shell: false, windowsHide: true })
    } catch (e) {
      // Log error solo se Tesseract non trovato (problema critico)
      console.error('[OCR][tesseract] not found or not runnable', e)
      throw new Error('Tesseract non trovato: installa Tesseract o imposta TESSERACT_PATH')
    }
    // Lang check silenzioso
    try {
      const langs = String(OCR_LANG || 'ita').split('+')
      const missing = langs.filter(l => {
        try { return !fss.existsSync(path.join(TESSDATA_DIR || '', `${l}.traineddata`)) } catch { return true }
      })
      if (missing.length) console.warn('[OCR][tesseract] missing traineddata', { missing, dir: TESSDATA_DIR })
    } catch {}
    const buf = await this.getFile(s3Key)
    const tmpDir = path.join(os.tmpdir(), 'ocr', crypto.randomBytes(6).toString('hex'))
    await fs.mkdir(tmpDir, { recursive: true })
    const pdfPath = path.join(tmpDir, 'input.pdf')
    await fs.writeFile(pdfPath, Buffer.from(buf))

    try {
      const totalPages = (await pdfPageCount(pdfPath)) || 1

      const born = await bornDigitalCheck(pdfPath, totalPages)
      if (born.bornDigital) {
        const byPage = born.text.split(/\f/g).map(t => t.trim())
        const pages = byPage.map(t => ({ text: t, confidence: 99 as number }))
        const avgConfidence = 99
        if (onProgress) await onProgress(1, { phase: 'OCR', currentPage: totalPages, totalPages })
        return { pages, avgConfidence, layout: [] }
      }

      const outBase = path.join(tmpDir, 'page')
      // Read limits at runtime so per-request overrides apply
      const runtimeLimit = Number(process.env.OCR_LIMIT_PAGES || 0)
      const runtimeForceFirst = String(process.env.OCR_FORCE_FIRST_PAGE || '').toLowerCase() === 'true'
      const limitFromEnv = runtimeLimit > 0 ? runtimeLimit : (runtimeForceFirst ? 1 : 0)
      const pagesToProcess = limitFromEnv > 0 ? Math.min(limitFromEnv, totalPages) : totalPages

      // Auto‑tuning concorrenza per pagina basato su CPU/RAM, con override via env
      const computePageConcurrency = () => {
        const cpus = os.cpus() || []
        const threads = Math.max(1, cpus.length || 1)
        const model = (cpus[0]?.model || '').trim()
        const speedMhz = Number(cpus[0]?.speed || 0) // MHz
        const totalMemGb = Math.round((os.totalmem() || 0) / (1024 ** 3))

        // Base: 2× thread logici (ottimo per pipeline raster+OCR)
        let base = threads * 2
        // Se CPU molto lenta o poca RAM, riduci leggermente
        if (speedMhz > 0 && speedMhz < 2200) base = Math.ceil(threads * 1.5)
        if (totalMemGb > 0 && totalMemGb < 12) base = Math.ceil(base * 0.75)

        const maxCap = Math.max(4, Number(process.env.OCR_MAX_CONCURRENCY || 16))
        return Math.max(4, Math.min(maxCap, base))
      }
      const cpuCount = Math.max(1, (os.cpus()?.length || 1))
      const autoConc = computePageConcurrency()
      const conc = Number(process.env.OCR_CONCURRENCY) > 0 ? Number(process.env.OCR_CONCURRENCY) : autoConc
      // Log concurrency rimosso (troppo verboso)

      const resultPages: { text: string; confidence: number }[] = new Array(pagesToProcess)
      const layout: any[] = []

      // helper: translate a single page top-down
      const translateOne = async (pageIdx: number, basePng: string) => {
        const t0 = Date.now()
        const processWords = async (words: Word[], dpiUsed: number, psmUsed: number, pngForSize: string) => {
          // Ordine deterministico basato sugli indici TSV: block/par/line/word
          const byIdx = [...words].sort((a, b) =>
            ((a.b ?? 0) - (b.b ?? 0)) ||
            ((a.p ?? 0) - (b.p ?? 0)) ||
            ((a.l ?? 0) - (b.l ?? 0)) ||
            ((a.wi ?? 0) - (b.wi ?? 0))
          )

          // Ottieni dimensioni pagina per ricostruzione geometrica
          let W = 0, H = 0
          try {
            const buffer = await fs.readFile(pngForSize)
            const sz = imageSize(buffer)
            W = (sz?.width || 0)
            H = (sz?.height || 0)
          } catch (e) {
            try { console.warn('[OCR][imageSize][error]', String(e)) } catch {}
          }

          // ✅ METODO PRIMARIO: Ricostruzione geometrica basata su coordinate
          // Costruiamo prima il layout normalizzato per avere le coordinate
          const layoutWords: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }> = []
          for (const w of byIdx) {
            const x0px = w.x
            const x1px = w.x + w.w
            const y0px_top = w.y
            const y1px_top = w.y + w.h
            const y0Pct_dom = H ? (y0px_top / H) : 0
            const y1Pct_dom = H ? (y1px_top / H) : 0
            layoutWords.push({
              text: w.text,
              x0: W ? (x0px / W) : 0,
              y0: y0Pct_dom,
              x1: W ? (x1px / W) : 0,
              y1: y1Pct_dom,
            })
          }

          // ✅ DISABILITATA ricostruzione geometrica: causava troppi problemi
          // Usa SOLO il metodo strutturale basato su indici Tesseract (più affidabile)
          let textParts: string[] = []
          let last = { b: -1, p: -1, l: -1 }
          for (const w of byIdx) {
            const nb = w.b ?? 0, np = w.p ?? 0, nl = w.l ?? 0
            if (last.b !== -1) {
              if (nb !== last.b) textParts.push('\n\n')
              else if (np !== last.p) textParts.push('\n\n')
              else if (nl !== last.l) textParts.push('\n')
              else textParts.push(' ')
            }
            textParts.push(w.text)
            last = { b: nb, p: np, l: nl }
          }
          const text = textParts.join('').replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
          // Log processWords rimosso (troppo verboso)

          const confs = byIdx.map(w => w.conf)
          const med = median(confs)

          // ✅ Salva layout con coordinate normalizzate (già calcolate sopra)
          // Usiamo layoutWords già costruito per la ricostruzione geometrica
          layout.push({
            page: pageIdx,
            width: W, height: H,
            dpiUsed, psmUsed,
            words: layoutWords.map((w, idx) => ({
              text: w.text,
              x0: w.x0,
              y0: w.y0,
              x1: w.x1,
              y1: w.y1,
              conf: byIdx[idx]?.conf ?? 0,
              b: byIdx[idx]?.b,
              p: byIdx[idx]?.p,
              l: byIdx[idx]?.l,
              wi: byIdx[idx]?.wi,
            })),
          })
          return { text, med }
        }

        let pageText = ''
        let pageConf: number = 0
        let usedPsm = 6
        let usedDpi = DPI_BASE

        // Log rimosso - logHead disabilitato per ridurre verbosità
        const logHead = (phase: string, extra: Record<string, any> = {}) => {
          // Silenzioso
        }

        // base ladder
        let baseOut = await tryBoxes(basePng, DPI_BASE)
        let words = baseOut.words
        usedPsm = baseOut.psmUsed
        let confs = words.map(w => w.conf)
        let med = median(confs)
        let lowRatio = confs.length ? confs.filter(c => c < CONF_LOWWORD).length / confs.length : 1
        logHead('base', { dpi: DPI_BASE, psm: usedPsm, words: words.length, medConf: med.toFixed(1), lowRatio: Number(lowRatio.toFixed(2)) })

        if (!words.length || med < CONF_PAGE || lowRatio > LOW_RATIO_LIMIT) {
          const hiPng = await rasterizePage(pdfPath, pageIdx, path.join(tmpDir, 'page-hi'), DPI_MAX)
          usedDpi = DPI_MAX
          const hiOut = await tryBoxes(hiPng, DPI_MAX)
          const wordsH = hiOut.words
          const medH = median(wordsH.map(w => w.conf))
          if (wordsH.length > words.length || (medH && med && medH > med)) { words = wordsH; med = medH; usedPsm = hiOut.psmUsed }
          logHead('hiDPI', { dpi: DPI_MAX, psm: usedPsm, words: words.length, medConf: med.toFixed(1) })
          const out = await processWords(words, usedDpi, usedPsm, hiPng)
          pageText = out.text; pageConf = out.med || 0
          // REMOVED fallback to ocrTxt: garantisce allineamento tra ocrText e ocrLayout.words
          if (!pageText || !pageText.trim()) {
            logHead('warn', { msg: 'processWords returned empty text, keeping empty to maintain alignment' })
          }
        } else {
          const out = await processWords(words, usedDpi, usedPsm, basePng)
          pageText = out.text; pageConf = out.med || 0
          // REMOVED fallback to ocrTxt: garantisce allineamento tra ocrText e ocrLayout.words
          if (!pageText || !pageText.trim()) {
            logHead('warn', { msg: 'processWords returned empty text, keeping empty to maintain alignment' })
          }
        }
        // Log testo pagina rimosso (troppo verboso)
        logHead('result', { words: pageConf ? undefined : words.length, conf: pageConf.toFixed(1), textLen: (pageText||'').length, ms: (Date.now()-t0), snippet: (pageText||'').slice(0, 120) })
        return { text: pageText, confidence: pageConf }
      }

      // Auto-concorrenza basata su CPU, con override via OCR_CONCURRENCY
      // Per-page pipeline: raster → OCR per pagina, in concorrenza
      let completed = 0
      const processOne = async (p: number) => {
        // Cooperative cancel: check redis flag between pages if running under worker
        try {
          const jobId = process.env.BULLMQ_JOB_ID || ''
          // Check memory registry first (standalone mode)
          const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined
          if (jobId && mem && mem.has(String(jobId))) { throw new Error('CANCELLED') }
        } catch {}
        const png = await rasterizePage(pdfPath, p, outBase, DPI_BASE)
        const out = await translateOne(p, png)
        resultPages[p - 1] = out
        completed++
        if (onProgress) await onProgress(completed / Math.max(1, pagesToProcess), { phase: 'OCR', currentPage: completed, totalPages: pagesToProcess })
      }
      let next = 1
      const runners: Promise<void>[] = []
      for (let k = 0; k < Math.min(conc, pagesToProcess); k++) {
        runners.push((async function run() { while (next <= pagesToProcess) { const i = next++; await processOne(i) } })())
      }
      await Promise.all(runners)

      const avgConfidence = resultPages.length ? resultPages.reduce((a, b) => a + b.confidence, 0) / resultPages.length : 0
      // Log return rimosso (troppo verboso)
      return { pages: resultPages, avgConfidence, layout }
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
}


