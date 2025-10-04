import { useState, useCallback, useRef } from 'react';
import { FileEntry, ScanProgress, FileKind } from '../types';
import { FileSystemAdapter } from '../services/FileSystemAdapter';
import { MimeService } from '../services/MimeService';

interface ScanOptions {
  rootPath: string;
  kinds?: Set<FileKind>;
  search?: string;
  maxInFlight?: number;
}

export function useScanFiles(adapter: FileSystemAdapter) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({
    scanned: 0,
    matched: 0,
    queued: 0,
    done: false
  });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const scanIdRef = useRef(0);

  // Fase 1: Conta tutte le directory ricorsivamente
  const countDirectories = useCallback(async (
    dirPath: string,
    currentScanId: number
  ): Promise<number> => {
    if (currentScanId !== scanIdRef.current) {
      return 0;
    }

    let count = 1; // Conta questa directory

    try {
      const { files: dirFiles } = await adapter.listDir(dirPath);
      
      for (const file of dirFiles) {
        if (currentScanId !== scanIdRef.current) {
          return count;
        }

        if (file.isDir) {
          // Conta ricorsivamente le sottodirectory
          count += await countDirectories(file.path, currentScanId);
        }
      }
    } catch (err) {
      if (currentScanId === scanIdRef.current) {
        console.warn(`Failed to count directory ${dirPath}:`, err);
      }
    }

    return count;
  }, [adapter]);

  // Fase 2: Scansiona i file directory per directory
  const scanRecursively = useCallback(async (
    dirPath: string,
    options: ScanOptions,
    currentScanId: number
  ): Promise<void> => {
    if (currentScanId !== scanIdRef.current) {
      return;
    }

    try {
      console.log('🔍 Scanning directory:', dirPath);
      
      // Aggiorna la directory corrente
      setProgress(prev => ({
        ...prev,
        currentDir: dirPath
      }));

      const { files: dirFiles } = await adapter.listDir(dirPath);
      console.log('🔍 Found files in', dirPath, ':', dirFiles);
      
      // Prima processa tutti i file della directory corrente
      for (const file of dirFiles) {
        if (currentScanId !== scanIdRef.current) {
          return;
        }

        if (!file.isDir) {
          // Process file
          setProgress(prev => ({
            ...prev,
            scanned: prev.scanned + 1
          }));

          // Check if file matches filters
          const shouldInclude = await shouldIncludeFile(file, options);
          console.log('🔍 File', file.name, 'should include:', shouldInclude);
          
          if (shouldInclude) {
            const fileEntry = await createFileEntry(file, adapter);
            console.log('🔍 Adding file to list:', fileEntry);
            
            setFiles(prev => [...prev, fileEntry]);
            setProgress(prev => ({
              ...prev,
              matched: prev.matched + 1
            }));
          }
        }
      }

      // Poi scansiona ricorsivamente le sottodirectory
      for (const file of dirFiles) {
        if (currentScanId !== scanIdRef.current) {
          return;
        }

        if (file.isDir) {
          await scanRecursively(file.path, options, currentScanId);
        }
      }

      // Directory completata
      setProgress(prev => ({
        ...prev,
        completedDirs: (prev.completedDirs || 0) + 1
      }));
      
    } catch (err) {
      if (currentScanId === scanIdRef.current) {
        console.warn(`Failed to scan directory ${dirPath}:`, err);
      }
    }
  }, [adapter]);

  const shouldIncludeFile = async (
    file: { name: string; path: string },
    options: ScanOptions
  ): Promise<boolean> => {
    // Check search filter
    if (options.search && !file.name.toLowerCase().includes(options.search.toLowerCase())) {
      return false;
    }

    // Check kind filter
    if (options.kinds && options.kinds.size > 0) {
      const kind = await MimeService.detectKind({
        name: file.name,
        path: file.path,
        readChunk: adapter.readChunk
      });
      
      if (!options.kinds.has(kind)) {
        return false;
      }
    }

    return true;
  };

  const createFileEntry = async (
    file: { name: string; path: string; size?: number; mtime?: number },
    adapter: FileSystemAdapter
  ): Promise<FileEntry> => {
    const kind = await MimeService.detectKind({
      name: file.name,
      path: file.path,
      readChunk: adapter.readChunk
    });

    const ext = file.name.split('.').pop()?.toLowerCase();
    
    // Rimuovi l'estensione
    let nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    
    // Se il nome contiene timestamp-uuid-nomeReale, estrai solo il nome reale
    // Pattern: 1758383831848-4af3a8fa-12bd-44b6-9bba-a18fc9f4f9d6-Catania
    const timestampUuidPattern = /^\d+-[a-f0-9-]{36}-(.+)$/i;
    const match = nameWithoutExt.match(timestampUuidPattern);
    if (match) {
      nameWithoutExt = match[1]; // Prendi solo la parte dopo l'ultimo trattino
    }
    
    const parentDirName = file.path.split(/[/\\]/).slice(-2, -1)[0] || '';

    return {
      id: file.path,
      name: nameWithoutExt,
      ext,
      kind,
      sizeBytes: file.size,
      mtime: file.mtime,
      path: file.path,
      parentDirName
    };
  };

  const startScan = useCallback(async (options: ScanOptions) => {
    console.log('🔍 Starting scan with options:', options);
    
    // Cancel any existing scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new scan
    const newScanId = ++scanIdRef.current;
    abortControllerRef.current = new AbortController();

    setScanning(true);
    setError(null);
    setFiles([]);
    setProgress({
      scanned: 0,
      matched: 0,
      queued: 0,
      done: false,
      totalDirs: 0,
      completedDirs: 0,
      currentDir: undefined,
      phase: 'counting'
    });

    try {
      // FASE 1: Conta le directory
      console.log('📊 Phase 1: Counting directories...');
      setProgress(prev => ({ ...prev, phase: 'counting', currentDir: 'Counting directories...' }));
      
      const totalDirs = await countDirectories(options.rootPath, newScanId);
      
      if (newScanId !== scanIdRef.current) {
        return; // Scan was cancelled
      }

      console.log(`📊 Found ${totalDirs} directories`);
      
      setProgress(prev => ({
        ...prev,
        totalDirs,
        phase: 'scanning',
        currentDir: options.rootPath
      }));

      // FASE 2: Scansiona i file
      console.log('🔍 Phase 2: Scanning files...');
      await scanRecursively(options.rootPath, options, newScanId);
      
      if (newScanId === scanIdRef.current) {
        setProgress(prev => ({ ...prev, done: true, currentDir: 'Scan completed!' }));
        console.log('🔍 Scan completed successfully');
      }
    } catch (err) {
      if (newScanId === scanIdRef.current) {
        setError(err instanceof Error ? err.message : 'Scan failed');
        console.error('🔍 Scan failed:', err);
      }
    } finally {
      if (newScanId === scanIdRef.current) {
        setScanning(false);
      }
    }
  }, [countDirectories, scanRecursively]);

  const pause = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setScanning(false);
  }, []);

  const resume = useCallback((options: ScanOptions) => {
    startScan(options);
  }, [startScan]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setScanning(false);
    setProgress(prev => ({ ...prev, done: true }));
  }, []);

  const rescan = useCallback((options: ScanOptions) => {
    startScan(options);
  }, [startScan]);

  return {
    files,
    progress,
    scanning,
    error,
    startScan,
    pause,
    resume,
    abort,
    rescan
  };
}

