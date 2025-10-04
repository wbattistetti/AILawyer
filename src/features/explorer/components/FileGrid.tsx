import React, { useState, useCallback } from 'react';
// import { FixedSizeList as List } from 'react-window';
import { 
  FileText, 
  Image, 
  Video, 
  Music, 
  File,
  MoreHorizontal,
  CheckSquare,
  Square,
  FileType,
  FileImage
} from 'lucide-react';
import { FileEntry, FileKind } from '../types';
import { MimeService } from '../services/MimeService';

interface FileGridProps {
  files: FileEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (fileId: string) => void;
  onOpenPreview: (file: FileEntry) => void;
  onRowMenu: (file: FileEntry, action: string) => void;
  className?: string;
}

interface FileRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    files: FileEntry[];
    selectedIds: Set<string>;
    onToggleSelection: (fileId: string) => void;
    onOpenPreview: (file: FileEntry) => void;
    onRowMenu: (file: FileEntry, action: string) => void;
  };
}

function FileRow({ index, style, data }: FileRowProps) {
  const { files, selectedIds, onToggleSelection, onOpenPreview, onRowMenu } = data;
  const file = files[index];
  const isSelected = selectedIds.has(file.id);

  const handleClick = useCallback(() => {
    onOpenPreview(file);
  }, [file, onOpenPreview]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelection(file.id);
  }, [file.id, onToggleSelection]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRowMenu(file, 'menu');
  }, [file, onRowMenu]);

  const getFileIcon = (kind: FileKind) => {
    const iconClass = "w-5 h-5";
    
    switch (kind) {
      case 'pdf':
        return <FileType className={`${iconClass} text-red-600`} />; // Icona più specifica per PDF
      case 'word':
        return <FileText className={`${iconClass} text-blue-600`} />; // Manteniamo FileText per Word
      case 'image':
        return <FileImage className={`${iconClass} text-green-600`} />; // Icona più specifica per immagini
      case 'video':
        return <Video className={`${iconClass} text-purple-600`} />;
      case 'audio':
        return <Music className={`${iconClass} text-orange-600`} />;
      default:
        return <File className={`${iconClass} text-gray-600`} />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div
      style={style}
      className={`
        flex items-center px-4 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer
        ${isSelected ? 'bg-blue-50' : ''}
      `}
      onClick={handleClick}
    >
      {/* Checkbox */}
      <div className="w-6 h-6 flex items-center justify-center mr-3">
        {isSelected ? (
          <CheckSquare className="w-4 h-4 text-blue-600" />
        ) : (
          <Square className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* File Icon */}
      <div className="w-8 h-8 flex items-center justify-center mr-3">
        {getFileIcon(file.kind)}
      </div>

      {/* File Name */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 whitespace-nowrap overflow-hidden">
          {file.name}
        </div>
        <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden">
          {file.parentDirName}
        </div>
      </div>

      {/* File Size */}
      <div className="w-20 text-right text-xs text-gray-500 mr-4">
        {formatFileSize(file.sizeBytes)}
      </div>

      {/* Date */}
      <div className="w-24 text-right text-xs text-gray-500 mr-4">
        {formatDate(file.mtime)}
      </div>

      {/* Actions Menu */}
      <div className="w-8 h-8 flex items-center justify-center">
        <button
          onClick={handleMenuClick}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}

export function FileGrid({
  files,
  selectedIds,
  onToggleSelection,
  onOpenPreview,
  onRowMenu,
  className = ''
}: FileGridProps) {

  const itemData = {
    files,
    selectedIds,
    onToggleSelection,
    onOpenPreview,
    onRowMenu
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
        <div className="w-6 mr-3"></div>
        <div className="w-8 mr-3"></div>
        <div className="flex-1">Name</div>
        <div className="w-20 text-right mr-4">Size</div>
        <div className="w-24 text-right mr-4">Date</div>
        <div className="w-8"></div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {files.length > 0 ? (
          <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {files.map((file, index) => (
              <FileRow
                key={file.id}
                index={index}
                style={{}}
                data={itemData}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <File className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No files found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
