/**
 * Servizio centralizzato per interagire con il filesystem.
 * Elimina duplicazione di logica in useExplorerDragDrop, PdfViewerAdapter, etc.
 */

const API_BASE = 'http://localhost:3001/api/filesystem'

export class FileSystemService {
  /**
   * Carica un file dal filesystem e lo converte in File object
   */
  static async loadFile(filePath: string): Promise<File> {
    const response = await fetch(`${API_BASE}/read-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    })

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status}`)
    }

    const fileBlob = await response.blob()
    const fileName = filePath.split(/[/\\]/).pop() || 'unknown'

    return new File([fileBlob], fileName, {
      type: fileBlob.type || 'application/octet-stream'
    })
  }

  /**
   * Carica un file dal filesystem e crea un blob URL per visualizzazione
   */
  static async loadFileAsBlobUrl(filePath: string): Promise<{ file: File; blobUrl: string }> {
    const file = await this.loadFile(filePath)
    const blobUrl = URL.createObjectURL(file)
    return { file, blobUrl }
  }

  /**
   * Verifica se un file esiste
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/read-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      })
      return response.ok
    } catch {
      return false
    }
  }
}
