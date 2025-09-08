import fs from 'fs'
import path from 'path'
import os from 'os'
import { execa } from 'execa'
import crypto from 'crypto'
import { config } from '../config/index.js'

export function getThumbPath(hash: string, ext = 'png') {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('invalid hash')
  if (!fs.existsSync(config.THUMBS_DIR)) fs.mkdirSync(config.THUMBS_DIR, { recursive: true })
  return path.join(config.THUMBS_DIR, `${hash}.${ext}`)
}

function resolvePdftoppm(): string {
  const binName = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
  let p = config.POPPLER_PATH || ''
  const looksExe = /pdftoppm(\.exe)?$/i.test(p)
  p = p ? (looksExe ? p : path.join(p, binName)) : binName
  return p
}

export async function buildPdfThumbFromFile(srcPath: string, outPng: string) {
  const pdftoppm = resolvePdftoppm()
  const prefix = outPng.slice(0, -4)
  const envPath = process.env.PATH || ''
  const binDir = path.isAbsolute(pdftoppm) ? path.dirname(pdftoppm) : ''
  const injectedPath = [binDir, config.POPPLER_PATH, envPath].filter(Boolean).join(process.platform === 'win32' ? ';' : ':')

  await execa(pdftoppm, ['-singlefile', '-f', '1', '-l', '1', '-png', '-scale-to', '1000', srcPath, prefix], {
    shell: false,
    windowsHide: true,
    env: { ...process.env, PATH: injectedPath },
  })
}

export async function buildPdfThumbFromBuffer(buf: Buffer, outPng: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-'))
  try {
    const pdfPath = path.join(tmpDir, 'in.pdf')
    fs.writeFileSync(pdfPath, buf)
    await buildPdfThumbFromFile(pdfPath, outPng)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}


