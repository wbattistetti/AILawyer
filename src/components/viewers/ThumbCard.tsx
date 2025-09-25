import React, { useState } from 'react'
import { Eye, Table, Trash, ScanText, FileText } from 'lucide-react'

interface ThumbCardProps {
  title: string
  imgSrc: string
  headerIcon?: React.ReactNode
  headerColorClass?: string
  excerpt?: string
  metaDocLabel?: string
  metaPage?: number | string
  onShow?: () => void
  selected?: boolean
  onSelect?: () => void
  onPreview?: () => void
  onPreviewOcr?: () => void
  onTable?: () => void
  onRemove?: () => void
  onOcr?: () => void
  onOcrQuick?: () => void
  ocrProgressPct?: number | null
  hasOcr?: boolean
}

export function ThumbCard({ title, imgSrc, headerIcon, headerColorClass, excerpt, metaDocLabel, metaPage, onShow, selected, onSelect, onPreview, onPreviewOcr, onTable, onRemove, onOcr, onOcrQuick, ocrProgressPct, hasOcr }: ThumbCardProps) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="relative group select-none rounded-md"
      title={title}
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      onDoubleClick={(e) => { e.stopPropagation(); onPreview?.() }}
    >
      <div className={`relative w-48 h-64 border rounded-sm bg-white overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        {/* Header bar */}
        <div className={`absolute left-2 right-2 top-2 h-7 rounded text-white flex items-center gap-2 px-2 ${headerColorClass || 'bg-amber-500'}`}>
          {headerIcon ?? <FileText className="w-4 h-4" />}
          <div className="text-xs font-semibold truncate" title={title}>{title}</div>
        </div>
        {/* Body: image or excerpt */}
        <div className="absolute inset-0 pt-10 pb-8 px-2 flex flex-col items-stretch justify-start overflow-hidden">
          {metaDocLabel && (
            <div className="text-[10px] leading-snug mb-1 flex items-center gap-2">
              <div className="flex-1 flex justify-center">
                <span className="inline-flex items-center gap-1 max-w-[80%] truncate px-2 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800">
                  <FileText className="w-3 h-3" />
                  <span className="truncate" title={metaDocLabel}>{metaDocLabel}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {typeof metaPage !== 'undefined' && (<span className="whitespace-nowrap text-neutral-700">Pag: {metaPage}</span>)}
                {onShow && (
                  <button
                    className="inline-flex items-center px-2 py-0.5 border rounded bg-blue-100 text-blue-800 hover:bg-blue-200 text-[10px]"
                    onClick={(e)=>{ e.stopPropagation(); onShow() }}
                  >Mostra</button>
                )}
              </div>
            </div>
          )}
          {!imgError && imgSrc ? (
            <div className="flex-1 flex items-center justify-center">
              <img src={imgSrc} alt={title} className="max-w-full max-h-full object-contain" onError={() => setImgError(true)} />
            </div>
          ) : (
            <div className="text-[11px] leading-snug text-neutral-800 w-full line-clamp-6">{excerpt || ' '}</div>
          )}
        </div>
        {typeof ocrProgressPct === 'number' && (
          <div className="absolute inset-0 bg-white/65 backdrop-blur-[1px] flex flex-col items-center justify-end pb-2">
            <div className="w-32 h-2 bg-black/10 rounded overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, ocrProgressPct))}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-black/70 font-medium">{Math.round(ocrProgressPct)}%</div>
          </div>
        )}
      </div>
      {/* Hover actions - centered */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
        <div className="pointer-events-auto inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm shadow px-2 py-1 rounded">
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreview?.() }}
            aria-label="Anteprima"
          >
            <Eye className="w-4 h-4" />
          </button>
          {hasOcr && (
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white relative"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreviewOcr?.() }}
              aria-label="Anteprima OCR"
              title="Apri PDF OCR"
            >
              <Eye className="w-4 h-4" />
              <span className="absolute -right-1 -top-1 text-[8px] bg-blue-500 text-white rounded px-0.5">OCR</span>
            </button>
          )}
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOcr?.() }}
            aria-label="OCR"
            title="Esegui OCR"
          >
            <ScanText className="w-4 h-4" />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOcrQuick?.() }}
            aria-label="OCR Veloce"
            title="OCR Veloce"
          >
            <ScanText className="w-4 h-4 text-blue-600" />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTable?.() }}
            aria-label="Azione tabella"
          >
            <Table className="w-4 h-4" />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove?.() }}
            aria-label="Rimuovi"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* no filename footer for extracts */}
    </div>
  )
}


