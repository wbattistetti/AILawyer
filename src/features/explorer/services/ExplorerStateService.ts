/**
 * Servizio per gestire la serializzazione e deserializzazione dello stato dell'Explorer.
 * Centralizza la logica di persistenza per renderla più mantenibile e testabile.
 */

export interface ExplorerStateData {
  selectedPath?: string
  driveLetter?: string
  driveLabel?: string
  driveType?: 'fixed' | 'removable' | 'optical'
  serialNumber?: string
  expandedPaths?: string[] // ✅ Path delle cartelle espansi nell'albero
}

export class ExplorerStateService {
  /**
   * Serializza lo stato dell'Explorer per il salvataggio nel database
   */
  static serialize(state: ExplorerStateData): string {
    return JSON.stringify(state)
  }

  /**
   * Deserializza lo stato salvato dal database
   * Gestisce sia il nuovo formato (JSON) che il vecchio formato (solo path string)
   */
  static deserialize(stateString: string | undefined): ExplorerStateData | null {
    if (!stateString) return null

    try {
      // Se è già un oggetto JSON
      if (stateString.startsWith('{')) {
        return JSON.parse(stateString) as ExplorerStateData
      }
      // Fallback: vecchio formato (solo path string)
      return { selectedPath: stateString }
    } catch (e) {
      console.warn('[EXPLORER-STATE] Errore parsing stato:', e)
      return null
    }
  }

  /**
   * Crea stato da path e drive info
   */
  static createState(
    selectedPath: string,
    drive: { id: string; label: string; type: 'fixed' | 'removable' | 'optical'; serialNumber?: string },
    expandedPaths: string[] = []
  ): ExplorerStateData {
    return {
      selectedPath,
      driveLetter: drive.id,
      driveLabel: drive.label,
      driveType: drive.type,
      serialNumber: drive.serialNumber,
      expandedPaths
    }
  }

  /**
   * Valida che lo stato sia completo e valido
   */
  static validate(state: ExplorerStateData | null): boolean {
    if (!state) return false
    return !!state.selectedPath
  }
}
