/**
 * Resolve screenshot data URL from extract results without Blob↔dataURL roundtrips.
 */

import type { ExtractedContent } from '../types/viewer.types'

/**
 * Prefer metadata.imageDataUrl when present (already produced by html2canvas / canvas crop).
 */
export function resolveExtractImageDataUrl(content: ExtractedContent): string | undefined {
  const fromMeta = content.metadata?.imageDataUrl
  if (typeof fromMeta === 'string' && fromMeta.length > 0) {
    return fromMeta
  }
  return undefined
}
