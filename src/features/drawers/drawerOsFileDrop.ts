/**
 * Drop di file OS sulle tab cassetto (strip + tab Dockview).
 *
 * Dockview rende le tab `draggable` e intercetta il DnD in bubble:
 * i handler React su `defaultTabComponent` non sono affidabili.
 * Qui usiamo listener nativi in capture su un root, hit-test via data-attribute,
 * e upload diretto tramite `__archiveData.handleFileDrop` (niente CustomEvent).
 */

export const DRAWER_DROP_ID_ATTR = 'data-drawer-drop-id'

type ArchiveDropApi = {
  handleFileDrop: (
    files: File[],
    compartoId?: string | null,
    target?: { type?: string; id?: string; title?: string } | null
  ) => Promise<void> | void
  comparti?: Array<{ id: string; nome: string; chiave?: string; key?: string }>
}

/**
 * Estrae l'id cassetto da un elemento (o antenato) con i marker di drop.
 */
export function drawerIdFromElement(el: Element | null): string | null {
  if (!el) return null

  const byDropId = el.closest(`[${DRAWER_DROP_ID_ATTR}]`)
  const fromDropId = byDropId?.getAttribute(DRAWER_DROP_ID_ATTR)
  if (fromDropId) return fromDropId

  const byStripTab = el.closest('[data-drawer-tab][data-drawer-id]')
  const fromStrip = byStripTab?.getAttribute('data-drawer-id')
  if (fromStrip) return fromStrip

  // Drop sul padding/chrome di .dv-tab (fuori dal contenuto React): cerca il marker dentro
  const dvTab = el.closest('.dv-tab')
  if (dvTab) {
    const marked = dvTab.querySelector(`[${DRAWER_DROP_ID_ATTR}]`)
    const id = marked?.getAttribute(DRAWER_DROP_ID_ATTR)
    if (id) return id
  }

  return null
}

/**
 * Risolve il cassetto sotto il cursore (strip o tab Dockview).
 */
export function findDrawerDropTarget(clientX: number, clientY: number): string | null {
  return drawerIdFromElement(document.elementFromPoint(clientX, clientY))
}

function isOsFileDrag(dt: DataTransfer | null): boolean {
  return !!dt?.types?.includes('Files')
}

function getArchiveDropApi(): ArchiveDropApi {
  const api = (window as unknown as { __archiveData?: ArchiveDropApi }).__archiveData
  if (!api || typeof api.handleFileDrop !== 'function') {
    throw new Error('[DRAWER-OS-DROP] __archiveData.handleFileDrop non disponibile')
  }
  return api
}

/**
 * Carica file OS nel cassetto indicato. Fallisce subito se l'API non è pronta.
 */
export async function uploadOsFilesToDrawer(files: File[], drawerId: string): Promise<void> {
  if (!files.length) {
    throw new Error('[DRAWER-OS-DROP] Nessun file nel drop')
  }
  if (!drawerId) {
    throw new Error('[DRAWER-OS-DROP] drawerId mancante')
  }

  const archive = getArchiveDropApi()
  const comparto = archive.comparti?.find(c => c.id === drawerId)
  const title = comparto?.nome

  await archive.handleFileDrop(files, drawerId, {
    type: 'drawer',
    id: drawerId,
    title,
  })
}

export type BindDrawerOsFileDropOptions = {
  /** Dopo l'upload, tipicamente apre/attiva il pannello del cassetto. */
  onAfterUpload?: (drawerId: string) => void
}

/**
 * Attacca listener capture su `root` per dragover/drop di file OS sulle tab cassetto.
 * @returns dispose
 */
export function bindDrawerOsFileDrop(
  root: HTMLElement,
  options: BindDrawerOsFileDropOptions = {}
): () => void {
  let highlighted: Element | null = null

  const clearHighlight = () => {
    if (highlighted) {
      highlighted.removeAttribute('data-drawer-drop-hover')
      highlighted = null
    }
  }

  const setHighlight = (drawerId: string | null, clientX: number, clientY: number) => {
    clearHighlight()
    if (!drawerId) return
    const el = document.elementFromPoint(clientX, clientY)
    const node =
      el?.closest(`[${DRAWER_DROP_ID_ATTR}="${drawerId}"]`) ||
      el?.closest(`[data-drawer-tab][data-drawer-id="${drawerId}"]`)
    if (node) {
      node.setAttribute('data-drawer-drop-hover', 'true')
      highlighted = node
    }
  }

  const onDragOver = (e: DragEvent) => {
    if (!isOsFileDrag(e.dataTransfer)) return
    if (!root.contains(e.target as Node)) return

    const drawerId = findDrawerDropTarget(e.clientX, e.clientY)
    if (!drawerId) {
      clearHighlight()
      return
    }

    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setHighlight(drawerId, e.clientX, e.clientY)
  }

  const onDragLeave = (e: DragEvent) => {
    if (!root.contains(e.relatedTarget as Node)) {
      clearHighlight()
    }
  }

  const onDrop = (e: DragEvent) => {
    if (!isOsFileDrag(e.dataTransfer)) return
    if (!root.contains(e.target as Node)) return

    const drawerId = findDrawerDropTarget(e.clientX, e.clientY)
    clearHighlight()
    if (!drawerId) return

    // Capture: intercetta prima di Dockview (bubble) e degli handler React.
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    const files = Array.from(e.dataTransfer?.files || [])
    void uploadOsFilesToDrawer(files, drawerId)
      .then(() => options.onAfterUpload?.(drawerId))
      .catch((err: unknown) => {
        console.error('[DRAWER-OS-DROP] Upload fallito:', err)
      })
  }

  root.addEventListener('dragover', onDragOver, true)
  root.addEventListener('dragleave', onDragLeave, true)
  root.addEventListener('drop', onDrop, true)

  return () => {
    clearHighlight()
    root.removeEventListener('dragover', onDragOver, true)
    root.removeEventListener('dragleave', onDragLeave, true)
    root.removeEventListener('drop', onDrop, true)
  }
}
