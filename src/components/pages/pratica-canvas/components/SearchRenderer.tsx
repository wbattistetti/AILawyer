import React from 'react';
import { Documento } from '../../../../types';
import { DockWorkspaceV2Handle } from '../../../DockWorkspaceV2';
import { SearchProvider } from '../../../search/SearchProvider';
import { SearchPanelTree } from '../../../search/SearchPanelTree';
import { api } from '../../../../lib/api';
import * as pdfjsLib from 'pdfjs-dist';

interface SearchRendererProps {
    documenti: Documento[];
    dockV2Ref: React.RefObject<DockWorkspaceV2Handle | null>;
    toast: any;
}

export function SearchRenderer({ documenti, dockV2Ref, toast }: SearchRendererProps) {
    return (
        <SearchProvider
            defaultScope={'archive'}
            registry={{
                getAllDocs: () => documenti.map(d => ({
                    id: d.id,
                    title: d.filename,
                    hash: d.hash || '',
                    pages: 0,
                    kind: (d.mime?.includes('word') ? 'word' : 'pdf')
                })),
                getOpenDocs: () => [],
                ensureDocOpen: async (docId: string) => {
                    const d = documenti.find(x => x.id === docId);
                    if (d) {
                        dockV2Ref.current?.openDoc({ id: d.id, title: d.filename });
                        toast({ title: 'Aperto nel Tavolo', description: d.filename });
                    };
                    return null;
                },
            }}
            onSearch={async (q, _scope) => {
                try {
                    const anyPdf: any = pdfjsLib as any;
                    if (anyPdf && anyPdf.GlobalWorkerOptions && !anyPdf.GlobalWorkerOptions.workerSrc) {
                        anyPdf.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js';
                    }
                } catch { }

                const targets = documenti.filter(d => (d.mime?.includes('pdf') || d.filename.toLowerCase().endsWith('.pdf')));
                const groups: any[] = [];
                console.log('[ARCHIVE SEARCH] start', { q, targets: targets.length });

                for (const d of targets) {
                    const fileUrl = api.getLocalFileUrl(d.ocrPdfKey || d.s3Key);
                    try {
                        // Fetch as ArrayBuffer to avoid CORS/URL issues
                        const res = await fetch(fileUrl);
                        const buf = await res.arrayBuffer();
                        const doc = await (pdfjsLib as any).getDocument({ data: new Uint8Array(buf), disableWorker: false }).promise;
                        const matches: any[] = [];
                        let ord = 0;
                        const total = doc.numPages || 0;
                        console.log('[ARCHIVE SEARCH] doc', d.filename, { pages: total });

                        for (let p = 1; p <= total; p++) {
                            const page = await doc.getPage(p);
                            const content = await page.getTextContent();
                            const items = content.items as any[];
                            let buffer = '';
                            const boxes: { x: number; y: number; w: number; h: number }[] = [];

                            for (const it of items) {
                                const s = (it.str || '') as string;
                                const tx = it.transform;
                                const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0;
                                const cw = ((it.width as number) || 0) / Math.max(1, s.length);

                                for (let i = 0; i < s.length; i++) {
                                    const x = (tx[4] as number) + (cw * i);
                                    const y = (tx[5] as number) - h;
                                    boxes.push({ x, y, w: cw, h });
                                }
                                buffer += s + ' ';
                            }

                            const hay = buffer.toLowerCase();
                            const needle = q.toLowerCase();
                            let pos = 0;

                            while (true) {
                                const idx = hay.indexOf(needle, pos);
                                if (idx < 0) break;
                                const start = idx, end = idx + needle.length;
                                let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;

                                for (let i = start; i < end && i < boxes.length; i++) {
                                    const c = boxes[i];
                                    l = Math.min(l, c.x);
                                    t = Math.min(t, c.y);
                                    r = Math.max(r, c.x + c.w);
                                    b = Math.max(b, c.y + c.h);
                                }

                                if (isFinite(l) && isFinite(t) && isFinite(r) && isFinite(b)) {
                                    const vp = page.getViewport({ scale: 1 });
                                    const x0Pct = l / vp.width, x1Pct = r / vp.width;
                                    const y0Pct = (vp.height - b) / vp.height, y1Pct = (vp.height - t) / vp.height;

                                    matches.push({
                                        id: `${d.id}-${p}-${start}`,
                                        docId: d.id,
                                        docTitle: d.filename,
                                        kind: 'pdf',
                                        page: p,
                                        q,
                                        x0Pct,
                                        x1Pct,
                                        y0Pct,
                                        y1Pct,
                                        charIdx: start,
                                        qLength: needle.length,
                                        snippet: buffer.slice(Math.max(0, start - 40), Math.min(buffer.length, end + 40)).trim(),
                                        score: 0,
                                        ord: ord++
                                    });
                                }
                                pos = end;
                            }
                        }

                        console.log('[ARCHIVE SEARCH] doc done', d.filename, { matches: matches.length });
                        groups.push({ doc: { id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: 'pdf' }, matches });
                    } catch (err) {
                        console.warn('[ARCHIVE SEARCH] doc error', d.filename, err);
                        groups.push({ doc: { id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: 'pdf' }, matches: [] });
                    }
                }

                const total = groups.reduce((s, g) => s + g.matches.length, 0);
                console.log('[ARCHIVE SEARCH] done', { total });
                return { id: String(Date.now()), query: q, scope: 'archive' as any, total, groups } as any;
            }}
        >
            <SearchPanelTree showInput={true} />
        </SearchProvider>
    );
}
