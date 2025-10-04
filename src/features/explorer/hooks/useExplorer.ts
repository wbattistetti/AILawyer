import { useMemo } from 'react';
import { FileSystemAdapter } from '../services/FileSystemAdapter';
import { BackendFileSystemAdapter } from '../services/adapters/BackendFileSystemAdapter';

/**
 * Hook di convenienza per creare l'adapter filesystem
 * Usa BackendFileSystemAdapter per accesso al vero filesystem tramite API del backend
 */
export function useExplorerAdapter(): FileSystemAdapter {
  return useMemo(() => {
    console.log('🔧 Using BackendFileSystemAdapter for real filesystem access');
    return new BackendFileSystemAdapter();
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
