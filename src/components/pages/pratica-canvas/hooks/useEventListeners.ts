import { useEffect, RefObject } from 'react';
import { Documento } from '../../../../types';
import { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3';

interface UseEventListenersProps {
    documenti: Documento[];
    clientThumbByS3: Record<string, string>;
    dockV2Ref: RefObject<DockWorkspaceV3Handle | null>;
    handleFileDrop: (files: File[], compartoId?: string | null, target?: any) => Promise<void>;
}

export function useEventListeners({
    documenti,
    clientThumbByS3,
    dockV2Ref,
    handleFileDrop
}: UseEventListenersProps) {

    // Document broadcast and upload listeners
    useEffect(() => {
        const getTags = (d: Documento) => {
            const tags: string[] = []
            if (d.ocrPdfKey) tags.push('OCR')
            return tags
        }

        const onUpload = async (e: any) => {
            try {
                const files: File[] = e?.detail?.files || []
                const target = e?.detail?.target || null
                if (!files || files.length === 0) return
                await handleFileDrop(files, null, target)
            } catch { }
        }

        const broadcastDocs = () => {
            try {
                const items = documenti.map(d => {
                    // ✅ Usa solo thumbnailDataUrl dal DB (client-side generata) o clientThumbByS3 per temp docs
                    // ❌ Rimossa generazione backend ridondante (server thumb)
                    const thumbnailFromDb = (d as any).thumbnailDataUrl || undefined
                    const clientThumb = clientThumbByS3[d.s3Key]
                    const isPdf = (d.mime?.includes('pdf') || d.filename.toLowerCase().endsWith('.pdf'))
                    const mkFallbackThumb = (doc: Documento) => {
                        const label = doc.filename?.slice(0, 40) || 'Documento'
                        const bg = '#3b82f6'
                        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='360' viewBox='0 0 256 360'>
                <rect width='100%' height='100%' rx='12' ry='12' fill='white' stroke='${bg}' stroke-width='3'/>
                <rect x='24' y='24' width='208' height='36' rx='6' fill='${bg}'/>
                <text x='128' y='48' text-anchor='middle' font-family='Inter, Arial, sans-serif' font-size='16' fill='white'>Estratto</text>
                <text x='24' y='100' font-family='Inter, Arial, sans-serif' font-size='14' fill='#111'>${label}</text>
                <text x='24' y='330' font-family='Inter, Arial, sans-serif' font-size='12' fill='#6b7280'>${(doc.mime || '').split('/').pop()?.toUpperCase() || 'FILE'}</text>
              </svg>`
                        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
                    }
                    const thumb = thumbnailFromDb || clientThumb || (isPdf ? `/api/files/local/${d.s3Key}` : mkFallbackThumb(d))
                    const item = { id: d.id, filename: d.filename, s3Key: d.s3Key, mime: d.mime, thumb, tags: getTags(d), compartoId: d.compartoId }

                    // Log solo per documenti senza compartoId (per debug)
                    if (!d.compartoId && !d.id.startsWith('temp:')) {
                      console.warn('[BROADCAST][DOCUMENTO-SENZA-COMPARTO-ID]', {
                        id: d.id,
                        filename: d.filename,
                        s3Key: d.s3Key?.substring(0, 20)
                      })
                    }

                    return item
                })

                // Log rimosso (troppo rumoroso)
                // Include in-memory pending extracts as virtual items (if any)
                try {
                    const pendingRaw = (window as any).__pendingExtracts as Array<any> | undefined
                    const pending = Array.isArray(pendingRaw) ? pendingRaw : []
                    const all = [...pending, ...items]
                    window.dispatchEvent(new CustomEvent('app:documents', { detail: { items: all } }))
                } catch {
                    window.dispatchEvent(new CustomEvent('app:documents', { detail: { items } }))
                }
            } catch { }
        }

        const onRequestDocs = () => {
          console.log('[LOAD][DOCUMENTI][EVENT] app:request-documents ricevuto', {
            documentiCount: documenti.length
          })
          broadcastDocs()
        }
        const onUploading = (e: any) => {
            try {
                const t = e?.detail?.target
                const c = e?.detail?.count || 0
                // Archive uploading count disabled
            } catch { }
        }

        window.addEventListener('app:upload-files' as any, onUpload as any)
        window.addEventListener('app:request-documents' as any, onRequestDocs as any)
        window.addEventListener('app:uploading' as any, onUploading as any)

        // initial broadcast so drawers get the list immediately
        broadcastDocs()

        const onOpen = (e: any) => {
            try {
                const d = e?.detail || {}
                if (!d?.docId) return
                // If tmp doc, open temporary tab
                if (String(d.docId).startsWith('tmp:')) {
                    const title = d?.meta?.title || 'Estratto'
                    const text = d?.meta?.text || d?.meta?.content || ''
                    const source = d?.meta?.source
                    try { console.log('[OPEN][tmpdoc]', { id: d.docId, title, source }) } catch { }
                    dockV2Ref.current?.openTmpDoc({ id: d.docId, title, content: text, text, source })
                    return
                }
                const doc = documenti.find(x => x.id === d.docId)
                if (doc && dockV2Ref.current) {
                    dockV2Ref.current.openDoc({ id: doc.id, title: doc.filename })
                    const ev = new CustomEvent('app:goto-match', { detail: { docId: d.docId, match: d.match, q: d.q } })
                    try { console.log('[OPEN][persisted][goto-match][dispatch]', ev.detail) } catch { }
                    window.dispatchEvent(ev)
                }
            } catch { }
        }

        const onGotoSource = (e: any) => {
            try {
                const detail = e?.detail || {}
                try { console.log('[GOTO-SOURCE][recv]', detail) } catch { }
                const srcTitle: string | undefined = detail.title
                const srcDocId: string | undefined = detail.docId
                const page: number | undefined = detail.page
                const box = detail.box

                const doc = (srcDocId && documenti.find(x => x.id === srcDocId))
                    || (srcTitle && documenti.find(x => x.filename === srcTitle))
                    || documenti[0]

                if (doc && dockV2Ref.current) {
                    dockV2Ref.current.openDoc({ id: doc.id, title: doc.filename })

                    if (typeof page === 'number' || box) {
                        const match: any = { page: typeof page === 'number' ? Math.max(1, Math.floor(page)) : 1 }
                        if (box && typeof box.x0Pct === 'number') {
                            match.x0Pct = box.x0Pct; match.x1Pct = box.x1Pct; match.y0Pct = box.y0Pct; match.y1Pct = box.y1Pct
                        } else {
                            match.x0Pct = 0.05; match.x1Pct = 0.95; match.y0Pct = 0.1; match.y1Pct = 0.9
                        }

                        if (detail?.range && typeof detail.range.startPage === 'number') {
                            (match as any).range = detail.range
                        }

                        const dispatchGoto = () => {
                            const ev = new CustomEvent('app:goto-match', { detail: { docId: doc.id, match } })
                            try { console.log('[GOTO-MATCH][dispatch]', ev.detail) } catch { }
                            try { window.dispatchEvent(ev) } catch { }
                        }

                        const onReady = (re: any) => {
                            try {
                                if (re?.detail?.docId === doc.id) {
                                    window.removeEventListener('app:viewer-ready' as any, onReady as any)
                                    dispatchGoto()
                                }
                            } catch { }
                        }

                        try {
                            window.addEventListener('app:viewer-ready' as any, onReady as any, { once: true } as any)
                            setTimeout(() => {
                                try {
                                    window.removeEventListener('app:viewer-ready' as any, onReady as any)
                                    dispatchGoto()
                                } catch { }
                            }, 150)
                        } catch { dispatchGoto() }
                    }
                }
            } catch { }
        }

        window.addEventListener('app:open-doc', onOpen as any)
        window.addEventListener('app:goto-source', onGotoSource as any)

        return () => {
            window.removeEventListener('app:open-doc', onOpen as any)
            window.removeEventListener('app:goto-source', onGotoSource as any)
            window.removeEventListener('app:upload-files' as any, onUpload as any)
            window.removeEventListener('app:request-documents' as any, onRequestDocs as any)
            window.removeEventListener('app:uploading' as any, onUploading as any)
        }
    }, [documenti, clientThumbByS3, dockV2Ref])

    // ✅ Auto-switch to Archive rimosso - archivio sostituito dai cassetti in basso
    // ✅ Quando si trascina un file, viene gestito direttamente dal drop sui cassetti
}

