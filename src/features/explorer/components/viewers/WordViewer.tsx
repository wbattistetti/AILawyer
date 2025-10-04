import React, { useState } from 'react';
import { FileText, ExternalLink, Download } from 'lucide-react';
import { FileEntry } from '../../types';

interface WordViewerProps {
  file: FileEntry;
  onOpenInSystem: (filePath: string) => void;
  className?: string;
}

export function WordViewer({ file, onOpenInSystem, className = '' }: WordViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.path;
    link.download = file.name;
    link.click();
  };

  const handleOpenInSystem = () => {
    onOpenInSystem(file.path);
  };

  // Simulate loading for demo purposes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setError('Word document preview not available');
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

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
              Word Document • {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown size'}
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
        {isLoading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading document...</p>
          </div>
        )}
        
        {error && (
          <div className="text-center max-w-md">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              Document Preview Not Available
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Word documents cannot be previewed in the browser. Use the system application to view this file.
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
        )}
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

