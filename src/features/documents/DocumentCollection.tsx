import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ThumbCard } from '../../components/viewers/ThumbCard'
import { FileText, ScanText } from 'lucide-react'

type DocItem = {
  id: string
  filename: string
  s3Key: string
  mime?: string
  thumb?: string
  tags?: string[]
  localUrl?: string
  meta?: any
}

export function DocumentCollection({
  title,
  items,
  onOpen,
  onDrop,
  uploadingCount,
  onRemove,
}: {
  title?: string
  items: DocItem[]
  onOpen: (doc: DocItem) => void
  onDrop?: (files: File[]) => void
  uploadingCount?: number
  onRemove?: (doc: DocItem) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onDropCb = useCallback((accepted: File[]) => {
    onDrop?.(accepted)
  }, [onDrop])
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: onDropCb,
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  return (
    <div className="w-full h-full flex flex-col relative">
      {title && (
        <div className="px-3 py-2 text-sm font-medium border-b bg-white flex items-center">
          <div className="flex-1" />
          <button
            type="button"
            className="ml-2 px-3 py-1 text-xs rounded border bg-blue-600 text-white hover:bg-blue-700"
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); open() }}
          >Carica documento</button>
        </div>
      )}
      <div className="flex-1 overflow-auto" {...getRootProps({ onDragOver: (e: any) => { e.preventDefault() } })}>
        <input {...getInputProps()} />
        <div className={`grid [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] gap-6 items-start p-3 ${isDragActive ? 'bg-blue-50' : ''}`}>
      {items.map(doc => {
          const meta = (doc as any).meta || {}
          const isExtract = !!(meta && (meta.kind === 'EXTRACT' || meta.source))
          const headerIcon = isExtract ? <ScanText className="w-4 h-4" /> : <FileText className="w-4 h-4" />
          const titleText = meta.title || (doc.filename||'').replace(/\.json$/,'')
          const excerpt = (meta.text || meta.content || '').toString().slice(0, 220)
          const src = meta.source || {}
          return (
            <ThumbCard
              key={doc.id}
              title={isExtract ? titleText : doc.filename}
              imgSrc={isExtract ? '' : (doc.thumb || '')}
              headerIcon={isExtract ? headerIcon : undefined}
              headerColorClass={isExtract ? 'bg-emerald-400' : 'bg-amber-500'}
              excerpt={isExtract ? excerpt : undefined}
              metaDocLabel={isExtract ? (src.title || src.docId || '') : undefined}
              metaPage={isExtract ? (src.page || undefined) : undefined}
              onShow={isExtract ? (()=>{ try { window.dispatchEvent(new CustomEvent('app:goto-source', { detail: { docId: src.docId, title: src.title, page: src.page, box: (src.x0Pct!=null? { x0Pct: src.x0Pct, x1Pct: src.x1Pct, y0Pct: src.y0Pct, y1Pct: src.y1Pct }: undefined) } })) } catch {} }) : undefined}
              selected={selectedId === doc.id}
              onSelect={() => setSelectedId(doc.id)}
              onPreview={() => onOpen(doc)}
              onTable={() => onOpen(doc)}
              onRemove={() => onRemove?.(doc)}
            />
          )
        })}
        </div>
      </div>
      {typeof uploadingCount === 'number' && uploadingCount > 0 && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
          <span className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
          <div className="text-sm text-neutral-800">{uploadingCount === 1 ? 'Sto caricando il file…' : `Sto caricando i ${uploadingCount} file…`}</div>
        </div>
      )}
      <div className="p-2 text-xs text-muted-foreground border-t bg-white">Trascina qui i file per aggiungerli alla raccolta</div>
    </div>
  )
}

export default DocumentCollection








