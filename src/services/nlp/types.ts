export type EventType = 'incontro' | 'telefonata' | 'consegna'

export interface EventRecord {
  id?: string
  type: EventType
  text: string
  participants: string[]
  time?: string
  place_raw?: string
  artefacts?: string[]
  amount?: string
  source?: Record<string, any>
  confidence?: number
}


