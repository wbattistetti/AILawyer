import React, { useState, useCallback, useEffect } from 'react';
import { SplitLayout } from './components/SplitLayout';
import { DirectoryTree } from './components/DirectoryTree';
import { FileGrid } from './components/FileGrid';
import { GridToolbar } from './components/GridToolbar';
import { PreviewPane } from './components/PreviewPane';
import { RowActionsMenu } from './components/RowActionsMenu';
import { useDriveList } from './hooks/useDriveList';
import { useScanFiles } from './hooks/useScanFiles';
import { useExplorerState } from './hooks/useExplorerState';
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
    clearError
  } = useExplorerState();

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
    
    // Start scanning the selected directory
    startScan({
      rootPath: node.path,
      kinds: state.filters.kinds.size > 0 ? state.filters.kinds : undefined,
      search: state.filters.search || undefined
    });
  }, [setSelectedNode, startScan, state.filters]);

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

    const scanOptions = {
      rootPath: state.selectedNode.path,
      kinds: state.filters.kinds.size > 0 ? state.filters.kinds : undefined,
      search: state.filters.search || undefined
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
  }, [state.selectedNode, state.filters, pause, resume, abort, rescan]);

  const handleFiltersChange = useCallback((filters: Partial<typeof state.filters>) => {
    setFilters(filters);
    
    // Restart scan with new filters if a node is selected
    if (state.selectedNode) {
      const newFilters = { ...state.filters, ...filters };
      startScan({
        rootPath: state.selectedNode.path,
        kinds: newFilters.kinds.size > 0 ? newFilters.kinds : undefined,
        search: newFilters.search || undefined
      });
    }
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
    <div className={`h-full ${className}`}>
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
        center={
          <div className="flex flex-col h-full">
            <GridToolbar
              filters={state.filters}
              onFiltersChange={handleFiltersChange}
              selectedCount={selectedCount}
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
            
            <div className="flex-1 overflow-hidden">
              <FileGrid
                files={filteredFiles}
                selectedIds={state.selectedIds}
                onToggleSelection={toggleFileSelection}
                onOpenPreview={handleFilePreview}
                onRowMenu={handleRowMenu}
              />
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

