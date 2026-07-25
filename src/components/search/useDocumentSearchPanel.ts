/**
 * Stato UI condiviso del pannello di ricerca documentale.
 */

import { useRef, useState } from 'react'

export interface DocumentSearchPanelState {
  panelW: number
  setPanelW: React.Dispatch<React.SetStateAction<number>>
  searchQ: string
  setSearchQ: React.Dispatch<React.SetStateAction<string>>
  showAdvanced: boolean
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>
  resizingRef: React.MutableRefObject<boolean>
}

/**
 * Mantiene query, visibilità e larghezza del pannello di ricerca.
 */
export function useDocumentSearchPanel(): DocumentSearchPanelState {
  const [panelW, setPanelW] = useState(320)
  const [searchQ, setSearchQ] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const resizingRef = useRef(false)

  return {
    panelW,
    setPanelW,
    searchQ,
    setSearchQ,
    showAdvanced,
    setShowAdvanced,
    resizingRef
  }
}
