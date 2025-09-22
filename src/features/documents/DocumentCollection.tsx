import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ThumbCard } from '../../components/viewers/ThumbCard'

type DocItem = {
  id: string
  filename: string
  s3Key: string
  mime?: string
  thumb?: string
  tags?: string[]
}

export function DocumentCollection({
  title,
  items,
  onOpen,
  onDrop,
  uploadingCount,
}: {
  title?: string
  items: DocItem[]
  onOpen: (doc: DocItem) => void
  onDrop?: (files: File[]) => void
  uploadingCount?: number
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onDropCb = useCallback((accepted: File[]) => {
    onDrop?.(accepted)
  }, [onDrop])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropCb,
    noClick: false,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  return (
    <div className="w-full h-full flex flex-col relative">
      {title && <div className="px-3 py-2 text-sm font-medium border-b bg-white">{title}</div>}
      <div className="flex-1 overflow-auto" {...getRootProps({ onDragOver: (e: any) => { e.preventDefault() } })}>
        <input {...getInputProps()} />
        <div className={`grid [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] gap-6 items-start p-3 ${isDragActive ? 'bg-blue-50' : ''}`}>
          {items.map(doc => (
            <ThumbCard
              key={doc.id}
              title={doc.filename}
              imgSrc={doc.thumb || ''}
              selected={selectedId === doc.id}
              onSelect={() => setSelectedId(doc.id)}
              onPreview={() => onOpen(doc)}
              onTable={() => onOpen(doc)}
            />
          ))}
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


