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

  const scanRecursively = useCallback(async (
    dirPath: string,
    options: ScanOptions,
    currentScanId: number
  ): Promise<void> => {
    if (currentScanId !== scanIdRef.current) {
      return; // Scan was cancelled
    }

    try {
      const { files: dirFiles } = await adapter.listDir(dirPath);
      
      for (const file of dirFiles) {
        if (currentScanId !== scanIdRef.current) {
          return; // Scan was cancelled
        }

        if (file.isDir) {
          // Recursively scan subdirectories
          await scanRecursively(file.path, options, currentScanId);
        } else {
          // Process file
          setProgress(prev => ({
            ...prev,
            scanned: prev.scanned + 1
          }));

          // Check if file matches filters
          const shouldInclude = await shouldIncludeFile(file, options);
          
          if (shouldInclude) {
            const fileEntry = await createFileEntry(file, adapter);
            
            setFiles(prev => [...prev, fileEntry]);
            setProgress(prev => ({
              ...prev,
              matched: prev.matched + 1
            }));
          }
        }
      }
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
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
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
      done: false
    });

    try {
      await scanRecursively(options.rootPath, options, newScanId);
      
      if (newScanId === scanIdRef.current) {
        setProgress(prev => ({ ...prev, done: true }));
      }
    } catch (err) {
      if (newScanId === scanIdRef.current) {
        setError(err instanceof Error ? err.message : 'Scan failed');
      }
    } finally {
      if (newScanId === scanIdRef.current) {
        setScanning(false);
      }
    }
  }, [scanRecursively]);

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

