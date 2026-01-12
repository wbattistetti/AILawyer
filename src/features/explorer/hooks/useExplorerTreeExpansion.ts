import { useState, useEffect, useCallback } from 'react'

/**
 * Hook per gestire lo stato di espansione dell'albero delle directory.
 * Traccia quali cartelle sono aperte/espansi e permette di ripristinare lo stato.
 */
export function useExplorerTreeExpansion(
  initialExpandedPaths?: string[]
) {
  const [expandedPaths, setExpandedPaths] = useState<string[]>(initialExpandedPaths || [])

  // ✅ Ripristina path espansi iniziali quando cambiano (solo se effettivamente diversi)
  useEffect(() => {
    if (initialExpandedPaths && initialExpandedPaths.length > 0) {
      // ✅ Evita loop infiniti: aggiorna solo se i path sono effettivamente diversi
      const currentPathsStr = expandedPaths.sort().join('|')
      const newPathsStr = initialExpandedPaths.sort().join('|')
      if (currentPathsStr !== newPathsStr) {
        setExpandedPaths(initialExpandedPaths)
      }
    }
  }, [initialExpandedPaths]) // ✅ Nota: expandedPaths non è nelle dipendenze per evitare loop

  const handleExpandedPathsChange = useCallback((paths: string[]) => {
    setExpandedPaths(paths)
  }, [])

  return {
    expandedPaths,
    handleExpandedPathsChange
  }
}
