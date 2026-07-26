/**
 * Toggle espandi/collassa per nodi albero ricerca (default espanso).
 */

/**
 * Inverte lo stato aperto; se assente, parte da `defaultOpen` (tipicamente true).
 */
export function nextTreeNodeOpen(
  current: boolean | undefined,
  defaultOpen = true
): boolean {
  return !(current ?? defaultOpen)
}
