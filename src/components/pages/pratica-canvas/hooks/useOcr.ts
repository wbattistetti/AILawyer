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

      // Determina se è un file locale (non salvato nel database)
      const isLocal = documento.id.startsWith('temp:')

      let job: { id: string; status: string }

      // Se il documento ha un ID temporaneo (modalità locale), usa endpoint OCR locale
      if (isLocal) {
        console.log('[OCR] Documento locale, usando endpoint OCR locale...', {
          tempId: documento.id,
          s3Key: documento.s3Key,
          filename: documento.filename
        })

        // Verifica che il file sia stato salvato usando il sanitized key
        try {
          // Il backend usa sanitizeFileName, quindi dobbiamo usare lo stesso
          const sanitizedKey = documento.s3Key.replace(/[:<>"|?*\\]/g, '_')
          const fileCheckUrl = `http://localhost:3001/api/files/${encodeURIComponent(sanitizedKey)}`
          console.log('[OCR] Verificando file...', { originalKey: documento.s3Key, sanitizedKey, url: fileCheckUrl })

          const checkRes = await fetch(fileCheckUrl, { method: 'HEAD' })
          if (!checkRes.ok) {
            console.warn('[OCR] File non ancora disponibile', {
              s3Key: documento.s3Key,
              sanitizedKey,
              status: checkRes.status,
              statusText: checkRes.statusText
            })
            // Riprova dopo un breve delay
            await new Promise(resolve => setTimeout(resolve, 1000))
            const retryRes = await fetch(fileCheckUrl, { method: 'HEAD' })
            if (!retryRes.ok) {
              throw new Error(`File non trovato dopo retry: ${retryRes.status} ${retryRes.statusText}`)
            }
          } else {
            console.log('[OCR] File verificato e disponibile', { s3Key: documento.s3Key, sanitizedKey })
          }
        } catch (e: any) {
          const errorMsg = e?.message || String(e)
          console.error('[OCR] File check failed', { s3Key: documento.s3Key, error: errorMsg })
          toast({
            title: 'Errore OCR',
            description: `File non trovato: ${errorMsg}`,
            variant: 'destructive'
          })
          return
        }

        toast({ title: 'OCR avviato', description: documento.filename })

        // Usa il nuovo endpoint per file locali (senza database - tutto in memoria)
        try {
          const result = await api.queueOcrLocal({
            s3Key: documento.s3Key,
            filename: documento.filename,
            mime: documento.mime || '',
            mode,
            limitPages,
            praticaId,
            compartoId: documento.compartoId || undefined,
          })

          // Per file locali, usiamo s3Key come identificatore (non jobId)
          job = { id: documento.s3Key, status: result.status }
          console.log('[OCR][queue-local-ok]', {
            s3Key: documento.s3Key,
            result,
            docId: documento.id
          })
        } catch (e: any) {
          console.error('[OCR] queueOcrLocal failed', { s3Key: documento.s3Key, error: e?.message || e })
          toast({
            title: 'Errore OCR',
            description: e?.message || 'Errore nell\'avvio dell\'OCR',
            variant: 'destructive'
          })
          return
        }
      } else {
        // Documento nel database: usa endpoint normale (con Job nel DB)
        toast({ title: 'OCR avviato', description: documento.filename })
        const jobResult = await api.queueOcr(documento.id, mode, limitPages)
        job = jobResult
        console.log('[OCR][queue-ok]', { docId: documento.id, jobId: job.id })
      }

      // Aggiorna state con documento.id (funziona sia per locali che per DB)
      setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: 0 }))
      setOcrJobByDoc(prev => ({ ...prev, [documento.id]: job.id }))
      setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: false }))

      let active = true
      const poll = async () => {
        if (!active) return
        try {
          // Per file locali: usa endpoint in-memory, per DB: usa getJob
          let progress: { progress: number; status: string; result?: any; error?: string }
          if (isLocal) {
            progress = await api.getOcrProgressLocal(documento.s3Key)
          } else {
            const j = await api.getJob(job.id)
            progress = {
              progress: j.progress || 0,
              status: j.status,
              result: j.result ? (typeof j.result === 'string' ? JSON.parse(j.result) : j.result) : undefined,
              error: j.error || undefined
            }
          }

          console.log('[OCR] progress response', {
            status: progress.status,
            progress: progress.progress,
            result: progress.result,
            isLocal
          })

          const meta = progress.result?.meta || {}
          const elapsedMs = progress.result?.elapsedMs || 0

          const done = Number(meta.currentPage || 0)
          const total = Number(meta.totalPages || 0)

          // Per file locali: usa direttamente progress.progress se disponibile, altrimenti calcola da meta
          const percent = isLocal
            ? Math.max(0, Math.min(100, Math.round(progress.progress || 0)))
            : (total > 0 ? Math.floor((done / total) * 100) : Math.round(progress.progress || 0))

          console.log('[OCR] computed percent', {
            done,
            total,
            progressFromBackend: progress.progress,
            computedPercent: percent,
            meta
          })

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

          if (progress.status === 'cancelled' || progress.status === 'failed') {
            active = false
            if (progress.status === 'failed') {
              toast({ title: 'OCR fallito', description: progress.error || 'Errore sconosciuto', variant: 'destructive' })
            }
            setTranscribedPctByDoc(prev => ({ ...prev, [documento.id]: percent }))
            setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: false }))
            setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrProgressByDoc(prev => {
              const { [documento.id]: _, ...rest } = prev
              return rest
            })
            console.log('[OCR][cancelled/failed][ui]', { docId: documento.id, percent, isLocal })
            return
          }

          if (progress.status === 'completed') {
            active = false
            toast({ title: 'OCR completato', description: documento.filename })

            // Per file locali, il risultato è già in memoria nel backend
            // Se il documento viene salvato nel DB, il risultato OCR dovrebbe essere incluso
            if (!isLocal) {
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
        } catch (e: any) {
          console.error('[OCR] polling error', {
            docId: documento.id,
            s3Key: documento.s3Key,
            isLocal,
            error: e?.message || e
          })
          // Continua il polling anche in caso di errore
        }
        setTimeout(poll, 1000)
      }
      poll()

    } catch (error) {
      console.error('[OCR] queue error', error)
      toast({ title: 'Errore', description: 'Impossibile avviare OCR', variant: 'destructive' })
    }
  }, [praticaId, toast, ocrCancellingByDoc, transcribedPctByDoc, persistOcrState, ocrJobByDoc])

  const handleOcrCancel = useCallback(async (documento: Documento) => {
    const isLocal = documento.id.startsWith('temp:')
    const pct = Math.max(0, Math.min(100, Number(ocrProgressByDoc[documento.id] ?? 0)))
    setTranscribedPctByDoc(prev => ({ ...prev, [documento.id]: pct }))
    setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
    setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
    setOcrProgressByDoc(prev => {
      const { [documento.id]: _, ...rest } = prev
      return rest
    })
    setOcrCancellingByDoc(prev => ({ ...prev, [documento.id]: true }))

    // Per file locali: cancella tramite endpoint in-memory
    // Per file DB: cancella tramite endpoint normale
    try {
      if (isLocal) {
        await api.cancelOcrLocal(documento.s3Key)
        console.log('[OCR][cancel-local]', { s3Key: documento.s3Key })
      } else {
        const jobId = ocrJobByDoc[documento.id]
        if (jobId) {
          await api.cancelJob(jobId)
          console.log('[OCR][cancel]', { docId: documento.id, jobId })
        }
      }
    } catch (e: any) {
      console.warn('[OCR] cancel failed (soft)', e)
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