import React, { useEffect, useState, useRef } from 'react';
import { FileEntry } from '../../types';
import { MediaViewer } from './MediaViewer';

interface VideoViewerAdapterProps {
  file: FileEntry;
  className?: string;
  onTempFileCreated?: (tempFileName: string) => void;
}

export function VideoViewerAdapter({ file, className = '', onTempFileCreated }: VideoViewerAdapterProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedPath, setProcessedPath] = useState<string | null>(null);

  // ✅ REF per mantenere il blob URL e evitare revoca prematura durante re-render
  const blobUrlRef = useRef<string | null>(null);
  const fileBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      if (isProcessing || processedPath === file.path) {
        console.log('[VIDEO-ADAPTER] Skip loadFile:', { isProcessing, processedPath, filePath: file.path });
        return;
      }

      console.log('[VIDEO-ADAPTER] loadFile START:', { filePath: file.path });

      try {
        setIsProcessing(true);
        setLoading(true);
        setError(null);

        // Se è già un URL HTTP, usalo direttamente
        if (file.path.startsWith('http://') || file.path.startsWith('https://')) {
          console.log('[VIDEO-ADAPTER] Usa URL HTTP diretto:', file.path);
          setFileUrl(file.path);
          setLoading(false);
          return;
        }

        // ✅ Per file molto grandi (>500MB), usa streaming diretto dal backend
        // ✅ Per file più piccoli, crea blob URL locale (migliore compatibilità con AVI)
        const fileSize = file.sizeBytes || 0;
        const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024; // 500MB

        let finalUrl: string;

        if (fileSize > LARGE_FILE_THRESHOLD) {
          // ✅ Streaming diretto per file molto grandi (evita caricamento completo in memoria)
          console.log('[VIDEO-ADAPTER] File grande, uso streaming diretto:', { filePath: file.path, size: fileSize });
          finalUrl = `http://localhost:3001/api/filesystem/file/${encodeURIComponent(file.path)}`;
          setFileUrl(finalUrl);
        } else {
          // ✅ CORREZIONE: Per file dal filesystem, crea blob URL locale (come PhotoViewerAdapter)
          // ✅ AVI e altri formati video non sono sempre supportati in streaming HTTP diretto
          // ✅ Il blob URL permette al browser di decodificare correttamente il video
          // ✅ L'upload avverrà solo quando l'utente salva la pratica
          console.log('[VIDEO-ADAPTER] Caricamento file per blob URL:', file.path);
          const response = await fetch('http://localhost:3001/api/filesystem/read-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: file.path }),
          });

          if (!response.ok) throw new Error(`Failed to read file: ${response.status}`);

          const fileBlob = await response.blob();
          console.log('[VIDEO-ADAPTER] File caricato, creazione blob URL. Size:', fileBlob.size);

          // ✅ Mantieni il blob in memoria per evitare garbage collection
          fileBlobRef.current = fileBlob;

          // ✅ Crea blob URL locale per il preview (non fa upload al backend)
          finalUrl = URL.createObjectURL(fileBlob);
          console.log('[VIDEO-ADAPTER] Blob URL creato:', finalUrl);

          // ✅ Salva il blob URL nel ref PRIMA di settarlo nello state
          blobUrlRef.current = finalUrl;
          setFileUrl(finalUrl);
        }

        // ✅ Notifica il componente padre con il filePath (non s3Key)
        // ✅ Questo permetterà al salvataggio differenziale di gestire correttamente il file
        if (onTempFileCreated) {
          onTempFileCreated(file.path); // Passa filePath invece di s3Key
        }

        setLoading(false);
        console.log('[VIDEO-ADAPTER] loadFile SUCCESS:', { fileUrl: finalUrl });
      } catch (err) {
        console.error('[VIDEO-ADAPTER] loadFile ERROR:', err);
        setError(err instanceof Error ? err.message : 'Failed to load video');
        setLoading(false);
      } finally {
        setIsProcessing(false);
        setProcessedPath(file.path);
      }
    };

    loadFile();
    // ✅ RIMOSSO onTempFileCreated dalle dipendenze per evitare loop infiniti
    // ✅ onTempFileCreated viene chiamato solo quando necessario, non serve nelle dipendenze
  }, [file.path, isProcessing, processedPath]);

  // ✅ Cleanup blob URL SOLO quando il componente viene smontato
  useEffect(() => {
    return () => {
      // ✅ Revoca il blob URL solo se esiste nel ref (evita revoca durante re-render)
      if (blobUrlRef.current) {
        console.log('[VIDEO-ADAPTER] Cleanup blob URL al dismount:', blobUrlRef.current);
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
        fileBlobRef.current = null;
      }
    };
  }, []); // ✅ Array vuoto: cleanup solo al dismount

  // ✅ CORREZIONE: Reset solo quando file.path cambia EFFETTIVAMENTE (non ad ogni render)
  useEffect(() => {
    // ✅ Reset solo se il path è diverso da quello già processato
    if (processedPath && processedPath !== file.path) {
      console.log('[VIDEO-ADAPTER] Reset state per nuovo file:', { oldPath: processedPath, newPath: file.path });
      // ✅ Revoca blob URL prima di resettare
      if (blobUrlRef.current) {
        console.log('[VIDEO-ADAPTER] Revoca blob URL per cambio file:', blobUrlRef.current);
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
        fileBlobRef.current = null;
      }
      setProcessedPath(null);
      setFileUrl(null);
      setError(null);
      setLoading(true);
    }
  }, [file.path, processedPath]);

  console.log('[VIDEO-ADAPTER] Render:', { loading, error, fileUrl, filePath: file.path });

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
          <p className="text-sm">Sto caricando il video...</p>
        </div>
      </div>
    );
  }

  if (error || !fileUrl) {
    console.warn('[VIDEO-ADAPTER] Error o fileUrl mancante:', { error, fileUrl });
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <p className="text-sm">{error || 'Unable to load video'}</p>
        </div>
      </div>
    );
  }

  console.log('[VIDEO-ADAPTER] Rendering MediaViewer con fileUrl:', fileUrl);
  return <MediaViewer file={{ ...file, path: fileUrl, kind: 'video' }} className={className} />;
}
