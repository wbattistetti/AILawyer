import { useState, useEffect, useCallback, useRef } from 'react';
import { FileEntry } from '../types';

interface UsePdfObjectExtractionOptions {
  files: FileEntry[];
  scanning: boolean;
  onFileUpdate: (fileId: string, oggetto: string | null) => void;
}

export interface ObjectExtractionStatus {
  total: number;
  completed: number;
  inQueue: number;
  inProcessing: number;
  isComplete: boolean;
  percentage: number;
}

/**
 * Hook che processa i PDF in modo lazy per estrarre l'oggetto.
 * Processa i PDF uno alla volta dopo che lo scan è completato, per non bloccare l'interfaccia.
 */
export function usePdfObjectExtraction({
  files,
  scanning,
  onFileUpdate
}: UsePdfObjectExtractionOptions) {
  const processingRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<FileEntry[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);
  const lastSignatureRef = useRef<string>('');

  // Stato per esporre informazioni di completamento
  const [status, setStatus] = useState<ObjectExtractionStatus>({
    total: 0,
    completed: 0,
    inQueue: 0,
    inProcessing: 0,
    isComplete: false,
    percentage: 0
  });

  // Funzione per chiamare l'endpoint backend
  const extractObject = useCallback(async (filePath: string, hasNativeText?: boolean): Promise<string | null> => {
    try {
      const response = await fetch('http://localhost:3001/api/filesystem/extract-object', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath, hasNativeText }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[PDF Object Extraction][HTTP_ERROR]', {
          filePath: filePath.split(/[/\\]/).pop(),
          status: response.status,
          error: errorText.substring(0, 200)
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.oggetto || null;
    } catch (error: any) {
      // Log solo errori reali (non "oggetto non trovato")
      if (error?.message && !error.message.includes('HTTP error')) {
        console.error('[PDF Object Extraction][ERROR]', {
          filePath: filePath.split(/[/\\]/).pop(),
          error: error?.message || String(error)
        });
      }
      return null;
    }
  }, []);


  // Funzione per calcolare lo stato di completamento
  const calculateStatus = useCallback(() => {
    // Conta solo i PDF che hanno già hasNativeText determinato (pronti per l'estrazione)
    const pdfFiles = files.filter(f => f.kind === 'pdf' && f.hasNativeText !== undefined);
    const total = pdfFiles.length;
    const completed = pdfFiles.filter(f => f.oggetto !== undefined).length;
    const inQueue = queueRef.current.length;
    const inProcessing = processingRef.current.size;
    const isComplete = !scanning && total > 0 && completed === total && inQueue === 0 && inProcessing === 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    setStatus({
      total,
      completed,
      inQueue,
      inProcessing,
      isComplete,
      percentage
    });
  }, [files, scanning]);

  // Aggiorna lo stato quando cambiano i file, lo scanning o il processing
  useEffect(() => {
    calculateStatus();
  }, [calculateStatus]);

  // Aggiorna lo stato anche dopo ogni aggiornamento di file (usando un piccolo delay)
  const handleFileUpdate = useCallback((fileId: string, oggetto: string | null) => {
    onFileUpdate(fileId, oggetto);
    // Aggiorna lo stato dopo un breve delay per permettere al file di aggiornarsi
    setTimeout(calculateStatus, 100);
  }, [onFileUpdate, calculateStatus]);

  // Cleanup quando il componente viene smontato
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Sostituisci tutte le chiamate a onFileUpdate con handleFileUpdate
  const processNextWithStatus = useCallback(async () => {
    // Se siamo in pausa o non ci sono PDF da processare, ferma e cancella timeout
    if (abortRef.current || queueRef.current.length === 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      calculateStatus();
      return;
    }

    // Prendi il primo PDF dalla queue
    const file = queueRef.current.shift();
    if (!file || processingRef.current.has(file.id)) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      calculateStatus();
      return;
    }

    processingRef.current.add(file.id);
    calculateStatus();

    // Log solo per PDF con OCR (più lenti)
    if (file.hasNativeText === false) {
      console.log('[PDF Object Extraction][OCR]', { fileName: file.name });
    }

    try {
      // Chiama l'endpoint backend per estrarre l'oggetto
      const oggetto = await extractObject(file.path, file.hasNativeText);

      // Log solo se oggetto trovato o se OCR fallisce
      if (oggetto || file.hasNativeText === false) {
        console.log('[PDF Object Extraction][RESULT]', {
          fileName: file.name,
          found: !!oggetto,
          length: oggetto ? oggetto.length : 0
        });
      }

      // Aggiorna lo stato del file
      handleFileUpdate(file.id, oggetto);
    } catch (error: any) {
      // Log solo errori reali
      console.error('[PDF Object Extraction][ERROR]', {
        fileName: file.name,
        error: error?.message || String(error)
      });
      // In caso di errore, assumiamo che l'oggetto non è stato trovato
      handleFileUpdate(file.id, null);
    } finally {
      processingRef.current.delete(file.id);
      calculateStatus();

      // Processa il prossimo PDF dopo un breve delay (per non bloccare l'UI)
      if (queueRef.current.length > 0 && !abortRef.current) {
        // Controlla se ci sono altri PDF OCR in processing
      const currentProcessingOCR = Array.from(processingRef.current).filter(id => {
        const file = files.find(f => f.id === id);
        return file && file.kind === 'pdf' && file.hasNativeText === false;
      }).length;

      // ✅ OTTIMIZZATO: Permetti più OCR in parallelo (fino a 3)
      // Ridotto delay per velocizzare il processing
      const nextFile = queueRef.current[0];
      const nextFileNeedsOCR = nextFile && nextFile.kind === 'pdf' && nextFile.hasNativeText === false;

      // Se il prossimo file richiede OCR e abbiamo già raggiunto il limite (3), aspetta
      if (nextFileNeedsOCR && currentProcessingOCR >= 3) {
        timeoutRef.current = setTimeout(processNextWithStatus, 200);
      } else {
        // ✅ Ridotto delay da 100ms a 50ms per velocizzare
        timeoutRef.current = setTimeout(processNextWithStatus, 50);
      }
      } else {
        timeoutRef.current = null;
      }
    }
  }, [extractObject, handleFileUpdate, calculateStatus, files]);

  // Sostituisci processNext con processNextWithStatus nel useEffect
  useEffect(() => {
    // Reset quando cambia la directory o si inizia un nuovo scan
    if (scanning) {
      abortRef.current = true;
      queueRef.current = [];
      processingRef.current.clear();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      lastSignatureRef.current = '';
      calculateStatus();
      return;
    }

    // Quando lo scan è completato, inizia il processing lazy
    abortRef.current = false;

    // Crea una signature basata solo su id e hasNativeText (NON oggetto)
    const filesSignature = JSON.stringify(
      files
        .filter(f => f.kind === 'pdf')
        .map(f => ({ id: f.id, hasNativeText: f.hasNativeText }))
        .sort((a, b) => a.id.localeCompare(b.id))
    );

    if (lastSignatureRef.current === filesSignature) {
      return;
    }
    lastSignatureRef.current = filesSignature;

    // Filtra solo i PDF che non sono ancora stati controllati
    const pdfsToCheck = files.filter(
      file => file.kind === 'pdf' &&
      file.oggetto === undefined &&
      file.hasNativeText !== undefined
    );

    // Aggiungi alla queue solo i PDF nuovi
    const queueIds = new Set(queueRef.current.map(f => f.id));
    const newPdfs = pdfsToCheck.filter(
      pdf => !processingRef.current.has(pdf.id) && !queueIds.has(pdf.id)
    );

    if (newPdfs.length > 0) {
      queueRef.current.push(...newPdfs);
      calculateStatus();

      const currentProcessingOCR = Array.from(processingRef.current).filter(id => {
        const file = files.find(f => f.id === id);
        return file && file.kind === 'pdf' && file.hasNativeText === false;
      }).length;

      // ✅ OTTIMIZZATO: Permetti più OCR in parallelo (3 invece di 1)
      // Questo accelera significativamente il processing quando ci sono molti PDF OCR
      const hasOcrPdfs = newPdfs.some(p => p.hasNativeText === false) || currentProcessingOCR > 0;
      const maxParallel = hasOcrPdfs ? 3 : 5; // ✅ Aumentato: 3 OCR paralleli, 5 PDF nativi

      if (!timeoutRef.current && queueRef.current.length > 0 && currentProcessingOCR < maxParallel) {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as any).requestIdleCallback(processNextWithStatus, { timeout: 1000 });
        } else {
          timeoutRef.current = setTimeout(processNextWithStatus, 200);
        }
      }
    } else {
      calculateStatus();
    }
  }, [files, scanning, processNextWithStatus, calculateStatus]);

  // Ritorna lo stato
  return { status };
}


