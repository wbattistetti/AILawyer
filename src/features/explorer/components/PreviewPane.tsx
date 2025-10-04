import React, { useState } from 'react';
import { X, Archive, Trash2, Download } from 'lucide-react';
import { FileEntry } from '../types';
import { PdfViewerAdapter } from './viewers/PdfViewerAdapter';
import { ImageViewer } from './viewers/ImageViewer';
import { MediaViewer } from './viewers/MediaViewer';
import { WordViewer } from './viewers/WordViewer';
import { UnknownViewer } from './viewers/UnknownViewer';

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

  const renderViewer = () => {
    switch (file.kind) {
      case 'pdf':
        return <PdfViewerAdapter file={file} onTempFileCreated={handleTempFileCreated} />;
      case 'image':
        return <ImageViewer file={file} />;
      case 'video':
      case 'audio':
        return <MediaViewer file={file} />;
      case 'word':
        return <WordViewer file={file} onOpenInSystem={onOpenInSystem} />;
      default:
        return <UnknownViewer file={file} onOpenInSystem={onOpenInSystem} />;
    }
  };

  return (
    <div className={`h-full flex flex-col bg-white ${className}`}>
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
      <div className="flex-1 overflow-hidden">
        {renderViewer()}
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

