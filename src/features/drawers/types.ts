export type DrawerType = 'DocumentCollection' | 'Generic'

export interface DrawerOpenPayload {
  drawerId: string
  title?: string
  type?: DrawerType
}


