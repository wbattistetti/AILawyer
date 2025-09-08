import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execa } from 'execa'
import { imageSize } from 'image-size'
import type { OcrResult } from '../types/index.js'

const POPPLER = process.env.POPPLER_PATH || ''
const TESSERACT = process.env.TESSERACT_PATH || 'tesseract'
const TESSDATA_DIR = process.env.TESSDATA_DIR || path.resolve(process.cwd(), 'tessdata')
const OCR_LANG = process.env.OCR_LANG || 'ita+eng'
const DPI_BASE = Number(process.env.OCR_DPI_BASE || 300)
const DPI_MAX = Number(process.env.OCR_DPI_MAX || 450)
const CONF_PAGE = Number(process.env.OCR_CONF_PAGE || 80)
const CONF_LOWWORD = 60
const LOW_RATIO_LIMIT = 0.15
const CONF_TEXT_THRESHOLD = Number(process.env.OCR_CONF_TEXT_THRESHOLD || 200)

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
  await execa(bin('pdftoppm'), ['-r', String(dpi), '-png', '-cropbox', pdfPath, outBase], { shell: false, windowsHide: true })
}

async function rasterizePage(pdfPath: string, page: number, outBase: string, dpi: number) {
  await execa(bin('pdftoppm'), ['-f', String(page), '-l', String(page), '-r', String(dpi), '-png', '-cropbox', pdfPath, outBase], { shell: false, windowsHide: true })
  return `${outBase}-${String(page).padStart(3, '0')}.png`
}

type Word = { text: string; conf: number; x: number; y: number; w: number; h: number }
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
    words.push({ text, conf, x: left, y: top, w: width, h: height })
  }
  return words
}

const tessEnv = { ...process.env, TESSDATA_PREFIX: TESSDATA_DIR }
const baseArgs = ['stdout', '-l', OCR_LANG, '--oem', '1', 'tsv', '-c', 'preserve_interword_spaces=1', '--tessdata-dir', TESSDATA_DIR]

async function ocrTsv(pngPath: string, psm: 4 | 6) {
  const { stdout } = await execa(TESSERACT, [pngPath, ...baseArgs, '--psm', String(psm)], {
    shell: false, windowsHide: true, env: tessEnv, maxBuffer: 1024 * 1024 * 100,
  })
  return stdout
}

export class PopplerOcrService implements IOcrPoppler {
  constructor(private getFile: (s3Key: string) => Promise<Buffer>) {}

  async extract(s3Key: string, onProgress?: (p: number, meta?: ProgressMeta)=>void): Promise<OcrResult & { layout: any[] }> {
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
      await rasterizeAll(pdfPath, outBase, DPI_BASE)
      if (onProgress) await onProgress(0.5, { phase: 'RASTER', totalPages })

      const pngs = fss.readdirSync(tmpDir).filter(f => f.startsWith('page-') && f.endsWith('.png')).sort()
      const resultPages: { text: string; confidence: number }[] = []
      const layout: any[] = []

      for (let i = 0; i < pngs.length; i++) {
        const pageIdx = i + 1
        const basePng = path.join(tmpDir, pngs[i])

        const processWords = (words: Word[], dpiUsed: number, psmUsed: number, pngForSize: string) => {
          words.sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y)
          const text = words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()
          const confs = words.map(w => w.conf)
          const med = median(confs)

          const { width: imgW, height: imgH } = imageSize(pngForSize)
          const W = imgW || 0, H = imgH || 0
          const scale = 72 / dpiUsed

          layout.push({
            page: pageIdx,
            imgW: W, imgH: H,
            dpiUsed, psmUsed,
            bboxScale: scale,
            words: words.map(w => ({
              text: w.text,
              x0: w.x * scale,
              y0: (H - (w.y + w.h)) * scale,
              x1: (w.x + w.w) * scale,
              y1: (H - w.y) * scale,
              conf: w.conf,
            })),
          })

          return { text, med }
        }

        let pageText = ''
        let pageConf = 0
        let usedPsm = 6
        let usedDpi = DPI_BASE

        try {
          // pass 1: psm6 @ base
          let tsv = await ocrTsv(basePng, 6)
          let words = parseTsv(tsv)
          let confs = words.map(w => w.conf)
          let med = median(confs)
          let lowRatio = confs.length ? confs.filter(c => c < CONF_LOWWORD).length / confs.length : 1

          // psm4 @ base se necessario
          if (med < CONF_PAGE || lowRatio > LOW_RATIO_LIMIT) {
            const tsv2 = await ocrTsv(basePng, 4)
            const words2 = parseTsv(tsv2)
            const med2 = median(words2.map(w => w.conf))
            if (med2 > med) { words = words2; med = med2; usedPsm = 4 }
          }

          // re-raster pagina @ DPI_MAX se ancora bassa
          if (med < CONF_PAGE) {
            const hiPng = await rasterizePage(pdfPath, pageIdx, path.join(tmpDir, 'page-hi'), DPI_MAX)
            usedDpi = DPI_MAX
            let tsvH = await ocrTsv(hiPng, 6)
            let wordsH = parseTsv(tsvH)
            let medH = median(wordsH.map(w => w.conf))
            if (medH < CONF_PAGE) {
              const tsvH2 = await ocrTsv(hiPng, 4)
              const wordsH2 = parseTsv(tsvH2)
              const medH2 = median(wordsH2.map(w => w.conf))
              if (medH2 > medH) { wordsH = wordsH2; medH = medH2; usedPsm = 4 }
            }
            const out = processWords(wordsH, usedDpi, usedPsm, hiPng)
            pageText = out.text; pageConf = out.med
          } else {
            const out = processWords(words, usedDpi, usedPsm, basePng)
            pageText = out.text; pageConf = out.med
          }
        } catch {
          pageText = ''
          pageConf = 0
        }

        resultPages.push({ text: pageText, confidence: pageConf })
        if (onProgress) await onProgress(0.5 + ((i + 1) / pngs.length) * 0.5, { phase: 'OCR', currentPage: pageIdx, totalPages })
      }

      const avgConfidence = resultPages.length ? resultPages.reduce((a, b) => a + b.confidence, 0) / resultPages.length : 0
      return { pages: resultPages, avgConfidence, layout }
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
}


