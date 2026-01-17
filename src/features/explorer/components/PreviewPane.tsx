import React, { useState, useEffect, useRef } from 'react';
import { X, Archive, Trash2, Download } from 'lucide-react';
import { FileEntry } from '../types';
import { PdfViewerAdapter } from './viewers/PdfViewerAdapter';
import { PhotoViewerAdapter } from './viewers/PhotoViewerAdapter';
import { VideoViewerAdapter } from './viewers/VideoViewerAdapter';
import { AudioViewerAdapter } from './viewers/AudioViewerAdapter';
import { WordViewerAdapter } from './viewers/WordViewerAdapter';
import { UnknownViewer } from './viewers/UnknownViewer';
import { DragAndDropService } from '../../../services/DragAndDropService';

interface PreviewPaneProps {
  file?: FileEntry;
  onClose: () => void;
  onOpenInSystem: (filePath: string) => void;
  className?: string;
}

export function PreviewPane({ file, onClose, onOpenInSystem, className = '' }: PreviewPaneProps) {
  const [tempFileName, setTempFileName] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const previousFileIdRef = useRef<string | null>(null);

  // ✅ Mostra spinner iniziale quando cambia il file - DEVE essere prima dell'early return!
  useEffect(() => {
    if (!file) {
      setIsInitializing(false);
      previousFileIdRef.current = null;
      return;
    }

    // Se è un file diverso, mostra lo spinner iniziale
    if (file.id !== previousFileIdRef.current) {
      setIsInitializing(true);
      previousFileIdRef.current = file.id;

      // Nascondi lo spinner dopo un breve delay per permettere al viewer di iniziare a caricare
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 300); // 300ms dovrebbe essere sufficiente per vedere lo spinner

      return () => clearTimeout(timer);
    }
  }, [file?.id]);

  if (!file) {
    return (
      <div className={`h-full flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-gray-400">👁️</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Preview</h3>
          <p className="text-sm text-gray-500">
            Select a file to preview its contents
          </p>
        </div>
      </div>
    );
  }

  const handleTempFileCreated = (fileName: string) => {
    setTempFileName(fileName);
  };

  const handleAddToArchive = async () => {
    if (!tempFileName) return;

    setIsArchiving(true);
    try {
      // Per ora, mostriamo solo un messaggio di successo
      // In futuro, possiamo implementare il trasferimento a una pratica specifica
      console.log('✅ File ready for archive:', tempFileName);

      // Reset temp file state
      setTempFileName(null);

      // Show success message
      alert('File ready for archive! (Feature to be implemented)');

    } catch (error) {
      console.error('Error preparing file for archive:', error);
      alert('Failed to prepare file for archive');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteTemp = async () => {
    if (!tempFileName) return;

    setIsDeleting(true);
    try {
      // Per ora, mostriamo solo un messaggio di successo
      // In futuro, possiamo implementare la cancellazione del file S3
      console.log('✅ Temp file marked for deletion:', tempFileName);

      // Reset temp file state
      setTempFileName(null);

      // Close preview
      onClose();

    } catch (error) {
      console.error('Error deleting temp file:', error);
      alert('Failed to delete temp file');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!file) {
      console.log('[PREVIEW-PANE][DRAG-START] ❌ File non disponibile')
      return;
    }

    console.log('[PREVIEW-PANE][DRAG-START] ✅ Inizio drag', {
      fileId: file.id,
      fileName: file.name,
      filePath: file.path,
      target: (e.target as HTMLElement)?.tagName
    })

    setIsDragging(true);
    // ✅ Usa il servizio centralizzato per setup drag
    DragAndDropService.setupExplorerFileDragStart(e, {
      id: file.id,
      path: file.path,
      name: file.name
    });

    console.log('[PREVIEW-PANE][DRAG-START] ✅ Setup completato, types:', Array.from(e.dataTransfer?.types || []))
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const renderViewer = () => {
    switch (file.kind) {
      case 'pdf':
        return <PdfViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      case 'image':
        return <PhotoViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      case 'video':
        return <VideoViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      case 'audio':
        return <AudioViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      case 'word':
        return <WordViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      default:
        return <UnknownViewer file={file} onOpenInSystem={onOpenInSystem} />;
    }
  };

  return (
    <div
      className={`h-full w-full flex flex-col bg-white ${className} ${isDragging ? 'opacity-50' : ''}`}
      draggable={!!file}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </h3>
          <p className="text-xs text-gray-500">
            {file.kind.toUpperCase()} • {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown size'}
            {tempFileName && <span className="ml-2 text-blue-600">• Temp file ready</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Action buttons - only show if temp file exists */}
          {tempFileName && (
            <>
              <button
                onClick={handleAddToArchive}
                disabled={isArchiving}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded transition-colors"
                title="Add to archive"
              >
                <Archive className="w-3 h-3" />
                {isArchiving ? 'Adding...' : 'Archive'}
              </button>

              <button
                onClick={handleDeleteTemp}
                disabled={isDeleting}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded transition-colors"
                title="Delete temp file"
              >
                <Trash2 className="w-3 h-3" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
            title="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewer Content */}
      <div className="flex-1 overflow-auto relative">
        {/* ✅ Spinner iniziale quando si apre un nuovo file */}
        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Sto caricando il documento...</p>
            </div>
          </div>
        )}
        <div className={isInitializing ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'}>
          {renderViewer()}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

