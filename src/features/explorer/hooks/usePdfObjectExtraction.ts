import { useState, useEffect, useCallback, useRef } from 'react';
import { FileEntry } from '../types';

interface UsePdfObjectExtractionOptions {
  files: FileEntry[];
  scanning: boolean;
  onFileUpdate: (fileId: string, oggetto: string | null) => void;
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.oggetto || null;
    } catch (error) {
      console.warn('[PDF Object Extraction] Failed for:', filePath, error);
      // Safe default: ritorna null (oggetto non trovato)
      return null;
    }
  }, []);

  // Processa il prossimo PDF nella queue
  const processNext = useCallback(async () => {
    // Se siamo in pausa o non ci sono PDF da processare, ferma e cancella timeout
    if (abortRef.current || queueRef.current.length === 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Prendi il primo PDF dalla queue
    const file = queueRef.current.shift();
    if (!file || processingRef.current.has(file.id)) {
      // Se non c'è file o è già in processing, ferma (non riprovare)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    processingRef.current.add(file.id);

    try {
      // Chiama l'endpoint backend per estrarre l'oggetto
      const oggetto = await extractObject(file.path, file.hasNativeText);

      // Aggiorna lo stato del file
      onFileUpdate(file.id, oggetto);
    } catch (error) {
      console.error('[PDF Object Extraction] Error processing file:', file.path, error);
      // In caso di errore, assumiamo che l'oggetto non è stato trovato
      onFileUpdate(file.id, null);
    } finally {
      processingRef.current.delete(file.id);

      // Processa il prossimo PDF dopo un breve delay (per non bloccare l'UI)
      // Solo se ci sono ancora file nella queue
      if (queueRef.current.length > 0 && !abortRef.current) {
        timeoutRef.current = setTimeout(processNext, 100);
      } else {
        timeoutRef.current = null;
      }
    }
  }, [extractObject, onFileUpdate]);

  // Quando i file cambiano o lo scan finisce, aggiorna la queue
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
      return;
    }

    // Quando lo scan è completato, inizia il processing lazy
    abortRef.current = false;

    // Filtra solo i PDF che non sono ancora stati controllati (oggetto === undefined)
    // e che hanno già hasNativeText determinato
    const pdfsToCheck = files.filter(
      file => file.kind === 'pdf' &&
      file.oggetto === undefined && // Solo quelli non ancora processati
      file.hasNativeText !== undefined // Aspetta che hasNativeText sia determinato prima
    );

    // Aggiungi alla queue solo i PDF nuovi (non già in processing o già in queue)
    const queueIds = new Set(queueRef.current.map(f => f.id));
    const newPdfs = pdfsToCheck.filter(
      pdf => !processingRef.current.has(pdf.id) && !queueIds.has(pdf.id)
    );

    if (newPdfs.length > 0) {
      queueRef.current.push(...newPdfs);

      // Inizia il processing solo se non è già in corso
      if (!timeoutRef.current && queueRef.current.length > 0) {
        // Usa requestIdleCallback se disponibile, altrimenti setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as any).requestIdleCallback(processNext, { timeout: 1000 });
        } else {
          timeoutRef.current = setTimeout(processNext, 200);
        }
      }
    }
  }, [files, scanning, processNext]);

  // Cleanup quando il componente viene smontato
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
}

