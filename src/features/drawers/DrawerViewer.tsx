import React, { useEffect, useState, useRef } from 'react'
import type { DrawerType } from './types'
import { DocumentCollection } from '../documents/DocumentCollection'
import { ArchiveRenderer } from '../../components/pages/pratica-canvas/components/ArchiveRenderer'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash } from 'lucide-react'

function iconFor(title?: string) {
  const s = (title || '').toLowerCase()
  if (s.includes('verbale')) return <FileText size={24} className="text-amber-600" />
  if (s.includes('difens')) return <Gavel size={24} className="text-emerald-600" />
  if (s.includes('incontri') || s.includes('eventi')) return <Zap size={24} className="text-pink-600" />
  if (s.includes('intercett')) return <Hash size={24} className="text-pink-600" />
  if (s.includes('procura')) return <Landmark size={24} className="text-violet-600" />
  if (s.includes('ufficio pg')) return <Shield size={24} className="text-slate-700" />
  if (s.includes('contatti') || s.includes('telefon')) return <Phone size={24} className="text-blue-600" />
  if (s.includes('timeline') || s.includes('termini')) return <Clock size={24} className="text-slate-600" />
  if (s.includes('anagrafe') || s.includes('avvocati') || s.includes('elenco nomi')) return <Users size={24} className="text-blue-700" />
  if (s.includes('reati')) return <Boxes size={24} className="text-slate-700" />
  return <Boxes size={24} className="text-slate-600" />
}

function DocumentCollectionView({ id, title }: { id: string; title?: string }) {
  const [items, setItems] = useState<Array<{ id: string; filename: string; s3Key: string; mime?: string; thumb?: string; tags?: string[] }>>([])
  const [uploadingCount, setUploadingCount] = useState<number>(0)
  const [memorieDifensive, setMemorieDifensive] = useState<Array<any>>([])

  useEffect(() => {
    const onDocs = (e: any) => {
      try {
        const arr = (e?.detail?.items || []) as Array<any>

        console.log('[DRAWER-VIEWER][DOCS-RECEIVED]', {
          drawerId: id,
          drawerTitle: title,
          totalItemsRicevuti: arr.length,
          itemsConCompartoId: arr.filter((x: any) => x.compartoId).length,
          itemsSenzaCompartoId: arr.filter((x: any) => !x.compartoId && !x.id.startsWith('temp:')).length,
          itemsMatchingCompartoId: arr.filter((x: any) => x.compartoId === id).length,
          itemsSample: arr.slice(0, 5).map((x: any) => ({
            id: x.id,
            filename: x.filename,
            compartoId: x.compartoId,
            match: x.compartoId === id
          }))
        })

        // ✅ PRIMA: Filtra per compartoId se id è fornito e corrisponde a un compartoId
        let filtered = arr
        if (id) {
          // Se id è un compartoId valido, filtra i documenti per quel comparto
          filtered = arr.filter((x: any) => x.compartoId === id)

          console.log('[DRAWER-VIEWER][FILTER-BY-COMPARTO]', {
            drawerId: id,
            primaFiltro: arr.length,
            dopoFiltro: filtered.length,
            itemsFiltrati: filtered.map((x: any) => ({
              id: x.id,
              filename: x.filename,
              compartoId: x.compartoId
            }))
          })
        }

        // ✅ POI: Se il cassetto ha un titolo che identifica una collezione speciale, filtra per tag corrispondente
        const key = (title || '').toLowerCase()
        if (key.includes('sequestro')) filtered = filtered.filter(x => (x.tags || []).includes('verbale_sequestro'))
        else if (key.includes('arresto')) filtered = filtered.filter(x => (x.tags || []).includes('verbale_arresto'))
        else if (key.includes('verbali') || key.includes('verbale')) filtered = filtered.filter(x => (x.tags || []).includes('verbale'))
        else if (key.includes('intercett')) filtered = filtered.filter(x => (x.tags || []).includes('intercettazioni'))
        else if (key.includes('reati')) filtered = filtered.filter(x => (x.tags || []).includes('reati'))
        else if (key.includes('memoria difensiva')) {
          // Per memoria difensiva, carica le memorie invece dei documenti normali
          loadMemorieDifensive()
          return
        }

        console.log('[DRAWER-VIEWER][FINAL-ITEMS]', {
          drawerId: id,
          drawerTitle: title,
          finalItemsCount: filtered.length,
          finalItems: filtered.map((x: any) => ({
            id: x.id,
            filename: x.filename,
            compartoId: x.compartoId
          }))
        })

        setItems(filtered)
      } catch (e) {
        console.error('[DRAWER-VIEWER][ERROR]', { drawerId: id, error: e })
      }
    }

    const onUploading = (e: any) => {
      try {
        const t = e?.detail?.target
        if (t?.type === 'drawer' && t?.id === id) setUploadingCount(e?.detail?.count || 0)
      } catch { }
    }

    const onExtractAdded = (e: any) => {
      try {
        // Se siamo nel drawer "memoria difensiva", ricarica le memorie
        const key = (title || '').toLowerCase()
        if (key.includes('memoria difensiva')) {
          // Estratto aggiunto, ricarico memorie difensive
          loadMemorieDifensive()
        }
      } catch { }
    }

    window.addEventListener('app:documents' as any, onDocs as any)
    window.addEventListener('app:uploading' as any, onUploading as any)
    window.addEventListener('app:extract-added' as any, onExtractAdded as any)
    try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }

    return () => {
      window.removeEventListener('app:documents' as any, onDocs as any)
      window.removeEventListener('app:uploading' as any, onUploading as any)
      window.removeEventListener('app:extract-added' as any, onExtractAdded as any)
    }
  }, [title, id])

  // Carica memorie difensive solo se ci sono estratti
  const loadMemorieDifensive = async () => {
    try {
      // TODO: Ottenere praticaId dal contesto
      const praticaId = 'current-pratica' // Per ora hardcoded

      // Carica estratti per verificare se ce ne sono
      const { api } = await import('../../lib/api')
      const estrattiResponse = await api.getEstrattiByPratica(praticaId)

      // Controlla anche estratti temporanei in memoria
      const pendingExtracts = (window as any).__pendingExtracts || []
      const totalExtracts = estrattiResponse.estratti.length + pendingExtracts.length

      // Log estratti rimosso per ridurre rumore

      if (totalExtracts > 0) {
        // Carica memorie difensive
        const memorieResponse = await api.getMemorieDifensiveByPratica(praticaId)

        // Trasforma in formato compatibile con DocumentCollection
        const memorieAsDocuments = memorieResponse.memorie.map((memoria: any) => ({
          id: memoria.id,
          filename: memoria.title,
          s3Key: `memoria-${memoria.id}`,
          mime: 'application/memoria-difensiva',
          thumb: generateMemoriaThumbnail(memoria),
          tags: ['memoria_difensiva'],
          type: 'memoria-difensiva',
          memoria: memoria
        }))

        setMemorieDifensive(memorieAsDocuments)
      } else {
        setMemorieDifensive([])
      }
    } catch (error) {
      console.error('Errore nel caricamento memorie difensive:', error)
      setMemorieDifensive([])
    }
  }

  // Genera thumbnail per memoria difensiva
  const generateMemoriaThumbnail = (memoria: any) => {
    // Crea un SVG semplice per la miniatura
    const svg = `
      <svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="280" fill="#3b82f6" rx="8"/>
        <text x="100" y="50" text-anchor="middle" fill="white" font-family="Arial" font-size="24">🛡️</text>
        <text x="100" y="100" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">Memoria Difensiva</text>
        <text x="100" y="130" text-anchor="middle" fill="white" font-family="Arial" font-size="12">${memoria.title}</text>
        <rect x="20" y="160" width="160" height="100" fill="white" fill-opacity="0.2" rx="4"/>
        <text x="100" y="200" text-anchor="middle" fill="white" font-family="Arial" font-size="10">Documento strutturato</text>
        <text x="100" y="220" text-anchor="middle" fill="white" font-family="Arial" font-size="10">per la difesa</text>
      </svg>
    `
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }

  // Determina se mostrare memorie difensive o documenti normali
  const displayItems = (title || '').toLowerCase().includes('memoria difensiva')
    ? memorieDifensive
    : items

  return (
    <DocumentCollection
      title={title}
      items={displayItems}
      uploadingCount={uploadingCount}
      onOpen={(doc) => {
        try {
          // Se è una memoria difensiva, apri il compositore
          if (doc.type === 'memoria-difensiva') {
            window.dispatchEvent(new CustomEvent('app:open-memoria-difensiva', {
              detail: {
                memoriaId: doc.id,
                memoria: doc.memoria,
                praticaId: 'current-pratica' // TODO: ottenere dal contesto
              }
            }))
            return
          }

          // Se è un pending (tmp:) apriamo una vista JSON semplice; se è persistito, apriamo il documento
          if (doc.id && String(doc.id).startsWith('tmp:')) {
            const data = { id: doc.id, title: ((doc as any)?.meta?.title || doc.filename), text: (doc as any)?.meta?.text || '', content: (doc as any)?.meta?.content || '', source: (doc as any)?.meta?.source }
            window.dispatchEvent(new CustomEvent('app:open-doc', { detail: { docId: doc.id, meta: data } }))
          } else {
            window.dispatchEvent(new CustomEvent('app:open-doc', { detail: { docId: doc.id } }))
          }
        } catch { }
      }}
      onRemove={async (doc) => {
        try {
          // Se è una memoria difensiva
          if (doc.type === 'memoria-difensiva') {
            const { api } = await import('../../lib/api')
            await api.deleteMemoriaDifensiva(doc.id)
            setMemorieDifensive(prev => prev.filter(d => d.id !== doc.id))
            return
          }

          // Se è un estratto pending in memoria (id tmp:), rimuovilo dalla lista globale in-memory
          if (doc.id && String(doc.id).startsWith('tmp:')) {
            const pendingRaw = (window as any).__pendingExtracts as Array<any> | undefined
            const pending = Array.isArray(pendingRaw) ? pendingRaw : []
            const next = pending.filter(d => d.id !== doc.id)
              ; (window as any).__pendingExtracts = next
            try { window.dispatchEvent(new CustomEvent('app:documents', { detail: { items: next } })) } catch { }
          } else {
            // Persistito: prova a chiamare API delete (se disponibile)
            try { await (await import('../../lib/api')).api.deleteDocumento?.(doc.id as any) } catch { }
          }
        } catch { }
        // Aggiorna subito la vista del cassetto
        setItems(prev => prev.filter(d => d.id !== doc.id))
      }}
      onDrop={(files) => {
        try {
          const ev = new CustomEvent('app:upload-files', { detail: { files, target: { type: 'drawer', id, title } } })
          window.dispatchEvent(ev)
        } catch { }
      }}
    />
  )
}

export function DrawerViewer({
  id,
  title,
  type,
  number,
  icon,
  color
}: {
  id: string
  title: string
  type?: DrawerType
  number?: number
  icon?: React.ReactNode
  color?: string
}) {
  const [archiveData, setArchiveData] = useState<any>(null)
  // ✅ Usa un ref per tracciare l'ultimo snapshot dei dati per evitare aggiornamenti inutili
  const lastDataRef = useRef<string | null>(null)

    useEffect(() => {
      const syncData = () => {
        const data = (window as any).__archiveData

        // ✅ Verifica che i dati essenziali siano presenti prima di aggiornare
        if (!data || !Array.isArray(data.comparti) || typeof data.handleFileDrop !== 'function') {
          return // Skip se dati non validi
        }

        // ✅ Crea un hash dei dati critici per evitare aggiornamenti inutili
        const dataHash = JSON.stringify({
          documentiCount: data.documenti?.length || 0,
          uploadsCount: data.uploads?.length || 0,
          uploadsSummary: (data.uploads || []).map((u: any) => ({
            filename: u.file?.name || u.filenameBase,
            status: u.status,
            progress: u.progress,
            compartoId: u.compartoId
          })),
          documentiSummary: (data.documenti || []).slice(0, 10).map((d: any) => ({
            id: d.id,
            s3Key: d.s3Key,
            compartoId: d.compartoId
          })),
          // ✅ Includi ocrProgressByDoc per rilevare cambiamenti nello stato OCR
          ocrProgressByDoc: data.ocrProgressByDoc || {},
          ocrEtaByDoc: data.ocrEtaByDoc || {},
          ocrStatusByDoc: data.ocrStatusByDoc || {},
          transcribedPctByDoc: data.transcribedPctByDoc || {}
        })

        // ✅ Aggiorna solo se i dati sono realmente cambiati
        if (lastDataRef.current === dataHash) {
          return // Dati non cambiati, skip aggiornamento
        }

        lastDataRef.current = dataHash

        setArchiveData(data)
      }

    // Sincronizza immediatamente
    syncData()

    // ✅ Ascolta eventi di upload per sincronizzazione immediata
    const handleUploadEvent = (e?: Event) => {
      const detail = (e as CustomEvent)?.detail

      // ✅ Se l'evento contiene gli uploads aggiornati, aggiorna immediatamente lo stato locale
      if (detail?.uploads) {
        // ✅ Usa queueMicrotask per evitare warning React
        queueMicrotask(() => {
          const data = (window as any).__archiveData
          // ✅ Verifica che i dati essenziali siano presenti
          if (data && Array.isArray(data.comparti) && typeof data.handleFileDrop === 'function') {
            // Aggiorna solo uploads mantenendo il resto dei dati
            setArchiveData({
              ...data,
              uploads: detail.uploads
            })
          }
        })
        return // Skip syncData perché abbiamo già aggiornato
      }

      // Altrimenti, sincronizza normalmente (solo se necessario)
      setTimeout(syncData, 50)
    }

    // ✅ Handler specifico per aggiornamenti documenti
    const handleDocumentsUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail

      if (detail?.documenti) {
        // ✅ Usa queueMicrotask per evitare warning React
        queueMicrotask(() => {
          const data = (window as any).__archiveData

          // ✅ Verifica che i dati essenziali siano presenti
          if (data && Array.isArray(data.comparti) && typeof data.handleFileDrop === 'function') {
            setArchiveData({
              ...data,
              documenti: detail.documenti
            })
          }
        })
        return
      }
      setTimeout(syncData, 50)
    }

    // ✅ Ascolta eventi emessi da handleFileDrop e da PraticaCanvasPage
    window.addEventListener('app:uploading', handleUploadEvent)
    window.addEventListener('app:archive-data-updated', handleUploadEvent)
    window.addEventListener('app:documents-updated', handleDocumentsUpdate)

    // ✅ Sincronizza anche quando window.__archiveData viene aggiornato (es. quando cambia ocrProgressByDoc)
    // Usa un polling leggero solo per rilevare aggiornamenti di ocrProgressByDoc
    const intervalId = setInterval(() => {
      syncData()
    }, 500) // Controlla ogni 500ms

    return () => {
      window.removeEventListener('app:uploading', handleUploadEvent)
      window.removeEventListener('app:archive-data-updated', handleUploadEvent)
      window.removeEventListener('app:documents-updated', handleDocumentsUpdate)
      clearInterval(intervalId)
    }
  }, [id]) // ✅ Aggiunto id come dipendenza per ricreare listener se cambia drawer

  if (!archiveData) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Caricamento...</div>
        </div>
      </div>
    )
  }

  // ✅ Verifica che il comparto esista
  const comparto = archiveData.comparti?.find((c: any) => c.id === id)

  if (!comparto) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex-1 p-3 text-sm text-muted-foreground">Cassetto non trovato</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* ✅ FASE 1: Header rimosso - numero e icona ora sono nella tab strip */}
      {/* ✅ Usa ArchiveRenderer per questo singolo comparto */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ArchiveRenderer
          documenti={archiveData.documenti}
          clientThumbByS3={archiveData.clientThumbByS3}
          dockV2Ref={archiveData.dockV2Ref}
          handleFileDrop={archiveData.handleFileDrop}
          handleRemoveThumb={archiveData.handleRemoveThumb}
          handleOcr={archiveData.handleOcr}
          handleOcrCancel={archiveData.handleOcrCancel}
          ocrProgressByDoc={archiveData.ocrProgressByDoc}
          ocrEtaByDoc={archiveData.ocrEtaByDoc}
          ocrStatusByDoc={archiveData.ocrStatusByDoc}
          ocrCancellingByDoc={archiveData.ocrCancellingByDoc}
          transcribedPctByDoc={archiveData.transcribedPctByDoc}
          comparti={archiveData.comparti}
          uploads={archiveData.uploads}
          toast={archiveData.toast}
          singleCompartoId={id} // ✅ Mostra solo questo comparto!
        />
      </div>
    </div>
  )
}

export default DrawerViewer


