import React, { useEffect, useState } from 'react';
import { FileEntry } from '../../types';
import { api } from '../../../../lib/api';
import { ImageViewer } from './ImageViewer';

interface PhotoViewerAdapterProps {
  file: FileEntry;
  className?: string;
  onTempFileCreated?: (tempFileName: string) => void;
}

export function PhotoViewerAdapter({ file, className = '', onTempFileCreated }: PhotoViewerAdapterProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedPath, setProcessedPath] = useState<string | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      if (isProcessing || processedPath === file.path) {
        return;
      }

      try {
        setIsProcessing(true);
        setLoading(true);
        setError(null);

        // Se è già un URL HTTP, usalo direttamente
        if (file.path.startsWith('http://') || file.path.startsWith('https://')) {
          setFileUrl(file.path);
          setLoading(false);
          return;
        }

        // Carica il file dal filesystem
        const response = await fetch('http://localhost:3001/api/filesystem/read-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: file.path }),
        });

        if (!response.ok) throw new Error(`Failed to read file: ${response.status}`);

        const fileBlob = await response.blob();
        const mimeType = fileBlob.type || 'image/jpeg';
        const fileObj = new File([fileBlob], file.name, { type: mimeType });

        // Carica su S3
        const { uploadUrl, s3Key } = await api.getUploadUrl(fileObj.name, fileObj.type);
        await api.uploadFile(uploadUrl, fileObj);

        const localFileUrl = api.getLocalFileUrl(s3Key);
        setFileUrl(localFileUrl);

        if (onTempFileCreated) {
          onTempFileCreated(s3Key);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading image:', err);
        setError(err instanceof Error ? err.message : 'Failed to load image');
        setLoading(false);
      } finally {
        setIsProcessing(false);
        setProcessedPath(file.path);
      }
    };

    loadFile();
  }, [file.path, isProcessing, processedPath, onTempFileCreated]);

  useEffect(() => {
    setProcessedPath(null);
    setFileUrl(null);
    setError(null);
  }, [file.path]);

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Sto caricando l'immagine...</p>
        </div>
      </div>
    );
  }

  if (error || !fileUrl) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <p className="text-sm text-red-600">{error || 'Unable to load image'}</p>
        </div>
      </div>
    );
  }

  // ✅ Passa fileUrl invece di file.path a ImageViewer
  return <ImageViewer file={{ ...file, path: fileUrl }} className={className} />;
}
