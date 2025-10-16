import React from 'react'

export interface OcrProgressProps {
  progressPct?: number | null
  etaText?: string | null
  statusText?: string | null
  onCancel?: (() => void | Promise<void>) | null
  cancelling?: boolean
}

export const OcrProgressOverlay = React.memo(function OcrProgressOverlay({ progressPct, etaText, statusText, onCancel, cancelling }: OcrProgressProps) {
  if (typeof progressPct !== 'number') return null
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)))
  const canCancel = typeof onCancel === 'function' && pct < 100 && !cancelling
  try { console.log('[OCR][overlay]', { pct, cancelling, etaText, statusText }) } catch {}

  return (
    <div className="absolute inset-0 bg-white/65 backdrop-blur-[1px] flex flex-col items-center justify-end pb-2">
      {((etaText && !cancelling) || canCancel || cancelling) && (
        <div className="mb-1 text-[11px] text-black/80 flex items-center gap-2">
          {(!cancelling && etaText) && (
            <span>
              {(() => {
                const parts = String(etaText).split('(')
                if (parts.length > 1) {
                  return (
                    <span>
                      {parts[0]}
                      <span className="font-semibold">({parts.slice(1).join('(')}</span>
                    </span>
                  )
                }
                return <span className="font-semibold">{etaText}</span>
              })()}
            </span>
          )}
          {cancelling && (<span className="font-semibold">Sto interrompendo l’OCR…</span>)}
          {canCancel && (
            <button
              className="px-2 py-0.5 text-[10px] rounded border border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
              onClick={(e)=>{ e.stopPropagation(); try { console.log('[OCR][overlay][cancel-click]') } catch {}; onCancel?.() }}
              title="Interrompi OCR"
              aria-label="Interrompi OCR"
            >
              ×
            </button>
          )}
          {(!canCancel && cancelling) && (
            <button className="px-2 py-0.5 text-[10px] rounded border text-red-300 bg-red-50/60 cursor-not-allowed" disabled>×</button>
          )}
        </div>
      )}
      {statusText && (
        <div className="mb-1 text-[10px] text-black/70">{statusText}</div>
      )}
      <div className="w-32 h-2 bg-black/10 rounded overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-black/70 font-medium">{pct}%</div>
    </div>
  )
})


