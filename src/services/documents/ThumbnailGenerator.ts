/**
 * Servizio per generare thumbnail e processare PDF.
 * Estratto da useArchive per modularità.
 */

import * as pdfjsLib from 'pdfjs-dist'

export interface ThumbnailResult {
  thumbnail?: string
  hash: string
  hasNativeText?: boolean
}

export class ThumbnailGenerator {
  /**
   * Calcola hash SHA-256 del file
   */
  static async calculateHash(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  }

  /**
   * Genera thumbnail PDF client-side
   */
  static async generatePdfThumbnail(file: File, targetW = 300): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const task = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await task.promise
      const page = await pdf.getPage(1)
      const vp1 = page.getViewport({ scale: 1 })
      const scale = targetW / vp1.width
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx as any, viewport }).promise
      return canvas.toDataURL('image/png')
    } catch {
      return ''
    }
  }

  /**
   * Rileva se un PDF ha testo nativo (non OCR)
   */
  static async detectNativeText(file: File): Promise<boolean> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const task = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await task.promise
      const page = await pdf.getPage(1)
      const textContent = await page.getTextContent()
      const textItemCount = textContent.items.length
      return textItemCount > 10
    } catch {
      return false
    }
  }

  /**
   * Genera thumbnail, hash e rileva testo nativo per un file
   */
  static async generate(file: File): Promise<ThumbnailResult> {
    // Calcola hash
    const hash = await this.calculateHash(file)

    // Se PDF, genera thumbnail e rileva testo nativo
    const isPdf = file.type?.startsWith('application/pdf') ||
                  file.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      const [thumbnail, hasNativeText] = await Promise.all([
        this.generatePdfThumbnail(file),
        this.detectNativeText(file)
      ])
      return { thumbnail: thumbnail || undefined, hash, hasNativeText }
    }

    return { hash }
  }
}
