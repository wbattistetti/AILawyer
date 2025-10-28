import React, { useEffect, useState } from 'react'
import type { DrawerType } from './types'
import { DocumentCollection } from '../documents/DocumentCollection'
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
        // Se il cassetto ha un titolo che identifica una collezione, filtra per tag corrispondente
        const key = (title || '').toLowerCase()
        let filtered = arr
        if (key.includes('sequestro')) filtered = arr.filter(x => (x.tags || []).includes('verbale_sequestro'))
        else if (key.includes('arresto')) filtered = arr.filter(x => (x.tags || []).includes('verbale_arresto'))
        else if (key.includes('verbali') || key.includes('verbale')) filtered = arr.filter(x => (x.tags || []).includes('verbale'))
        else if (key.includes('intercett')) filtered = arr.filter(x => (x.tags || []).includes('intercettazioni'))
        else if (key.includes('reati')) filtered = arr.filter(x => (x.tags || []).includes('reati'))
        else if (key.includes('memoria difensiva')) {
          // Per memoria difensiva, carica le memorie invece dei documenti normali
          loadMemorieDifensive()
          return
        }
        // default: nessun filtro
        setItems(filtered)
      } catch { }
    }

    const onUploading = (e: any) => {
      try {
        const t = e?.detail?.target
        if (t?.type === 'drawer' && t?.id === id) setUploadingCount(e?.detail?.count || 0)
      } catch { }
    }

    window.addEventListener('app:documents' as any, onDocs as any)
    window.addEventListener('app:uploading' as any, onUploading as any)
    try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }

    return () => {
      window.removeEventListener('app:documents' as any, onDocs as any)
      window.removeEventListener('app:uploading' as any, onUploading as any)
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

      if (estrattiResponse.estratti.length > 0) {
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

export function DrawerViewer({ id, title, type }: { id: string; title: string; type?: DrawerType }) {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Niente header qui: titolo/icona saranno nella tab */}
      <div className="flex-1 overflow-auto">
        {type === 'DocumentCollection' ? (
          <DocumentCollectionView id={id} title={title} />
        ) : (
          <div className="p-3 text-sm text-muted-foreground">Viewer del cassetto generico</div>
        )}
      </div>
    </div>
  )
}

export default DrawerViewer


