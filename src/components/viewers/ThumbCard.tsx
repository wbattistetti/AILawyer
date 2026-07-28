import React, { useEffect, useState } from 'react'
import { Eye, Trash, ScanText, FileText } from 'lucide-react'
import { useAutoThumbnail } from '../../hooks/useAutoThumbnail'
import { OcrProgressOverlay } from './OcrProgressOverlay'
import { formatPageCountLabel, normalizePageCount } from './common/utils/pageCountLabel'
import { getPdfPageCount } from './common/utils/pdfPageCount'

interface ThumbCardProps {
  title: string
  imgSrc: string
  headerIcon?: React.ReactNode
  headerColorClass?: string
  excerpt?: string
  metaDocLabel?: string
  metaPage?: number | string
  /** Totale pagine del file (footer miniatura); omesso sugli estratti */
  pageCount?: number | null
  onShow?: () => void
  selected?: boolean
  onSelect?: () => void
  onPreview?: () => void
  onPreviewOcr?: () => void
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
  pageCount: pageCountProp,
  onShow,
  selected,
  onSelect,
  onPreview,
  onPreviewOcr,
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
  const [fetchedPageCount, setFetchedPageCount] = useState<{ url: string; count: number } | null>(null)
  const [imgLoading, setImgLoading] = useState<boolean>(false)

  // Log solo quando hasNativeText cambia in modo inaspettato (per debug problema specifico)
  // Rimossi log verbosi per ridurre rumore

  // resetta errori immagine quando cambia la sorgente
  useEffect(() => { setImgError(false) }, [imgSrc])


  // Log OCR-DEBUG rimosso per ridurre rumore (mantenere solo se necessario per debug specifico)

  // Hook per generazione automatica miniature
  const { thumbnail: generatedThumbnail, pageCount: generatedPageCount, loading: thumbnailLoading, generate } = useAutoThumbnail(
    autoGenerateThumbnail ? fileUrl : null,
    {
      enabled: autoGenerateThumbnail,
      width: 192, // 48 * 4 (w-48 = 192px)
      height: 256, // 64 * 4 (h-64 = 256px)
      quality: 0.8,
      ...thumbnailOptions
    }
  )

  const isPdf = isPdfProp !== undefined
    ? isPdfProp
    : (fileUrl || '').toLowerCase().endsWith('.pdf') || autoGenerateThumbnail

  // Estratti: non mostrare totale pagine del file (usano già metaPage)
  const isExtractCard = Boolean(metaDocLabel)

  const fetchedForCurrentUrl =
    fileUrl && fetchedPageCount?.url === fileUrl ? fetchedPageCount.count : null

  const resolvedPageCount =
    normalizePageCount(pageCountProp) ??
    normalizePageCount(generatedPageCount) ??
    normalizePageCount(fetchedForCurrentUrl)

  // Se manca il conteggio e abbiamo un PDF, leggilo una volta (cache in getPdfPageCount)
  useEffect(() => {
    if (isExtractCard) return
    if (resolvedPageCount != null) return
    if (!isPdf || !fileUrl) return

    let cancelled = false
    const url = fileUrl
    getPdfPageCount(url)
      .then((n) => {
        if (!cancelled) setFetchedPageCount({ url, count: n })
      })
      .catch(() => {
        // Metadato opzionale: senza conteggio il footer resta nascosto
      })

    return () => { cancelled = true }
  }, [isExtractCard, resolvedPageCount, isPdf, fileUrl])

  // Determina quale immagine mostrare
  const displayImage = generatedThumbnail || imgSrc

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

  const isOcrCompleted =
    (typeof ocrProgressPct === 'number' && ocrProgressPct >= 100) ||
    (typeof transcribedPct === 'number' && transcribedPct >= 100) ||
    ocrStatus === 'completed'
  const canRunOcr = !hasNativeText && !isOcrCompleted

  return (
    <div
      className="relative group select-none rounded-md w-48"
      title={title}
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      onDoubleClick={(e) => { e.stopPropagation(); onPreview?.() }}
    >
      <div className={`relative w-48 h-64 border rounded-sm bg-background overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        {/* Header bar - altezza dinamica in base al contenuto */}
        <div className={`absolute left-2 right-2 top-2 rounded text-white flex items-center gap-2 px-2 py-1.5 min-h-[2rem] ${headerColorClass || 'bg-slate-500'}`}>
          {headerIcon ?? <FileText className="w-4 h-4 flex-shrink-0" />}
          <div className="text-xs font-semibold break-words leading-[1.5] flex-1 min-w-0" title={title}>{title}</div>
        </div>
        {/* Label stato OCR sotto l'header, allineata a destra */}
        {(() => {
          // OCR in corso (0-99%)
          if (typeof ocrProgressPct === 'number' && ocrProgressPct < 100 && !ocrCancelling) {
            return (
              <div className="absolute right-2 top-12 z-10">
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
              <div className="absolute right-2 top-12 z-20">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-600 text-white shadow-sm font-medium">
                  Trascritto!
                </span>
              </div>
            )
          }

          // OCR parziale/interrotto (1-99%)
          if (typeof transcribedPct === 'number' && transcribedPct > 0 && transcribedPct < 100) {
            return (
              <div className="absolute right-2 top-12 z-10">
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
              <div className="absolute right-2 top-12 z-20">
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500 text-white shadow-sm">
                  Da trascrivere
                </span>
              </div>
            )
          }

          return null
        })()}
        {/* Body: image or excerpt - padding top dinamico per accomodare header (calcolato dal contenuto) */}
        <div className="absolute inset-0 pt-12 pb-8 px-2 flex flex-col items-stretch justify-start overflow-hidden z-0">
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
        {(() => {
          const shouldShowOverlay = !ocrCancelling &&
            typeof ocrProgressPct === 'number' &&
            ocrProgressPct >= 0 &&
            ocrProgressPct < 100 &&
            !(typeof transcribedPct === 'number' && transcribedPct >= 100) &&
            ocrStatus !== 'completed'

          // Log rimosso (troppo rumoroso)
          // if (typeof ocrProgressPct === 'number' || ocrProgressPct !== undefined) {
          //   try {
          //     console.log('[THUMBCARD][OCR-OVERLAY]', { ... })
          //   } catch {}
          // }

          return shouldShowOverlay && (
            <OcrProgressOverlay
              progressPct={ocrProgressPct!}
              etaText={ocrEtaText ?? null}
              statusText={ocrStatusText ?? null}
              onCancel={onOcrCancel ?? null}
              cancelling={false}
            />
          )
        })()}
        {!isExtractCard && resolvedPageCount != null && (
          <div className="absolute left-0 right-0 bottom-0 z-10 flex h-6 items-center justify-center border-t border-neutral-200 bg-background/95">
            <span className="text-[10px] leading-none text-muted-foreground">
              {formatPageCountLabel(resolvedPageCount)}
            </span>
          </div>
        )}
      </div>
      {/* Hover actions - centered */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition">
        <div className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-sm border border-neutral-300 shadow-md px-2 py-1 rounded-md">
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreview?.() }}
            aria-label="Anteprima"
            title="Anteprima: apre il documento nel visualizzatore"
          >
            <Eye className="w-4 h-4" />
          </button>
          {hasOcr && (
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted relative"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreviewOcr?.() }}
              aria-label="Anteprima OCR"
              title="Anteprima OCR: apre la versione trascritta del documento"
            >
              <Eye className="w-4 h-4" />
              <span className="absolute -right-1 -top-1 text-[8px] bg-blue-500 text-white rounded px-0.5">OCR</span>
            </button>
          )}
          {canRunOcr && (
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOcr?.() }}
              aria-label="OCR"
              title="Trascrivi: avvia l'OCR per estrarre il testo dal documento scansionato"
            >
              <ScanText className="w-4 h-4" />
            </button>
          )}
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove?.() }}
            aria-label="Rimuovi"
            title="Elimina: rimuove il documento dalla pratica"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}


