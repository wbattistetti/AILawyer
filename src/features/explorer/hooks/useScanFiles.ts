import { useState, useCallback, useRef } from 'react';
import { FileEntry, ScanProgress, FileKind } from '../types';
import { FileSystemAdapter } from '../services/FileSystemAdapter';
import { MimeService } from '../services/MimeService';
import { ClassificationService } from '../services/ClassificationService';

interface ScanOptions {
  rootPath: string;
  kinds?: Set<FileKind>;
  search?: string;
  maxInFlight?: number;
  autoClassify?: boolean; // ✅ Se true, fa classificazione automatica durante la scansione
}

// ✅ Tipo per mappare filePath -> classificazione esistente
type ExistingClassification = {
  compartoId: string;
  compartoKey: string;
  compartoNome: string;
};

// ✅ Funzione per recuperare classificazioni esistenti dalla pratica
async function loadExistingClassifications(praticaId: string | undefined): Promise<Map<string, ExistingClassification>> {
  const classifications = new Map<string, ExistingClassification>();

  if (!praticaId) {
    return classifications;
  }

  try {
    // Recupera documenti dalla pratica
    const archiveData = (window as any).__archiveData as {
      praticaId?: string;
      documenti?: Array<{ filePath?: string; compartoId?: string }>;
      comparti?: Array<{ id: string; key: string; nome: string }>;
    } | undefined;

    if (!archiveData || !archiveData.documenti || !archiveData.comparti) {
      // Prova a caricare direttamente dall'API
      const { api } = await import('../../../lib/api');
      const documenti = await api.getDocumentiByPratica(praticaId);
      const comparti = await api.getComparti(praticaId);

      // Crea mappa comparti per lookup veloce
      const compartiMap = new Map(comparti.map(c => [c.id, c]));

      // Mappa filePath -> classificazione
      documenti.forEach(doc => {
        if (doc.filePath && doc.compartoId) {
          const comparto = compartiMap.get(doc.compartoId);
          if (comparto) {
            classifications.set(doc.filePath, {
              compartoId: doc.compartoId,
              compartoKey: comparto.key,
              compartoNome: comparto.nome
            });
          }
        }
      });
    } else {
      // Usa dati già caricati
      const compartiMap = new Map(archiveData.comparti.map(c => [c.id, c]));

      archiveData.documenti.forEach(doc => {
        if (doc.filePath && doc.compartoId) {
          const comparto = compartiMap.get(doc.compartoId);
          if (comparto) {
            classifications.set(doc.filePath, {
              compartoId: doc.compartoId,
              compartoKey: comparto.key,
              compartoNome: comparto.nome
            });
          }
        }
      });
    }
  } catch (error) {
    console.warn('[EXPLORER][CLASSIFICATION] Errore nel caricamento classificazioni esistenti:', error);
  }

  return classifications;
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
  const existingClassificationsRef = useRef<Map<string, ExistingClassification>>(new Map());
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
      // ✅ Log rimosso per ridurre spam console

      // Aggiorna la directory corrente
      setProgress(prev => ({
        ...prev,
        currentDir: dirPath
      }));

      const { files: dirFiles } = await adapter.listDir(dirPath);
      // ✅ Log rimosso per ridurre spam console

      // Prima processa tutti i file della directory corrente
      for (const file of dirFiles) {
        if (currentScanId !== scanIdRef.current) {
          return;
        }

        if (!file.isDir) {
          // Skip files without a valid path
          if (!file.path || typeof file.path !== 'string') {
            console.warn('🔍 Skipping file without valid path:', file);
            continue;
          }

          // Process file
          setProgress(prev => ({
            ...prev,
            scanned: prev.scanned + 1
          }));

          // Check if file matches filters
          const shouldInclude = await shouldIncludeFile(file, options);
          // ✅ Log rimosso per ridurre spam console

          if (shouldInclude) {
            const fileEntry = await createFileEntry(file, adapter, options);
            // ✅ Log rimosso per ridurre spam console

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
      // ✅ Wrapper per adattare la firma: MimeService si aspetta readChunk(start, len)
      // ma BackendFileSystemAdapter.readChunk ha la firma (filePath, start, len)
      const readChunkWrapper = async (start: number, len: number): Promise<ArrayBuffer> => {
        if (!adapter.readChunk) {
          throw new Error('readChunk not available');
        }
        // Ensure file.path is a string
        const pathStr = typeof file.path === 'string' ? file.path : String(file.path || '');
        if (!pathStr) {
          throw new Error(`Invalid file path for file ${file.name}: ${file.path}`);
        }
        return adapter.readChunk(pathStr, start, len);
      };

      const kind = await MimeService.detectKind({
        name: file.name,
        path: file.path,
        readChunk: readChunkWrapper
      });

      if (!options.kinds.has(kind)) {
        return false;
      }
    }

    return true;
  };

  const createFileEntry = async (
    file: { name: string; path: string; size?: number; mtime?: number },
    adapter: FileSystemAdapter,
    options?: ScanOptions
  ): Promise<FileEntry> => {
    // ✅ Wrapper per adattare la firma: MimeService si aspetta readChunk(start, len)
    // ma BackendFileSystemAdapter.readChunk ha la firma (filePath, start, len)
    const readChunkWrapper = async (start: number, len: number): Promise<ArrayBuffer> => {
      if (!adapter.readChunk) {
        throw new Error('readChunk not available');
      }
      // Ensure file.path is a string
      const pathStr = typeof file.path === 'string' ? file.path : String(file.path || '');
      if (!pathStr) {
        throw new Error(`Invalid file path for file ${file.name}: ${file.path}`);
      }
      return adapter.readChunk(pathStr, start, len);
    };

    const kind = await MimeService.detectKind({
      name: file.name,
      path: file.path,
      readChunk: readChunkWrapper
    });

    const ext = file.name.split('.').pop()?.toLowerCase();

    // ✅ Mantieni il nome completo con estensione
    let fileName = file.name;

    // Se il nome contiene timestamp-uuid-nomeReale, estrai solo il nome reale
    // Pattern: 1758383831848-4af3a8fa-12bd-44b6-9bba-a18fc9f4f9d6-Catania.pdf
    const timestampUuidPattern = /^\d+-[a-f0-9-]{36}-(.+)$/i;
    const match = fileName.match(timestampUuidPattern);
    if (match) {
      fileName = match[1]; // Prendi solo la parte dopo l'ultimo trattino (mantiene estensione)
    }

    const parentDirName = file.path.split(/[/\\]/).slice(-2, -1)[0] || '';

    // Classificazione automatica
    const fileEntry: FileEntry = {
      id: file.path,
      name: fileName, // ✅ Nome completo con estensione
      ext,
      kind,
      sizeBytes: file.size,
      mtime: file.mtime,
      path: file.path,
      parentDirName
    };

    // ✅ PRIMA: Controlla se esiste già una classificazione nel database
    const existingClassification = existingClassificationsRef.current.get(file.path);
    if (existingClassification) {
      // Usa la classificazione esistente dal database
      fileEntry.compartoKey = existingClassification.compartoKey;
      fileEntry.compartoNome = existingClassification.compartoNome;
      fileEntry.classificationSource = 'manual'; // Considera come manuale perché già salvata

      // ✅ Salva anche in memoria globale per mostrare nei cassetti
      const updateFn = (window as any).__updatePendingClassification;
      if (updateFn && typeof updateFn === 'function') {
        updateFn(fileEntry.path, {
          compartoKey: existingClassification.compartoKey,
          compartoNome: existingClassification.compartoNome
        });
      }
    } else {
      // ✅ SECONDO: Se non esiste e autoClassify è abilitato, prova classificazione automatica
      // ✅ MODIFICATO: Non fa classificazione automatica di default
      if (options?.autoClassify) {
        try {
          const classification = await ClassificationService.classifyFile(fileEntry);
          if (classification) {
            fileEntry.compartoKey = classification.compartoKey;
            fileEntry.compartoNome = classification.compartoNome;
            fileEntry.classificationSource = 'auto';

            // ✅ Salva anche in memoria globale per mostrare nei cassetti
            const updateFn = (window as any).__updatePendingClassification;
            if (updateFn && typeof updateFn === 'function') {
              updateFn(fileEntry.path, {
                compartoKey: classification.compartoKey,
                compartoNome: classification.compartoNome
              });
            }
          }
        } catch (error) {
          console.warn('Failed to classify file:', file.path, error);
        }
      }
    }

    return fileEntry;
  };

  const startScan = useCallback(async (options: ScanOptions) => {
    // ✅ Log rimosso per ridurre spam console

    // ✅ Carica classificazioni esistenti prima di iniziare la scansione
    const archiveData = (window as any).__archiveData as { praticaId?: string } | undefined;
    const praticaId = archiveData?.praticaId;
    if (praticaId) {
      try {
        const classifications = await loadExistingClassifications(praticaId);
        existingClassificationsRef.current = classifications;
        // ✅ Log rimosso per ridurre spam console
      } catch (error) {
        console.warn('[EXPLORER][CLASSIFICATION] Errore nel caricamento classificazioni:', error);
      }
    }

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
      // ✅ Log rimosso per ridurre spam console
      setProgress(prev => ({ ...prev, phase: 'counting', currentDir: 'Counting directories...' }));

      const totalDirs = await countDirectories(options.rootPath, newScanId);

      if (newScanId !== scanIdRef.current) {
        return; // Scan was cancelled
      }

      // ✅ Log rimosso per ridurre spam console

      setProgress(prev => ({
        ...prev,
        totalDirs,
        phase: 'scanning',
        currentDir: options.rootPath
      }));

      // FASE 2: Scansiona i file
      // ✅ Log rimosso per ridurre spam console
      await scanRecursively(options.rootPath, options, newScanId);

      if (newScanId === scanIdRef.current) {
        setProgress(prev => ({ ...prev, done: true, currentDir: 'Scan completed!' }));
        // ✅ Log rimosso per ridurre spam console
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

