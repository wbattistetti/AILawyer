import React from 'react';
import { Documento } from '../../../../types';
import { DockWorkspaceV2Handle } from '../../../DockWorkspaceV2';
import { DocumentCollection } from '../../../../features/documents/DocumentCollection';
import { api } from '../../../../lib/api';
import { RefreshCw } from 'lucide-react';

interface ArchiveRendererProps {
    documenti: Documento[];
    clientThumbByS3: Record<string, string>;
    dockV2Ref: React.RefObject<DockWorkspaceV2Handle | null>;
    handleFileDrop: (files: File[], compartmentId: string | null, target: string | null) => Promise<void>;
    handleRemoveThumb: (docId: string) => void;
    handleOcr: (doc: Documento, mode: string) => Promise<void>;
    handleOcrCancel: (doc: Documento) => Promise<void>;
    ocrProgressByDoc: Record<string, number>;
    ocrEtaByDoc: Record<string, number>;
    ocrStatusByDoc: Record<string, string>;
    ocrCancellingByDoc: Record<string, boolean>;
    transcribedPctByDoc: Record<string, number>;
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
    toast
}: ArchiveRendererProps) {
    const showOverlay = false;

    return (
        <div className="relative w-full h-full">
            <DocumentCollection
                title="Archivio"
                items={documenti.map(d => {
                    const isPdf = d.mime?.startsWith('application/pdf') || d.filename.toLowerCase().endsWith('.pdf');
                    const ver = (d as any)?.updatedAt ? `?v=${encodeURIComponent((d as any).updatedAt as any)}` : '';
                    const serverThumb = isPdf && d.hash ? `${api.getThumbUrl(d.hash)}${ver}` : '';
                    const clientThumb = clientThumbByS3[d.s3Key];
                    const thumb = clientThumb || serverThumb || '';
                    return {
                        id: d.id,
                        filename: d.filename,
                        s3Key: d.s3Key,
                        mime: d.mime,
                        thumb,
                        hasNativeText: d.hasNativeText ?? false,
                        ocrStatus: d.ocrStatus
                    };
                })}
                onOpen={(doc) => {
                    const trovato = documenti.find(x => x.id === doc.id);
                    if (trovato) {
                        dockV2Ref.current?.openDoc({ id: trovato.id, title: trovato.filename });
                        toast({ title: 'Aperto nel Tavolo', description: trovato.filename });
                    }
                }}
                onDrop={(files) => { handleFileDrop(files, null, { type: 'archive' }) }}
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
            />
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
