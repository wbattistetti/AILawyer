import React, { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { ThumbCard } from '../../components/viewers/ThumbCard'
import { FileText, ScanText, Search, X, Loader2 } from 'lucide-react'
import { SearchProvider } from '../../components/search/SearchProvider'
import { SearchPanelTree } from '../../components/search/SearchPanelTree'
import * as pdfjsLib from 'pdfjs-dist'
import { api } from '../../lib/api'
import { useDocumentThumbnail } from '../../hooks/useDocumentThumbnail'
import { DragAndDropService } from '../../services/DragAndDropService'

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
  autoGenerateThumbnail?: boolean // ✅ NOVO: Flag per auto-generazione thumbnail per file virtuali
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
        const fileUrl = doc.localUrl || `http://localhost:3001/api/files/${encodeURIComponent(doc.s3Key)}`;

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
  draggableItems,
  onDragStartItem,
  extraNodesTop,
  compartoId,
  pendingMoveConfirmations,
  onConfirmMove,
  onCancelMove,
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
  draggableItems?: boolean
  onDragStartItem?: (docId: string, e: React.DragEvent, dragElement?: HTMLElement) => void
  extraNodesTop?: React.ReactNode
  compartoId?: string // ✅ ID del comparto per gestire drop Explorer
  pendingMoveConfirmations?: Map<string, any> // ✅ Miniature ghost in attesa di conferma
  onConfirmMove?: (confirmation: any) => void // ✅ Callback per conferma spostamento
  onCancelMove?: (confirmation: any) => void // ✅ Callback per annullamento spostamento
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchQuerySubmitted, setSearchQuerySubmitted] = useState<string>('')
  const [searchHeight, setSearchHeight] = useState<number>(300)
  const [isSearching, setIsSearching] = useState<boolean>(false)

  // Quiet: rimuovi log rumorosi, mantieni solo diagnostica su drop

  const [isExplorerDragOver, setIsExplorerDragOver] = useState(false)

  const onDropCb = useCallback((accepted: File[]) => {
    try {
      console.info('📥 [DC] onDrop', { files: accepted?.length || 0, names: accepted.map(f => f.name) })
    } catch { }
    onDrop?.(accepted)
  }, [onDrop])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: onDropCb,
    onDragEnter: () => { try { console.info('🟦 [DC] drag enter') } catch { } },
    onDragLeave: () => { try { console.info('⬜ [DC] drag leave') } catch { } },
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  // ✅ Handler per drop di file Explorer (oltre a react-dropzone)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // ✅ Usa il servizio centralizzato per gestire dragOver
    const handled = DragAndDropService.handleDragOver(e, [
      DragAndDropService.EXPLORER_FILE_TYPE,
      DragAndDropService.DOC_ID_TYPE,
      'Files'
    ])

    if (handled && DragAndDropService.isDocId(e) && compartoId) {
      // ✅ Controlla se il documento esiste già in questo comparto
      const docId = e.dataTransfer.getData(DragAndDropService.DOC_ID_TYPE)
      if (docId) {
        const doc = items.find(d => d.id === docId)
        if (doc && doc.compartoId === compartoId) {
          // ✅ Cambia icona mouse a "no-drop" (rosso)
          e.dataTransfer.dropEffect = 'no-drop'
        }
      }
    } else if (handled && DragAndDropService.isExplorerFile(e)) {
      setIsExplorerDragOver(true)
    }
  }, [compartoId, items])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (DragAndDropService.isExplorerFile(e)) {
      e.preventDefault()
      e.stopPropagation()
      // Solo se lasciamo completamente il container
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsExplorerDragOver(false)
      }
    }
  }, [])

  // ✅ Handler unificato per drop: gestisce sia file Explorer che file normali
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    console.log('[DOCUMENT-COLLECTION][DROP][START] Drop ricevuto', {
      compartoId,
      target: (e.target as HTMLElement)?.tagName,
      currentTarget: (e.currentTarget as HTMLElement)?.tagName,
      types: Array.from(e.dataTransfer?.types || [])
    })

    // ✅ CRITICO: Se è un drag Dockview, NON gestire - lascia che Dockview gestisca
    const { isDockviewDrag } = await import('../../utils/dragEventUtils')
    const isDockview = isDockviewDrag(e)
    console.log('[DOCUMENT-COLLECTION][DROP] isDockviewDrag result:', isDockview)

    if (isDockview) {
      console.log('[DOCUMENT-COLLECTION][DROP] ❌ Ignorato - è drag Dockview')
      return // Lascia che Dockview gestisca il drop del pannello
    }

    console.log('[DOCUMENT-COLLECTION][DROP] ✅ Procedo con gestione drop')

    // ✅ CRITICO: Ferma la propagazione per evitare gestione duplicata
    e.stopPropagation()
    e.preventDefault()

    console.log('[DOCUMENT-COLLECTION] handleDrop chiamato', {
      compartoId,
      compartoIdType: typeof compartoId,
      compartoIdLength: compartoId?.length,
      dataTransferTypes: Array.from(e.dataTransfer.types),
      hasExplorerFile: DragAndDropService.isExplorerFile(e),
      hasDocId: DragAndDropService.isDocId(e),
      hasFiles: DragAndDropService.isFiles(e),
      target: e.target,
      currentTarget: e.currentTarget
    })

    if (!compartoId) {
      // ✅ Se non c'è compartoId ma è un file Explorer, prova comunque a emettere l'evento
      if (DragAndDropService.isExplorerFile(e)) {
        const explorerFileData = e.dataTransfer.getData(DragAndDropService.EXPLORER_FILE_TYPE)
        const fileData = DragAndDropService.parseExplorerFileData(explorerFileData)
        if (fileData) {
          console.error('[DOCUMENT-COLLECTION] ❌ Drop Explorer ricevuto ma compartoId è undefined/null!', {
            compartoId,
            title,
            fileData
          })
          try {
            const event = new CustomEvent('explorer:file-drop-to-drawer', {
              detail: { fileData, drawerId: null }
            })
            window.dispatchEvent(event)
          } catch (error) {
            console.error('[DOCUMENT-COLLECTION] Error dispatching explorer event:', error)
          }
        }
      }
      return
    }

    // ✅ Usa il servizio centralizzato per gestire il drop
    const handled = await DragAndDropService.handleDrop(e, compartoId, {
      onExplorerFile: (fileData) => {
        setIsExplorerDragOver(false)
        console.log('[DOCUMENT-COLLECTION] ✅ Emetto evento explorer:file-drop-to-drawer', { fileData, drawerId: compartoId })
        const event = new CustomEvent('explorer:file-drop-to-drawer', {
          detail: { fileData, drawerId: compartoId }
        })
        window.dispatchEvent(event)
      },
      onDocId: async (docId) => {
        // ✅ Usa il servizio centralizzato per spostare il documento
        try {
          const archiveData = (window as any).__archiveData as {
            comparti?: Array<{ id: string; key: string; nome: string }>
            documenti?: Array<{ id: string; filePath?: string; [key: string]: any }>
          } | undefined

          const comparti = archiveData?.comparti || []
          const documenti = archiveData?.documenti || []

          // Verifica che il compartoId sia valido
          const targetComparto = comparti.find(c => c.id === compartoId)
          if (targetComparto) {
            const api = (await import('../../lib/api')).api
            await DragAndDropService.moveDocumentToComparto(docId, compartoId, {
              documenti,
              comparti,
              api
            })
            console.log('[DOCUMENT-COLLECTION] Documento spostato con successo', { docId, compartoId })
          } else {
            console.warn('[DOCUMENT-COLLECTION] Comparto non trovato per compartoId:', compartoId)
          }
        } catch (error) {
          console.error('[DOCUMENT-COLLECTION] Errore spostamento documento:', error)
        }
      },
      onFiles: (files) => {
        // ✅ Gestisci file OS normali
        if (onDrop) {
          onDrop(files)
        } else {
          onDropCb(files)
        }
      }
    })

    if (handled) {
      setIsExplorerDragOver(false)
    }
  }, [compartoId, onDrop, onDropCb])

  // ✅ Estrai getRootProps ma sovrascrivi onDrop con il nostro handler unificato
  const rootProps = getRootProps()
  const { onDrop: _, onDragOver: __, ...restRootProps } = rootProps

  return (
    <div
      className={`w-full h-full flex flex-col relative ${isExplorerDragOver || isDragActive ? 'bg-blue-50' : ''}`}
      data-component="document-collection"
      {...restRootProps}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        <div className="flex-1 overflow-auto" data-component="document-collection-thumbnails">
          <input {...getInputProps()} />
          <div className={`grid [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] gap-6 items-start p-3 ${isDragActive ? 'bg-blue-50' : ''}`}>
            {/* ✅ Prima tutti i documenti normali */}
            {items.map(doc => {
              // ✅ Rimosso rettangolo punteggiato "Carico...": i documenti temporanei vengono creati SUBITO con miniatura
              // ✅ Non serve più il placeholder, la miniatura appare immediatamente

              // ✅ Gestisci miniatura ghost per conferma spostamento (sostituisce la miniatura esistente)
              if (compartoId && pendingMoveConfirmations) {
                const moveConfirmation = pendingMoveConfirmations.get(`${doc.id}-${compartoId}`)
                if (moveConfirmation && moveConfirmation.targetCompartoId === compartoId) {
                  return (
                    <div
                      key={`move-confirmation-${moveConfirmation.docId}-${moveConfirmation.targetCompartoId}`}
                      className="relative w-full min-w-[12rem] max-w-[12rem] aspect-[3/4] border-2 border-orange-400 border-dashed rounded-md bg-orange-50 flex flex-col items-center justify-center p-2 gap-1.5 overflow-hidden"
                    >
                      <div className="text-[10px] font-medium text-gray-900 text-center px-1.5 line-clamp-2 flex-1 flex items-center">
                        Il documento "{moveConfirmation.filename}" è già in "{moveConfirmation.sourceCompartoNome}".
                      </div>
                      <div className="text-[9px] text-gray-600 text-center px-1.5">
                        Vuoi spostarlo qui?
                      </div>
                      <div className="flex gap-1.5 mt-auto mb-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onConfirmMove?.(moveConfirmation)
                          }}
                          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium flex-shrink-0"
                        >
                          Conferma
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            console.log('🔄 [DOC-COLLECTION][CANCEL] Click su Annulla (doc esistente)', { moveConfirmation })
                            onCancelMove?.(moveConfirmation)
                          }}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-[10px] font-medium flex-shrink-0"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )
                }
              }

              // ✅ Documento normale
              const meta = (doc as any).meta || {}
              const isExtract = !!(meta && (meta.kind === 'EXTRACT' || meta.source))
              const headerIcon = isExtract ? <ScanText className="w-4 h-4" /> : <FileText className="w-4 h-4" />
              const titleText = meta.title || (doc.filename || '').replace(/\.json$/, '')
              const excerpt = (meta.text || meta.content || '').toString().slice(0, 220)
              const src = meta.source || {}
              const isPdf = !isExtract && ((doc.mime || '').startsWith('application/pdf') || (doc.filename || '').toLowerCase().endsWith('.pdf'))
              const computedFileUrl = !isExtract && (
                doc.localUrl || (doc.s3Key ? `http://localhost:3001/api/files/${encodeURIComponent(doc.s3Key)}` : '')
              ) || undefined

              // NON convertire undefined in false! Passa undefined così com'è
              const hasNativeTextValue = doc.hasNativeText

              // ✅ Priorità thumbnail: 1) doc.thumb passato da ArchiveRenderer (già estratto da thumbnailDataUrl), 2) generazione client on-demand
              // ❌ Rimossa generazione backend ridondante (server thumb)
              const thumbnailFromDb = doc.thumb || (doc as any).thumbnailDataUrl || undefined
              const finalImgSrc = isExtract ? '' : thumbnailFromDb
              const isTempDoc = doc.id?.startsWith('temp:') || doc.id?.startsWith('pending:')
              // ✅ Per documenti temporanei/pending, non fare lazy loading dal backend (thumbnail generata client-side)
              // ✅ NOVO: Usa autoGenerateThumbnail dal docItem se presente (per file virtuali), altrimenti calcola
              const shouldAutoGenerate = doc.autoGenerateThumbnail ?? (isPdf && !thumbnailFromDb && computedFileUrl)
              const shouldLoadLazyThumbnail = !isExtract && isPdf && !thumbnailFromDb && !isTempDoc

              // ✅ Key stabile per evitare re-mount quando l'ID cambia (tempIdImmediato → tempIdFinale → documento reale)
              // Priorità: s3Key > hash > filePath > id
              const stableKey = doc.s3Key || (doc as any).hash || (doc as any).filePath || doc.id

              return (
                <ThumbCardWithLazyThumbnail
                  key={stableKey}
                  doc={doc}
                  isExtract={isExtract}
                  titleText={titleText}
                  excerpt={excerpt}
                  src={src}
                  headerIcon={headerIcon}
                  finalImgSrc={finalImgSrc}
                  computedFileUrl={computedFileUrl}
                  shouldAutoGenerate={shouldAutoGenerate}
                  shouldLoadLazyThumbnail={shouldLoadLazyThumbnail}
                  isPdf={isPdf}
                  hasNativeTextValue={hasNativeTextValue}
                  draggableItems={draggableItems}
                  onDragStartItem={onDragStartItem}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onOpen={onOpen}
                  onRemove={onRemove}
                  onOcr={onOcr}
                  onOcrCancel={onOcrCancel}
                  progressById={progressById}
                  etaById={etaById}
                  statusById={statusById}
                  cancellingById={cancellingById}
                  transcribedPctById={transcribedPctById}
                />
              )
            })}
            {/* ✅ Miniature ghost per conferma spostamento IN CODA (dopo tutti i documenti) */}
            {compartoId && pendingMoveConfirmations && Array.from(pendingMoveConfirmations.values())
              .filter(confirmation => confirmation.targetCompartoId === compartoId)
              .filter(confirmation => !items.some(doc => doc.id === confirmation.docId))
              .map(confirmation => (
                <div
                  key={`move-confirmation-ghost-${confirmation.docId}-${confirmation.targetCompartoId}`}
                  className="relative w-full min-w-[12rem] max-w-[12rem] aspect-[3/4] border-2 border-orange-400 border-dashed rounded-md bg-orange-50 flex flex-col items-center justify-center p-2 gap-1.5 overflow-hidden"
                >
                  <div className="text-[10px] font-medium text-gray-900 text-center px-1.5 line-clamp-2 flex-1 flex items-center">
                    Il documento "{confirmation.filename}" è già in "{confirmation.sourceCompartoNome}".
                  </div>
                  <div className="text-[9px] text-gray-600 text-center px-1.5">
                    Vuoi spostarlo qui?
                  </div>
                  <div className="flex gap-1.5 mt-auto mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onConfirmMove?.(confirmation)
                      }}
                      className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium flex-shrink-0"
                    >
                      Conferma
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        console.log('🔄 [DOC-COLLECTION][CANCEL] Click su Annulla', { confirmation })
                        onCancelMove?.(confirmation)
                      }}
                      className="px-2 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-[10px] font-medium flex-shrink-0"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
      {typeof uploadingCount === 'number' && uploadingCount > 0 && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
          <span className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
          <div className="text-sm text-neutral-800">{uploadingCount === 1 ? 'Sto caricando il file…' : `Sto caricando i ${uploadingCount} file…`}</div>
        </div>
      )}
      {/* ✅ Footer rimosso: l'intera area è già una drop zone per il cassetto specifico */}
    </div>
  )
}

// Componente wrapper per gestire lazy loading thumbnail (hook non può essere in map)
function ThumbCardWithLazyThumbnail({
  doc,
  isExtract,
  titleText,
  excerpt,
  src,
  headerIcon,
  finalImgSrc,
  computedFileUrl,
  shouldAutoGenerate,
  shouldLoadLazyThumbnail,
  isPdf,
  hasNativeTextValue,
  draggableItems,
  onDragStartItem,
  selectedId,
  setSelectedId,
  onOpen,
  onRemove,
  onOcr,
  onOcrCancel,
  progressById,
  etaById,
  statusById,
  cancellingById,
  transcribedPctById,
}: any) {
  // ✅ Stato per tracciare se questo documento è in drag
  const [isDragging, setIsDragging] = useState(false)

  // Lazy load thumbnail dal DB se necessario
  const { thumbnail: lazyThumbnail } = useDocumentThumbnail(
    shouldLoadLazyThumbnail ? doc.id : undefined,
    true
  )

  // Aggiorna imgSrc con lazy thumbnail se disponibile
  const finalImgSrcWithLazy = isExtract ? '' : (finalImgSrc || lazyThumbnail || '')
  const finalShouldAutoGenerate = shouldAutoGenerate && !lazyThumbnail

  // Log solo per problemi: hasNativeText true ma thumbnail mancante o viceversa
  if (isPdf && !isExtract && hasNativeTextValue === true && !finalImgSrcWithLazy) {
    console.warn('[THUMBCARD][PROBLEM]', {
      filename: doc.filename,
      hasNativeText: hasNativeTextValue,
      thumbnailMissing: !finalImgSrcWithLazy
    })
  }

  return (
    <div
      draggable={!!draggableItems}
      onDragStart={(e) => {
        // ✅ Imposta stato dragging
        setIsDragging(true)
        // ✅ Passa l'elemento DOM per creare il drag image
        const dragElement = e.currentTarget as HTMLElement
        onDragStartItem?.(doc.id, e, dragElement)
      }}
      onDragEnd={(e) => {
        // ✅ Rimuovi stato dragging quando il drag termina
        setIsDragging(false)
      }}
      className={isDragging ? 'opacity-50 brightness-75 transition-opacity' : 'transition-opacity'}
      ref={(el) => {
        // ✅ Salva riferimento per accesso diretto se necessario
        if (el && draggableItems) {
          (el as any).__thumbCardElement = el
        }
      }}
    >
                  <ThumbCard
                    title={isExtract ? titleText : doc.filename}
                    imgSrc={finalImgSrcWithLazy}
                    // genera lato client solo se manca thumbnail dal DB e server
                    fileUrl={computedFileUrl}
                    autoGenerateThumbnail={finalShouldAutoGenerate}
                    isPdf={isPdf}
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
                    hasNativeText={hasNativeTextValue}
                    // Log per debug
                    // Debug log aggiunto nel componente wrapper se necessario
                  />
    </div>
  )
}








