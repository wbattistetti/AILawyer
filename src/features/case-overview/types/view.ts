import type { Fonte, BlockKind } from './graph'

export type LayoutMode = "RADIAL" | "HIERARCHICAL" | "TIMELINE";

export interface OverviewViewState {
  selectedPeople: string[];
  compare: boolean;
  egoDepth: 1 | 2;
  dateRange?: { from?: string; to?: string };
  filters: {
    fonte?: Fonte[];
    kinds?: BlockKind[];
  };
  attenuateRest: boolean;
  layout: LayoutMode;
  viewMode?: 'GRAPH' | 'CABINET';
}


