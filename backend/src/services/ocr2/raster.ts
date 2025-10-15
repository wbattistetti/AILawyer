import path from 'node:path'
import { execa } from 'execa'
import { imageSize } from 'image-size'
import fs from 'node:fs/promises'

function bin(name: string) {
  const POPPLER = process.env.POPPLER_PATH || ''
  return POPPLER ? path.join(POPPLER, name) : name
}

export async function rasterizePage(
  pdfPath: string,
  page: number,
  dpi: number,
  color = false,
): Promise<{ png: string; width: number; height: number }> {
  const outBase = path.join(path.dirname(pdfPath), `__ocr2__page`)
  const args: string[] = []
  if (!color) args.push('-gray')
  args.push(
    '-f', String(page),
    '-l', String(page),
    '-r', String(dpi),
    '-png',
    '-cropbox',
    '-aa', 'no',
    '-aaVector', 'no',
    pdfPath,
    outBase,
  )
  await execa(bin('pdftoppm'), args, { shell: false, windowsHide: true })
  const png = path.join(path.dirname(pdfPath), `__ocr2__page-${String(page).padStart(3, '0')}.png`)
  const { width = 0, height = 0 } = imageSize(png)
  await fs.access(png)
  return { png, width, height }
}


