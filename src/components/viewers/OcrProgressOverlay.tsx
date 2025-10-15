import React from 'react'

export interface OcrProgressProps {
  progressPct?: number | null
  etaText?: string | null
  statusText?: string | null
}

export const OcrProgressOverlay = React.memo(function OcrProgressOverlay({ progressPct, etaText, statusText }: OcrProgressProps) {
  if (typeof progressPct !== 'number') return null
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)))

  return (
    <div className="absolute inset-0 bg-white/65 backdrop-blur-[1px] flex flex-col items-center justify-end pb-2">
      {etaText && (
        <div className="mb-1 text-[11px] text-black/80">
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


