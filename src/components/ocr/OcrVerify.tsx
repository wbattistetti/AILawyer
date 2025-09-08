import React, { useMemo, useRef, useState } from 'react'
import { Documento, OcrLayoutPage } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface OcrVerifyProps {
  documento: Documento
}

export function OcrVerify({ documento }: OcrVerifyProps) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const layout: OcrLayoutPage | undefined = useMemo(() => documento.ocrLayout?.[0], [documento])
  const fileUrl = useMemo(() => api.getLocalFileUrl(documento.s3Key), [documento.s3Key])

  const handleVerify = async () => {
    if (!layout || !textAreaRef.current) return
    const selectionStart = textAreaRef.current.selectionStart
    const selectionEnd = textAreaRef.current.selectionEnd
    const selected = documento.ocrText?.slice(selectionStart, selectionEnd)?.trim()
    if (!selected) return

    // Trova le parole che compongono la selezione
    const selectedWords = layout.words.filter(w => selected.includes(w.text))
    if (selectedWords.length === 0) return

    const x0 = Math.min(...selectedWords.map(w => w.x0))
    const y0 = Math.min(...selectedWords.map(w => w.y0))
    const x1 = Math.max(...selectedWords.map(w => w.x1))
    const y1 = Math.max(...selectedWords.map(w => w.y1))

    // Crea un canvas temporaneo per ritaglio (richiede che il browser possa aprire il file)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scaleX = img.width / (layout.width || img.width)
      const scaleY = img.height / (layout.height || img.height)
      const cx = document.createElement('canvas')
      const cy = document.createElement('canvas')
      cx.width = (x1 - x0) * scaleX
      cx.height = (y1 - y0) * scaleY
      const ctx = cx.getContext('2d')!
      ctx.drawImage(
        img,
        x0 * scaleX,
        y0 * scaleY,
        (x1 - x0) * scaleX,
        (y1 - y0) * scaleY,
        0,
        0,
        (x1 - x0) * scaleX,
        (y1 - y0) * scaleY
      )
      setCropSrc(cx.toDataURL('image/png'))
      setOpen(true)
    }
    img.src = fileUrl
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textAreaRef}
        className="w-full h-40 rounded-md border p-2 text-sm"
        defaultValue={documento.ocrText || ''}
      />
      <div className="flex items-center space-x-2">
        <Button size="sm" variant="outline" onClick={handleVerify}>
          Verify selezione
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Porzione immagine</DialogTitle>
          </DialogHeader>
          {cropSrc && (
            <img src={cropSrc} alt="ritaglio" className="max-w-full max-h-[60vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


