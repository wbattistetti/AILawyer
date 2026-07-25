/**
 * Confine UI condiviso che isola la ricerca dagli eventi dei viewer.
 */

import type { HTMLAttributes } from 'react'
import { SEARCH_SURFACE_ROLE } from './searchSurfaceContract'

interface SearchSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  kind: 'document' | 'practice'
}

/**
 * Racchiude una UI di ricerca nel contratto DOM riconosciuto dai viewer.
 */
export function SearchSurface({
  kind,
  onMouseDown,
  ...props
}: SearchSurfaceProps) {
  return (
    <div
      {...props}
      data-role={SEARCH_SURFACE_ROLE}
      data-search-kind={kind}
      onMouseDown={(event) => {
        event.stopPropagation()
        onMouseDown?.(event)
      }}
    />
  )
}
