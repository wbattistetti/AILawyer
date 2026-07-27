import type { Node as RFNode, Edge as RFEdge } from 'reactflow'

export type NodeKind =
  | 'person'
  | 'male'
  | 'female'
  | 'company'
  | 'place'
  | 'meeting'
  | 'bar'
  | 'restaurant'
  | 'vehicle'
  | 'motorcycle'
  | 'contact'
  | 'identifier'
  | 'object'
  | 'other_investigation'

export type RelationKind =
  // person ↔ person
  | 'padre' | 'madre' | 'figlio' | 'figlia'
  | 'marito' | 'moglie'
  | 'convivente' | 'ex_coniuge'
  | 'fidanzato' | 'fidanzata'
  | 'fratello' | 'sorella'
  | 'amicizia_affari' | 'frequentazione'
  | 'stessa_entita'
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
  // person ↔ place (address vs commercial)
  | 'frequentatore' | 'incontro_presso'
  | 'vive_presso' | 'residenza' | 'domicilio'
  | 'recatosi' | 'visto_presso'
  | 'sede'
  // person ↔ meeting / object / contact
  | 'partecipante' | 'organizzatore'
  | 'detiene' | 'utilizza_contatto'
  // person ↔ vehicle/motorcycle
  | 'intestatario' | 'conducente_abituale' | 'utilizzatore'
  // company ↔ company
  | 'controllante' | 'controllata' | 'collegata' | 'joint_venture' | 'acquisizione' | 'cessione'
  // free-text relation
  | 'custom'

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
  startEditing?: boolean
}

export type BuilderEdgeData = {
  relation: RelationKind
  /** Discursive middle text when relation is `custom` (e.g. "vive a"). */
  customMiddle?: string
  /** Short caption on the edge when relation is `custom`. */
  customCaption?: string
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


