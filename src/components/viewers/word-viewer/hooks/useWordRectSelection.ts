/**
 * ✅ Hook per drag rettangolo in Word viewer
 * Wrapper semplificato di useRectSelection
 */

import { useRectSelection, type DraftBox } from '../../common/hooks/useRectSelection'

export interface UseWordRectSelectionProps {
  /**
   * ID univoco del viewer (es. docId) - necessario per isolamento
   */
  viewerId: string
  /**
   * Se il viewer è abilitato
   */
  enabled: boolean
  /**
   * Se il viewer è attualmente attivo (visibile/focus)
   */
  isActive: boolean
  hostRef: React.RefObject<HTMLDivElement>
  onSelection: (selection: any) => void
  onDraftChange?: (draft: DraftBox | null) => void
  /**
   * ✅ Ref alle pagine per calcolare coordinate rispetto alla pagina (come PDF viewer)
   */
  pageElsRef?: React.MutableRefObject<Map<number, HTMLElement>>
}

export function useWordRectSelection({
  viewerId,
  enabled,
  isActive,
  hostRef,
  onSelection,
  onDraftChange,
  pageElsRef // ✅ AGGIUNTO
}: UseWordRectSelectionProps) {
  // ✅ Usa hook comune con pageElsRef e isolamento
  return useRectSelection({
    viewerId,
    enabled,
    isActive,
    hostRef: hostRef as React.RefObject<HTMLElement>,
    onSelection,
    onDraftChange,
    pageElsRef // ✅ PASSATO
  })
}
