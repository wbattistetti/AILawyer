/**
 * CaseOverviewDiagram - baseline orchestrator for the overview graph.
 * Usage:
 * <CaseOverviewDiagram graph={caseGraph} peopleIndex={peopleIndex} initialState={{ layout: 'RADIAL', attenuateRest: true }} />
 */
import React, { useMemo } from 'react'
import type { CaseGraph } from '../types/graph'
import type { OverviewViewState } from '../types/view'
import { useOverviewState } from '../hooks/useOverviewState'
import { GraphCanvas } from './GraphCanvas'
import GraphBuilder from '../graph-builder/GraphBuilder'
import { OverviewToolbar } from './OverviewToolbar'
import CabinetView from './CabinetView'

export interface CaseOverviewDiagramProps {
  graph: CaseGraph
  peopleIndex: Record<string, string>
  initialState?: Partial<OverviewViewState>
  onOpenList?: (blockId: string) => void
  onOpenDocument?: (nodeId: string) => void
  onExportDossier?: (peopleIds: string[]) => void
  height?: number | string
}

export function CaseOverviewDiagram(props: CaseOverviewDiagramProps) {
  const h = props.height ?? '100%'
  useMemo(() => {
    // initialize defaults
    if (props.initialState) {
      const s = useOverviewState.getState()
      useOverviewState.setState({
        ...s,
        ...props.initialState,
        filters: { ...(s.filters||{}), ...(props.initialState.filters||{}) },
      })
    }
  }, [])

  const state = useOverviewState()

  return (
    <div className="w-full" style={{ height: h }}>
      <div className="h-8 flex items-center justify-between px-2 border-b bg-white">
        <div className="font-medium">Overview</div>
        <OverviewToolbar />
      </div>
      <div className="h-[calc(100%-2rem)] bg-white relative">
        {state.viewMode === 'CABINET' ? (
          <CabinetView graph={props.graph} onOpen={(id)=>{ /* open editor via custom event - consumed by GraphCanvas editor */ }} />
        ) : (
          <GraphBuilder />
        )}
      </div>
    </div>
  )
}


