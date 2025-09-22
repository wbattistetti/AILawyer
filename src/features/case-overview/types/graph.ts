export type Fonte = "PG" | "PM" | "DIFESA" | "UFFICIO";
export type BlockKind =
  | "CONTAINER"
  | "ENTITY"
  | "DOCUMENT"
  | "MEASURE"
  | "EVENT"
  | "EVIDENCE"
  | "TIMELINE";

export interface CaseNode {
  id: string;
  label: string;
  kind: BlockKind;
  meta?: Record<string, any>;
  fonte?: Fonte;
  counts?: Record<string, number>;
}

export interface CaseEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
}

export interface CaseGraph {
  nodes: CaseNode[];
  edges: CaseEdge[];
}


