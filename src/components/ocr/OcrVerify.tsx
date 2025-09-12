import React, { useMemo, useRef, useState } from 'react'
import { Documento, OcrLayoutPage } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface OcrVerifyProps {
  documento: Documento
  externalPage?: number
  onPageChange?: (page: number) => void
}

export function OcrVerify({ documento, externalPage, onPageChange }: OcrVerifyProps) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const pages = useMemo(() => (documento.ocrText ? (documento.ocrText.split('\f')) : ['']), [documento.ocrText])
  const [pageIndex, setPageIndex] = useState(0)
  // keep in sync with external page changes
  React.useEffect(() => {
    if (typeof externalPage === 'number' && externalPage - 1 !== pageIndex) {
      setPageIndex(Math.max(0, externalPage - 1))
    }
  }, [externalPage])
  const layout: OcrLayoutPage | undefined = useMemo(() => {
    const lay: any = (documento as any).ocrLayout
    if (!lay) return undefined
    const arr = Array.isArray(lay) ? lay : (()=>{ try{ return JSON.parse(lay as string) } catch { return undefined } })()
    if (!arr || !Array.isArray(arr)) return undefined
    return arr.find((p: any) => p?.page === pageIndex + 1) || arr[0]
  }, [documento, pageIndex])
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

  const handleSave = async () => {
    if (!textAreaRef.current) return
    setSaving(true)
    try {
      await api.updateDocumento(documento.id, { ocrText: textAreaRef.current.value })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar pagine */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">Pagina</span>
        <input type="number" className="w-16 border rounded px-2 py-1 text-sm" min={1} max={pages.length} value={pageIndex + 1} onChange={(e)=>{
          const v = Math.max(1, Math.min(pages.length, parseInt(e.target.value||'1',10)))
          setPageIndex(v-1)
          onPageChange?.(v)
        }} />
        <span className="text-xs text-muted-foreground">/ {pages.length}</span>
      </div>

      <textarea
        ref={textAreaRef}
        className="w-full flex-1 min-h-0 rounded-md border p-2 text-sm font-mono leading-5 resize-none"
        defaultValue={pages[pageIndex] || ''}
      />
      <div className="mt-2 flex items-center space-x-2">
        <Button size="sm" variant="outline" onClick={handleVerify}>
          Verify selezione
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio…' : 'Salva'}
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


