import fs from 'fs/promises'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

export async function extractNativeText(pdfPath: string): Promise<string> {
  const filename = pdfPath.split(/[/\\]/).pop()
  console.log('[EXTRACT][native-text][START]', { filename, path: pdfPath })
  
  try {
    const buffer = await fs.readFile(pdfPath)
    console.log('[EXTRACT][native-text][buffer]', { filename, size: buffer.length })
    
    const uint8Array = new Uint8Array(buffer)
    
    const loadingTask = getDocument({ 
      data: uint8Array,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false
    })
    const pdfDoc = await loadingTask.promise
    console.log('[EXTRACT][native-text][loaded]', { filename, numPages: pdfDoc.numPages })
    
    let fullText = ''
    
    // Estrai testo da tutte le pagine
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()
      
      // Concatena tutti gli items di testo della pagina
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
      
      fullText += pageText + '\n'
      
      if (pageNum % 10 === 0) {
        console.log('[EXTRACT][native-text][progress]', { filename, page: pageNum, totalPages: pdfDoc.numPages })
      }
    }
    
    await pdfDoc.cleanup()
    
    const extractedLength = fullText.trim().length
    console.log('[EXTRACT][native-text][SUCCESS]', { 
      filename,
      extractedLength,
      preview: fullText.substring(0, 100)
    })
    
    return fullText.trim()
  } catch (error) {
    console.error('[EXTRACT][native-text][ERROR]', { 
      filename,
      error: (error as Error).message,
      stack: (error as Error).stack
    })
    return ''
  }
}

