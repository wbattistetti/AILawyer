import { create } from 'zustand'
import type { OverviewViewState, LayoutMode } from '../types/view'

type Store = OverviewViewState & {
  setLayout: (l: LayoutMode) => void
  setPeople: (ids: string[]) => void
  togglePerson: (id: string) => void
  setFilters: (p: Partial<OverviewViewState['filters']>) => void
  setAttenuate: (v: boolean) => void
  setViewMode: (m: 'GRAPH'|'CABINET') => void
}

export const useOverviewState = create<Store>((set, get) => ({
  selectedPeople: [],
  compare: false,
  egoDepth: 1,
  filters: {},
  attenuateRest: true,
  layout: 'RADIAL',
  viewMode: 'GRAPH',
  setLayout: (l) => set({ layout: l }),
  setPeople: (ids) => set({ selectedPeople: ids }),
  togglePerson: (id) => {
    const cur = new Set(get().selectedPeople)
    if (cur.has(id)) cur.delete(id); else cur.add(id)
    set({ selectedPeople: Array.from(cur) })
  },
  setFilters: (p) => set({ filters: { ...get().filters, ...p } }),
  setAttenuate: (v) => set({ attenuateRest: v }),
  setViewMode: (m) => set({ viewMode: m }),
}))


