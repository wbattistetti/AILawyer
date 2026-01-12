import React, { useEffect, useState, useMemo } from 'react';
import { Comparto, Documento, UploadProgress } from '../../../../types';
import { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3';
import { DocumentCollection } from '../../../../features/documents/DocumentCollection';
import { api } from '../../../../lib/api';
import { colorFor, iconFor } from '../../../../features/drawers/drawerPalette';
import { RefreshCw } from 'lucide-react';
import { DragAndDropService } from '../../../../services/DragAndDropService';
import { useDocumentStore } from '../../../../stores/documentStore/store';

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
    dockV2Ref: React.RefObject<DockWorkspaceV3Handle | null>;
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
    pendingMoveConfirmations?: Map<string, any>; // ✅ Miniature ghost in attesa di conferma
    onConfirmMove?: (confirmation: any) => void; // ✅ Callback per conferma spostamento
    onCancelMove?: (confirmation: any) => void; // ✅ Callback per annullamento spostamento
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
    singleCompartoId, // ✅ Nuovo prop
    pendingMoveConfirmations,
    onConfirmMove,
    onCancelMove
}: ArchiveRendererProps) {
    const store = useDocumentStore()
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

    // ✅ SEMPLIFICATO: Non serve più listener per classificazioni pendenti
    // ✅ I documenti vengono creati SUBITO nello store quando viene fatto il drop

    // ✅ Nascondi header accordion se è singleCompartoId (modo drawer)
    const hideHeaders = !!singleCompartoId

    // Quiet: rimuovi log rumorosi

    const toggle = (id: string) => setOpenMap(m => ({ ...m, [id]: !m[id] }))

    const onDropFilesToComparto = (files: File[], compartoId: string) => {
        handleFileDrop(files, compartoId, { type: 'drawer', id: compartoId })
    }

    const onDropDocIdToComparto = async (docId: string, compartoId: string) => {
        try {
            // ✅ Usa il servizio centralizzato per spostare il documento
            await DragAndDropService.moveDocumentToComparto(docId, compartoId, {
                documenti,
                comparti,
                api,
                store
            })
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
            // ✅ Usa il servizio per verificare tipi supportati
            if (DragAndDropService.isExplorerFile(e) ||
                DragAndDropService.isDocId(e) ||
                DragAndDropService.isFiles(e)) {
                setIsDragging(true)
                if (filteredComparti.length === 1) {
                    setHoverBody(filteredComparti[0].id)
                }
            }
        },
        onDragOver: (e: React.DragEvent) => {
            // ✅ Usa il servizio centralizzato per gestire dragOver
            DragAndDropService.handleDragOver(e, [
                DragAndDropService.EXPLORER_FILE_TYPE,
                DragAndDropService.DOC_ID_TYPE,
                'Files'
            ])
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
            setIsDragging(false)

            console.log('[ARCHIVE-RENDERER][DROP][START] Drop ricevuto', {
                compartoId: filteredComparti[0]?.id,
                target: (e.target as HTMLElement)?.tagName,
                currentTarget: (e.currentTarget as HTMLElement)?.tagName,
                types: Array.from(e.dataTransfer?.types || [])
            })

            // ✅ CRITICO: Se è un drag Dockview, NON gestire - lascia che Dockview gestisca
            const { isDockviewDrag } = await import('../../../../utils/dragEventUtils')
            const isDockview = isDockviewDrag(e)
            console.log('[ARCHIVE-RENDERER][DROP] isDockviewDrag result:', isDockview)

            if (isDockview) {
                console.log('[ARCHIVE-RENDERER][DROP] ❌ Ignorato - è drag Dockview')
                return // Lascia che Dockview gestisca il drop del pannello
            }

            console.log('[ARCHIVE-RENDERER][DROP] ✅ Procedo con gestione drop')

            // ✅ CRITICO: Ferma la propagazione per evitare che DocumentCollection gestisca anche il drop
            e.stopPropagation()
            e.preventDefault()

            if (filteredComparti.length === 1) {
                const comparto = filteredComparti[0]
                setHoverBody(null)

                // ✅ Usa il servizio centralizzato per gestire il drop
                await DragAndDropService.handleDrop(e, comparto.id, {
                    onExplorerFile: (fileData) => {
                        console.log('[ARCHIVE-RENDERER][DROP] File Explorer rilevato, dispatching explorer:file-drop-to-drawer', {
                            compartoId: comparto.id,
                            compartoNome: comparto.nome,
                            fileData
                        })
                        const event = new CustomEvent('explorer:file-drop-to-drawer', {
                            detail: { fileData, drawerId: comparto.id }
                        })
                        window.dispatchEvent(event)
                        console.log('[ARCHIVE-RENDERER][DROP] Evento explorer:file-drop-to-drawer emesso con drawerId:', comparto.id)
                    },
                    onDocId: async (docId) => {
                        await onDropDocIdToComparto(docId, comparto.id)
                    },
                    onFiles: (files) => {
                        onDropFilesToComparto(files as any, comparto.id)
                    }
                })
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
                // ✅ SEMPLIFICATO: Mostra solo i documenti dallo store (già processati con hash)
                // ✅ Non creiamo più documenti "pending:" virtuali - quando viene fatto il drop,
                // ✅ il documento viene creato SUBITO nello store con hash, anche se senza thumbnail
                const docs = documenti.filter(d => d.compartoId === comparto.id)

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
                                    onDragEnter: (e: React.DragEvent) => {
                                        if (DragAndDropService.handleDragOver(e)) {
                                            setHoverBody(comparto.id)
                                        }
                                    },
                                    onDragOver: (e: React.DragEvent) => {
                                        DragAndDropService.handleDragOver(e)
                                    },
                                    onDragLeave: () => { setHoverBody(h => (h === comparto.id ? null : h)) },
                                    onDrop: async (e: React.DragEvent) => {
                                        setHoverBody(null)
                                        await DragAndDropService.handleDrop(e, comparto.id, {
                                            onExplorerFile: (fileData) => {
                                                const event = new CustomEvent('explorer:file-drop-to-drawer', {
                                                    detail: { fileData, drawerId: comparto.id }
                                                })
                                                window.dispatchEvent(event)
                                            },
                                            onDocId: async (docId) => {
                                                await onDropDocIdToComparto(docId, comparto.id)
                                            },
                                            onFiles: (files) => {
                                                onDropFilesToComparto(files as any, comparto.id)
                                            }
                                        })
                                    }
                                })}
                            >
                                <DocumentCollection
                                    items={(() => {
                                        // ✅ Prima tutti i documenti normali
                                        const docItems = docs.map(d => {
                                            const isPdf = d.mime?.startsWith('application/pdf') || d.filename.toLowerCase().endsWith('.pdf');

                                            // ✅ LOG DETTAGLIATO: Documento ricevuto da documenti array
                                            const isHashId = /^[0-9a-f]{64}$/i.test(d.id)
                                            console.log('🎨 [ARCHIVE-RENDERER][DOC-MAP][INPUT]', {
                                                docId: d.id.substring(0, 16) + '...',
                                                docIdLength: d.id.length,
                                                isHashId: isHashId,
                                                filename: d.filename,
                                                isPdf: isPdf,
                                                hasS3Key: !!d.s3Key,
                                                s3Key: d.s3Key || 'NULL',
                                                rawThumbnailDataUrl: !!(d as any).thumbnailDataUrl,
                                                rawThumbnailLength: (d as any).thumbnailDataUrl?.length || 0,
                                                rawThumbnailType: typeof (d as any).thumbnailDataUrl,
                                                rawThumbnailPreview: (d as any).thumbnailDataUrl?.substring(0, 50) || 'NULL',
                                                rawHash: !!(d as any).hash,
                                                rawHashLength: (d as any).hash?.length || 0,
                                                rawHashPreview: (d as any).hash?.substring(0, 16) + '...' || 'NULL'
                                            })

                                            // ✅ Usa solo thumbnailDataUrl dal DB (client-side generata) o clientThumbByS3 per temp docs
                                            // ❌ Rimossa generazione backend ridondante (server thumb)
                                            const thumbnailFromDb = (d as any).thumbnailDataUrl || undefined;
                                            const clientThumb = clientThumbByS3[d.s3Key];
                                            const thumb = thumbnailFromDb || clientThumb || '';
                                            const localUrl = (d as any).localUrl || undefined

                                            // ✅ LOG DETTAGLIATO: Dopo estrazione thumbnail
                                            console.log('🎨 [ARCHIVE-RENDERER][DOC-MAP][THUMB-EXTRACT]', {
                                                docId: d.id.substring(0, 16) + '...',
                                                filename: d.filename,
                                                thumbnailFromDb: !!thumbnailFromDb,
                                                thumbnailFromDbLength: thumbnailFromDb?.length || 0,
                                                thumbnailFromDbPreview: thumbnailFromDb?.substring(0, 50) || 'NULL',
                                                clientThumb: !!clientThumb,
                                                clientThumbLength: clientThumb?.length || 0,
                                                finalThumb: !!thumb,
                                                finalThumbLength: thumb?.length || 0,
                                                finalThumbPreview: thumb?.substring(0, 50) || 'NULL'
                                            })

                                            // ✅ NOVO: Se è un file virtuale PDF senza thumbnail, abilita auto-generazione
                                            const isPendingFile = d.id.startsWith('pending:')
                                            const shouldAutoGenerate = isPendingFile && isPdf && !thumb && !!localUrl

                                            const docItem = {
                                                id: d.id,
                                                filename: d.filename,
                                                s3Key: d.s3Key,
                                                mime: d.mime,
                                                thumb, // ✅ CRITICO: Passa thumbnail estratta
                                                localUrl,
                                                hasNativeText: d.hasNativeText, // NON convertire undefined in false!
                                                ocrStatus: d.ocrStatus,
                                                // ✅ NOVO: Passa flag per auto-generazione thumbnail
                                                autoGenerateThumbnail: shouldAutoGenerate
                                            }

                                            // ✅ LOG FINALE: Verifica che la thumbnail sia presente
                                            if (isHashId && isPdf && !thumb) {
                                                console.warn('⚠️ [ARCHIVE-RENDERER][MISSING-THUMB] Documento con hash senza thumbnail', {
                                                    docId: d.id.substring(0, 16) + '...',
                                                    filename: d.filename,
                                                    hasThumbnailDataUrl: !!thumbnailFromDb,
                                                    thumbnailDataUrlLength: thumbnailFromDb?.length || 0,
                                                    hasClientThumb: !!clientThumb,
                                                    clientThumbLength: clientThumb?.length || 0
                                                })
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

                                        // ✅ Rimosso ghost items: i documenti temporanei vengono creati SUBITO con miniatura
                                        // ✅ Non serve più il rettangolo punteggiato "Carico..."
                                        return docItems
                                    })()}
                                    onOpen={(doc) => {
                                        const trovato = documenti.find(x => x.id === doc.id);
                                        if (trovato) {
                                            dockV2Ref.current?.openDoc({ id: trovato.id, title: trovato.filename });
                                            toast({ title: 'Documento aperto', description: trovato.filename });
                                        }
                                    }}
                                    // onDrop gestito dal body dell'accordion per evitare doppi eventi
                                    onRemove={(doc) => {
                                        handleRemoveThumb(doc.id)
                                    }}
                                    onOcr={(doc) => {
                                        const d = documenti.find(x => x.id === doc.id);
                                        if (d) handleOcr(d, 'full');
                                    }}
                                    onOcrCancel={async (doc) => {
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
                                    onDragStartItem={(docId, e, dragElement) => {
                                        // ✅ Usa il servizio centralizzato per setup drag con drag image
                                        DragAndDropService.setupDocIdDragStart(e, docId, dragElement)
                                    }}
                                    compartoId={comparto.id}
                                    pendingMoveConfirmations={pendingMoveConfirmations}
                                    onConfirmMove={onConfirmMove}
                                    onCancelMove={onCancelMove}
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
