/**
 * Persistenza della sola ultima sessione workspace (layout dock).
 * Ripristina il layout solo se si riapre la stessa pratica lasciata aperta;
 * altrimenti il progetto riparte da zero.
 */

export const LAST_WORKSPACE_SESSION_KEY = 'ws_dock_last_session'

export type LastWorkspaceSession = {
  praticaId: string
  layout: unknown
  savedAt: number
}

/**
 * Legge l'ultima sessione workspace da localStorage.
 */
export function loadLastWorkspaceSession(): LastWorkspaceSession | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LAST_WORKSPACE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastWorkspaceSession>
    if (!parsed?.praticaId || parsed.layout == null) return null
    return {
      praticaId: String(parsed.praticaId),
      layout: parsed.layout,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    }
  } catch {
    return null
  }
}

/**
 * Salva layout e pratica corrente come unica sessione ripristinabile.
 */
export function saveLastWorkspaceSession(praticaId: string, layout: unknown): void {
  if (!praticaId) {
    throw new Error('saveLastWorkspaceSession: praticaId obbligatorio')
  }
  if (layout == null) {
    throw new Error('saveLastWorkspaceSession: layout obbligatorio')
  }
  try {
    if (typeof localStorage === 'undefined') return
    const session: LastWorkspaceSession = {
      praticaId,
      layout,
      savedAt: Date.now(),
    }
    localStorage.setItem(LAST_WORKSPACE_SESSION_KEY, JSON.stringify(session))
  } catch {
    // localStorage pieno o non disponibile: non bloccare l'UI
  }
}

/**
 * True solo se la pratica aperta è quella dell'ultima sessione salvata.
 */
export function shouldRestoreLastWorkspace(praticaId: string | undefined): boolean {
  if (!praticaId) return false
  const session = loadLastWorkspaceSession()
  return !!session && session.praticaId === praticaId
}

/**
 * Layout da ripristinare per la pratica, o null se si deve ripartire da zero.
 */
export function getRestorableLayoutForPratica(praticaId: string | undefined): unknown | null {
  if (!praticaId) return null
  const session = loadLastWorkspaceSession()
  if (!session || session.praticaId !== praticaId) return null
  return session.layout
}

/**
 * Rimuove la sessione salvata (es. dopo restore fallito).
 */
export function clearLastWorkspaceSession(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(LAST_WORKSPACE_SESSION_KEY)
  } catch {
    // ignore
  }
}
