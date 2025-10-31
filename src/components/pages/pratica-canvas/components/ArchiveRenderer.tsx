import React, { useEffect, useState } from 'react';
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
    toast
}: ArchiveRendererProps) {
    const showOverlay = false;
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
    const [hoverHeader, setHoverHeader] = useState<string | null>(null)
    const [hoverBody, setHoverBody] = useState<string | null>(null)

    // Quiet: rimuovi log rumorosi

    const toggle = (id: string) => setOpenMap(m => ({ ...m, [id]: !m[id] }))

    const onDropFilesToComparto = (files: File[], compartoId: string) => {
        handleFileDrop(files, compartoId, { type: 'drawer', id: compartoId })
    }

    const onDropDocIdToComparto = async (docId: string, compartoId: string) => {
        try {
            console.info('🔀 [AR] move doc to comparto', { docId, compartoId })
            await api.updateDocumento(docId, { compartoId })
            try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }
        } catch (e) {
            console.error('move document failed', e)
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

    return (
        <div className="relative w-full h-full overflow-auto space-y-2 p-2" data-component="archive-renderer">
            {(comparti || []).sort((a, b) => a.ordine - b.ordine).map(comparto => {
                // Filtra documenti del comparto e deduplica per s3Key per evitare doppioni temporanei
                const rawDocs = documenti.filter(d => d.compartoId === comparto.id)
                const seen = new Set<string>()
                const docs = rawDocs.filter(d => {
                    const key = d.s3Key || d.id
                    if (seen.has(key)) return false
                    seen.add(key)
                    return true
                })
                // Log rimosso per ridurre rumore
                return (
                    <div key={comparto.id} className="border rounded-md overflow-hidden">
                        <div {...headerProps(comparto)}>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-sm" style={{ background: colorFor(comparto.nome), color: '#fff' }}>
                                    {(() => { const I: any = iconFor(comparto.nome); return <I size={32} /> })()}
                                </span>
                                <div className="font-medium text-[1.05rem]">{comparto.nome} ({docs.length})</div>
                            </div>
                            <div className="text-sm text-neutral-500">{openMap[comparto.id] ? '▾' : '▸'}</div>
                        </div>
                        {openMap[comparto.id] && (
                            <div
                                className="bg-white"
                                style={{ background: hoverBody === comparto.id ? hexToRgba(colorFor(comparto.nome), 0.06) : undefined }}
                                onDragEnter={(e) => { e.preventDefault(); setHoverBody(comparto.id) }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                                onDragLeave={() => { setHoverBody(h => (h === comparto.id ? null : h)) }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    setHoverBody(null)
                                    const docId = e.dataTransfer.getData('application/x-doc-id')
                                    if (docId) { await onDropDocIdToComparto(docId, comparto.id); return }
                                    const files = Array.from(e.dataTransfer.files || [])
                                    if (files.length) { onDropFilesToComparto(files as any, comparto.id) }
                                }}
                            >
                                <DocumentCollection
                                    extraNodesTop={(() => {
                                        const ups = (uploads || []).filter(u => {
                                            if (!u || u.compartoId !== comparto.id) return false
                                            if (u.status === 'error' || u.status === 'completed') return false
                                            if (u.hasTempDoc) return false
                                            if (u.s3Key && documenti.some(d => d.s3Key === u.s3Key)) return false
                                            return true
                                        })
                                        if (ups.length === 0) return null
                                        return ups.map((u, idx) => {
                                            const color = colorFor(comparto.nome)
                                            const dashedStyle = { borderColor: color }
                                            const name = (u.filenameBase || u.file?.name || '').replace(/\.[^.]+$/, '')
                                            return (
                                                <div key={`upload-ph-${comparto.id}-${idx}`} className="relative w-full min-w-[12rem] aspect-[3/4] border-2 border-dashed rounded-md flex items-center justify-center overflow-hidden" style={dashedStyle}>
                                                    {u.preview ? (
                                                        <img src={u.preview} alt={name} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                                                    ) : null}
                                                    <div className="relative z-10 flex flex-col items-center gap-2 p-2 text-center">
                                                        <span className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        <div className="text-xs font-medium">Carico…</div>
                                                        <div className="text-[11px] text-neutral-600 line-clamp-2">{name}</div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    })()}
                                    items={docs.map(d => {
                                        const isPdf = d.mime?.startsWith('application/pdf') || d.filename.toLowerCase().endsWith('.pdf');
                                        const ver = (d as any)?.updatedAt ? `?v=${encodeURIComponent((d as any).updatedAt as any)}` : '';
                                        const serverThumb = isPdf && d.hash ? `${api.getThumbUrl(d.hash)}${ver}` : '';
                                        const clientThumb = clientThumbByS3[d.s3Key];
                                        const thumb = clientThumb || serverThumb || '';
                                        const localUrl = (d as any).localUrl || undefined
                                        return {
                                            id: d.id,
                                            filename: d.filename,
                                            s3Key: d.s3Key,
                                            mime: d.mime,
                                            thumb,
                                            localUrl,
                                            hasNativeText: d.hasNativeText, // NON convertire undefined in false!
                                            ocrStatus: d.ocrStatus
                                        };
                                    })}
                                    onOpen={(doc) => {
                                        const trovato = documenti.find(x => x.id === doc.id);
                                        if (trovato) {
                                            dockV2Ref.current?.openDoc({ id: trovato.id, title: trovato.filename });
                                            toast({ title: 'Documento aperto', description: trovato.filename });
                                        }
                                    }}
                                    // onDrop gestito dal body dell'accordion per evitare doppi eventi
                                    onRemove={(doc) => { handleRemoveThumb(doc.id) }}
                                    onOcr={(doc) => {
                                        const d = documenti.find(x => x.id === doc.id);
                                        if (d) handleOcr(d, 'full');
                                    }}
                                    onOcrCancel={async (doc) => {
                                        const d = documenti.find(x => x.id === doc.id);
                                        if (!d) return;
                                        await handleOcrCancel(d);
                                    }}
                                    progressById={ocrProgressByDoc as any}
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
