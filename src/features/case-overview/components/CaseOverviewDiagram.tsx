/**
 * CaseOverviewDiagram - baseline orchestrator for the overview graph.
 * Usage:
 * <CaseOverviewDiagram praticaId={praticaId} />
 */
import React from 'react'
// CaseGraph removed - no longer needed
// OverviewViewState removed - no longer needed
// useOverviewState removed - no longer needed since viewMode is handled by sidebar tabs
// GraphCanvas removed - no longer needed
import GraphBuilder from '../graph-builder/GraphBuilder'
// OverviewToolbar removed - Grafo and Armadio are now separate tabs in sidebar

export interface CaseOverviewDiagramProps {
  praticaId: string // Aggiungi questa prop
  onOpenList?: (blockId: string) => void
  onOpenDocument?: (nodeId: string) => void
  onExportDossier?: (peopleIds: string[]) => void
  height?: number | string
}

export function CaseOverviewDiagram(props: CaseOverviewDiagramProps) {
  return (
    <div className="w-full h-full bg-white relative" style={{ height: props.height ?? '100%' }}>
      <GraphBuilder praticaId={props.praticaId} />
    </div>
  )
}


