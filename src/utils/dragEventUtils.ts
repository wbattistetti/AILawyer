/**
 * Utility semplici per distinguere i tipi di drag-and-drop.
 * Non gestisce nulla, solo verifica il tipo.
 *
 * Separazione chiara:
 * - Dockview: gestisce internamente i drag dei suoi pannelli
 * - Explorer/File/Documenti: gestiti da DragAndDropService
 */

/**
 * Verifica se è un drag di pannello Dockview.
 * Dockview gestisce internamente i suoi drag, non dobbiamo interferire.
 */
export function isDockviewDrag(e: DragEvent | React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types || [])
  const hasExplorerFile = types.includes('application/x-explorer-file')
  const hasDocId = types.includes('application/x-doc-id')

  // ✅ PROBLEMA: Durante drop, dataTransfer.types può essere vuoto
  // ✅ SOLUZIONE: Prova anche a leggere direttamente i dati
  let hasExplorerFileData = false
  let hasDocIdData = false

  try {
    const explorerData = e.dataTransfer?.getData('application/x-explorer-file')
    hasExplorerFileData = !!explorerData
  } catch {}

  try {
    const docIdData = e.dataTransfer?.getData('application/x-doc-id')
    hasDocIdData = !!docIdData
  } catch {}

  // ✅ PRIORITÀ 1: Controlla anche la cache globale (per gestire casi in cui getData non funziona)
  let hasCustomDragInCache = false
  try {
    const cache = (window as any).__dragDataCache as Map<number, { type: string; data: string; timestamp: number }> | undefined
    if (cache && cache.size > 0) {
      // Trova l'entry più recente
      let mostRecent: { type: string; timestamp: number } | null = null
      cache.forEach((value) => {
        if (!mostRecent || value.timestamp > mostRecent.timestamp) {
          mostRecent = { type: value.type, timestamp: value.timestamp }
        }
      })
      // Se l'entry più recente è di tipo custom e è stata creata negli ultimi 5 secondi
      if (mostRecent && Date.now() - mostRecent.timestamp < 5000) {
        hasCustomDragInCache = mostRecent.type === 'application/x-explorer-file' || mostRecent.type === 'application/x-doc-id'
      }
    }
  } catch {}

  console.log('[DRAG-UTILS][isDockviewDrag] Verifica tipo drag:', {
    types,
    hasExplorerFile,
    hasDocId,
    hasExplorerFileData,
    hasDocIdData,
    hasCustomDragInCache,
    target: (e.target as HTMLElement)?.tagName,
    targetClasses: (e.target as HTMLElement)?.className
  })

  // ✅ PRIORITÀ ASSOLUTA: Se ha marker custom (Explorer file o Doc ID), NON è Dockview
  // Verifica sia types che dati diretti che cache (per gestire tutti i casi)
  if (hasExplorerFile || hasDocId || hasExplorerFileData || hasDocIdData || hasCustomDragInCache) {
    console.log('[DRAG-UTILS][isDockviewDrag] ❌ NON è Dockview - ha marker custom')
    return false // Non è un drag Dockview, è un drag nostro
  }

  const target = e.target as HTMLElement
  if (!target) {
    console.log('[DRAG-UTILS][isDockviewDrag] ❌ Target null')
    return false
  }

  // ✅ Verifica SOLO elementi Dockview specifici (tab container, ecc.)
  // ✅ IMPORTANTE: Non considerare elementi dentro la drawer tab strip come Dockview
  const isDrawerTabStrip = !!target.closest('[data-drawer-strip]') ||
                           !!target.closest('.drawer-tab-strip') ||
                           target.closest('button')?.hasAttribute('data-drawer-tab')

  if (isDrawerTabStrip) {
    console.log('[DRAG-UTILS][isDockviewDrag] ❌ NON è Dockview - è drawer tab strip')
    return false
  }

  const isTabContainer = !!target.closest('.dv-tabs-and-actions-container')
  const isTab = !!target.closest('.dv-tab')
  const isDockviewTab = !!target.closest('[class*="dockview-tab"]')
  const isDockviewArea = !!target.closest('.dockview-react')

  const result = isTabContainer || isTab || isDockviewTab

  console.log('[DRAG-UTILS][isDockviewDrag] Verifica elementi Dockview:', {
    isTabContainer,
    isTab,
    isDockviewTab,
    isDockviewArea,
    isDrawerTabStrip,
    result: result ? '✅ È Dockview' : '❌ NON è Dockview'
  })

  return result
}

/**
 * Verifica se è un drag di file Explorer
 */
export function isExplorerFileDrag(e: DragEvent | React.DragEvent): boolean {
  return e.dataTransfer?.types.includes('application/x-explorer-file') ?? false
}

/**
 * Verifica se è un drag di documento (spostamento tra cassetti)
 */
export function isDocumentDrag(e: DragEvent | React.DragEvent): boolean {
  return e.dataTransfer?.types.includes('application/x-doc-id') ?? false
}

/**
 * Verifica se è un drag di file OS nativi
 */
export function isOsFileDrag(e: DragEvent | React.DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}
