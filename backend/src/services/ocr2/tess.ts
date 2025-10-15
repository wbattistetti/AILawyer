import path from 'node:path'
import fs from 'node:fs/promises'
import fss from 'node:fs'
import { execa } from 'execa'
import type { Token } from './types'

const TESSERACT = (() => {
  const envSet = process.env.TESSERACT_PATH
  if (envSet && envSet.trim()) return envSet
  const win = 'C\\\x3a\\ Program Files\\\\Tesseract-OCR\\\\tesseract.exe'
  return process.platform === 'win32' ? win : 'tesseract'
})()

const OCR_LANG = process.env.OCR_LANG || 'ita'

const CANDIDATE_TESSDATA = [
  process.env.TESSDATA_DIR,
  'C:\\Program Files\\Tesseract-OCR\\tessdata',
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

async function waitFor(p: string, tries = 40, ms = 25) {
  for (let i = 0; i < tries; i++) { try { await fs.access(p); return true } catch { await new Promise(r => setTimeout(r, ms)) } }
  return false
}

const baseArgs = ['-l', OCR_LANG, '--oem', '1', '-c', 'preserve_interword_spaces=1', '--tessdata-dir', TESSDATA_DIR]

export async function runTSV(png: string, psm: number, dpi: number) {
  const outBase = path.join(path.dirname(png), `ocr2-${path.basename(png, '.png')}-${psm}-${dpi}-${Date.now()}`)
  try {
    const { stderr } = await execa(
      TESSERACT,
      [png, outBase, ...baseArgs, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, '-c', 'tessedit_create_tsv=1'],
      { shell: false, windowsHide: true, maxBuffer: 1024 * 1024 * 100 },
    )
    if (stderr && stderr.trim()) console.warn('[ocr2][tsv][stderr]', stderr.slice(0, 400))
  } catch (e: any) {
    console.warn('[ocr2][tsv][error]', String(e?.stderr || e?.message || e).slice(0, 400))
  }
  const tsv = `${outBase}.tsv`
  if (!(await waitFor(tsv))) return ''
  return fs.readFile(tsv, 'utf-8')
}

export async function runHOCR(png: string, psm: number, dpi: number) {
  const outBase = path.join(path.dirname(png), `ocr2-${path.basename(png, '.png')}-${psm}-${dpi}-${Date.now()}`)
  try {
    const { stderr } = await execa(
      TESSERACT,
      [png, outBase, ...baseArgs, '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`, '-c', 'tessedit_create_hocr=1'],
      { shell: false, windowsHide: true, maxBuffer: 1024 * 1024 * 100 },
    )
    if (stderr && stderr.trim()) console.warn('[ocr2][hocr][stderr]', stderr.slice(0, 400))
  } catch (e: any) {
    console.warn('[ocr2][hocr][error]', String(e?.stderr || e?.message || e).slice(0, 400))
  }
  const hocr = `${outBase}.hocr`
  if (!(await waitFor(hocr))) return ''
  return fs.readFile(hocr, 'utf-8')
}

export async function runTXT(png: string, psm: number, dpi: number) {
  const { stdout } = await execa(
    TESSERACT,
    [png, 'stdout', ...baseArgs, 'txt', '--psm', String(psm), '-c', `user_defined_dpi=${dpi}`],
    { shell: false, windowsHide: true, maxBuffer: 1024 * 1024 * 100 },
  )
  return stdout
}

export function parseTSV(tsv: string): Token[] {
  if (!tsv) return []
  const lines = tsv.split('\n')
  const hdr = lines[0]?.split('\t') || []
  const ix = (k: string) => hdr.indexOf(k)
  const res: Token[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const level = Number(cols[ix('level')] || 0)
    if (level !== 5) continue
    const text = cols[ix('text')] || ''
    const conf = Number(cols[ix('conf')] || -1)
    if (!text || conf < 0) continue
    const x = Number(cols[ix('left')] || 0)
    const y = Number(cols[ix('top')] || 0)
    const w = Number(cols[ix('width')] || 0)
    const h = Number(cols[ix('height')] || 0)
    res.push({ text, conf, x, y, w, h })
  }
  return res
}

export function parseHOCR(hocr: string): Token[] {
  if (!hocr) return []
  const rx1 = /class=['"]ocrx_word['"][^>]*title=['"][^"']*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+);[^"']*x_wconf\s+(\d+)[^"']*['"][^>]*>(.*?)<\/span>/gsi
  const rx2 = /class=['"]ocrx_word['"][^>]*title=['"][^"']*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^"']*['"][^>]*>(.*?)<\/span>/gsi
  const out: Token[] = []
  let m: RegExpExecArray | null
  while ((m = rx1.exec(hocr))) {
    const [, x0, y0, x1, y1, conf, raw] = m
    const text = String(raw).replace(/<[^>]+>/g, '').trim()
    if (text) out.push({ text, conf: Number(conf), x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
  }
  if (out.length === 0) {
    while ((m = rx2.exec(hocr))) {
      const [, x0, y0, x1, y1, raw] = m as unknown as [any, string, string, string, string, string]
      const text = String(raw).replace(/<[^>]+>/g, '').trim()
      if (text) out.push({ text, conf: 60, x: +x0, y: +y0, w: (+x1 - +x0), h: (+y1 - +y0) })
    }
  }
  return out
}


