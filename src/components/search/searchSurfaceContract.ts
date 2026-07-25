/**
 * Contratto DOM condiviso che identifica ogni superficie di ricerca.
 */

export const SEARCH_SURFACE_ROLE = 'search-surface'
export const SEARCH_SURFACE_SELECTOR = `[data-role="${SEARCH_SURFACE_ROLE}"]`

/**
 * Verifica se un target DOM appartiene a una superficie di ricerca.
 */
export function isSearchSurfaceTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined'
    && target instanceof Element
    && target.closest(SEARCH_SURFACE_SELECTOR) !== null
}
