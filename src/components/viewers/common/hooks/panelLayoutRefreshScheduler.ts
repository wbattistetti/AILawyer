/**
 * Coalesces viewer layout refreshes until dock measurements have settled.
 */

export interface PanelLayoutRefreshScheduler {
  schedule: () => void
  cancel: () => void
}

type RequestFrame = (callback: FrameRequestCallback) => number
type CancelFrame = (frameId: number) => void

/**
 * Creates a cancellable two-frame scheduler so refreshes run after layout and paint.
 */
export function createPanelLayoutRefreshScheduler(
  onRefresh: () => void,
  requestFrame: RequestFrame = requestAnimationFrame,
  cancelFrame: CancelFrame = cancelAnimationFrame
): PanelLayoutRefreshScheduler {
  let firstFrameId: number | undefined
  let secondFrameId: number | undefined

  const cancel = () => {
    if (firstFrameId !== undefined) cancelFrame(firstFrameId)
    if (secondFrameId !== undefined) cancelFrame(secondFrameId)
    firstFrameId = undefined
    secondFrameId = undefined
  }

  const schedule = () => {
    cancel()
    firstFrameId = requestFrame(() => {
      firstFrameId = undefined
      secondFrameId = requestFrame(() => {
        secondFrameId = undefined
        onRefresh()
      })
    })
  }

  return { schedule, cancel }
}
