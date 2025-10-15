export type Token = {
  text: string
  conf: number
  x: number
  y: number
  w: number
  h: number
}

export type Word = {
  text: string
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export type PageMetrics = {
  dpiUsed: number
  psmUsed: number
  words: number
  medConf: number
  textLen: number
}

export type PageResult = {
  page: number
  text: string
  confidence: number
  width: number
  height: number
  words: Word[]
  metrics: PageMetrics
}

export type TranslateOptions = {
  dpiBase?: number
  dpiMax?: number
  lang?: string
  tessdataDir?: string
  rasterColor?: boolean
  psmChain?: number[]
}

export type DocumentResult = {
  pages: PageResult[]
  avgConfidence: number
  layout: Array<{
    page: number
    width: number
    height: number
    dpiUsed: number
    psmUsed: number
    words: Word[]
  }>
}


