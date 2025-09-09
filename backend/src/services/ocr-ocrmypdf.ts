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
      const args = [
        '--skip-text',
        '--rotate-pages', '--deskew',
        '--optimize', '3',
        '--language', config.OCR_LANG,
        '--sidecar', sidecar,
        inputPdf, outPdf
      ]

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
        const m = line.match(re)
        if (m) {
          cur = parseInt(m[1], 10)
          total = parseInt(m[2], 10)
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
      return { pages, avgConfidence: 0, layout: [] }
    } catch (e: any) {
      const msg = [e?.shortMessage, e?.stderr, e?.message].filter(Boolean).join(' | ')
      throw new Error(`ocrmypdf failed: ${msg}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
}
