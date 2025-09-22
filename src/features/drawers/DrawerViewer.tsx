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
  const [items, setItems] = useState<Array<{ id:string; filename:string; s3Key:string; mime?:string; thumb?:string; tags?: string[] }>>([])
  const [uploadingCount, setUploadingCount] = useState<number>(0)
  useEffect(() => {
    const onDocs = (e: any) => {
      try {
        const arr = (e?.detail?.items || []) as Array<any>
        // Se il cassetto ha un titolo che identifica una collezione, filtra per tag corrispondente
        const key = (title || '').toLowerCase()
        let filtered = arr
        if (key.includes('verbale di sequestro')) filtered = arr.filter(x => (x.tags || []).includes('verbale_sequestro'))
        else if (key.includes('verbale di arresto')) filtered = arr.filter(x => (x.tags || []).includes('verbale_arresto'))
        else if (key.includes('elenco verbali redatti') || key.includes('verbali')) filtered = arr.filter(x => (x.tags || []).includes('verbale'))
        // default: nessun filtro
        setItems(filtered)
      } catch {}
    }
    const onUploading = (e: any) => {
      try {
        const t = e?.detail?.target
        if (t?.type === 'drawer' && t?.id === id) setUploadingCount(e?.detail?.count || 0)
      } catch {}
    }
    window.addEventListener('app:documents' as any, onDocs as any)
    window.addEventListener('app:uploading' as any, onUploading as any)
    try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch {}
    return () => {
      window.removeEventListener('app:documents' as any, onDocs as any)
      window.removeEventListener('app:uploading' as any, onUploading as any)
    }
  }, [])
  return (
    <DocumentCollection
      title={title}
      items={items}
      uploadingCount={uploadingCount}
      onOpen={() => {}}
      onRemove={(doc)=>{
        // Rimuovere solo dal cassetto: filtra localmente senza toccare l'Archivio
        setItems(prev => prev.filter(d => d.id !== doc.id))
      }}
      onDrop={(files) => {
        try {
          const ev = new CustomEvent('app:upload-files', { detail: { files, target: { type: 'drawer', id, title } } })
          window.dispatchEvent(ev)
        } catch {}
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


