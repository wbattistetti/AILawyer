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
   * Crea una miniatura placeholder con testo personalizzato
   * Utile per mostrare immediatamente una miniatura mentre quella reale viene generata
   */
  static createPlaceholderThumbnail(text: string = "Sto creando la miniatura..."): string {
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 400
    const ctx = canvas.getContext('2d')

    if (!ctx) return ''

    // Sfondo grigio chiaro
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Testo centrato
    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Testo su più righe se necessario
    const lines = text.split('\n')
    const lineHeight = 24
    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2

    lines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, startY + index * lineHeight)
    })

    return canvas.toDataURL('image/png')
  }

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
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-1] Lettura file in arrayBuffer', { filename: file.name })
      const arrayBuffer = await file.arrayBuffer()
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-2] ArrayBuffer letto', {
        filename: file.name,
        arrayBufferSize: arrayBuffer.byteLength
      })

      // ✅ Converti Word in HTML usando mammoth
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-3] Conversione Word in HTML con mammoth', { filename: file.name })
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
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-4] Conversione mammoth completata', {
        filename: file.name,
        htmlLength: result.value.length
      })

      const html = result.value

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-5] Creazione elemento DOM temporaneo', { filename: file.name })
      // ✅ Crea elemento DOM temporaneo per renderizzare HTML
      tempContainer = document.createElement('div')
      tempContainer.style.position = 'absolute'
      tempContainer.style.left = '-9999px'
      tempContainer.style.top = '0'
      tempContainer.style.width = '800px' // Larghezza standard per documento Word
      // ✅ Usa CSS variable del tema invece di #ffffff hardcoded
      const bgValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      const bgColor = bgValue ? `hsl(${bgValue})` : '#ffffff' // Fallback a bianco se non disponibile
      tempContainer.style.backgroundColor = bgColor
      tempContainer.style.padding = '2rem'
      tempContainer.style.border = '1px solid #e5e7eb' // ✅ Bordo per distinguere la pagina
      tempContainer.className = 'word-page'

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-6] Creazione wrapper e inserimento HTML', { filename: file.name })
      // ✅ Crea wrapper con stile simile a WordViewerCore
      const wrapper = document.createElement('div')
      wrapper.className = 'word-viewer-content'
      wrapper.style.width = '100%'
      wrapper.style.backgroundColor = bgColor // ✅ Usa stesso colore del container
      wrapper.style.padding = '2rem'
      wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif' // ✅ Font standard
      // ✅ Usa CSS variable del tema per il colore testo
      const fgValue = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
      const fgColor = fgValue ? `hsl(${fgValue})` : '#000000' // Fallback a nero se non disponibile
      wrapper.style.color = fgColor
      wrapper.style.lineHeight = '1.5'
      wrapper.innerHTML = html

      tempContainer.appendChild(wrapper)
      document.body.appendChild(tempContainer)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-7] Elemento DOM aggiunto al body', {
        filename: file.name,
        scrollHeight: tempContainer.scrollHeight
      })

      // ✅ Attendi che il rendering sia completo usando requestAnimationFrame (più efficiente del timeout)
      // Aspetta 2 frame per assicurarsi che layout e font siano pronti
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-8] Attesa rendering DOM', { filename: file.name })
      await new Promise(resolve => requestAnimationFrame(() => {
        requestAnimationFrame(resolve)
      }))
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-9] Rendering DOM completato', {
        filename: file.name,
        scrollHeight: tempContainer.scrollHeight
      })

      // ✅ Cattura screenshot usando html2canvas
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-10] Import html2canvas', { filename: file.name })
      const html2canvas = (await import('html2canvas')).default
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-11] html2canvas importato, inizio cattura', { filename: file.name })

      // ✅ Cattura i primi 1000px (ripristinato come richiesto)
      const captureHeight = Math.min(1000, tempContainer.scrollHeight)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-12] Calcolo altezza cattura', {
        filename: file.name,
        captureHeight,
        scrollHeight: tempContainer.scrollHeight
      })

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13] Chiamata html2canvas', {
        filename: file.name,
        containerWidth: tempContainer.offsetWidth,
        containerHeight: tempContainer.offsetHeight,
        scrollHeight: tempContainer.scrollHeight,
        captureHeight
      })

      // ✅ Aggiungi timeout per html2canvas (30 secondi)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.1] Creazione promise html2canvas', { filename: file.name })
      const html2canvasPromise = html2canvas(tempContainer, {
        x: 0,
        y: 0,
        width: 800,
        height: captureHeight,
        windowWidth: 800,
        windowHeight: captureHeight, // ✅ Limita la finestra di rendering
        useCORS: true,
        backgroundColor: bgColor, // ✅ Usa colore del tema invece di #ffffff hardcoded
        scale: 1.0, // ✅ Ridotto da 1.5 a 1.0 (sufficiente per thumbnail, molto più veloce)
        logging: false,
        allowTaint: false,
        // ✅ Opzioni per evitare blocchi
        imageTimeout: 5000, // Timeout per caricamento immagini (5 secondi)
        removeContainer: false, // Non rimuovere il container (lo facciamo noi)
        onclone: (clonedDoc) => {
          console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.2] html2canvas onclone chiamato', { filename: file.name })
          // ✅ Rimuovi immagini esterne che potrebbero bloccare
          const images = clonedDoc.querySelectorAll('img')
          console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.3] Immagini trovate nel clone', {
            filename: file.name,
            imageCount: images.length
          })
          images.forEach(img => {
            if (img.src && !img.src.startsWith('data:')) {
              console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.4] Rimozione immagine esterna', {
                filename: file.name,
                imgSrc: img.src.substring(0, 50)
              })
              img.remove()
            }
          })
        }
      })

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.5] Creazione timeout promise', { filename: file.name })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          console.error('🔧 [THUMBNAIL-GEN][WORD][STEP-13.6] TIMEOUT html2canvas (30s)', { filename: file.name })
          reject(new Error('html2canvas timeout (30s)'))
        }, 30000)
      )

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-13.7] Attesa Promise.race html2canvas', { filename: file.name })
      const canvas = await Promise.race([html2canvasPromise, timeoutPromise])
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-14] html2canvas completato', {
        filename: file.name,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasType: canvas.constructor.name
      })

      // ✅ Ridimensiona canvas per thumbnail (targetW larghezza)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-15] Ridimensionamento canvas', {
        filename: file.name,
        targetW,
        sourceWidth: canvas.width,
        sourceHeight: canvas.height
      })
      const thumbnailCanvas = document.createElement('canvas')
      const scale = targetW / canvas.width
      thumbnailCanvas.width = targetW
      thumbnailCanvas.height = Math.ceil(canvas.height * scale)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-15.1] Canvas thumbnail creato', {
        filename: file.name,
        thumbnailWidth: thumbnailCanvas.width,
        thumbnailHeight: thumbnailCanvas.height,
        scale
      })

      const ctx = thumbnailCanvas.getContext('2d')
      if (!ctx) {
        console.error('🔧 [THUMBNAIL-GEN][WORD][STEP-15.2] ERRORE: Impossibile ottenere context 2d', { filename: file.name })
        throw new Error('Impossibile ottenere context 2d')
      }
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-15.3] Disegno immagine sul canvas thumbnail', { filename: file.name })
      ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-16] Canvas ridimensionato', {
        filename: file.name,
        thumbnailWidth: thumbnailCanvas.width,
        thumbnailHeight: thumbnailCanvas.height
      })

      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-17] Conversione canvas in DataURL', { filename: file.name })
      const dataUrl = thumbnailCanvas.toDataURL('image/png', 0.9)
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-18] DataURL generato', {
        filename: file.name,
        dataUrlLength: dataUrl.length,
        dataUrlPreview: dataUrl.substring(0, 50) + '...'
      })
      console.log('🔧 [THUMBNAIL-GEN][WORD][STEP-19] ✅ Miniatura Word generata con successo', { filename: file.name })
      return dataUrl
    } catch (error) {
      console.error('🔧 [THUMBNAIL-GEN][WORD][ERROR] Errore generazione thumbnail Word', {
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : typeof error
      })
      return ''
    } finally {
      // ✅ Pulisci elemento temporaneo (sempre, anche in caso di errore)
      console.log('🔧 [THUMBNAIL-GEN][WORD][FINALLY] Pulizia elemento temporaneo', {
        filename: file.name,
        hasContainer: !!tempContainer,
        hasParent: !!(tempContainer && tempContainer.parentNode)
      })
      if (tempContainer && tempContainer.parentNode) {
        document.body.removeChild(tempContainer)
        console.log('🔧 [THUMBNAIL-GEN][WORD][FINALLY] Elemento rimosso dal DOM', { filename: file.name })
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
    console.log('🔧 [THUMBNAIL-GEN][GENERATE][START] Inizio generazione miniatura', {
      filename: file.name,
      size: file.size,
      type: file.type
    })

    try {
      // Calcola hash
      console.log('🔧 [THUMBNAIL-GEN][GENERATE][HASH-START] Calcolo hash', { filename: file.name })
      const hash = await this.calculateHash(file)
      console.log('🔧 [THUMBNAIL-GEN][GENERATE][HASH-SUCCESS] Hash calcolato', {
        filename: file.name,
        hashPreview: hash.substring(0, 16) + '...'
      })

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
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][PDF] Tipo PDF rilevato', { filename: file.name })
        const [thumbnail, hasNativeText] = await Promise.all([
          this.generatePdfThumbnail(file),
          this.detectNativeText(file)
        ])
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][PDF][SUCCESS] Miniatura PDF generata', {
          filename: file.name,
          hasThumbnail: !!thumbnail,
          thumbnailLength: thumbnail?.length || 0,
          hasNativeText
        })
        return { thumbnail: thumbnail || undefined, hash, hasNativeText }
      }

      // ✅ Genera thumbnail per Word
      if (isWord) {
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][WORD] Tipo Word rilevato', { filename: file.name })
        const thumbnail = await this.generateWordThumbnail(file)
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][WORD][SUCCESS] Miniatura Word generata', {
          filename: file.name,
          hasThumbnail: !!thumbnail,
          thumbnailLength: thumbnail?.length || 0
        })
        return { thumbnail: thumbnail || undefined, hash, hasNativeText: true } // Word ha sempre testo nativo
      }

      // ✅ Genera thumbnail per immagini
      if (isImage) {
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][IMAGE] Tipo immagine rilevato', { filename: file.name })
        const thumbnail = await this.generateImageThumbnail(file)
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][IMAGE][SUCCESS] Miniatura immagine generata', {
          filename: file.name,
          hasThumbnail: !!thumbnail,
          thumbnailLength: thumbnail?.length || 0
        })
        return { thumbnail: thumbnail || undefined, hash, hasNativeText: false }
      }

      // ✅ Genera thumbnail per video (primo fotogramma)
      if (isVideo) {
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][VIDEO] Tipo video rilevato', { filename: file.name })
        const thumbnail = await this.generateVideoThumbnail(file)
        console.log('🔧 [THUMBNAIL-GEN][GENERATE][VIDEO][SUCCESS] Miniatura video generata', {
          filename: file.name,
          hasThumbnail: !!thumbnail,
          thumbnailLength: thumbnail?.length || 0
        })
        return { thumbnail: thumbnail || undefined, hash, hasNativeText: false }
      }

      console.log('🔧 [THUMBNAIL-GEN][GENERATE][SKIP] Tipo file non supportato', { filename: file.name })
      return { hash }
    } catch (error) {
      console.error('🔧 [THUMBNAIL-GEN][GENERATE][ERROR] Errore durante generazione miniatura', {
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw error // Rilancia l'errore per essere gestito dal chiamante
    }
  }
}
