import React, { useEffect, useState } from 'react';
import { FileEntry } from '../../types';
import { api } from '../../../../lib/api';

// Import the existing PdfReader component
import { PdfReader } from '../../../../components/viewers/PdfReader';

interface PdfViewerAdapterProps {
  file: FileEntry;
  className?: string;
  onTempFileCreated?: (tempFileName: string) => void;
}

export function PdfViewerAdapter({ file, className = '', onTempFileCreated }: PdfViewerAdapterProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempFileName, setTempFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Protezione contro copie multiple
  const [processedPath, setProcessedPath] = useState<string | null>(null); // Traccia del file già processato

  useEffect(() => {
    const loadFile = async () => {
      // Protezione contro copie multiple
      if (isProcessing || processedPath === file.path) {
        console.log('⚠️ Already processing or already processed, skipping...');
        return;
      }
      
      try {
        setIsProcessing(true);
        setLoading(true);
        setError(null);

        // Se il path inizia con http:// o https://, è già un URL
        if (file.path.startsWith('http://') || file.path.startsWith('https://')) {
          setFileUrl(file.path);
          setLoading(false);
          return;
        }

        // Usiamo lo stesso sistema del drag & drop: carichiamo il file e usiamo getLocalFileUrl
        console.log('🔄 Uploading file like drag & drop:', file.path);
        
        // Leggiamo il file dal filesystem
        const response = await fetch('http://localhost:3001/api/filesystem/read-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filePath: file.path }),
        });

        if (!response.ok) {
          throw new Error(`Failed to read file: ${response.status}`);
        }

        const fileBlob = await response.blob();
        const fileObj = new File([fileBlob], file.name, { type: 'application/pdf' });
        
        // Carichiamo il file usando lo stesso sistema del drag & drop
        const { uploadUrl, s3Key } = await api.getUploadUrl(fileObj.name, fileObj.type);
        await api.uploadFile(uploadUrl, fileObj);
        
        console.log('✅ File uploaded with s3Key:', s3Key);
        
        // Usiamo lo stesso URL del sistema esistente
        const localFileUrl = api.getLocalFileUrl(s3Key);
        console.log('🔍 Using same URL as thumbnails:', localFileUrl);
        setFileUrl(localFileUrl);
        
        // Notifica il componente padre con la chiave S3
        if (onTempFileCreated) {
          onTempFileCreated(s3Key);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading PDF file:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF file');
        setLoading(false);
      } finally {
        setIsProcessing(false); // Reset della protezione
        setProcessedPath(file.path); // Marca il file come processato
      }
    };

    loadFile();
  }, [file.path]); // Rimuovo onTempFileCreated dalle dipendenze per evitare loop

  // Reset quando cambia il file
  useEffect(() => {
    setProcessedPath(null);
    setFileUrl(null);
    setTempFileName(null);
    setError(null);
  }, [file.path]);

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Preparing file for preview...</p>
          <p className="text-xs text-gray-500 mt-1">File: {file.name}</p>
        </div>
      </div>
    );
  }

  if (error || !fileUrl) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-600">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading PDF</h3>
          <p className="text-sm text-gray-500 mb-4">
            {error || 'Unable to load PDF file'}
          </p>
          <p className="text-xs text-gray-400">
            Path: {file.path}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <PdfReader 
        fileUrl={fileUrl}
        className="h-full"
      />
    </div>
  );
}

