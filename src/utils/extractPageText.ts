/**
 * Recupera il testo canonico di una pagina tramite il resolver documentale backend.
 */

interface PageContentResponse {
  page?: unknown
  text?: unknown
}

const getApiBaseUrl = (): string =>
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

/**
 * Estrae il testo di una pagina per documenti locali o persistiti.
 */
export async function extractPageText(docId: string, pageNumber: number): Promise<string | null> {
  const normalizedId = docId.trim()
  if (!normalizedId) throw new Error('docId è obbligatorio per estrarre il testo pagina')
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(`Numero pagina non valido: ${pageNumber}`)
  }

  const params = new URLSearchParams({
    docId: normalizedId,
    page: String(pageNumber)
  })
  const response = await fetch(`${getApiBaseUrl()}/api/document-content/page?${params.toString()}`)
  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    const detail = typeof body?.error === 'string' ? `: ${body.error}` : ''
    throw new Error(`Recupero testo pagina non riuscito (${response.status})${detail}`)
  }

  const data = await response.json() as PageContentResponse
  if (data.page !== pageNumber || typeof data.text !== 'string') {
    throw new Error('Risposta testo pagina non valida')
  }
  return data.text.trim() || null
}
