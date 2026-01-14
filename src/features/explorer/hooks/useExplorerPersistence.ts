import { useCallback, useEffect, useRef } from 'react'
import { DriveInfo } from '../types'
import { ExplorerStateService, ExplorerStateData } from '../services/ExplorerStateService'

/**
 * Hook per gestire il salvataggio automatico dello stato dell'Explorer.
 * Salva lo stato quando cambia la directory selezionata o i path espansi.
 */
export function useExplorerPersistence(
  praticaId: string | undefined,
  selectedPath: string | undefined,
  expandedPaths: string[],
  drives: DriveInfo[]
) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const saveState = useCallback(async () => {
    if (!praticaId || !selectedPath) return

    // ✅ Debounce: salva dopo 500ms di inattività per evitare troppe chiamate API
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const matchingDrive = drives.find(d => selectedPath.startsWith(d.path))
        if (!matchingDrive) {
          console.warn('[EXPLORER-PERSISTENCE] Drive non trovato per path:', selectedPath)
          return
        }

        const state: ExplorerStateData = ExplorerStateService.createState(
          selectedPath,
          matchingDrive,
          expandedPaths
        )

        const { api } = await import('../../../lib/api')
        await api.updatePratica(praticaId, {
          explorerState: ExplorerStateService.serialize(state)
        })

        // ✅ Log rimosso per ridurre spam console
      } catch (err) {
        console.warn('[EXPLORER-PERSISTENCE] Errore salvataggio stato:', err)
      }
    }, 500)
  }, [praticaId, selectedPath, expandedPaths, drives])

  // ✅ Salva automaticamente quando cambia lo stato
  useEffect(() => {
    if (selectedPath) {
      saveState()
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [selectedPath, expandedPaths, saveState])

  return { saveState }
}
