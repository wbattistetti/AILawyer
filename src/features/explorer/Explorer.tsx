import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { File } from 'lucide-react';
import { SplitLayout } from './components/SplitLayout';
import { DirectoryTree } from './components/DirectoryTree';
import { FileGrid } from './components/FileGrid';
import { FileGridWithAutoWidth } from './components/FileGridWithAutoWidth';
import { GridToolbar } from './components/GridToolbar';
import { PreviewPane } from './components/PreviewPane';
import { RowActionsMenu } from './components/RowActionsMenu';
import { useDriveList } from './hooks/useDriveList';
import { useScanFiles } from './hooks/useScanFiles';
import { useExplorerState } from './hooks/useExplorerState';
import { usePdfNativeTextDetection } from './hooks/usePdfNativeTextDetection';
import { usePdfObjectExtraction } from './hooks/usePdfObjectExtraction';
import { FileSystemAdapter } from './services/FileSystemAdapter';
import { LocalizeService } from './services/LocalizeService';
import { CompartiService } from './services/CompartiService';
import { ClassificationService } from './services/ClassificationService';
import { FileEntry } from './types';

interface ExplorerProps {
  adapter: FileSystemAdapter;
  className?: string;
  praticaId?: string; // ID pratica per salvare/caricare stato
  initialSelectedPath?: string; // Path iniziale da ripristinare
  onStateChange?: (selectedPath: string | undefined) => void; // Callback quando cambia la directory selezionata
}

export function Explorer({ adapter, className = '', praticaId, initialSelectedPath, onStateChange }: ExplorerProps) {
  const [previewFile, setPreviewFile] = useState<FileEntry | undefined>();
  const [highlightPath, setHighlightPath] = useState<string | undefined>();
  const [centerWidth, setCenterWidth] = useState<number>(500);

  // Hooks
  const { drives, loading: drivesLoading, error: drivesError, refresh: refreshDrives } = useDriveList(adapter);
  const {
    files,
    progress,
    scanning,
    error: scanError,
    startScan,
    pause,
    resume,
    abort,
    rescan
  } = useScanFiles(adapter);

  const {
    state,
    visibleFiles,
    selectedCount,
    filteredFiles,
    setSelectedNode,
    setFiles,
    toggleFileSelection,
    selectAll,
    deselectAll,
    setFilters,
    toggleKindFilter,
    setSearchFilter,
    setProgress,
    setScanning,
    setError,
    clearError,
    updateFileClassification,
    updateFileNativeText,
    updateFileObject
  } = useExplorerState();

  // Hook per il rilevamento lazy del testo nativo nei PDF
  const { isInspecting } = usePdfNativeTextDetection({
    files: state.files,
    scanning: state.scanning,
    onFileUpdate: updateFileNativeText
  });

  // ✅ Stato per tracciare se l'estrazione è stata avviata manualmente
  const [isExtractionManuallyEnabled, setIsExtractionManuallyEnabled] = useState(false);

  // ✅ Traccia i file già analizzati (per evitare ri-analisi)
  const analyzedFilesRef = useRef<Set<string>>(new Set());

  // ✅ Stato per indicare se l'analisi è in corso
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ✅ Ref per fermare la classificazione
  const classificationAbortRef = useRef(false);

  // Hook per l'estrazione lazy dell'oggetto dai PDF
  // ✅ MODIFICATO: Disabilitato di default (non parte automaticamente)
  // ✅ Si abilita solo quando isExtractionManuallyEnabled è true
  const { status: objectExtractionStatus, startExtraction, stopExtraction } = usePdfObjectExtraction({
    files: state.files,
    scanning: state.scanning,
    onFileUpdate: updateFileObject,
    enabled: isExtractionManuallyEnabled // ✅ Si abilita solo quando avviata manualmente
  });

  // Sync scan results with state
  useEffect(() => {
    setFiles(files);
  }, [files, setFiles]);

  useEffect(() => {
    setProgress(progress);
  }, [progress, setProgress]);

  useEffect(() => {
    setScanning(scanning);
  }, [scanning, setScanning]);

  useEffect(() => {
    if (scanError) {
      setError(scanError);
    }
  }, [scanError, setError]);

  // ✅ NON tracciare automaticamente i file con oggetto estratto
  // ✅ analyzedFilesRef traccia solo i file esplicitamente analizzati tramite il pulsante
  // ✅ L'estrazione oggetto è gestita separatamente da usePdfObjectExtraction

  // ✅ Reset analyzedFilesRef quando cambia la directory selezionata
  useEffect(() => {
    if (state.selectedNode) {
      analyzedFilesRef.current.clear();
    }
  }, [state.selectedNode?.path]);

  // ✅ Ripristina lo stato iniziale se fornito
  useEffect(() => {
    if (initialSelectedPath && !state.selectedNode && drives.length > 0) {
      // Verifica se il path è ancora disponibile
      const drive = drives.find(d => initialSelectedPath.startsWith(d.path));
      if (drive) {
        // Verifica se la directory esiste ancora
        adapter.listDir(initialSelectedPath).then(() => {
          setSelectedNode({ type: 'dir', path: initialSelectedPath });
          startScan({
            rootPath: initialSelectedPath,
            kinds: undefined,
            search: state.filters.search || undefined
          });
        }).catch((err) => {
          console.warn('[EXPLORER] Path non più disponibile:', initialSelectedPath, err);
          // Mostra un avviso all'utente
          setError(`Il percorso salvato non è più disponibile: ${initialSelectedPath}. Verifica che il drive/dispositivo sia collegato.`);
          // Non ripristinare se il path non è più disponibile
        });
      } else {
        // Drive non trovato - mostra avviso
        const driveLetter = initialSelectedPath.split(/[/\\]/)[0];
        setError(`Il drive/dispositivo "${driveLetter}" non è più disponibile. Verifica che sia collegato.`);
      }
    }
  }, [initialSelectedPath, drives, state.selectedNode, adapter, setSelectedNode, startScan, state.filters.search, setError]);

  // ✅ Salva lo stato quando cambia la directory selezionata
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state.selectedNode?.path);
    }
  }, [state.selectedNode?.path, onStateChange]);

  // Event handlers
  const handleNodeSelect = useCallback((node: { type: 'drive' | 'dir'; path: string }) => {
    setSelectedNode(node);

    // Start scanning the selected directory - scan ALL files (ignore type filters)
    // Type filters will be applied in memory after scanning
    startScan({
      rootPath: node.path,
      kinds: undefined, // Always scan all files, filter in memory later
      search: state.filters.search || undefined // Keep search filter during scan for efficiency
    });
  }, [setSelectedNode, startScan, state.filters.search]);

  const handleFilePreview = useCallback((file: FileEntry) => {
    setPreviewFile(file);
  }, []);

  const handleRowMenu = useCallback((file: FileEntry, action: string) => {
    switch (action) {
      case 'localize':
        const dirPath = LocalizeService.getDirectoryPath(file.path);
        setHighlightPath(dirPath);
        break;
      case 'open':
        adapter.openInSystem(file.path);
        break;
      case 'reveal':
        adapter.revealInFolder(file.path);
        break;
      case 'copy':
        navigator.clipboard.writeText(file.path);
        break;
    }
  }, [adapter]);

  const handleUploadToArchive = useCallback(() => {
    const selectedFiles = filteredFiles.filter(file => state.selectedIds.has(file.id));
    console.log('Uploading to archive:', selectedFiles);
    // TODO: Implement actual upload logic
  }, [filteredFiles, state.selectedIds]);

  const handleScanControls = useCallback((action: 'pause' | 'resume' | 'stop' | 'rescan') => {
    if (!state.selectedNode) return;

    // Always scan all files, filter in memory later
    const scanOptions = {
      rootPath: state.selectedNode.path,
      kinds: undefined, // Always scan all files
      search: state.filters.search || undefined // Keep search filter during scan for efficiency
    };

    switch (action) {
      case 'pause':
        pause();
        break;
      case 'resume':
        resume(scanOptions);
        break;
      case 'stop':
        abort();
        break;
      case 'rescan':
        rescan(scanOptions);
        break;
    }
  }, [state.selectedNode, state.filters.search, pause, resume, abort, rescan]);

  const handleFiltersChange = useCallback((filters: Partial<typeof state.filters>) => {
    setFilters(filters);

    // If search filter changes, restart scan (for efficiency)
    // Type filters are applied in memory, no need to rescan
    if (state.selectedNode && filters.search !== undefined) {
      const newFilters = { ...state.filters, ...filters };
      startScan({
        rootPath: state.selectedNode.path,
        kinds: undefined, // Always scan all files
        search: newFilters.search || undefined
      });
    }
    // Type filters (kinds) are applied instantly in memory via filteredFiles
  }, [setFilters, state.selectedNode, state.filters, startScan]);

  // ✅ Funzione per fermare l'analisi
  const stopAnalysis = useCallback(() => {
    console.log('[ANALYZE] Stop richiesto - fermo analisi');
    setIsAnalyzing(false);
    setIsExtractionManuallyEnabled(false); // ✅ Disabilita estrazione per nascondere "Sto analizzando l'oggetto..."
    classificationAbortRef.current = true;
    if (stopExtraction) {
      stopExtraction();
    }
  }, [stopExtraction]);

  // ✅ Logica centralizzata per determinare se l'analisi è realmente in corso
  const isAnalysisInProgress = useMemo(() => {
    if (!isExtractionManuallyEnabled) return false;

    // Controlla se ci sono PDF senza oggetto ancora da processare
    const pdfsWithoutObject = state.files.filter(
      file => file.kind === 'pdf' && file.oggetto === undefined
    );

    // Controlla se ci sono file senza classificazione
    const filesNeedingClassification = state.files.filter(
      file => !file.compartoKey && !file.compartoNome
    );

    // L'estrazione è attiva se:
    // - Ci sono PDF senza oggetto
    // - E l'estrazione è abilitata
    // - E (ci sono file in coda/processing O total > 0 E non è completa)
    const extractionActive = pdfsWithoutObject.length > 0 &&
                           (!objectExtractionStatus.isComplete &&
                            (objectExtractionStatus.inQueue > 0 ||
                             objectExtractionStatus.inProcessing > 0 ||
                             objectExtractionStatus.total > 0));

    // La classificazione è attiva se ci sono file da classificare
    const classificationActive = filesNeedingClassification.length > 0;

    return extractionActive || classificationActive;
  }, [isExtractionManuallyEnabled, state.files, objectExtractionStatus]);

  // ✅ useEffect semplificato: sincronizza isAnalyzing con lo stato reale dell'analisi
  useEffect(() => {
    if (isAnalyzing && !isAnalysisInProgress) {
      // L'analisi è stata completata
      console.log('[ANALYZE] Analisi completata - nessun file da processare');
      setIsAnalyzing(false);
    } else if (!isAnalyzing && isAnalysisInProgress && isExtractionManuallyEnabled) {
      // L'analisi dovrebbe essere in corso ma isAnalyzing è false (ripristina)
      // Questo può succedere se l'estrazione è ancora in corso dopo che la classificazione è finita
      console.log('[ANALYZE] Ripristino isAnalyzing perché analisi ancora in corso');
      setIsAnalyzing(true);
    }
  }, [isAnalyzing, isAnalysisInProgress, isExtractionManuallyEnabled]);

  // ✅ Funzione per avviare analisi e classificazione manualmente
  const handleAnalyzeDocuments = useCallback(async () => {
    console.log('[ANALYZE] Avvio analisi');
    setIsAnalyzing(true);
    classificationAbortRef.current = false;

    // 1. Abilita estrazione e avvia estrazione oggetto dai PDF (solo quelli senza oggetto)
    setIsExtractionManuallyEnabled(true);

    // Conta PDF senza oggetto per debug
    const pdfsWithoutObject = state.files.filter(
      file => file.kind === 'pdf' && file.oggetto === undefined
    );
    console.log('[ANALYZE] PDF senza oggetto trovati:', pdfsWithoutObject.length);

    if (startExtraction) {
      startExtraction(); // ✅ startExtraction già filtra solo PDF con oggetto === undefined
    }

    // 2. Classifica solo i file che non hanno ancora una classificazione
    const filesToClassify = state.files.filter(
      file => !file.compartoKey && !file.compartoNome
    );

    console.log('[ANALYZE] File senza classificazione trovati:', filesToClassify.length);
    console.log('[ANALYZE] Avvio classificazione per', filesToClassify.length, 'file');

    // ✅ Classifica i file in modo asincrono
    for (const file of filesToClassify) {
      // ✅ Controlla se l'analisi è stata fermata
      if (classificationAbortRef.current) {
        console.log('[ANALYZE] Analisi fermata dall\'utente');
        break;
      }

      try {
        const classification = await ClassificationService.classifyFile(file);
        if (classification) {
          updateFileClassification(file.id, classification.compartoKey, classification.compartoNome);

          // Salva anche in memoria globale
          const updateFn = (window as any).__updatePendingClassification;
          if (updateFn && typeof updateFn === 'function') {
            updateFn(file.path, {
              compartoKey: classification.compartoKey,
              compartoNome: classification.compartoNome
            });
          }
        }

        // ✅ Marca il file come analizzato (solo per la classificazione)
        analyzedFilesRef.current.add(file.id);
      } catch (error) {
        console.warn('[ANALYZE] Errore classificazione file:', file.path, error);
        // ✅ Marca comunque come analizzato per evitare loop infiniti
        analyzedFilesRef.current.add(file.id);
      }
    }

    console.log('[ANALYZE] Classificazione completata');
    // ✅ isAnalyzing verrà impostato a false automaticamente dal useEffect quando l'analisi è completata
  }, [state.files, updateFileClassification, startExtraction]);

  const handleSelectAll = useCallback(() => {
    selectAll();
  }, [selectAll]);

  const handleDeselectAll = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  // ✅ Calcola se ci sono file visibili (filtrati) che necessitano ancora di analisi
  const hasFilesToAnalyze = useMemo(() => {
    // Controlla solo i file filtrati (visibili)
    const pdfsNeedingObject = filteredFiles.filter(
      file => file.kind === 'pdf' && file.oggetto === undefined
    );

    const filesNeedingClassification = filteredFiles.filter(
      file => !file.compartoKey && !file.compartoNome
    );

    return pdfsNeedingObject.length > 0 || filesNeedingClassification.length > 0;
  }, [filteredFiles]);

  const handleOpenInSystem = useCallback((filePath: string) => {
    adapter.openInSystem(filePath);
  }, [adapter]);

  const handleClosePreview = useCallback(() => {
    setPreviewFile(undefined);
  }, []);

  const handleFileClassificationChange = useCallback((fileId: string, compartoKey: string, compartoNome: string) => {
    // ✅ Aggiorna stato locale (già fatto)
    updateFileClassification(fileId, compartoKey, compartoNome);

    // ✅ NOVO: Salva in memoria globale per mostrare nei cassetti
    const file = state.files.find(f => f.id === fileId);
    if (file) {
      const updateFn = (window as any).__updatePendingClassification;
      if (updateFn && typeof updateFn === 'function') {
        if (compartoKey) {
          updateFn(file.path, { compartoKey, compartoNome });
        } else {
          updateFn(file.path, null); // Rimuovi classificazione
        }
      } else {
        console.warn('[EXPLORER][CLASSIFICATION] updatePendingClassification non disponibile')
      }
    }
  }, [updateFileClassification, state.files]);

  // ✅ Listener per drop di file Explorer sui cassetti
  useEffect(() => {
    const handleExplorerFileDrop = (event: CustomEvent) => {
      const { fileData, drawerId } = event.detail;

      // Trova il file nello stato
      const file = state.files.find(f => f.id === fileData.fileId || f.path === fileData.filePath);
      if (!file) {
        console.warn('[EXPLORER][DROP] File non trovato:', fileData);
        return;
      }

      // Trova il comparto corrispondente al drawerId
      // drawerId può essere:
      // - una chiave (es. 'parti_anagrafiche') in DockWorkspaceV2
      // - un ID del database in DockWorkspaceV3
      let comparto = CompartiService.getByKey(drawerId);

      // Se non trovato per chiave, potrebbe essere un ID - prova a cercare nei comparti globali
      if (!comparto) {
        // Prova a ottenere i comparti dal contesto globale se disponibili
        const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined;
        const globalComparti = archiveData?.comparti;
        if (globalComparti) {
          const compartoById = globalComparti.find(c => c.id === drawerId);
          if (compartoById) {
            // Usa la chiave del comparto trovato per ottenere i dati completi
            comparto = CompartiService.getByKey(compartoById.key);
          }
        }
      }

      if (!comparto) {
        console.warn('[EXPLORER][DROP] Comparto non trovato per drawerId:', drawerId);
        return;
      }

      // Aggiorna la classificazione del file
      handleFileClassificationChange(file.id, comparto.key, comparto.nome);
    };

    window.addEventListener('explorer:file-drop-to-drawer', handleExplorerFileDrop as EventListener);

    return () => {
      window.removeEventListener('explorer:file-drop-to-drawer', handleExplorerFileDrop as EventListener);
    };
  }, [state.files, handleFileClassificationChange]);

  // Error handling
  if (drivesError) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <h3 className="text-lg font-medium text-red-600 mb-2">Error Loading Drives</h3>
          <p className="text-sm text-gray-600 mb-4">{drivesError}</p>
          <button
            onClick={refreshDrives}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className={`h-full w-full ${className}`}>
      <SplitLayout
        left={
          <DirectoryTree
            drives={drives}
            adapter={adapter}
            onSelect={handleNodeSelect}
            selectedPath={state.selectedNode?.path}
            highlightPath={highlightPath}
          />
        }
        centerAutoWidth={true}
        centerMinWidth={500}
        centerMaxWidth={1200}
        centerWidth={centerWidth}
        rightWidth={600}
        minRightWidth={400}
        center={
          <div className="flex flex-col h-full">
            {/* ✅ Mostra toolbar se c'è directory selezionata (indipendentemente dai file filtrati) */}
            {state.selectedNode && (
              <GridToolbar
                filters={state.filters}
                onFiltersChange={handleFiltersChange}
                selectedCount={selectedCount}
                totalFiles={state.files.length}
                visibleFiles={filteredFiles.length}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onUploadToArchive={handleUploadToArchive}
                scanning={scanning}
                progress={progress}
                onPause={() => handleScanControls('pause')}
                onResume={() => handleScanControls('resume')}
                onStop={() => handleScanControls('stop')}
                onRescan={() => handleScanControls('rescan')}
                onAnalyzeDocuments={handleAnalyzeDocuments}
                isAnalyzing={isAnalyzing}
                onStopAnalysis={stopAnalysis}
                canAnalyze={hasFilesToAnalyze}
              />
            )}

            <div className="flex-1 overflow-hidden">
              {/* Stato 1: Nessuna directory selezionata */}
              {!state.selectedNode ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <File className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600">Devi selezionare a sinistra una cartella</p>
                  </div>
                </div>
              ) : filteredFiles.length === 0 && !scanning ? (
                /* Stato 2: Directory selezionata ma nessun file trovato */
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <File className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600">Nessun file trovato</p>
                  </div>
                </div>
              ) : (
                /* Stato 3: File trovati - mostra griglia normalmente */
                <FileGridWithAutoWidth
                  files={filteredFiles}
                  selectedIds={state.selectedIds}
                  onToggleSelection={toggleFileSelection}
                  onOpenPreview={handleFilePreview}
                  onRowMenu={handleRowMenu}
                  onFileClassificationChange={handleFileClassificationChange}
                  onWidthChange={setCenterWidth}
                  objectExtractionStatus={objectExtractionStatus}
                  isExtractionEnabled={isExtractionManuallyEnabled} // ✅ Si attiva solo quando clicchi "Analizza documenti"
                />
              )}
            </div>
          </div>
        }
        right={
          <PreviewPane
            file={previewFile}
            onClose={handleClosePreview}
            onOpenInSystem={handleOpenInSystem}
          />
        }
      />
    </div>
  );
}

