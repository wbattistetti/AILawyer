import { useState, useMemo, useCallback } from 'react';
import { ExplorerState, FileEntry, GridFilters, FileKind } from '../types';

const initialFilters: GridFilters = {
  kinds: new Set(),
  search: ''
};

export function useExplorerState() {
  const [state, setState] = useState<ExplorerState>({
    selectedNode: undefined,
    files: [],
    visibleIds: [],
    selectedIds: new Set(),
    filters: initialFilters,
    progress: {
      scanned: 0,
      matched: 0,
      queued: 0,
      done: false
    },
    scanning: false,
    error: undefined
  });

  // Memoized selectors
  const visibleFiles = useMemo(() => {
    return state.files.filter(file => state.visibleIds.includes(file.id));
  }, [state.files, state.visibleIds]);

  const selectedFiles = useMemo(() => {
    return state.files.filter(file => state.selectedIds.has(file.id));
  }, [state.files, state.selectedIds]);

  const selectedCount = useMemo(() => {
    return state.selectedIds.size;
  }, [state.selectedIds]);

  const filteredFiles = useMemo(() => {
    let filtered = state.files;

    // Apply kind filters
    if (state.filters.kinds.size > 0) {
      filtered = filtered.filter(file => state.filters.kinds.has(file.kind));
    }

    // Apply search filter
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchLower) ||
        file.ext?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [state.files, state.filters]);

  // Actions
  const setSelectedNode = useCallback((node: { type: 'drive' | 'dir'; path: string } | undefined) => {
    setState(prev => ({ ...prev, selectedNode: node }));
  }, []);

  const setFiles = useCallback((files: FileEntry[]) => {
    setState(prev => ({
      ...prev,
      files,
      visibleIds: files.map(f => f.id)
    }));
  }, []);

  const toggleFileSelection = useCallback((fileId: string) => {
    setState(prev => {
      const newSelectedIds = new Set(prev.selectedIds);
      if (newSelectedIds.has(fileId)) {
        newSelectedIds.delete(fileId);
      } else {
        newSelectedIds.add(fileId);
      }
      return { ...prev, selectedIds: newSelectedIds };
    });
  }, []);

  const selectAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedIds: new Set(filteredFiles.map(f => f.id))
    }));
  }, [filteredFiles]);

  const deselectAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedIds: new Set()
    }));
  }, []);

  const setFilters = useCallback((filters: Partial<GridFilters>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters }
    }));
  }, []);

  const toggleKindFilter = useCallback((kind: FileKind) => {
    setState(prev => {
      const newKinds = new Set(prev.filters.kinds);
      if (newKinds.has(kind)) {
        newKinds.delete(kind);
      } else {
        newKinds.add(kind);
      }
      return {
        ...prev,
        filters: { ...prev.filters, kinds: newKinds }
      };
    });
  }, []);

  const setSearchFilter = useCallback((search: string) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, search }
    }));
  }, []);

  const setProgress = useCallback((progress: ExplorerState['progress']) => {
    setState(prev => ({ ...prev, progress }));
  }, []);

  const setScanning = useCallback((scanning: boolean) => {
    setState(prev => ({ ...prev, scanning }));
  }, []);

  const setError = useCallback((error: string | undefined) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: undefined }));
  }, []);

  return {
    // State
    state,
    visibleFiles,
    selectedFiles,
    selectedCount,
    filteredFiles,
    
    // Actions
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
  };
}

