export type Token = { text: string; x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }

export type PageInput = {
  docId: string
  title: string
  page: number
  tokens: Token[]
  praticaId?: string
}

export type ThingKind = 'contact' | 'id' | 'place' | 'vehicle' | 'docref'

export type CharSpan = { start: number; end: number }

export interface ThingOut {
  id: string
  kind: ThingKind
  label: string
  value: string
  page: number
  box?: { x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }
  span?: CharSpan
  meta?: Record<string, any>
}

export type DetectFn = (input: PageInput) => ThingOut[]


