import type { Node as RFNode, Edge as RFEdge } from 'reactflow'

export type NodeKind =
  | 'male'
  | 'female'
  | 'company'
  | 'meeting'
  | 'bar'
  | 'restaurant'
  | 'vehicle'
  | 'motorcycle'
  | 'other_investigation'

export type RelationKind =
  // person ↔ person
  | 'padre' | 'madre' | 'figlio' | 'figlia'
  | 'marito' | 'moglie'
  | 'convivente' | 'ex_coniuge'
  | 'fidanzato' | 'fidanzata'
  | 'fratello' | 'sorella'
  | 'amicizia_affari' | 'frequentazione'
  | 'collega' | 'superiore' | 'subordinato'
  // person → company / company → person
  | 'dipendente' | 'datore'
  | 'amministratore_unico' | 'amministratore' | 'consigliere'
  | 'rappresentante_legale'
  | 'titolare_firmatario'
  | 'socio' | 'socio_occulto'
  | 'accomandatario' | 'accomandante'
  | 'gestore'
  | 'appaltatore' | 'fornitore' | 'cliente'
  | 'proprietario' | 'interessi'
  // person ↔ place (bar/restaurant)
  | 'frequentatore' | 'incontro_presso'
  // person ↔ vehicle/motorcycle
  | 'intestatario' | 'conducente_abituale' | 'utilizzatore'
  // company ↔ company
  | 'controllante' | 'controllata' | 'collegata' | 'joint_venture' | 'acquisizione' | 'cessione'

export type NodeStyle = {
  ringColor?: string
  ringWidth?: number
  ringFill?: string | null
  ringFillColor?: string
  showBigX?: boolean
  ringFillAlpha?: number
  bigXColor?: string
  bigXSizePx?: number
  textFontSizePx?: number
  textBold?: boolean
  textItalic?: boolean
  textColor?: string
  labelWidthPx?: number
}

export type BuilderNodeData = {
  kind: NodeKind
  refId?: string
  label: string
  labelBlock?: string | null
  icon?: string
  details?: {
    dob?: string
    hasPs?: boolean
  }
  onDelete?: () => void
  nodeId?: string
  centerAt?: { x: number; y: number }
  style?: NodeStyle
}

export type BuilderEdgeData = {
  relation: RelationKind
  percent?: number
  dashed?: boolean
  tooltip?: string
  strokeColor?: string
  strokeWidth?: number
  captionFontSizePx?: number
  captionBold?: boolean
  captionItalic?: boolean
  captionColor?: string
}

export type BuilderNode = RFNode<BuilderNodeData>
export type BuilderEdge = RFEdge<BuilderEdgeData>


