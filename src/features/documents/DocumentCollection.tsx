import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ThumbCard } from '../../components/viewers/ThumbCard'
import { FileText, ScanText, Search, X, Loader2 } from 'lucide-react'
import { SearchProvider } from '../../components/search/SearchProvider'
import { SearchPanelTree } from '../../components/search/SearchPanelTree'
import * as pdfjsLib from 'pdfjs-dist'
import { api } from '../../lib/api'

type DocItem = {
  id: string
  filename: string
  s3Key: string
  mime?: string
  thumb?: string
  tags?: string[]
  localUrl?: string
  meta?: any
  ocrStatus?: string
  hasNativeText?: boolean
}

// ✅ CORREZIONE: Funzione per generare snippet contestuali
function generateContextualSnippet(text: string, foundPos: number, queryLength: number): string {
  // Trova l'inizio e la fine della riga contenente la match
  let lineStart = foundPos;
  let lineEnd = foundPos + queryLength;

  // Trova l'inizio della riga (prima newline o inizio testo)
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Trova la fine della riga (dopo newline o fine testo)
  while (lineEnd < text.length && text[lineEnd] !== '\n') {
    lineEnd++;
  }

  // Estrai la riga completa
  const fullLine = text.substring(lineStart, lineEnd).trim();

  // Se la riga è troppo lunga, mostra solo il contesto intorno alla match
  if (fullLine.length > 100) {
    const contextStart = Math.max(0, foundPos - lineStart - 30);
    const contextEnd = Math.min(fullLine.length, foundPos - lineStart + queryLength + 30);
    return fullLine.substring(contextStart, contextEnd);
  }

  return fullLine;
}

// Funzione per ricerca client-side sui PDF con testo nativo
async function searchInPdfDocuments(items: DocItem[], query: string): Promise<any> {
  try {
    // Configura PDF.js worker
    const anyPdf: any = pdfjsLib as any;
    if (anyPdf && anyPdf.GlobalWorkerOptions && !anyPdf.GlobalWorkerOptions.workerSrc) {
      anyPdf.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js';
    }

    // Filtra solo PDF con testo nativo
    const pdfTargets = items.filter(d =>
      (d.mime?.includes('pdf') || d.filename.toLowerCase().endsWith('.pdf')) &&
      d.hasNativeText
    );


    const groups: any[] = [];
    const normalizedQuery = query.toLowerCase();

    for (const doc of pdfTargets) {
      try {
        const fileUrl = api.getLocalFileUrl(doc.s3Key);

        // Fetch PDF come ArrayBuffer
        const res = await fetch(fileUrl);
        const buf = await res.arrayBuffer();
        const pdfDoc = await (pdfjsLib as any).getDocument({
          data: new Uint8Array(buf),
          disableWorker: false
        }).promise;

        const matches: any[] = [];
        const totalPages = pdfDoc.numPages || 0;

        // Cerca in ogni pagina
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const page = await pdfDoc.getPage(pageNum);
          const content = await page.getTextContent();
          const items = content.items as any[];

          // ✅ CORREZIONE: Ricostruisci le righe seguendo l'ordine visivo
          const textItems: Array<{
            str: string;
            x: number;
            y: number;
            width: number;
            height: number;
            charBoxes: Array<{ x: number; y: number; w: number; h: number }>;
          }> = [];

          // Estrai tutti gli elementi di testo con le loro coordinate
          for (const item of items) {
            const str = (item.str || '') as string;
            if (!str.trim()) continue; // Salta elementi vuoti

            const transform = item.transform;
            const x = transform[4] as number;
            const y = transform[5] as number;
            const width = (item.width as number) || 0;
            const height = (item.height as number) || Math.abs(transform[5] - (transform[5] - (item.height as number))) || 0;

            // Calcola le bounding box per ogni carattere
            const charBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
            const charWidth = width / Math.max(1, str.length);

            for (let i = 0; i < str.length; i++) {
              charBoxes.push({
                x: x + (charWidth * i),
                y: y - height,
                w: charWidth,
                h: height
              });
            }

            textItems.push({
              str,
              x,
              y,
              width,
              height,
              charBoxes
            });
          }

          // ✅ CORREZIONE: Ordina per righe (Y) e poi per posizione orizzontale (X)
          textItems.sort((a, b) => {
            // Prima ordina per Y (righe), con una tolleranza per elementi sulla stessa riga
            const yDiff = Math.abs(a.y - b.y);
            if (yDiff > Math.max(a.height, b.height) * 0.5) {
              return b.y - a.y; // Y decrescente (dall'alto verso il basso)
            }
            // Se sono sulla stessa riga, ordina per X (da sinistra a destra)
            return a.x - b.x;
          });

          // ✅ CORREZIONE: Ricostruisci il testo seguendo l'ordine visivo
          let textBuffer = '';
          const boxes: { x: number; y: number; w: number; h: number }[] = [];

          for (const item of textItems) {
            textBuffer += item.str + ' ';
            boxes.push(...item.charBoxes);
          }

          // Cerca la query nel testo
          const normalizedText = textBuffer.toLowerCase();
          let searchPos = 0;

          while (true) {
            const foundPos = normalizedText.indexOf(normalizedQuery, searchPos);
            if (foundPos === -1) break;

            // Calcola le coordinate della match
            const charStart = foundPos;
            const charEnd = foundPos + normalizedQuery.length;

            if (charStart < boxes.length && charEnd <= boxes.length) {
              const startBox = boxes[charStart];
              const endBox = boxes[charEnd - 1];

              matches.push({
                id: `${doc.id}-${pageNum}-${foundPos}`,
                docId: doc.id,
                docTitle: doc.filename,
                kind: 'pdf' as const,
                page: pageNum,
                q: query,
                x0Pct: Math.max(0, Math.min(1, startBox.x / page.view[2])),
                x1Pct: Math.max(0, Math.min(1, (endBox.x + endBox.w) / page.view[2])),
                y0Pct: Math.max(0, Math.min(1, startBox.y / page.view[3])),
                y1Pct: Math.max(0, Math.min(1, (endBox.y + endBox.h) / page.view[3])),
                charIdx: foundPos,
                qLength: normalizedQuery.length,
                snippet: generateContextualSnippet(textBuffer, foundPos, normalizedQuery.length),
                score: 1
              });
            }

            searchPos = foundPos + 1;
          }
        }

        if (matches.length > 0) {
          groups.push({
            doc: {
              id: doc.id,
              title: doc.filename,
              hash: '',
              pages: totalPages,
              kind: 'pdf' as const
            },
            matches
          });
        }


      } catch (error) {
        console.error('[CLIENT-SEARCH] Error processing document', { filename: doc.filename, error });
      }
    }

    const totalMatches = groups.reduce((sum, group) => sum + group.matches.length, 0);

    return {
      id: `client-search-${Date.now()}`,
      query,
      scope: 'archive',
      total: totalMatches,
      groups
    };

  } catch (error) {
    console.error('[CLIENT-SEARCH] Search failed', error);
    return null;
  }
}

export function DocumentCollection({
  title,
  items,
  onOpen,
  onDrop,
  uploadingCount,
  onRemove,
  onOcr,
  onOcrCancel,
  cancellingById,
  transcribedPctById,
  progressById,
  etaById,
  statusById,
}: {
  title?: string
  items: DocItem[]
  onOpen: (doc: DocItem) => void
  onDrop?: (files: File[]) => void
  uploadingCount?: number
  onRemove?: (doc: DocItem) => void
  onOcr?: (doc: DocItem) => void
  onOcrCancel?: (doc: DocItem) => void
  cancellingById?: Record<string, boolean>
  transcribedPctById?: Record<string, number>
  progressById?: Record<string, number>
  etaById?: Record<string, string>
  statusById?: Record<string, string>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchQuerySubmitted, setSearchQuerySubmitted] = useState<string>('')
  const [searchHeight, setSearchHeight] = useState<number>(300)
  const [isSearching, setIsSearching] = useState<boolean>(false)

  const onDropCb = useCallback((accepted: File[]) => {
    onDrop?.(accepted)
  }, [onDrop])
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: onDropCb,
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  return (
    <div className="w-full h-full flex flex-col relative">
      {title && (
        <div className="px-3 py-2 text-sm font-medium border-b bg-white flex items-center gap-2">
          {isSearching ? (
            <Loader2 size={16} className="text-blue-500 animate-spin" />
          ) : (
            <Search size={16} className="text-gray-500" />
          )}
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setSearchQuerySubmitted(searchQuery.trim())
                setSearchOpen(true)
                setSearchQuery('')  // Svuota textbox dopo Enter
              }
            }}
            placeholder="Cerca in tutti i documenti..."
            className="flex-1 border rounded px-2 py-1 text-xs"
            disabled={isSearching}
          />
          {searchOpen ? (
            <button
              type="button"
              className="p-1 hover:bg-gray-200 rounded"
              title="Chiudi ricerca"
              onClick={() => setSearchOpen(false)}
            >
              <X size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="p-1 hover:bg-blue-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cerca"
              disabled={isSearching}
              onClick={() => {
                if (searchQuery.trim() && !isSearching) {
                  setSearchQuerySubmitted(searchQuery.trim())
                  setSearchOpen(true)
                  setSearchQuery('')  // Svuota textbox dopo click
                }
              }}
            >
              <Search size={18} />
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1 text-xs rounded border bg-blue-600 text-white hover:bg-blue-700"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); open() }}
          >Carica documento</button>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Pannello ricerca (quando aperto) */}
        {searchOpen && (
          <>
            <div className="border-b bg-white" style={{ height: searchHeight, minHeight: 150, maxHeight: 600 }}>
              <SearchProvider
                defaultScope={'archive'}
                initialQuery={searchQuerySubmitted}
                autoSearch={true}
                onSearch={async (q, scope) => {
                  setIsSearching(true)  // Avvia spinner

                  try {
                    // ✅ PRIMA: Prova ricerca client-side sui PDF con testo nativo
                    const clientResult = await searchInPdfDocuments(items, q)

                    if (clientResult && clientResult.total > 0) {
                      return clientResult
                    }

                    // ✅ SECONDO: Se nessun risultato client-side, prova backend per documenti salvati

                    const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
                    const response = await fetch(`${apiUrl}/api/search/archive?q=${encodeURIComponent(q)}&limit=50`)

                    if (!response.ok) {
                      return clientResult || null
                    }

                    const data = await response.json()

                    // Raggruppa i risultati per documento
                    const matchesByDoc = new Map<string, any[]>()
                    const docInfo = new Map<string, { id: string; filename: string }>()

                      ; (data.matches || []).forEach((match, index) => {
                        if (!matchesByDoc.has(match.docId)) {
                          matchesByDoc.set(match.docId, [])
                          docInfo.set(match.docId, { id: match.docId, filename: match.filename })
                        }

                        matchesByDoc.get(match.docId)!.push({
                          id: `${match.docId}-${match.page}-${match.charIdx || 0}-${index}`,
                          docId: match.docId,
                          docTitle: match.filename,
                          kind: 'pdf' as const,
                          page: match.page,
                          q: q,
                          x0Pct: match.x0Pct,
                          x1Pct: match.x1Pct,
                          y0Pct: match.y0Pct,
                          y1Pct: match.y1Pct,
                          charIdx: match.charIdx,
                          qLength: match.qLen,
                          snippet: match.snippet,
                          score: 1
                        })
                      })

                    const groups = Array.from(matchesByDoc.entries()).map(([docId, matches]) => {
                      const info = docInfo.get(docId)!
                      return {
                        doc: {
                          id: info.id,
                          title: info.filename,
                          hash: '',
                          pages: 1,
                          kind: 'pdf' as const
                        },
                        matches
                      }
                    })

                    return {
                      id: `archive-${Date.now()}`,
                      query: q,
                      scope: 'archive',
                      total: data.total || 0,
                      groups
                    }
                  } catch (error) {
                    return null
                  } finally {
                    setIsSearching(false)  // Ferma spinner
                  }
                }}
              >
                <SearchPanelTree showInput={false} showScopeSelector={false} initialQuery={searchQuerySubmitted} />
              </SearchProvider>
            </div>
            {/* Divisore trascinabile orizzontale */}
            <div
              className="h-1 cursor-row-resize bg-gray-200 hover:bg-blue-300"
              onMouseDown={(e) => {
                e.preventDefault()
                const startY = e.clientY
                const startHeight = searchHeight
                const handleMove = (moveEvent: MouseEvent) => {
                  const delta = moveEvent.clientY - startY
                  const newHeight = Math.max(150, Math.min(600, startHeight + delta))
                  setSearchHeight(newHeight)
                }
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove)
                  document.removeEventListener('mouseup', handleUp)
                  document.body.style.cursor = ''
                }
                document.addEventListener('mousemove', handleMove)
                document.addEventListener('mouseup', handleUp)
                document.body.style.cursor = 'row-resize'
              }}
            />
          </>
        )}

        {/* Miniature documenti */}
        <div className="flex-1 overflow-auto" {...getRootProps({ onDragOver: (e: any) => { e.preventDefault() } })}>
          <input {...getInputProps()} />
          <div className={`grid [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] gap-6 items-start p-3 ${isDragActive ? 'bg-blue-50' : ''}`}>
            {items.map(doc => {
              const meta = (doc as any).meta || {}
              const isExtract = !!(meta && (meta.kind === 'EXTRACT' || meta.source))
              const headerIcon = isExtract ? <ScanText className="w-4 h-4" /> : <FileText className="w-4 h-4" />
              const titleText = meta.title || (doc.filename || '').replace(/\.json$/, '')
              const excerpt = (meta.text || meta.content || '').toString().slice(0, 220)
              const src = meta.source || {}
              const isPdf = !isExtract && ((doc.mime || '').startsWith('application/pdf') || (doc.filename || '').toLowerCase().endsWith('.pdf'))
              const computedFileUrl = !isExtract && (
                doc.localUrl || (doc.s3Key ? `http://localhost:3001/files/${encodeURIComponent(doc.s3Key)}` : '')
              ) || undefined
              return (
                <ThumbCard
                  key={doc.id}
                  title={isExtract ? titleText : doc.filename}
                  imgSrc={isExtract ? '' : (doc.thumb || '')}
                  // genera sempre lato client per i PDF
                  fileUrl={computedFileUrl}
                  autoGenerateThumbnail={isPdf}
                  headerIcon={isExtract ? headerIcon : undefined}
                  headerColorClass={isExtract ? 'bg-emerald-400' : 'bg-amber-500'}
                  excerpt={isExtract ? excerpt : undefined}
                  metaDocLabel={isExtract ? (src.title || src.docId || '') : undefined}
                  metaPage={isExtract ? (src.page || undefined) : undefined}
                  onShow={isExtract ? (() => { try { window.dispatchEvent(new CustomEvent('app:goto-source', { detail: { docId: src.docId, title: src.title, page: src.page, box: (src.x0Pct != null ? { x0Pct: src.x0Pct, x1Pct: src.x1Pct, y0Pct: src.y0Pct, y1Pct: src.y1Pct } : undefined) } })) } catch { } }) : undefined}
                  selected={selectedId === doc.id}
                  onSelect={() => setSelectedId(doc.id)}
                  onPreview={() => onOpen(doc)}
                  onTable={() => onOpen(doc)}
                  onRemove={() => onRemove?.(doc)}
                  onOcr={() => onOcr?.(doc)}
                  onOcrCancel={() => onOcrCancel?.(doc)}

                  ocrProgressPct={typeof progressById?.[doc.id] === 'number' ? progressById![doc.id] : undefined as any}
                  ocrEtaText={etaById?.[doc.id] ?? null}
                  ocrStatusText={statusById?.[doc.id] ?? null}
                  ocrCancelling={cancellingById?.[doc.id] as any}
                  transcribedPct={transcribedPctById?.[doc.id] as any}
                  ocrStatus={doc.ocrStatus ?? null}
                  hasNativeText={doc.hasNativeText ?? false}
                />
              )
            })}
          </div>
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








