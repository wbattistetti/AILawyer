import React, { useState, useCallback, useEffect } from 'react';
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
import { FileEntry } from './types';

interface ExplorerProps {
  adapter: FileSystemAdapter;
  className?: string;
}

export function Explorer({ adapter, className = '' }: ExplorerProps) {
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

  // Hook per l'estrazione lazy dell'oggetto dai PDF
  usePdfObjectExtraction({
    files: state.files,
    scanning: state.scanning,
    onFileUpdate: updateFileObject
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

  const handleSelectAll = useCallback(() => {
    selectAll();
  }, [selectAll]);

  const handleDeselectAll = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const handleOpenInSystem = useCallback((filePath: string) => {
    adapter.openInSystem(filePath);
  }, [adapter]);

  const handleClosePreview = useCallback(() => {
    setPreviewFile(undefined);
  }, []);

  const handleFileClassificationChange = useCallback((fileId: string, compartoKey: string, compartoNome: string) => {
    updateFileClassification(fileId, compartoKey, compartoNome);
  }, [updateFileClassification]);

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
            {/* Mostra toolbar solo se c'è directory selezionata E ci sono file da mostrare */}
            {state.selectedNode && filteredFiles.length > 0 && (
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

