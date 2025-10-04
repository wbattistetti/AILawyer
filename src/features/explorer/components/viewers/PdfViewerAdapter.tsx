import React from 'react';
import { FileEntry } from '../../types';

// Import the existing PdfReader component
import { PdfReader } from '../../../../components/viewers/PdfReader';

interface PdfViewerAdapterProps {
  file: FileEntry;
  className?: string;
}

export function PdfViewerAdapter({ file, className = '' }: PdfViewerAdapterProps) {
  return (
    <div className={`h-full ${className}`}>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </h3>
          <p className="text-xs text-gray-500">
            PDF Document • {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown size'}
          </p>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <PdfReader 
            fileUrl={file.path}
            className="h-full"
          />
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
