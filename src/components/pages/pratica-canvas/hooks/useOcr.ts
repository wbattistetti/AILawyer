import { useState, useCallback } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Documento } from '../../../../types'
import { loadOcrState, saveOcrState, clearDoc, type OcrState } from '../../../../utils/ocrState'

export function useOcr(praticaId: string | undefined) {
  const { toast } = useToast()

  const [ocrProgressByDoc, setOcrProgressByDoc] = useState<Record<string, number>>({})
  const [ocrEtaByDoc, setOcrEtaByDoc] = useState<Record<string, string | null>>({})
  const [ocrStatusByDoc, setOcrStatusByDoc] = useState<Record<string, string | null>>({})
  const [ocrCancellingByDoc, setOcrCancellingByDoc] = useState<Record<string, boolean>>({})
  const [transcribedPctByDoc, setTranscribedPctByDoc] = useState<Record<string, number>>({})
  const [ocrJobByDoc, setOcrJobByDoc] = useState<Record<string, string>>({})

  const loadOcrStateFromStorage = useCallback(() => {
    if (!praticaId) return
    const st = loadOcrState(praticaId)
    setOcrProgressByDoc(st.progress || {})
    setOcrEtaByDoc(st.eta || {})
    setOcrStatusByDoc(st.status || {})
    setOcrCancellingByDoc(st.cancelled || {})
    setTranscribedPctByDoc({})
    setOcrJobByDoc({})
  }, [praticaId])

  const persistOcrState = useCallback(() => {
    if (!praticaId) return
    const st: OcrState = {
      progress: ocrProgressByDoc,
      eta: ocrEtaByDoc,
      status: ocrStatusByDoc,
      cancelled: ocrCancellingByDoc
    }
    saveOcrState(praticaId, st)
  }, [praticaId, ocrProgressByDoc, ocrEtaByDoc, ocrStatusByDoc, ocrCancellingByDoc])

  const handleOcr = useCallback(async (documento: Documento, mode: 'quick' | 'full' = 'full', limitPages?: number) => {
    if (!praticaId) return

    try {
      console.log('[OCR] queue request', documento.id, documento.filename)
      toast({ title: 'OCR avviato', description: documento.filename })

      const job = await api.queueOcr(documento.id, mode, limitPages)
      console.log('[OCR][queue-ok]', { docId: documento.id, jobId: job.id })

      setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: 0 }))
      setOcrJobByDoc(prev => ({ ...prev, [documento.id]: job.id }))
      setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: false }))

      let active = true
      const poll = async () => {
        if (!active) return
        try {
          const j = await api.getJob(job.id)
          console.log('[OCR] job', j.status, j.progress)

          const meta = (() => {
            try { return JSON.parse(j.result || '{}')?.meta || {} } catch { return {} }
          })()
          const elapsedMs = (() => {
            try { return JSON.parse(j.result || '{}')?.elapsedMs || 0 } catch { return 0 }
          })()

          const done = Number(meta.currentPage || 0)
          const total = Number(meta.totalPages || 0)
          const pctByMeta = total > 0 ? Math.floor((done / total) * 100) : Math.round((j.progress || 0))
          const percent = Math.max(0, Math.min(100, pctByMeta))

          const isCancelling = !!ocrCancellingByDoc[documento.id]
          const hasFrozen = typeof transcribedPctByDoc[documento.id] === 'number'

          if (!isCancelling && !hasFrozen) {
            setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: percent }))

            const phase = meta.phase || 'OCR'
            setOcrStatusByDoc(prev => ({
              ...prev,
              [documento.id]: (percent < 100)
                ? (done > 0 && total > 0 ? `${phase} pagina ${done} di ${total}…` : 'Preparazione…')
                : null
            }))

            let etaText: string | null = null
            if (done > 0 && total > done && percent < 100) {
              const avgPerPage = elapsedMs / done
              const remainingMs = Math.max(0, (total - done) * avgPerPage)
              const etaDate = new Date(Date.now() + remainingMs)
              const hh = String(etaDate.getHours()).padStart(2, '0')
              const mm = String(etaDate.getMinutes()).padStart(2, '0')
              const mins = Math.round(remainingMs / 60000)
              etaText = `Fine stimata: ${hh}:${mm} (≈${mins} min)`
            }
            setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: etaText }))
            persistOcrState()
          }

          if (j.status === 'cancelling') {
            setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: true }))
            console.log('[OCR][ui][cancelling]', { docId: documento.id })
          }

          const isSigtermFail = (j.status === 'failed') && /sigterm|killed|termination/i.test(String(j.error || ''))
          if (j.status === 'cancelled' || isSigtermFail) {
            active = false
            setTranscribedPctByDoc(prev => ({ ...prev, [documento.id]: percent }))
            setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: false }))
            setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrProgressByDoc(prev => {
              const { [documento.id]: _, ...rest } = prev
              return rest
            })
            console.log('[OCR][cancelled][ui]', { docId: documento.id, percent })
            return
          }

          if (j.status === 'completed' || j.status === 'failed') {
            active = false
            if (j.status === 'failed') {
              toast({ title: 'OCR fallito', description: j.error || 'Errore sconosciuto', variant: 'destructive' })
            } else {
              toast({ title: 'OCR completato', description: documento.filename })
              try {
                const refreshed = await api.getDocumento(documento.id)
                // Qui dovresti aggiornare il documento nell'elenco
              } catch (e) {
                console.warn('[OCR] soft refresh failed', e)
              }
            }

            setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: 100 }))
            setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
            persistOcrState()

            if (praticaId) clearDoc(praticaId, documento.id)

            setTimeout(() => {
              setOcrProgressByDoc(prev => {
                const { [documento.id]: _, ...rest } = prev
                return rest
              })
            }, 1500)
            return
          }
        } catch {}
        setTimeout(poll, 1000)
      }
      poll()

    } catch (error) {
      console.error('[OCR] queue error', error)
      toast({ title: 'Errore', description: 'Impossibile avviare OCR', variant: 'destructive' })
    }
  }, [praticaId, toast, ocrCancellingByDoc, transcribedPctByDoc, persistOcrState])

  const handleOcrCancel = useCallback(async (documento: Documento) => {
    const pct = Math.max(0, Math.min(100, Number(ocrProgressByDoc[documento.id] ?? 0)))
    setTranscribedPctByDoc(prev => ({ ...prev, [documento.id]: pct }))
    setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
    setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
    setOcrProgressByDoc(prev => {
      const { [documento.id]: _, ...rest } = prev
      return rest
    })
    setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: true }))
    
    const jid = ocrJobByDoc[documento.id]
    if (jid) {
      try { 
        await api.cancelJob(jid) 
      } catch (error) {
        console.error('[OCR] cancel error', error)
      }
    }
  }, [ocrProgressByDoc, ocrJobByDoc])

  return {
    ocrProgressByDoc,
    ocrEtaByDoc,
    ocrStatusByDoc,
    ocrCancellingByDoc,
    transcribedPctByDoc,
    ocrJobByDoc,
    loadOcrStateFromStorage,
    persistOcrState,
    handleOcr,
    handleOcrCancel,
    setOcrProgressByDoc,
    setOcrEtaByDoc,
    setOcrStatusByDoc,
    setOcrCancellingByDoc,
    setTranscribedPctByDoc,
    setOcrJobByDoc
  }
}