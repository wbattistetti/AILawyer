/**
 * Servizio per generare thumbnail e processare PDF.
 * Estratto da useArchive per modularità.
 */

import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

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
   * Genera thumbnail per documenti Word (.docx)
   * Converte Word in HTML e cattura screenshot della prima pagina
   */
  static async generateWordThumbnail(file: File, targetW = 300): Promise<string> {
    let tempContainer: HTMLDivElement | null = null

    try {
      const arrayBuffer = await file.arrayBuffer()

      // ✅ Converti Word in HTML usando mammoth
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh"
          ]
        }
      )

      const html = result.value

      // ✅ Crea elemento DOM temporaneo per renderizzare HTML
      tempContainer = document.createElement('div')
      tempContainer.style.position = 'absolute'
      tempContainer.style.left = '-9999px'
      tempContainer.style.top = '0'
      tempContainer.style.width = '800px' // Larghezza standard per documento Word
      tempContainer.style.backgroundColor = '#ffffff'
      tempContainer.style.padding = '2rem'
      tempContainer.style.border = '1px solid #e5e7eb' // ✅ Bordo per distinguere la pagina
      tempContainer.className = 'word-page'

      // ✅ Crea wrapper con stile simile a WordViewerCore
      const wrapper = document.createElement('div')
      wrapper.className = 'word-viewer-content'
      wrapper.style.width = '100%'
      wrapper.style.backgroundColor = '#ffffff'
      wrapper.style.padding = '2rem'
      wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif' // ✅ Font standard
      wrapper.style.color = '#000000' // ✅ Colore testo nero
      wrapper.style.lineHeight = '1.5'
      wrapper.innerHTML = html

      tempContainer.appendChild(wrapper)
      document.body.appendChild(tempContainer)

      // ✅ Attendi che il rendering sia completo (immagini, font, ecc.)
      await new Promise(resolve => setTimeout(resolve, 200))

      // ✅ Cattura screenshot usando html2canvas
      const html2canvas = (await import('html2canvas')).default

      // ✅ Calcola altezza della prima "pagina" (circa 1000px per una pagina A4)
      const firstPageHeight = Math.min(1000, tempContainer.scrollHeight)

      const canvas = await html2canvas(tempContainer, {
        x: 0,
        y: 0,
        width: 800,
        height: firstPageHeight,
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 1.5, // ✅ Per Word, scale 1 può risultare nero, usa 1.5
        logging: false,
        allowTaint: false
      })

      // ✅ Ridimensiona canvas per thumbnail (targetW larghezza)
      const thumbnailCanvas = document.createElement('canvas')
      const scale = targetW / canvas.width
      thumbnailCanvas.width = targetW
      thumbnailCanvas.height = Math.ceil(canvas.height * scale)
      const ctx = thumbnailCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)

      return thumbnailCanvas.toDataURL('image/png', 0.9)
    } catch (error) {
      console.error('[ThumbnailGenerator] Errore generazione thumbnail Word:', error)
      return ''
    } finally {
      // ✅ Pulisci elemento temporaneo (sempre, anche in caso di errore)
      if (tempContainer && tempContainer.parentNode) {
        document.body.removeChild(tempContainer)
      }
    }
  }

  /**
   * Genera thumbnail per immagini (JPG, PNG, GIF, ecc.)
   * Ridimensiona l'immagine mantenendo le proporzioni
   */
  static async generateImageThumbnail(file: File, targetW = 300): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      const blobUrl = URL.createObjectURL(file)

      img.onload = () => {
        // ✅ Calcola dimensioni mantenendo proporzioni
        const scale = targetW / img.width
        const targetH = Math.ceil(img.height * scale)

        // ✅ Crea canvas per thumbnail
        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')!

        // ✅ Disegna immagine ridimensionata
        ctx.drawImage(img, 0, 0, targetW, targetH)

        // ✅ Pulisci blob URL
        URL.revokeObjectURL(blobUrl)

        resolve(canvas.toDataURL('image/png', 0.9))
      }

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl)
        resolve('')
      }

      img.src = blobUrl
    })
  }

  /**
   * Genera thumbnail per video (MP4, AVI, ecc.) SENZA calcolare l'hash
   * Estrae il primo fotogramma del video
   * Usato per video grandi che non devono essere caricati in memoria
   */
  static async generateVideoThumbnailOnly(file: File, targetW = 300): Promise<string> {
    return this.generateVideoThumbnail(file, targetW)
  }

  /**
   * Genera thumbnail per video (MP4, AVI, ecc.)
   * Estrae il primo fotogramma del video
   */
  static async generateVideoThumbnail(file: File, targetW = 300): Promise<string> {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      const blobUrl = URL.createObjectURL(file)

      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true

      const cleanup = () => {
        URL.revokeObjectURL(blobUrl)
        if (video.parentNode) {
          video.parentNode.removeChild(video)
        }
      }

      video.onloadedmetadata = () => {
        // ✅ Imposta il video al primo frame (0 secondi)
        video.currentTime = 0.1 // ✅ Usa 0.1 invece di 0 per evitare problemi con alcuni video
      }

      video.onseeked = () => {
        try {
          // ✅ Calcola dimensioni mantenendo proporzioni
          const scale = targetW / video.videoWidth
          const targetH = Math.ceil(video.videoHeight * scale)

          // ✅ Crea canvas per thumbnail
          const canvas = document.createElement('canvas')
          canvas.width = targetW
          canvas.height = targetH
          const ctx = canvas.getContext('2d')!

          // ✅ Disegna il frame corrente del video
          ctx.drawImage(video, 0, 0, targetW, targetH)

          cleanup()
          resolve(canvas.toDataURL('image/png', 0.9))
        } catch (error) {
          console.error('[ThumbnailGenerator] Errore estrazione frame video:', error)
          cleanup()
          resolve('')
        }
      }

      video.onerror = () => {
        console.error('[ThumbnailGenerator] Errore caricamento video per thumbnail')
        cleanup()
        resolve('')
      }

      // ✅ Aggiungi video al DOM (nascosto) per permettere il caricamento
      video.style.position = 'absolute'
      video.style.left = '-9999px'
      video.style.width = '1px'
      video.style.height = '1px'
      document.body.appendChild(video)

      video.src = blobUrl
    })
  }

  /**
   * Genera thumbnail, hash e rileva testo nativo per un file
   */
  static async generate(file: File): Promise<ThumbnailResult> {
    // Calcola hash
    const hash = await this.calculateHash(file)

    // ✅ Verifica tipo file
    const isPdf = file.type?.startsWith('application/pdf') ||
                  file.name.toLowerCase().endsWith('.pdf')

    const isWord = file.type?.includes('wordprocessingml') ||
                   file.type?.includes('msword') ||
                   file.name.toLowerCase().endsWith('.docx') ||
                   file.name.toLowerCase().endsWith('.doc')

    const isImage = file.type?.startsWith('image/') ||
                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)

    const isVideo = file.type?.startsWith('video/') ||
                    /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file.name)

    if (isPdf) {
      const [thumbnail, hasNativeText] = await Promise.all([
        this.generatePdfThumbnail(file),
        this.detectNativeText(file)
      ])
      return { thumbnail: thumbnail || undefined, hash, hasNativeText }
    }

    // ✅ Genera thumbnail per Word
    if (isWord) {
      const thumbnail = await this.generateWordThumbnail(file)
      return { thumbnail: thumbnail || undefined, hash, hasNativeText: true } // Word ha sempre testo nativo
    }

    // ✅ Genera thumbnail per immagini
    if (isImage) {
      const thumbnail = await this.generateImageThumbnail(file)
      return { thumbnail: thumbnail || undefined, hash, hasNativeText: false }
    }

    // ✅ Genera thumbnail per video (primo fotogramma)
    if (isVideo) {
      const thumbnail = await this.generateVideoThumbnail(file)
      return { thumbnail: thumbnail || undefined, hash, hasNativeText: false }
    }

    return { hash }
  }
}
