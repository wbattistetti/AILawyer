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

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
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
  await execa(bin('pdftoppm'), args, { shell: false, windowsHide: true })
}

async function rasterizePage(pdfPath: string, page: number, outBase: string, dpi: number) {
  const args: string[] = []
  if (!process.env.OCR_RASTER_COLOR) args.push('-gray')
  args.push('-f', String(page), '-l', String(page), '-r', String(dpi), '-png', '-cropbox', '-aa', 'no', '-aaVector', 'no', pdfPath, outBase)
  await execa(bin('pdftoppm'), args, { shell: false, windowsHide: true })
  return `${outBase}-${String(page).padStart(3, '0')}.png`
}

type Word = { text: string; conf: number; x: number; y: number; w: number; h: number; b?: number; p?: number; l?: number; wi?: number }
function parseTsv(tsv: string): Word[] {
  const lines = tsv.split('\n')
  if (!lines.length) return []
  const header = lines[0].split('\t')
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
    const cols = lines[i].split('\t')
    if (!cols.length) continue
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
    try { console.log('[OCR][cmd][tsv]', TESSERACT, args.join(' ')) } catch {}
    const { stderr } = await execa(TESSERACT, args, {
      shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
    })
    if (stderr && stderr.trim()) console.warn('[OCR][tesseract][tsv][stderr]', stderr.slice(0, 500))
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e)
    console.warn('[OCR][tesseract][tsv][error]', String(msg).slice(0, 500))
  }
  const tsvPath = `${outBase}.tsv`
  if (!(await waitFor(tsvPath))) { try { console.warn('[OCR][tsv][missing]', tsvPath) } catch {}; return '' }
  try { const sz = fss.statSync(tsvPath)?.size || 0; console.log('[OCR][tsv][file]', { path: tsvPath, size: sz }) } catch {}
  try { return await fs.readFile(tsvPath, 'utf-8') } catch { return '' }
}

async function ocrHocr(pngPath: string, psm: number, dpi: number) {
  const outBase = path.join(path.dirname(pngPath), `out-${path.basename(pngPath, '.png')}-${psm}-${dpi}-${Date.now()}`)
  try {
    const args = [pngPath, outBase, ...baseArgsCommon, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, '-c', 'tessedit_create_hocr=1']
    try { console.log('[OCR][cmd][hocr]', TESSERACT, args.join(' ')) } catch {}
    const { stderr } = await execa(TESSERACT, args, {
      shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
    })
    if (stderr && stderr.trim()) console.warn('[OCR][tesseract][hocr][stderr]', stderr.slice(0, 500))
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e)
    console.warn('[OCR][tesseract][hocr][error]', String(msg).slice(0, 500))
  }
  const hocrPath = `${outBase}.hocr`
  if (!(await waitFor(hocrPath))) { try { console.warn('[OCR][hocr][missing]', hocrPath) } catch {}; return '' }
  try { const sz = fss.statSync(hocrPath)?.size || 0; console.log('[OCR][hocr][file]', { path: hocrPath, size: sz }) } catch {}
  try { return await fs.readFile(hocrPath, 'utf-8') } catch { return '' }
}

async function ocrTxt(pngPath: string, psm: number, dpi: number) {
  const args = [pngPath, ...baseArgsCommon, 'txt', '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`]
  try { console.log('[OCR][cmd][txt]', TESSERACT, args.join(' ')) } catch {}
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
    const text = String(raw).replace(/<[^>]+>/g, '').trim()
    if (!text) continue
    words.push({ text, conf: Number(conf), x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
  }
  if (words.length === 0) {
    while ((m = rx2.exec(hocr))) {
      const [, x0, y0, x1, y1, raw] = m
      const text = String(raw).replace(/<[^>]+>/g, '').trim()
      if (!text) continue
      words.push({ text, conf: 60, x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
    }
  }
  return words
}

const PSM_CHAIN = [6, 4, 3, 11, 12] as const

async function tryBoxes(png: string, dpi: number) {
  try { const st = fss.statSync(png); console.log('[OCR][png]', { path: png, size: st?.size || 0, dpi }) } catch {}
  for (const psm of PSM_CHAIN) {
    const tsv = await ocrTsv(png, psm, dpi).catch(() => '')
    let words = parseTsv(tsv)
    try { console.log('[OCR][psm][tsv]', { psm, tsvLen: tsv.length || 0, words: words.length }) } catch {}
    if (words.length) return { words, psmUsed: psm }
    const hocr = await ocrHocr(png, psm, dpi).catch(() => '')
    if (hocr) {
      words = parseHocrWords(hocr)
      try { console.log('[OCR][psm][hocr]', { psm, hocrLen: hocr.length || 0, words: words.length }) } catch {}
      if (words.length) return { words, psmUsed: psm }
    } else {
      try { console.log('[OCR][psm][hocr]', { psm, hocrLen: 0, words: 0 }) } catch {}
    }
  }
  return { words: [] as Word[], psmUsed: 6 }
}

export class PopplerOcrService implements IOcrPoppler {
  constructor(private getFile: (s3Key: string) => Promise<Buffer>) {}

  async extract(s3Key: string, onProgress?: (p: number, meta?: ProgressMeta)=>void): Promise<OcrResult & { layout: any[] }> {
    try { console.log('[OCR][bin]', { TESSERACT, TESSDATA_DIR, POPPLER, OCR_LANG }) } catch {}
    // Preflight: versione e lang data
    try {
      const { stdout: ver } = await execa(TESSERACT, ['--version'], { shell: false, windowsHide: true })
      console.log('[OCR][tesseract][version]', (ver || '').split('\n')[0])
    } catch (e) {
      console.error('[OCR][tesseract] not found or not runnable', e)
      throw new Error('Tesseract non trovato: installa Tesseract o imposta TESSERACT_PATH')
    }
    try {
      const { stdout: langsOut } = await execa(TESSERACT, ['--list-langs', '--tessdata-dir', TESSDATA_DIR], { shell: false, windowsHide: true })
      const first = (langsOut || '').split('\n').slice(0, 6).join(' | ')
      console.log('[OCR][tesseract][langs]', first)
    } catch {}
    try {
      const langs = (OCR_LANG || 'ita').split('+')
      const missing = langs.filter(l => {
        try { return !fss.existsSync(path.join(TESSDATA_DIR, `${l}.traineddata`)) } catch { return true }
      })
      if (missing.length) console.warn('[OCR][tesseract] missing traineddata', { missing, dir: TESSDATA_DIR })
    } catch {}
    const buf = await this.getFile(s3Key)
    const tmpDir = path.join(os.tmpdir(), 'ocr', crypto.randomBytes(6).toString('hex'))
    await fs.mkdir(tmpDir, { recursive: true })
    const pdfPath = path.join(tmpDir, 'input.pdf')
    await fs.writeFile(pdfPath, buf)

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
      if (pagesToProcess < totalPages) {
        // Rasterize only the first N pages
        for (let p = 1; p <= pagesToProcess; p++) {
          await rasterizePage(pdfPath, p, outBase, DPI_BASE)
        }
      } else {
        await rasterizeAll(pdfPath, outBase, DPI_BASE)
      }
      if (onProgress) await onProgress(0.5, { phase: 'RASTER', totalPages: pagesToProcess })

      const pngsAll = fss.readdirSync(tmpDir).filter(f => f.startsWith('page-') && f.endsWith('.png')).sort()
      const maxPages = Math.min(pagesToProcess, pngsAll.length)
      const pngs = pngsAll.slice(0, maxPages)
      try { console.log('[OCR][raster]', { totalPages, pagesToProcess, files: pngs.length, first: pngs[0] }) } catch {}
      const resultPages: { text: string; confidence: number }[] = []
      const layout: any[] = []

      // helper: translate a single page top-down
      const translateOne = async (pageIdx: number, basePng: string) => {
        const processWords = (words: Word[], dpiUsed: number, psmUsed: number, pngForSize: string) => {
          // Ordine deterministico basato sugli indici TSV: block/par/line/word
          const byIdx = [...words].sort((a, b) =>
            ((a.b ?? 0) - (b.b ?? 0)) ||
            ((a.p ?? 0) - (b.p ?? 0)) ||
            ((a.l ?? 0) - (b.l ?? 0)) ||
            ((a.wi ?? 0) - (b.wi ?? 0))
          )

          // Ricostruzione testo fedele: parola→spazio, cambio linea→\n, cambio paragrafo→\n\n
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

          const confs = byIdx.map(w => w.conf)
          const med = median(confs)
          let W = 0, H = 0
          try {
            const sz = imageSize(pngForSize)
            W = (sz.width || 0)
            H = (sz.height || 0)
          } catch (e) {
            try { console.warn('[OCR][imageSize][error]', String(e)) } catch {}
          }
          const invScale = dpiUsed / 72
          layout.push({
            page: pageIdx,
            width: W, height: H,
            dpiUsed, psmUsed,
            words: byIdx.map(w => {
              const x0px = (w.x) * invScale
              const x1px = (w.x + w.w) * invScale
              const y0px = (H - (w.y + w.h) * invScale)
              const y1px = (H - (w.y) * invScale)
              return {
                text: w.text,
                x0: W ? (x0px / W) : 0,
                y0: H ? (y0px / H) : 0,
                x1: W ? (x1px / W) : 0,
                y1: H ? (y1px / H) : 0,
                conf: w.conf,
                b: w.b, p: w.p, l: w.l, wi: w.wi,
              }
            }),
          })
          return { text, med }
        }

        let pageText = ''
        let pageConf = 0
        let usedPsm = 6
        let usedDpi = DPI_BASE

        const logHead = (phase: string, extra: Record<string, any> = {}) => {
          try { console.log('[OCR][page]', { page: pageIdx, phase, ...extra }) } catch {}
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
          if (wordsH.length > words.length || medH > med) { words = wordsH; med = medH; usedPsm = hiOut.psmUsed }
          logHead('hiDPI', { dpi: DPI_MAX, psm: usedPsm, words: words.length, medConf: med.toFixed(1) })
          const out = processWords(words, usedDpi, usedPsm, hiPng)
          pageText = out.text; pageConf = out.med
          if (!pageText || !pageText.trim()) {
            try { pageText = (await ocrTxt(hiPng, usedPsm, usedDpi)).replace(/\s+/g, ' ').trim() } catch {}
          }
        } else {
          const out = processWords(words, usedDpi, usedPsm, basePng)
          pageText = out.text; pageConf = out.med
          if (!pageText || !pageText.trim()) {
            try { pageText = (await ocrTxt(basePng, usedPsm, usedDpi)).replace(/\s+/g, ' ').trim() } catch {}
          }
        }
        // Log testo riconosciuto per pagina (tronco a 200 char)
        try {
          console.log('[OCR][pageText]', {
            page: pageIdx,
            len: (pageText || '').length,
            head: (pageText || '').slice(0, 200).replace(/\s+/g, ' '),
          })
        } catch {}
        logHead('result', { words: pageConf ? undefined : words.length, conf: pageConf.toFixed(1), textLen: (pageText||'').length, snippet: (pageText||'').slice(0, 120) })
        return { text: pageText, confidence: pageConf }
      }

      for (let i = 0; i < pngs.length; i++) {
        const pageIdx = i + 1
        const basePng = path.join(tmpDir, pngs[i])
        try {
          const out = await translateOne(pageIdx, basePng)
          resultPages.push(out)
        } catch {
          resultPages.push({ text: '', confidence: 0 })
        }
        if (onProgress) await onProgress(0.5 + ((i + 1) / Math.max(1, pngs.length)) * 0.5, { phase: 'OCR', currentPage: pageIdx, totalPages: pngs.length })
      }

      const avgConfidence = resultPages.length ? resultPages.reduce((a, b) => a + b.confidence, 0) / resultPages.length : 0
      try {
        console.log('[OCR][return]', { pages: resultPages.length, lens: resultPages.map(p => (p.text||'').length).slice(0, 3).join(','), layoutPages: layout.length, words0: (layout[0]?.words?.length || 0) })
      } catch {}
      return { pages: resultPages, avgConfidence, layout }
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
}


