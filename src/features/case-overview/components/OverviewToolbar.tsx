import React from 'react'
import { useOverviewState } from '../hooks/useOverviewState'

export function OverviewToolbar() {
  const { viewMode, setViewMode } = useOverviewState()
  const Btn = ({ mode, label }: { mode: 'GRAPH'|'CABINET'; label: string }) => (
    <button
      type="button"
      className={`px-2 py-1 border rounded text-xs ${viewMode===mode ? 'bg-blue-600 text-white' : 'bg-white'}`}
      onClick={() => setViewMode(mode)}
    >{label}</button>
  )
  return (
    <div className="flex gap-2">
      <Btn mode="GRAPH" label="Grafo" />
      <Btn mode="CABINET" label="Armadio" />
    </div>
  )
}

export default OverviewToolbar


