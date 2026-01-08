import React from 'react';
import { Documento } from '../../../../types';
import { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3';
import { PersonCardsPanel } from '../../../../features/entities/PersonCardsPanel';
import { buildPdfJsAdaptersFromDocs } from '../../../../features/entities/adapters/PdfJsDocAdapter';

interface PersonsRendererProps {
  documenti: Documento[];
  dockV2Ref: React.RefObject<DockWorkspaceV3Handle | null>;
  toast: any;
}

export function PersonsRenderer({ documenti, dockV2Ref, toast }: PersonsRendererProps) {
  return (
    <PersonCardsPanel
      getAllDocsMeta={async () => documenti.map(d => ({
        praticaId: d.praticaId,
        hash: d.hash,
        docId: d.id,
        title: d.filename,
        pages: 0
      }))}
      buildAdapters={async (docs) => {
        const map = new Map(docs.map(m => [m.docId, m]));
        const selected = documenti.filter(d => map.has(d.id));
        return buildPdfJsAdaptersFromDocs(selected);
      }}
      onOpenOccurrence={(o) => {
        // Open doc tab, then dispatch navigation event used by VerifyPdfViewer
        const d = documenti.find(x => x.id === o.docId);
        if (d) {
          dockV2Ref.current?.openDoc({ id: d.id, title: d.filename });
          toast({ title: 'Aperto nel Tavolo', description: d.filename });
        }
        try {
          window.dispatchEvent(new CustomEvent('app:goto-match', {
            detail: {
              docId: o.docId,
              q: '',
              match: {
                id: o.id,
                docId: o.docId,
                docTitle: o.docTitle,
                kind: 'pdf',
                page: o.page,
                q: '',
                x0Pct: o.box.x0Pct,
                x1Pct: o.box.x1Pct,
                y0Pct: o.box.y0Pct,
                y1Pct: o.box.y1Pct,
                snippet: o.snippet,
                score: 1
              }
            }
          }));
        } catch { }
      }}
    />
  );
}
