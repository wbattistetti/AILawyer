import React from 'react';
import { File, ExternalLink, Download } from 'lucide-react';
import { FileEntry } from '../../types';

interface UnknownViewerProps {
  file: FileEntry;
  onOpenInSystem: (filePath: string) => void;
  className?: string;
}

export function UnknownViewer({ file, onOpenInSystem, className = '' }: UnknownViewerProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.path;
    link.download = file.name;
    link.click();
  };

  const handleOpenInSystem = () => {
    onOpenInSystem(file.path);
  };

  const getFileExtension = () => {
    const ext = file.ext || file.name.split('.').pop();
    return ext ? `.${ext}` : 'Unknown';
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </h3>
            <p className="text-xs text-gray-500">
              {getFileExtension()} • {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown size'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleOpenInSystem}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
              title="Open with system app"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md">
          <File className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            File Type Not Supported
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            This file type cannot be previewed in the browser. Use the system application to view this file.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={handleOpenInSystem}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Open with System App
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
            >
              Download
            </button>
          </div>
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

