export type OcrState = {
  progress: Record<string, number>
  eta: Record<string, string | null>
  status: Record<string, string | null>
  cancelled: Record<string, boolean>
}

const key = (praticaId: string) => `ocr_state_${praticaId}`

export function loadOcrState(praticaId: string): OcrState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key(praticaId)) : null
    if (!raw) return { progress: {}, eta: {}, status: {}, cancelled: {} }
    const parsed = JSON.parse(raw)
    return {
      progress: parsed?.progress || {},
      eta: parsed?.eta || {},
      status: parsed?.status || {},
      cancelled: parsed?.cancelled || {},
    }
  } catch {
    return { progress: {}, eta: {}, status: {}, cancelled: {} }
  }
}

export function saveOcrState(praticaId: string, state: OcrState) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key(praticaId), JSON.stringify(state))
  } catch {}
}

export function clearDoc(praticaId: string, docId: string) {
  const st = loadOcrState(praticaId)
  delete st.progress[docId]
  delete st.eta[docId]
  delete st.status[docId]
  delete st.cancelled[docId]
  saveOcrState(praticaId, st)
}


