/**
 * Store separato per mantenere File objects fuori dallo store Zustand.
 * I File objects non sono serializzabili, quindi non possono essere salvati nello store Zustand.
 * Questo store mantiene i riferimenti ai File objects in memoria per permettere il salvataggio lazy.
 */

// ✅ Map: docId -> File object
const fileReferenceStore = new Map<string, File>()

/**
 * Salva un File object per un documento
 */
export function setFileReference(docId: string, file: File): void {
  fileReferenceStore.set(docId, file)
  console.log('[FILE-REF-STORE] File reference salvato:', { docId: docId.substring(0, 16) + '...', filename: file.name, size: file.size })
}

/**
 * Recupera un File object per un documento
 */
export function getFileReference(docId: string): File | undefined {
  return fileReferenceStore.get(docId)
}

/**
 * Rimuove un File object per un documento
 */
export function removeFileReference(docId: string): void {
  const file = fileReferenceStore.get(docId)
  if (file) {
    fileReferenceStore.delete(docId)
    console.log('[FILE-REF-STORE] File reference rimosso:', { docId: docId.substring(0, 16) + '...', filename: file.name })
  }
}

/**
 * Rimuove tutti i File objects (cleanup)
 */
export function clearFileReferences(): void {
  const count = fileReferenceStore.size
  fileReferenceStore.clear()
  console.log('[FILE-REF-STORE] Tutti i file references rimossi:', { count })
}

/**
 * Verifica se esiste un File object per un documento
 */
export function hasFileReference(docId: string): boolean {
  return fileReferenceStore.has(docId)
}

/**
 * Ottiene tutti i docId che hanno un File reference
 */
export function getAllFileReferenceIds(): string[] {
  return Array.from(fileReferenceStore.keys())
}
