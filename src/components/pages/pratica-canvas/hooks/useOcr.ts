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

      // Determina se è un file locale (modalità privacy)
      // Può essere: 1) documento temporaneo (temp:) o 2) documento salvato con s3Key "local:..."
      const isLocal = documento.id.startsWith('temp:') || documento.s3Key?.startsWith('local:')

      let job: { id: string; status: string }

      // Se è un file locale (modalità privacy), usa endpoint OCR locale e gestisci upload on-demand
      if (isLocal) {
        console.log('[OCR] Documento locale, usando endpoint OCR locale...', {
          tempId: documento.id,
          s3Key: documento.s3Key,
          filename: documento.filename
        })

        // UPLOAD ON-DEMAND: Verifica se il file è già in uploads/, altrimenti caricalo
        const sanitizedKey = documento.s3Key.replace(/[:<>"|?*\\]/g, '_')
        const fileCheckUrl = `http://localhost:3001/api/files/${encodeURIComponent(sanitizedKey)}`

        try {
          // Controlla se il file esiste già in uploads/
          const checkRes = await fetch(fileCheckUrl, { method: 'HEAD' })

          if (!checkRes.ok) {
            console.log('[OCR] File non in uploads/, faccio upload on-demand...', {
              s3Key: documento.s3Key,
              sanitizedKey,
              hasFilePath: !!documento.filePath
            })

            // Prova prima con filePath se disponibile (copia automatica dal disco locale)
            if (documento.filePath) {
              console.log('[OCR] FilePath disponibile, copio automaticamente dal disco locale...', {
                filePath: documento.filePath,
                s3Key: documento.s3Key
              })

              toast({
                title: 'Caricamento file...',
                description: 'Il file viene copiato automaticamente dal disco locale per l\'OCR'
              })

              try {
                const copyRes = await fetch('http://localhost:3001/api/filesystem/copy-for-ocr', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sourcePath: documento.filePath,
                    targetS3Key: documento.s3Key
                  })
                })

                if (!copyRes.ok) {
                  const errorData = await copyRes.json().catch(() => ({}))
                  throw new Error(errorData.error || `Failed to copy file: ${copyRes.statusText}`)
                }

                console.log('[OCR] File copiato automaticamente da filePath', {
                  filePath: documento.filePath,
                  s3Key: documento.s3Key
                })

                // Verifica che sia stato copiato
                await new Promise(resolve => setTimeout(resolve, 500))
                const verifyRes = await fetch(fileCheckUrl, { method: 'HEAD' })
                if (!verifyRes.ok) {
                  throw new Error(`File non disponibile dopo copia: ${verifyRes.status} ${verifyRes.statusText}`)
                }

                // Successo! Il file è ora in uploads/, procedi con OCR
                console.log('[OCR] File ora disponibile in uploads/, procedo con OCR')
              } catch (copyError: any) {
                console.error('[OCR] Errore nella copia automatica da filePath', {
                  error: copyError,
                  filePath: documento.filePath,
                  message: copyError?.message
                })

                // Fallback: se la copia fallisce (file spostato/cancellato), prova con _sourceFile
                console.log('[OCR] Copia da filePath fallita, provo fallback con _sourceFile...')

                const sourceFileFallback = (documento as any)._sourceFile
                if (!sourceFileFallback) {
                  toast({
                    title: 'File non disponibile',
                    description: `Il file non è più nella posizione originale e non è in memoria. Percorso originale: ${documento.filePath}`,
                    variant: 'destructive'
                  })
                  return
                }

                // Prosegui con upload da _sourceFile (fallback)
                console.log('[OCR] Usando _sourceFile come fallback...')

                toast({
                  title: 'Caricamento file...',
                  description: 'Il file viene caricato per l\'OCR (modalità privacy)'
                })

                const localUploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(documento.s3Key)}`
                await api.uploadFile(localUploadUrl, sourceFileFallback)

                console.log('[OCR] Upload on-demand completato (da _sourceFile fallback)', {
                  s3Key: documento.s3Key,
                  sanitizedKey
                })

                // Verifica che il file sia stato caricato correttamente
                await new Promise(resolve => setTimeout(resolve, 500))
                const verifyResFallback = await fetch(fileCheckUrl, { method: 'HEAD' })
                if (!verifyResFallback.ok) {
                  throw new Error(`File non disponibile dopo upload: ${verifyResFallback.status} ${verifyResFallback.statusText}`)
                }
              }
            } else {
              // filePath non disponibile: prova con _sourceFile
              const sourceFile = (documento as any)._sourceFile
              if (!sourceFile) {
                // File non disponibile in memoria e nessun filePath
                console.warn('[OCR] File non in memoria (dopo refresh?) e non in uploads/, e nessun filePath', {
                  s3Key: documento.s3Key,
                  docId: documento.id
                })

                toast({
                  title: 'File non disponibile',
                  description: 'In modalità privacy, il file deve essere ricaricato per l\'OCR. Trascina il documento di nuovo nell\'archivio.',
                  variant: 'destructive'
                })
                return
              }

              // Upload on-demand: carica il file ora (da _sourceFile)
              console.log('[OCR] Upload on-demand in corso (da _sourceFile)...', {
                filename: sourceFile.name,
                size: sourceFile.size,
                s3Key: documento.s3Key
              })

              toast({
                title: 'Caricamento file...',
                description: 'Il file viene caricato per l\'OCR (modalità privacy)'
              })

              const localUploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(documento.s3Key)}`
              await api.uploadFile(localUploadUrl, sourceFile)

              console.log('[OCR] Upload on-demand completato', {
                s3Key: documento.s3Key,
                sanitizedKey
              })

              // Verifica che il file sia stato caricato correttamente
              await new Promise(resolve => setTimeout(resolve, 500)) // Breve delay per assicurarsi che sia scritto
              const verifyRes = await fetch(fileCheckUrl, { method: 'HEAD' })
              if (!verifyRes.ok) {
                throw new Error(`File non disponibile dopo upload: ${verifyRes.status} ${verifyRes.statusText}`)
              }
            }

            console.log('[OCR] File verificato dopo upload on-demand', {
              s3Key: documento.s3Key,
              sanitizedKey
            })
          } else {
            console.log('[OCR] File già disponibile in uploads/', {
              s3Key: documento.s3Key,
              sanitizedKey
            })
          }
        } catch (e: any) {
          const errorMsg = e?.message || String(e)
          console.error('[OCR] Upload on-demand failed', {
            s3Key: documento.s3Key,
            error: errorMsg,
            hasSourceFile: !!(documento as any)._sourceFile
          })
          toast({
            title: 'Errore OCR',
            description: `Impossibile caricare il file: ${errorMsg}`,
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

            // Mantieni lo stato completato (100%) e salva come transcribedPct per persistenza
            setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: 100 }))
            setTranscribedPctByDoc(prev => ({ ...prev, [documento.id]: 100 }))
            setOcrEtaByDoc(prev => ({ ...prev, [documento.id]: null }))
            setOcrStatusByDoc(prev => ({ ...prev, [documento.id]: null }))
            persistOcrState()

            if (praticaId) clearDoc(praticaId, documento.id)

            // NON rimuovere il progresso dopo 1.5 secondi - mantieni lo stato "Trascritto!" visibile
            // La label "Trascritto!" verrà mostrata grazie a transcribedPct === 100 o ocrProgressPct === 100
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