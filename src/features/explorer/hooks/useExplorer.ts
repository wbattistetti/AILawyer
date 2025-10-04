import { useMemo } from 'react';
import { FileSystemAdapter } from '../services/FileSystemAdapter';
import { MockFileSystemAdapter } from '../services/adapters/MockFileSystemAdapter';

/**
 * Hook di convenienza per creare l'adapter filesystem
 * Utilizza MockFileSystemAdapter per compatibilità browser
 */
export function useExplorerAdapter(): FileSystemAdapter {
  return useMemo(() => {
    // Always use MockFileSystemAdapter in browser environment
    // NodeFileSystemAdapter requires Node.js fs module which is not available in browser
    return new MockFileSystemAdapter();
  }, []);
}

/**
 * Hook per l'integrazione completa del pannello Explorer
 * Fornisce l'adapter e le props necessarie
 */
export function useExplorer() {
  const adapter = useExplorerAdapter();
  
  return {
    adapter,
    ExplorerProps: {
      adapter
    }
  };
}
