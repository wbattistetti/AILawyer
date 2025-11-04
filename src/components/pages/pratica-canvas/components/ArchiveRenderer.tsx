import React, { useEffect, useState, useMemo } from 'react';
import { Comparto, Documento, UploadProgress } from '../../../../types';
import { DockWorkspaceV2Handle } from '../../../DockWorkspaceV2';
import { DocumentCollection } from '../../../../features/documents/DocumentCollection';
import { api } from '../../../../lib/api';
import { colorFor, iconFor } from '../../../../features/drawers/drawerPalette';
import { RefreshCw } from 'lucide-react';

// Helper per convertire HEX in RGBA con alpha
function hexToRgba(hex: string, alpha = 0.1) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ArchiveRendererProps {
    documenti: Documento[];
    clientThumbByS3: Record<string, string>;
    dockV2Ref: React.RefObject<DockWorkspaceV2Handle | null>;
    handleFileDrop: (files: File[], compartoId?: string | null, target?: any) => Promise<void>;
    handleRemoveThumb: (docId: string) => void;
    handleOcr: (doc: Documento, mode?: 'quick' | 'full', limitPages?: number) => Promise<void>;
    handleOcrCancel: (doc: Documento) => Promise<void>;
    ocrProgressByDoc: Record<string, number>;
    ocrEtaByDoc: Record<string, string | null>;
    ocrStatusByDoc: Record<string, string | null>;
    ocrCancellingByDoc: Record<string, boolean>;
    transcribedPctByDoc: Record<string, number>;
    comparti: Comparto[];
    uploads?: UploadProgress[];
    toast: any;
    singleCompartoId?: string; // ✅ Se presente, mostra solo questo comparto (senza header accordion)
}

export function ArchiveRenderer({
    documenti,
    clientThumbByS3,
    dockV2Ref,
    handleFileDrop,
    handleRemoveThumb,
    handleOcr,
    handleOcrCancel,
    ocrProgressByDoc,
    ocrEtaByDoc,
    ocrStatusByDoc,
    ocrCancellingByDoc,
    transcribedPctByDoc,
    comparti,
    uploads,
    toast,
    singleCompartoId // ✅ Nuovo prop
}: ArchiveRendererProps) {
    const showOverlay = false;
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
    const [hoverHeader, setHoverHeader] = useState<string | null>(null)
    const [hoverBody, setHoverBody] = useState<string | null>(null)

    // ✅ Filtra comparti se singleCompartoId è presente (memoizzato per evitare re-render infiniti)
    const filteredComparti = useMemo(() => {
        return singleCompartoId
            ? comparti.filter(c => c.id === singleCompartoId)
            : comparti
    }, [comparti, singleCompartoId])

    // ✅ Apri automaticamente se c'è un solo comparto (modo drawer)
    useEffect(() => {
        if (filteredComparti.length === 1) {
            const compartoId = filteredComparti[0].id
            // Solo aggiorna se non è già aperto (evita loop infiniti)
            setOpenMap(prev => {
                if (prev[compartoId]) return prev // Già aperto, non cambiare
                return { [compartoId]: true }
            })
        }
    }, [filteredComparti])

    // ✅ Nascondi header accordion se è singleCompartoId (modo drawer)
    const hideHeaders = !!singleCompartoId

    // Quiet: rimuovi log rumorosi

    const toggle = (id: string) => setOpenMap(m => ({ ...m, [id]: !m[id] }))

    const onDropFilesToComparto = (files: File[], compartoId: string) => {
        handleFileDrop(files, compartoId, { type: 'drawer', id: compartoId })
    }

    const onDropDocIdToComparto = async (docId: string, compartoId: string) => {
        try {
            console.log('[MOVE][DOCUMENTO][ARCHIVE][START]', { docId, compartoId })
            await api.updateDocumento(docId, { compartoId })
            console.log('[MOVE][DOCUMENTO][ARCHIVE][SUCCESS]', { docId, compartoId })
            try {
                console.log('[MOVE][DOCUMENTO][ARCHIVE] Emetto app:request-documents per ricaricare')
                window.dispatchEvent(new CustomEvent('app:request-documents'))
            } catch { }
        } catch (e) {
            console.error('[MOVE][DOCUMENTO][ARCHIVE][ERROR]', { docId, compartoId, error: e })
        }
    }

    const headerProps = (comparto: Comparto) => {
        const color = colorFor(comparto.nome)
        const Icon = iconFor(comparto.nome)
        return {
            className: `px-3 py-2 flex items-center justify-between cursor-pointer transition-colors`,
            style: {
                background: hoverHeader === comparto.id ? hexToRgba(color, 0.24) : hexToRgba(color, 0.14),
                borderLeft: `4px solid ${color}`,
            },
            onClick: () => toggle(comparto.id),
            onDragEnter: (e: React.DragEvent) => {
                e.preventDefault()
                setHoverHeader(comparto.id) // solo highlight; niente auto-expand
            },
            onDragLeave: () => { setHoverHeader(h => (h === comparto.id ? null : h)) },
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
            onDrop: async (e: React.DragEvent) => {
                e.preventDefault()
                setHoverHeader(null)
                const docId = e.dataTransfer.getData('application/x-doc-id')
                if (docId) {
                    await onDropDocIdToComparto(docId, comparto.id)
                    setOpenMap(m => ({ ...m, [comparto.id]: true })) // apri dopo drop
                    return
                }
                const files = Array.from(e.dataTransfer.files || [])
                if (files.length) {
                    onDropFilesToComparto(files as any, comparto.id)
                    setOpenMap(m => ({ ...m, [comparto.id]: true })) // apri dopo drop
                }
            },
        }
    }

    // ✅ In modalità drawer (singleCompartoId), gestisci drop sull'intero container
    const [isDragging, setIsDragging] = useState(false)
    const drawerDropHandlers = hideHeaders ? {
        onDragEnter: (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-doc-id')) {
                setIsDragging(true)
                if (filteredComparti.length === 1) {
                    setHoverBody(filteredComparti[0].id)
                }
            }
        },
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-doc-id')) {
                e.dataTransfer.dropEffect = 'copy'
            }
        },
        onDragLeave: (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            // Solo se lasciamo completamente il container
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragging(false)
                if (filteredComparti.length === 1) {
                    setHoverBody(null)
                }
            }
        },
        onDrop: async (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)
            if (filteredComparti.length === 1) {
                const comparto = filteredComparti[0]
                setHoverBody(null)
                const docId = e.dataTransfer.getData('application/x-doc-id')
                if (docId) {
                    await onDropDocIdToComparto(docId, comparto.id)
                    return
                }
                const files = Array.from(e.dataTransfer.files || [])
                if (files.length) {
                    onDropFilesToComparto(files as any, comparto.id)
                }
            }
        }
    } : {}

    return (
        <div
            className={`relative w-full h-full overflow-auto ${hideHeaders ? 'p-0' : 'space-y-2 p-2'} ${hideHeaders && isDragging ? 'border-2 border-dashed border-blue-400 bg-blue-50/50' : ''}`}
            data-component="archive-renderer"
            {...drawerDropHandlers}
            style={hideHeaders && hoverBody && !isDragging ? {
                background: hexToRgba(colorFor(filteredComparti[0]?.nome || ''), 0.06)
            } : undefined}
        >
            {filteredComparti.sort((a, b) => a.ordine - b.ordine).map(comparto => {
                // Filtra documenti del comparto
                const rawDocs = documenti.filter(d => d.compartoId === comparto.id)

                // ✅ LOGICA SEMPLIFICATA: Mantieni il documento temporaneo visibile finché non c'è un documento reale
                // ✅ effettivamente presente nello stesso array che lo sostituisce
                const seenIds = new Set<string>()
                const docs = rawDocs.filter(d => {
                    const isTemp = d.id.startsWith('temp:')

                    // ✅ Deduplica per ID (ogni documento deve avere un ID univoco)
                    if (seenIds.has(d.id)) {
                        return false // ID già visto, escludi
                    }
                    seenIds.add(d.id)

                    // ✅ Se è un documento temporaneo, verifica se esiste un documento REALE nello stesso array
                    // ✅ con lo stesso s3Key. Solo in quel caso escludi il temporaneo.
                    if (isTemp && d.s3Key) {
                        const realDocWithSameS3Key = rawDocs.find(rd =>
                            !rd.id.startsWith('temp:') &&
                            rd.s3Key === d.s3Key &&
                            rd.id !== d.id // Deve essere un documento diverso
                        )

                        if (realDocWithSameS3Key) {
                            // ✅ Log solo quando viene escluso (situazione critica)
                            console.log('❌ [ARCHIVE-RENDERER][TEMP-EXCLUDED] Escluso documento temporaneo', {
                                compartoId: comparto.id,
                                tempId: d.id,
                                tempFilename: d.filename,
                                realId: realDocWithSameS3Key.id,
                                realFilename: realDocWithSameS3Key.filename
                            })
                            return false
                        }
                    }

                    return true
                })

                return (
                    <div key={comparto.id} className={hideHeaders ? "" : "border rounded-md overflow-hidden"}>
                        {!hideHeaders && (
                            <div {...headerProps(comparto)}>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-sm" style={{ background: colorFor(comparto.nome), color: '#fff' }}>
                                        {(() => { const I: any = iconFor(comparto.nome); return <I size={32} /> })()}
                                    </span>
                                    <div className="font-medium text-[1.05rem]">{comparto.nome} ({docs.length})</div>
                                </div>
                                <div className="text-sm text-neutral-500">{openMap[comparto.id] ? '▾' : '▸'}</div>
                            </div>
                        )}
                        {(hideHeaders || openMap[comparto.id]) && (
                            <div
                                className={hideHeaders ? "" : "bg-white"}
                                style={hideHeaders ? {} : { background: hoverBody === comparto.id ? hexToRgba(colorFor(comparto.nome), 0.06) : undefined }}
                                // ✅ In modalità drawer (hideHeaders), i drop sono gestiti dal container padre
                                // ✅ In modalità archivio normale, gestisci drop qui
                                {...(hideHeaders ? {} : {
                                    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setHoverBody(comparto.id) },
                                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
                                    onDragLeave: () => { setHoverBody(h => (h === comparto.id ? null : h)) },
                                    onDrop: async (e: React.DragEvent) => {
                                        e.preventDefault();
                                        setHoverBody(null)
                                        const docId = e.dataTransfer.getData('application/x-doc-id')
                                        if (docId) { await onDropDocIdToComparto(docId, comparto.id); return }
                                        const files = Array.from(e.dataTransfer.files || [])
                                        if (files.length) { onDropFilesToComparto(files as any, comparto.id) }
                                    }
                                })}
                            >
                                <DocumentCollection
                                    items={(() => {
                                        // ✅ Prima tutti i documenti normali
                                        const docItems = docs.map(d => {
                                            const isPdf = d.mime?.startsWith('application/pdf') || d.filename.toLowerCase().endsWith('.pdf');
                                            // ✅ Usa solo thumbnailDataUrl dal DB (client-side generata) o clientThumbByS3 per temp docs
                                            // ❌ Rimossa generazione backend ridondante (server thumb)
                                            const thumbnailFromDb = (d as any).thumbnailDataUrl || undefined;
                                            const clientThumb = clientThumbByS3[d.s3Key];
                                            const thumb = thumbnailFromDb || clientThumb || '';
                                            const localUrl = (d as any).localUrl || undefined
                                            const docItem = {
                                                id: d.id,
                                                filename: d.filename,
                                                s3Key: d.s3Key,
                                                mime: d.mime,
                                                thumb,
                                                localUrl,
                                                hasNativeText: d.hasNativeText, // NON convertire undefined in false!
                                                ocrStatus: d.ocrStatus
                                            }

                                            // Log solo se hasNativeText è undefined (non dovrebbe succedere dopo salvataggio)
                                            if (isPdf && docItem.hasNativeText === undefined && comparto.key === 'da_classificare') {
                                                console.warn('[ARCHIVE][LOAD][MISSING-HASNATIVETEXT]', {
                                                    filename: d.filename,
                                                    docId: d.id,
                                                    hasNativeText: docItem.hasNativeText
                                                })
                                            }

                                            return docItem
                                        })

                                        // ✅ Poi aggiungi i Ghost (upload placeholders) alla fine
                                        const allUploads = uploads || []
                                        const compartoColor = colorFor(comparto.nome)
                                        const ghostItems = allUploads
                                            .filter(u => {
                                                if (!u || u.compartoId !== comparto.id) return false
                                                if (u.status === 'error' || u.status === 'completed') return false
                                                if (u.hasTempDoc) return false
                                                // ✅ Escludi upload se esiste già un documento (temporaneo o reale) con lo stesso s3Key O stesso file name
                                                if (u.s3Key && documenti.some(d => d.s3Key === u.s3Key)) return false
                                                // ✅ Escludi anche se il documento temporaneo ha lo stesso filename nello stesso comparto
                                                if (u.file?.name && documenti.some(d =>
                                                    d.compartoId === comparto.id &&
                                                    d.filename === u.file.name &&
                                                    d.id.startsWith('temp:')
                                                )) return false
                                                return true
                                            })
                                            .map((u, idx) => ({
                                                id: `upload-ghost-${comparto.id}-${idx}`,
                                                filename: (u.filenameBase || u.file?.name || '').replace(/\.[^.]+$/, ''),
                                                s3Key: u.s3Key || '',
                                                mime: u.file?.type || '',
                                                thumb: u.preview || '',
                                                localUrl: undefined,
                                                hasNativeText: undefined,
                                                ocrStatus: 'pending' as const,
                                                _isUploadGhost: true, // ✅ Flag per distinguere il Ghost
                                                _uploadData: {
                                                    ...u,
                                                    compartoColor // ✅ Aggiungi colore del comparto
                                                }
                                            }))

                                        // ✅ Ritorna documenti + Ghost alla fine
                                        return [...docItems, ...ghostItems]
                                    })()}
                                    onOpen={(doc) => {
                                        // ✅ Ignora Ghost (non sono documenti reali)
                                        if ((doc as any)._isUploadGhost) return

                                        const trovato = documenti.find(x => x.id === doc.id);
                                        if (trovato) {
                                            dockV2Ref.current?.openDoc({ id: trovato.id, title: trovato.filename });
                                            toast({ title: 'Documento aperto', description: trovato.filename });
                                        }
                                    }}
                                    // onDrop gestito dal body dell'accordion per evitare doppi eventi
                                    onRemove={(doc) => {
                                        // ✅ Ignora Ghost (non sono documenti reali)
                                        if ((doc as any)._isUploadGhost) return
                                        handleRemoveThumb(doc.id)
                                    }}
                                    onOcr={(doc) => {
                                        // ✅ Ignora Ghost (non sono documenti reali)
                                        if ((doc as any)._isUploadGhost) return

                                        const d = documenti.find(x => x.id === doc.id);
                                        if (d) handleOcr(d, 'full');
                                    }}
                                    onOcrCancel={async (doc) => {
                                        // ✅ Ignora Ghost (non sono documenti reali)
                                        if ((doc as any)._isUploadGhost) return

                                        const d = documenti.find(x => x.id === doc.id);
                                        if (!d) return;
                                        await handleOcrCancel(d);
                                    }}
                                    progressById={(() => {
                                      try {
                                        const docIds = rawDocs.map(d => d.id)
                                        const progressKeys = Object.keys(ocrProgressByDoc || {})
                                        const matches = progressKeys.filter(key => docIds.includes(key))
                                        // Log disabled (too noisy)
                                      } catch {}
                                      return ocrProgressByDoc as any
                                    })()}
                                    etaById={ocrEtaByDoc as any}
                                    statusById={ocrStatusByDoc as any}
                                    cancellingById={ocrCancellingByDoc as any}
                                    transcribedPctById={transcribedPctByDoc as any}
                                    uploadingCount={0}
                                    draggableItems
                                    onDragStartItem={(docId, e) => {
                                        e.dataTransfer.setData('application/x-doc-id', docId)
                                        e.dataTransfer.effectAllowed = 'move'
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )
            })}
            {showOverlay && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
                    <RefreshCw className="w-7 h-7 animate-spin text-blue-700 mb-2" />
                    <div className="text-sm text-neutral-800">
                        Caricamento file...
                    </div>
                </div>
            )}
        </div>
    );
}
