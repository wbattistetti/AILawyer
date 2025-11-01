import React, { useEffect, useState } from 'react'
import { Eye, Table, Trash, ScanText, FileText } from 'lucide-react'
import { useAutoThumbnail } from '../../hooks/useAutoThumbnail'
import { OcrProgressOverlay } from './OcrProgressOverlay'

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
  onOcrCancel?: () => void
  onOcrResume?: () => void
  ocrProgressPct?: number | null
  ocrCancelling?: boolean
  transcribedPct?: number | null
  hasOcr?: boolean
  ocrEtaText?: string | null
  ocrStatusText?: string | null
  ocrStatus?: string | null
  hasNativeText?: boolean
  // Nuove props per generazione automatica miniature
  fileUrl?: string
  autoGenerateThumbnail?: boolean
  isPdf?: boolean // Prop esplicita per indicare se è PDF
  thumbnailOptions?: {
    width?: number
    height?: number
    quality?: number
  }
}

export function ThumbCard({
  title,
  imgSrc,
  headerIcon,
  headerColorClass,
  excerpt,
  metaDocLabel,
  metaPage,
  onShow,
  selected,
  onSelect,
  onPreview,
  onPreviewOcr,
  onTable,
  onRemove,
  onOcr,
  onOcrCancel,
  onOcrResume,
  ocrProgressPct,
  ocrCancelling,
  transcribedPct,
  hasOcr,
  ocrEtaText,
  ocrStatusText,
  ocrStatus,
  hasNativeText,
  fileUrl,
  autoGenerateThumbnail = false,
  thumbnailOptions = {},
  isPdf: isPdfProp
}: ThumbCardProps) {
  const [imgError, setImgError] = useState(false)

  // Log solo quando hasNativeText cambia in modo inaspettato (per debug problema specifico)
  // Rimossi log verbosi per ridurre rumore

  // resetta errori immagine quando cambia la sorgente
  useEffect(() => { setImgError(false) }, [imgSrc])


  // Log OCR-DEBUG rimosso per ridurre rumore (mantenere solo se necessario per debug specifico)

  // Hook per generazione automatica miniature
  const { thumbnail: generatedThumbnail, loading: thumbnailLoading, generate } = useAutoThumbnail(
    autoGenerateThumbnail ? fileUrl : null,
    {
      enabled: autoGenerateThumbnail,
      width: 192, // 48 * 4 (w-48 = 192px)
      height: 256, // 64 * 4 (h-64 = 256px)
      quality: 0.8,
      ...thumbnailOptions
    }
  )

  // Determina quale immagine mostrare
  const displayImage = generatedThumbnail || imgSrc

  // Stato di caricamento immagine (mostra spinner finché il browser non emette onLoad)
  const [imgLoading, setImgLoading] = useState<boolean>(false)
  useEffect(() => { setImgLoading(!!displayImage) }, [displayImage])

  // Se cambia la sorgente effettiva dell'immagine (server → client-side o viceversa),
  // rimuovi lo stato di errore per permettere un nuovo tentativo di render
  useEffect(() => { setImgError(false) }, [displayImage])

  // Log stato card rimosso per ridurre rumore

  // Fallback: se l'immagine fallisce (es. 404 sul server-thumb), genera la miniatura client-side
  useEffect(() => {
    if (!fileUrl) return
    if (!imgError) return
    if (generatedThumbnail || thumbnailLoading) return
    try { generate() } catch { }
  }, [imgError, fileUrl, generatedThumbnail, thumbnailLoading, generate])
  return (
    <div
      className="relative group select-none rounded-md w-48"
      title={title}
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      onDoubleClick={(e) => { e.stopPropagation(); onPreview?.() }}
    >
      <div className={`relative w-48 h-64 border rounded-sm bg-white overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        {/* Header bar */}
        <div className={`absolute left-2 right-2 top-2 h-7 rounded text-white flex items-center gap-2 px-2 ${headerColorClass || 'bg-amber-500'}`}>
          {headerIcon ?? <FileText className="w-4 h-4" />}
          <div className="text-xs font-semibold truncate" title={title}>{title}</div>
          <div className="flex-1" />
        </div>
        {/* Label stato OCR sotto l'header, allineata a destra */}
        {(() => {
          // Usa prop esplicita se disponibile, altrimenti deduci da fileUrl o autoGenerateThumbnail
          const isPdf = isPdfProp !== undefined
            ? isPdfProp
            : (fileUrl || '').toLowerCase().endsWith('.pdf') || autoGenerateThumbnail

          // OCR in corso (0-99%)
          if (typeof ocrProgressPct === 'number' && ocrProgressPct < 100 && !ocrCancelling) {
            return (
              <div className="absolute right-2 top-9 z-10">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-600 text-white">
                  Trascrizione {ocrProgressPct}%
                </span>
              </div>
            )
          }

          // OCR completato (100% O ocrStatus === 'completed')
          // Controlla sia ocrProgressPct === 100 che transcribedPct >= 100 e ocrStatus === 'completed'
          const isCompleted =
            (typeof ocrProgressPct === 'number' && ocrProgressPct >= 100) ||
            (typeof transcribedPct === 'number' && transcribedPct >= 100) ||
            ocrStatus === 'completed'

          if (isCompleted) {
            return (
              <div className="absolute right-2 top-9 z-20">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-600 text-white shadow-sm font-medium">
                  Trascritto!
                </span>
              </div>
            )
          }

          // OCR parziale/interrotto (1-99%)
          if (typeof transcribedPct === 'number' && transcribedPct > 0 && transcribedPct < 100) {
            return (
              <div className="absolute right-2 top-9 z-10">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-600 text-white">
                  Trascritto {transcribedPct}%
                </span>
              </div>
            )
          }

          // PDF scansione senza OCR - "Da trascrivere" (SOLO se è stato verificato che NON ha testo nativo)
          // IMPORTANTE: hasNativeText deve essere STRICTTAMENTE false (non undefined, non null)
          const shouldShowDaTrascrivere = isPdf && hasNativeText === false && ocrStatus !== 'completed' && !transcribedPct && !ocrProgressPct

          // Log solo se hasNativeText è true ma dovremmo mostrare "Da trascrivere" (caso problematico)
          if (isPdf && hasNativeText === true && shouldShowDaTrascrivere) {
            console.warn('[THUMBCARD][LABEL][UNEXPECTED]', {
              title,
              hasNativeText,
              shouldShowDaTrascrivere,
              ocrStatus
            })
          }

          if (shouldShowDaTrascrivere) {
            return (
              <div className="absolute right-2 top-9 z-20">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500 text-white shadow-sm">
                  Da trascrivere
                </span>
              </div>
            )
          }

          return null
        })()}
        {/* Body: image or excerpt */}
        <div className="absolute inset-0 pt-10 pb-8 px-2 flex flex-col items-stretch justify-start overflow-hidden z-0">
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
                    onClick={(e) => { e.stopPropagation(); onShow() }}
                  >Mostra</button>
                )}
              </div>
            </div>
          )}
          {!imgError && displayImage ? (
            <div className="flex-1 flex items-center justify-center">
              <img
                src={displayImage}
                alt={title}
                className="max-w-full max-h-full object-contain"
                onError={() => { setImgError(true); setImgLoading(false) }}
                onLoad={() => { setImgError(false); setImgLoading(false) }}
              />
            </div>
          ) : thumbnailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-[10px] text-neutral-600">Generando miniatura...</div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] leading-snug text-neutral-800 w-full line-clamp-6">{excerpt || ' '}</div>
          )}
        </div>
        {(!ocrCancelling &&
          typeof ocrProgressPct === 'number' &&
          ocrProgressPct < 100 &&
          !(typeof transcribedPct === 'number' && transcribedPct >= 100) &&
          ocrStatus !== 'completed'
        ) && (
            <OcrProgressOverlay
              progressPct={ocrProgressPct}
              etaText={ocrEtaText ?? null}
              statusText={ocrStatusText ?? null}
              onCancel={onOcrCancel ?? null}
              cancelling={false}
            />
          )}
      </div>
      {/* Hover actions - centered */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition">
        <div className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/90 backdrop-blur-sm shadow px-2 py-1 rounded">
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
          {!hasNativeText && (
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOcr?.() }}
              aria-label="OCR"
              title="Esegui OCR"
            >
              <ScanText className="w-4 h-4" />
            </button>
          )}
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


