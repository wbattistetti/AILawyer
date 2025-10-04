import React from 'react';
import { X } from 'lucide-react';
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

  const renderViewer = () => {
    switch (file.kind) {
      case 'pdf':
        return <PdfViewerAdapter file={file} />;
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
          </p>
        </div>
        
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
          title="Close preview"
        >
          <X className="w-4 h-4" />
        </button>
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

