import React from 'react'
import { Search, Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, PanelRightOpen } from 'lucide-react'
import { Tool } from '../hooks/usePdfAnnotations'

interface PdfUnifiedToolbarProps {
  // Page navigation (da TopBar)
  totalPages: number
  pageInput: string
  onPageInputChange: (value: string) => void
  onJump: (page: number) => void

  // Search (da TopBar)
  searchQ: string
  onSearchQChange: (value: string) => void
  onOpenSearchPanel: () => void
  showAdvanced: boolean
  onCloseSearchPanel: () => void

  // Tools (da PdfToolbarAdvanced)
  tool: Tool
  setTool: (tool: Tool | ((prev: Tool) => Tool)) => void
  audit: boolean
  setAudit: (audit: boolean) => void
  autoDeskew: boolean
  setAutoDeskew: (deskew: boolean) => void
  skewAngles: Record<number, number>
  setSkewAngles: (angles: Record<number, number>) => void
  selectKind: 'NATIVE' | 'OCR'
  setSelectKind: (kind: 'NATIVE' | 'OCR') => void
  zoomPct: number
  setZoomPct: (zoom: number) => void
  scaleRef: React.MutableRefObject<number>
  zoomDebounceRef: React.MutableRefObject<number | null>
  hostRef: React.RefObject<HTMLElement>

  // Functions
  estimateSkewForPage: (page: number) => Promise<number>
  persistSkew: (angles: Record<number, number>) => void
  applyImmediateToPage: (page: number, angle: number) => void
  zoomTo: (scale: number) => void
  setShowAdvanced: (show: boolean) => void
}

export const PdfUnifiedToolbar: React.FC<PdfUnifiedToolbarProps> = ({
  totalPages,
  pageInput,
  onPageInputChange,
  onJump,
  searchQ,
  onSearchQChange,
  onOpenSearchPanel,
  showAdvanced,
  onCloseSearchPanel,
  tool,
  setTool,
  audit,
  setAudit,
  autoDeskew,
  setAutoDeskew,
  skewAngles,
  setSkewAngles,
  selectKind,
  setSelectKind,
  zoomPct,
  setZoomPct,
  scaleRef,
  zoomDebounceRef,
  hostRef,
  estimateSkewForPage,
  persistSkew,
  applyImmediateToPage,
  zoomTo,
  setShowAdvanced
}) => {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-background flex-shrink-0 flex-wrap">
      {/* SINISTRA: Pagina + Strumenti */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Pagina */}
        <div className="flex items-center gap-1">
          <input
            className="w-16 border rounded px-1 py-0.5 text-center text-sm"
            value={pageInput}
            onChange={(e) => onPageInputChange(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const p = Math.max(1, Math.min(totalPages || 1, parseInt(pageInput || '1', 10)))
                onJump(p)
              }
            }}
          />
          <span className="text-sm text-gray-600 whitespace-nowrap">/ {totalPages || '-'}</span>
        </div>

        {/* Separatore */}
        <div className="h-6 w-px bg-gray-300" />

        {/* Strumenti di annotazione */}
        <div className="flex items-center gap-1">
          <button
            className={`px-2 py-1 rounded border ${tool === 'highlight' ? 'bg-yellow-100 border-yellow-400' : ''}`}
            title="Evidenzia"
            onClick={() => setTool(tool === 'highlight' ? 'none' : 'highlight')}
          >
            <Highlighter size={16} />
          </button>
          <button
            className={`px-2 py-1 rounded border ${tool === 'underline' ? 'bg-sky-100 border-sky-400' : ''}`}
            title="Sottolinea"
            onClick={() => setTool(tool === 'underline' ? 'none' : 'underline')}
          >
            <UnderlineIcon size={16} />
          </button>
          <button
            className={`px-2 py-1 rounded border ${tool === 'strike' ? 'bg-red-100 border-red-400' : ''}`}
            title="Barra"
            onClick={() => setTool(tool === 'strike' ? 'none' : 'strike')}
          >
            <StrikethroughIcon size={16} />
          </button>
          <button
            className={`px-2 py-1 rounded border text-sm ${audit ? 'bg-muted border-border' : ''}`}
            title="Audit mode (testo digitale)"
            onClick={() => setAudit(a => !a)}
          >
            Audit
          </button>
          <button
            className={`px-2 py-1 rounded border ${tool === 'comment' ? 'bg-amber-100 border-amber-400' : ''}`}
            title="Commento"
            onClick={() => setTool(tool === 'comment' ? 'none' : 'comment')}
          >
            <MessageSquare size={16} />
          </button>
          <button
            className={`px-2 py-1 rounded border text-sm ${autoDeskew ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : ''}`}
            title={autoDeskew ? 'Raddrizza: ON' : 'Raddrizza quando serve'}
            onClick={async () => {
              const next = !autoDeskew
              try { console.log('[DESKEW][toggle]', { next }) } catch {}
              setAutoDeskew(next)
              if (next) {
                const p = Math.max(1, parseInt(pageInput || '1', 10))
                try { console.log('[DESKEW][estimate][start]', { page: p }) } catch {}
                if (!skewAngles[p]) {
                  const ang = await estimateSkewForPage(p)
                  try { console.log('[DESKEW][estimate][done]', { page: p, angle: ang }) } catch {}
                  setSkewAngles(prev => { const n = { ...prev, [p]: ang }; persistSkew(n); return n })
                  applyImmediateToPage(p, ang)
                } else {
                  const ang = skewAngles[p]
                  try { console.log('[DESKEW][cached]', { page: p, angle: ang }) } catch {}
                  applyImmediateToPage(p, ang)
                }
              }
            }}
          >
            Raddrizza
          </button>
        </div>
      </div>

      {/* DESTRA: Ricerca + Controlli */}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {/* Pulsante Ricerca */}
        {showAdvanced ? (
          <button
            className="px-2 py-1 border rounded bg-blue-100 border-blue-400 hover:bg-blue-200 text-sm"
            title="Chiudi pannello ricerca"
            onClick={() => {
              setShowAdvanced(false)
              onCloseSearchPanel()
            }}
          >
            <PanelRightOpen size={16} className="inline-block mr-1 rotate-180" />
            Chiudi ricerca
          </button>
        ) : (
          <button
            className="px-2 py-1 border rounded hover:bg-muted text-sm"
            title="Apri pannello ricerca"
            onClick={() => {
              setShowAdvanced(true)
              onOpenSearchPanel()
            }}
          >
            <Search size={16} className="inline-block mr-1" />
            Cerca
          </button>
        )}

        {/* Separatore */}
        <div className="h-6 w-px bg-gray-300" />

        {/* Selezione e Zoom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-600">Selezione</label>
            <select
              className="border rounded px-1 py-0.5 text-xs"
              value={selectKind}
              onChange={(e) => setSelectKind(e.target.value as 'NATIVE' | 'OCR')}
            >
              <option value="NATIVE">Nativa</option>
              <option value="OCR">OCR</option>
            </select>
          </div>
          <span className="text-xs w-10 text-right">{zoomPct}%</span>
          <input
            type="range"
            min={50}
            max={300}
            step={1}
            value={zoomPct}
            className="w-20"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setZoomPct(v)
              const s = v / 100
              scaleRef.current = s
              if (zoomDebounceRef.current != null) {
                window.clearTimeout(zoomDebounceRef.current)
              }
              zoomDebounceRef.current = window.setTimeout(() => {
                try { zoomTo(s) } catch {}
                const viewer = hostRef.current as HTMLElement | null
                if (viewer) viewer.style.setProperty('--scale-factor', String(s))
              }, 80)
            }}
          />
        </div>
      </div>
    </div>
  )
}

