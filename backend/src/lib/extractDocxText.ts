/**
 * Estrae il testo semplice da un documento DOCX tramite Mammoth.
 */

import mammoth from 'mammoth'

/** Legge un file DOCX e restituisce il testo, mantenendo i separatori di paragrafo. */
export async function extractDocxText(docxPath: string): Promise<string> {
  if (typeof docxPath !== 'string' || !docxPath.trim()) {
    throw new Error('extractDocxText: percorso DOCX obbligatorio')
  }
  const result = await mammoth.extractRawText({ path: docxPath })
  return result.value.replace(/\r\n?/g, '\n').trim()
}
