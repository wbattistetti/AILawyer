import { useState, useEffect, useCallback, useRef } from 'react';
import { FileEntry } from '../types';

interface UsePdfNativeTextDetectionOptions {
  files: FileEntry[];
  scanning: boolean;
  onFileUpdate: (fileId: string, hasNativeText: boolean) => void;
}

/**
 * Hook che processa i PDF in modo lazy per determinare se hanno bisogno di OCR.
 * Processa i PDF uno alla volta dopo che lo scan è completato, per non bloccare l'interfaccia.
 */
export function usePdfNativeTextDetection({
  files,
  scanning,
  onFileUpdate
}: UsePdfNativeTextDetectionOptions) {
  const [isInspecting, setIsInspecting] = useState(false);
  const processingRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<FileEntry[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);

  // Funzione per chiamare l'endpoint backend
  const detectNativeText = useCallback(async (filePath: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3001/api/filesystem/detect-native-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.hasNativeText === true;
    } catch (error) {
      console.warn('[PDF Native Text Detection] Failed for:', filePath, error);
      // Safe default: assume no native text (needs OCR)
      return false;
    }
  }, []);

  // Processa il prossimo PDF nella queue
  const processNext = useCallback(async () => {
    // Se siamo in pausa o non ci sono PDF da processare, ferma
    if (abortRef.current || queueRef.current.length === 0) {
      setIsInspecting(false);
      return;
    }

    // Prendi il primo PDF dalla queue
    const file = queueRef.current.shift();
    if (!file || processingRef.current.has(file.id)) {
      // Se non c'è file o è già in processing, riprova dopo un po'
      timeoutRef.current = setTimeout(processNext, 100);
      return;
    }

    setIsInspecting(true);
    processingRef.current.add(file.id);

    try {
      // Chiama l'endpoint backend per rilevare il testo nativo
      const hasNativeText = await detectNativeText(file.path);

      // Aggiorna lo stato del file
      onFileUpdate(file.id, hasNativeText);
    } catch (error) {
      console.error('[PDF Native Text Detection] Error processing file:', file.path, error);
      // In caso di errore, assumiamo che non ha testo nativo (safe default)
      onFileUpdate(file.id, false);
    } finally {
      processingRef.current.delete(file.id);

      // Processa il prossimo PDF dopo un breve delay (per non bloccare l'UI)
      timeoutRef.current = setTimeout(processNext, 50);
    }
  }, [detectNativeText, onFileUpdate]);

  // Quando i file cambiano o lo scan finisce, aggiorna la queue
  useEffect(() => {
    // Reset quando cambia la directory o si inizia un nuovo scan
    if (scanning) {
      abortRef.current = true;
      queueRef.current = [];
      processingRef.current.clear();
      setIsInspecting(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Quando lo scan è completato, inizia il processing lazy
    abortRef.current = false;

    // Filtra solo i PDF che non sono ancora stati controllati
    const pdfsToCheck = files.filter(
      file => file.kind === 'pdf' && file.hasNativeText === undefined
    );

    // Aggiungi alla queue solo i PDF nuovi (non già in processing)
    const newPdfs = pdfsToCheck.filter(
      pdf => !processingRef.current.has(pdf.id)
    );

    if (newPdfs.length > 0) {
      queueRef.current.push(...newPdfs);

      // Inizia il processing se non è già in corso
      if (!isInspecting && queueRef.current.length > 0) {
        // Usa requestIdleCallback se disponibile, altrimenti setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as any).requestIdleCallback(processNext, { timeout: 1000 });
        } else {
          timeoutRef.current = setTimeout(processNext, 100);
        }
      }
    }
  }, [files, scanning, isInspecting, processNext]);

  // Cleanup quando il componente viene smontato
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isInspecting
  };
}

