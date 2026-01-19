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
import { useExplorerDriveRestore } from './hooks/useExplorerDriveRestore';
import { useExplorerPersistence } from './hooks/useExplorerPersistence';
import { useExplorerTreeExpansion } from './hooks/useExplorerTreeExpansion';
import { useExplorerClassification } from './hooks/useExplorerClassification';
import { useExplorerDragDrop } from './hooks/useExplorerDragDrop';
import { FileSystemAdapter } from './services/FileSystemAdapter';
import { LocalizeService } from './services/LocalizeService';
import { ClassificationService } from './services/ClassificationService';
import { ExplorerStateService } from './services/ExplorerStateService';
import { FileEntry } from './types';

interface ExplorerProps {
  adapter: FileSystemAdapter;
  className?: string;
  praticaId?: string; // ID pratica per salvare/caricare stato
  initialSelectedPath?: string; // Path iniziale da ripristinare
  onStateChange?: (selectedPath: string | undefined, expandedPaths?: string[]) => void; // Callback quando cambia la directory selezionata o i path espansi
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

  // ✅ Nuovi hook per persistenza e ripristino
  const parsedState = ExplorerStateService.deserialize(initialSelectedPath)
  const { expandedPaths, handleExpandedPathsChange } = useExplorerTreeExpansion(parsedState?.expandedPaths)
  const { restoreStatus, restoreState } = useExplorerDriveRestore(parsedState, drives, adapter)
  const { saveState } = useExplorerPersistence(praticaId, state.selectedNode?.path, expandedPaths, drives)

  // ✅ Hook per classificazione
  const { handleFileClassificationChange } = useExplorerClassification(state.files, updateFileClassification)

  // ✅ Hook per drag-and-drop
  useExplorerDragDrop(state.files, praticaId, handleFileClassificationChange)

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

  // ✅ Ripristina lo stato iniziale usando il nuovo hook
  useEffect(() => {
    if (parsedState && !state.selectedNode && drives.length > 0) {
      restoreState(
        (path) => {
          setSelectedNode({ type: 'dir', path });
          clearError();
          startScan({
            rootPath: path,
            kinds: undefined,
            search: state.filters.search || undefined
          });
        },
        (error, unavailableDrive) => {
          setError(error);
          // unavailableDrive è già gestito da restoreStatus
        }
      );
    }
  }, [parsedState, drives, state.selectedNode, restoreState, setSelectedNode, startScan, state.filters.search, setError, clearError]);

  // ✅ Reset error quando l'utente seleziona una nuova directory
  useEffect(() => {
    if (state.selectedNode && restoreStatus.status === 'error') {
      clearError();
    }
  }, [state.selectedNode?.path, restoreStatus.status, clearError]);

  // ✅ Notifica cambiamenti di stato al parent (per salvataggio manuale se necessario)
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state.selectedNode?.path, expandedPaths);
    }
  }, [state.selectedNode?.path, expandedPaths, onStateChange]);

  // ✅ Il salvataggio automatico è gestito da useExplorerPersistence

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
    console.log('[EXPLORER] handleFilePreview chiamato con file:', {
      name: file.name,
      kind: file.kind,
      path: file.path,
      ext: file.ext,
      sizeBytes: file.sizeBytes
    });
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

  // ✅ La logica di classificazione e drag-and-drop è ora gestita dai hook:
  // - useExplorerClassification: gestisce handleFileClassificationChange
  // - useExplorerDragDrop: gestisce explorer:file-drop-to-drawer

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
            initialExpandedPaths={expandedPaths}
            onExpandedPathsChange={handleExpandedPathsChange}
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
              {/* ✅ Stato 0: Path salvato non disponibile - mostra messaggio informativo */}
              {restoreStatus.unavailableDrive && !state.selectedNode ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md p-6 bg-amber-50 border border-amber-200 rounded-lg">
                    <File className="w-12 h-12 mx-auto mb-4 text-amber-500" />
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">
                      {restoreStatus.unavailableDrive.driveType === 'removable'
                        ? 'Chiavetta USB non disponibile'
                        : restoreStatus.unavailableDrive.driveType === 'optical'
                        ? 'DVD/CD non disponibile'
                        : 'Dispositivo non disponibile'}
                    </h3>
                    <p className="text-sm text-amber-800 mb-4">
                      {restoreStatus.error || 'Il dispositivo salvato non è più disponibile. Seleziona la directory corretta per continuare.'}
                    </p>
                    <div className="bg-card rounded p-3 mb-4 text-left">
                      {restoreStatus.unavailableDrive.savedDriveLabel && restoreStatus.unavailableDrive.savedDriveLabel !== restoreStatus.unavailableDrive.driveLetter && (
                        <p className="text-xs text-gray-600 mb-1">
                          <strong>Nome dispositivo:</strong> {restoreStatus.unavailableDrive.savedDriveLabel}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mb-1">
                        <strong>Drive:</strong> {restoreStatus.unavailableDrive.driveLetter}
                      </p>
                      <p className="text-xs text-gray-600 mb-1">
                        <strong>Tipo:</strong> {
                          restoreStatus.unavailableDrive.driveType === 'removable' ? 'Chiavetta USB' :
                          restoreStatus.unavailableDrive.driveType === 'optical' ? 'DVD/CD' :
                          'Drive fisso'
                        }
                      </p>
                      <p className="text-xs text-gray-600 mb-1 mt-2">
                        <strong>Percorso salvato:</strong>
                      </p>
                      <p className="text-xs font-mono text-gray-800 break-all">
                        {restoreStatus.unavailableDrive.path}
                      </p>
                    </div>
                    <p className="text-sm text-amber-800 mb-4">
                      Per continuare, collega il dispositivo e seleziona una nuova directory, oppure seleziona una directory diversa.
                    </p>
                    <button
                      onClick={() => {
                        clearError();
                      }}
                      className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm"
                    >
                      Ho capito
                    </button>
                  </div>
                </div>
              ) : !state.selectedNode ? (
                /* Stato 1: Nessuna directory selezionata */
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
                  sortBy={state.filters.sortBy}
                  sortOrder={state.filters.sortOrder}
                  onSortChange={(field, order) => setFilters({ sortBy: field, sortOrder: order })}
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

