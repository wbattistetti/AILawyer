import path from 'node:path'
import { execa } from 'execa'
import { rasterizePage } from '../services/ocr2/raster'
import { runTSV, parseTSV, runHOCR, parseHOCR, runTXT } from '../services/ocr2/tess'

async function main() {
  const pdf = process.argv[2]
  const page = Number(process.argv[3] || 1)
  const dpi = Number(process.env.OCR_SMOKE_DPI || 300)
  if (!pdf) {
    console.log('Usage: tsx src/scripts/ocr2-smoke.ts <pdfPath> [page]')
    process.exit(1)
  }

  console.log('[smoke] env', {
    TESSDATA_DIR: process.env.TESSDATA_DIR,
    POPPLER_PATH: process.env.POPPLER_PATH,
    OCR_LANG: process.env.OCR_LANG,
    TESSERACT_PATH: process.env.TESSERACT_PATH,
  })

  try {
    const { stdout } = await execa('tesseract', ['--version'], { shell: false })
    console.log('[smoke] tesseract --version')
    console.log(stdout.split('\n').slice(0, 2).join('\n'))
  } catch (e) {
    console.warn('[smoke] tesseract --version failed')
  }
  try {
    const { stdout } = await execa('tesseract', ['--list-langs', '--tessdata-dir', String(process.env.TESSDATA_DIR || '')], { shell: false })
    console.log('[smoke] tesseract --list-langs (first 10):')
    console.log(stdout.split('\n').slice(0, 10).join('\n'))
  } catch {}

  console.log(`[smoke] rasterize page=${page} dpi=${dpi}`)
  const r = await rasterizePage(path.resolve(pdf), page, dpi, !!process.env.OCR_RASTER_COLOR)
  console.log('[smoke] raster done', { png: r.png, w: r.width, h: r.height })

  const psm = Number(process.env.OCR_SMOKE_PSM || 6)
  console.log(`[smoke] tsv psm=${psm}`)
  const tsv = await runTSV(r.png, psm, dpi)
  const wordsTsv = parseTSV(tsv)
  console.log('[smoke] tsv words', wordsTsv.length)
  if (wordsTsv.length > 0) console.log('[smoke] tsv first', wordsTsv[0])

  console.log(`[smoke] hocr psm=${psm}`)
  const hocr = await runHOCR(r.png, psm, dpi)
  const wordsHocr = parseHOCR(hocr)
  console.log('[smoke] hocr words', wordsHocr.length)
  if (wordsHocr.length > 0) console.log('[smoke] hocr first', wordsHocr[0])

  console.log(`[smoke] txt psm=${psm}`)
  const txt = await runTXT(r.png, psm, dpi)
  console.log('[smoke] txt len', txt.length)
  console.log('[smoke] txt head', txt.slice(0, 200).replace(/\s+/g, ' '))
}

main().catch((e) => {
  console.error('[smoke] failed', e)
  process.exit(1)
})


