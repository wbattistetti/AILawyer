import fs from 'fs'
import os from 'os'
import path from 'path'
import { execa } from 'execa'
import { config } from '../config/index.js'
import { OcrResult } from '../types/index.js'

export class OcrmypdfService {
  constructor(private getBuffer: (s3Key: string) => Promise<Buffer>) {}

  async extract(
    s3Key: string,
    onProgress?: (p01: number, meta?: { currentPage?: number; totalPages?: number }) => void | Promise<void>
  ): Promise<OcrResult & { layout: any[] }> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocrmypdf-'))
    const inputPdf = path.join(tmp, 'in.pdf')
    const outPdf = path.join(tmp, 'out.pdf')
    const sidecar = path.join(tmp, 'out.txt')

    try {
      const buf = await this.getBuffer(s3Key)
      fs.writeFileSync(inputPdf, buf)

      const bin = config.OCRMYPDF_PATH || 'ocrmypdf'
      const jobs = config.OCR_JOBS && config.OCR_JOBS > 0 ? String(config.OCR_JOBS) : String(Math.max(1, Math.min(8, (os.cpus()?.length || 2) - 1)))

      // Build args depending on quick vs full mode
      const quick = !!config.OCR_QUICK_MODE
      const args: string[] = []
      args.push('--jobs', jobs)
      args.push('--skip-text')
      args.push('--rotate-pages')
      if (!quick) args.push('--deskew')
      // Optimize: 0 for quick, 3 for full
      args.push('--optimize', quick ? '0' : '3')
      // Disable cleaning filters in quick mode
      if (quick) {
        args.push('--clean', '0', '--clean-final', '0')
        // Lower DPI to reduce raster cost
        const dpi = Math.max(150, Math.min(300, config.OCR_QUICK_DPI))
        args.push('--image-dpi', String(dpi), '--image-dpi-max', String(dpi + 20))
        // Speed up tesseract
        args.push('--tesseract-oem', '1', '--tesseract-psm', '6')
      }
      // Language: quick mode prefers OCR_QUICK_LANG if set
      args.push('--language', quick ? (config as any).OCR_QUICK_LANG || config.OCR_LANG : config.OCR_LANG)
      args.push('--sidecar', sidecar)
      args.push(inputPdf, outPdf)

      // Docker wrapper: if OCRMYPDF_PATH === 'docker', run image with network none and mount tmp dir
      const useDocker = bin.toLowerCase() === 'docker'
      const cmd = useDocker ? 'docker' : bin
      const cmdArgs = useDocker
        ? ['run', '--rm', '--network', 'none', '-v', `${tmp}:/work`, '-w', '/work', 'ocrmypdf-local:latest', 'ocrmypdf',
           ...args.map(a => a.replace(tmp, '/work'))]
        : args

      const child = execa(cmd, cmdArgs, {
        timeout: config.OCR_TIMEOUT_SEC * 1000,
        windowsHide: true,
        stderr: 'pipe',
        stdout: 'ignore',
        env: process.env,
      })

      let total = 0, cur = 0
      const re = /Processing page\s+(\d+) of (\d+)/i

      child.stderr?.on('data', (d: Buffer) => {
        const line = d.toString()
        const m = line.match(re) as RegExpMatchArray | null
        if (m && m[1] && m[2]) {
          cur = parseInt(m[1] as string, 10)
          total = parseInt(m[2] as string, 10)
          if (onProgress && total > 0) onProgress(Math.min(1, cur / total), { currentPage: cur, totalPages: total })
        }
        if (process.env.LOG_OCR === '1') console.log('[ocrmypdf]', line.trim())
      })

      const { exitCode, stderr } = await child
      if (exitCode !== 0) {
        throw new Error(stderr || `ocrmypdf exited with code ${exitCode}`)
      }

      if (onProgress && total > 0) await onProgress(1, { currentPage: total, totalPages: total })

      const text = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8') : ''
      const pages = [{ text, confidence: 0 }]
      // Persist OCRed PDF alongside original: save to uploads with suffix .ocr.pdf
      const ocrPdfBuffer = fs.readFileSync(outPdf)
      const ocrPdfKey = s3Key.endsWith('.pdf') ? s3Key.replace(/\.pdf$/i, '.ocr.pdf') : s3Key + '.ocr.pdf'
      // Save to local uploads dir for local mode consumers
      const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
      try { fs.mkdirSync(path.dirname(path.join(uploadsDir, ocrPdfKey)), { recursive: true }) } catch {}
      fs.writeFileSync(path.join(uploadsDir, ocrPdfKey), ocrPdfBuffer)
      ;(pages as any).ocrPdfKey = ocrPdfKey
      return { pages, avgConfidence: 0, layout: [] }
    } catch (e: any) {
      const msg = [e?.shortMessage, e?.stderr, e?.message].filter(Boolean).join(' | ')
      throw new Error(`ocrmypdf failed: ${msg}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
}
