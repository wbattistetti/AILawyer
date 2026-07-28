/**
 * Verifica che lo snapshot di dataTransfer catturi i file in modo sincrono.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DragAndDropService } from './DragAndDropService'

function makeDropEvent(files: File[], types: string[] = ['Files']): React.DragEvent {
  return {
    dataTransfer: {
      types,
      files,
      getData: () => '',
    },
    preventDefault() {},
    stopPropagation() {},
  } as unknown as React.DragEvent
}

describe('DragAndDropService.snapshotDataTransfer', () => {
  it('cattura i File OS prima di qualsiasi await', () => {
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })
    const snap = DragAndDropService.snapshotDataTransfer(makeDropEvent([file]))
    expect(snap.files).toHaveLength(1)
    expect(snap.files[0].name).toBe('doc.pdf')
    expect(snap.types).toContain('Files')
  })
})

describe('DragAndDropService.handleDrop OS files', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invoca onFiles dallo snapshot sincrono', async () => {
    vi.stubGlobal('window', { __dragDataCache: new Map() })
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })
    const onFiles = vi.fn().mockResolvedValue(undefined)

    const handled = await DragAndDropService.handleDrop(
      makeDropEvent([file]),
      'comparto-1',
      { onFiles }
    )

    expect(handled).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file], 'comparto-1')
  })
})
