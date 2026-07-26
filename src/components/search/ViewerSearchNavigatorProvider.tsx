/**
 * Provider React del registry navigatori ricerca ↔ viewer.
 */

import React, { createContext, useContext, useMemo } from 'react'
import { ViewerSearchNavigatorRegistry } from './viewerSearchNavigatorRegistry'

const ViewerSearchNavigatorRegistryContext =
  createContext<ViewerSearchNavigatorRegistry | null>(null)

/**
 * Espone un registry stabile per tutta la pratica (dock + overlay ricerca).
 */
export function ViewerSearchNavigatorProvider({
  children
}: {
  children: React.ReactNode
}) {
  const registry = useMemo(() => new ViewerSearchNavigatorRegistry(), [])
  return (
    <ViewerSearchNavigatorRegistryContext.Provider value={registry}>
      {children}
    </ViewerSearchNavigatorRegistryContext.Provider>
  )
}

/**
 * Registry obbligatorio: fallisce fuori dal provider.
 */
export function useViewerSearchNavigatorRegistry(): ViewerSearchNavigatorRegistry {
  const registry = useContext(ViewerSearchNavigatorRegistryContext)
  if (!registry) {
    throw new Error('useViewerSearchNavigatorRegistry richiede ViewerSearchNavigatorProvider')
  }
  return registry
}

/**
 * Registry opzionale: null se il provider non è montato (es. viewer isolati).
 */
export function useOptionalViewerSearchNavigatorRegistry(): ViewerSearchNavigatorRegistry | null {
  return useContext(ViewerSearchNavigatorRegistryContext)
}
