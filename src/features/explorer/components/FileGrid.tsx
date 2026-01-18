import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  FileImage,
  Loader2,
  ArrowUpDown,
  Calendar
} from 'lucide-react';
import { FileEntry, FileKind, SortField, SortOrder } from '../types';
import { MimeService } from '../services/MimeService';
import { CompartiService, CompartoOption } from '../services/CompartiService';
import { ObjectExtractionStatus } from '../hooks/usePdfObjectExtraction';
import { DragAndDropService } from '../../../services/DragAndDropService';

// Hook per colonna "Oggetto" ridimensionabile
function useOggettoColumnWidth() {
  const [width, setWidth] = useState(250); // Larghezza iniziale
  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizingRef.current = {
      startX: e.clientX,
      startWidth: width
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;

      const { startX, startWidth: startW } = resizingRef.current;
      const delta = moveEvent.clientX - startX;
      const minWidth = 150;
      const newWidth = Math.max(minWidth, startW + delta);

      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  return { width, handleResizeStart };
}

interface FileGridProps {
  files: FileEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (fileId: string) => void;
  onOpenPreview: (file: FileEntry) => void;
  onRowMenu: (file: FileEntry, action: string) => void;
  onFileClassificationChange?: (fileId: string, compartoKey: string, compartoNome: string) => void;
  className?: string;
  objectExtractionStatus?: ObjectExtractionStatus;
  isExtractionEnabled?: boolean; // ✅ Se false, non mostrare "Sto analizzando l'oggetto..."
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSortChange?: (field: SortField, order: SortOrder) => void;
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
    onFileClassificationChange?: (fileId: string, compartoKey: string, compartoNome: string) => void;
    compartoColumnWidth: number;
    oggettoColumnWidth: number;
    handleOggettoResizeStart?: (e: React.MouseEvent) => void;
  };
}

function FileRow({ index, style, data }: FileRowProps) {
  const { files, selectedIds, onToggleSelection, onOpenPreview, onRowMenu, onFileClassificationChange, compartoColumnWidth, oggettoColumnWidth, isExtractionEnabled, objectExtractionStatus } = data;
  const file = files[index];
  const isSelected = selectedIds.has(file.id);
  const [isEditingComparto, setIsEditingComparto] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);

  // Focus sul select quando entra in modalità edit
  useEffect(() => {
    if (isEditingComparto && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isEditingComparto]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Salva la posizione iniziale del mouse solo se non è un click su checkbox o altri elementi interattivi
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('button, select, input')) {
      return;
    }
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Se c'è stato un drag significativo, non aprire la preview
    if (hasDraggedRef.current) {
      return;
    }
    // Se il mouse si è mosso più di 5px, considera come drag, non click
    if (dragStartPosRef.current) {
      const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
      const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
      if (dx > 5 || dy > 5) {
        return;
      }
    }
    onOpenPreview(file);
  }, [file, onOpenPreview]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    hasDraggedRef.current = true;
    // ✅ Usa il servizio centralizzato per setup drag
    DragAndDropService.setupExplorerFileDragStart(e, {
      id: file.id,
      path: file.path,
      name: file.name
    });
  }, [file]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartPosRef.current = null;
    // Reset dopo un breve delay per permettere al click di verificare hasDraggedRef
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 100);
  }, []);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelection(file.id);
  }, [file.id, onToggleSelection]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRowMenu(file, 'menu');
  }, [file, onRowMenu]);

  const handleCompartoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingComparto(true);
  }, []);

  const handleCompartoChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const compartoKey = e.target.value;
    if (compartoKey && onFileClassificationChange) {
      const comparto = CompartiService.getByKey(compartoKey);
      if (comparto) {
        onFileClassificationChange(file.id, comparto.key, comparto.nome);
      }
    } else if (!compartoKey && onFileClassificationChange) {
      // Rimuovi classificazione se selezionato "-- Nessuno --"
      onFileClassificationChange(file.id, '', '');
    }
    setIsEditingComparto(false);
  }, [file.id, onFileClassificationChange]);

  const handleCompartoBlur = useCallback(() => {
    setIsEditingComparto(false);
  }, []);

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
        ${isDragging ? 'opacity-50' : ''}
      `}
      draggable={true}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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

      {/* File Icon with OCR indicator */}
      <div className="w-8 h-8 flex items-center justify-center mr-3 relative">
        {getFileIcon(file.kind)}
        {/* OCR indicator for PDFs */}
        {file.kind === 'pdf' && (
          <div className="absolute -top-1 -right-1">
            {file.hasNativeText === undefined ? (
              // Spinner quando sta controllando
              <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
            ) : file.hasNativeText === false ? (
              // Badge "Da trascrivere" quando serve OCR
              <span className="px-1 py-0.5 text-[8px] rounded bg-orange-500 text-white shadow-sm">
                OCR
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* File Name */}
      <div className="flex-1 min-w-[200px] min-w-0">
        <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
          {file.name}
        </div>
        {/* ❌ RIMOSSO: parentDirName non più mostrato */}
      </div>

      {/* Oggetto - con wrap text e ridimensionabile */}
      <div
        className="flex-shrink-0 mr-4 min-w-0 relative"
        style={{ width: `${oggettoColumnWidth}px`, minWidth: `${oggettoColumnWidth}px` }}
      >
        {file.kind === 'pdf' && file.oggetto === undefined && isExtractionEnabled && objectExtractionStatus && !objectExtractionStatus.isComplete ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="whitespace-nowrap">Sto analizzando l'oggetto...</span>
          </div>
        ) : file.kind === 'pdf' && file.oggetto === undefined ? (
          // ✅ Se estrazione disabilitata, mostra solo "Oggetto non disponibile"
          <div className="text-xs text-gray-400 italic">
            Oggetto non disponibile
          </div>
        ) : file.kind === 'pdf' && (file.oggetto === null || file.oggetto === '') ? (
          <div className="text-xs text-gray-400 italic">
            Oggetto non trovato
          </div>
        ) : file.oggetto && typeof file.oggetto === 'string' ? (
          <div className="text-xs text-gray-700 break-words" title={file.oggetto}>
            {file.oggetto}
          </div>
        ) : null}
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-10 transition-all"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (data.handleOggettoResizeStart) {
              data.handleOggettoResizeStart(e);
            }
          }}
          style={{ marginRight: '-4px' }}
          title="Trascina per ridimensionare"
        />
      </div>

      {/* Tipo Documento */}
      <div
        className="flex-shrink-0 mr-4 min-w-0"
        style={{ width: `${compartoColumnWidth}px`, minWidth: `${compartoColumnWidth}px` }}
      >
        {isEditingComparto ? (
          <select
            ref={selectRef}
            value={file.compartoKey || ''}
            onChange={handleCompartoChange}
            onBlur={handleCompartoBlur}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          >
            <option value="">-- Nessuno --</option>
            {CompartiService.getAll()
              .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }))
              .map(comparto => (
                <option key={comparto.key} value={comparto.key}>
                  {comparto.nome}
                </option>
              ))}
          </select>
        ) : (
          <div
            onClick={handleCompartoClick}
            className={`
              text-xs px-2 py-1 rounded cursor-pointer transition-colors whitespace-nowrap overflow-hidden text-ellipsis w-full
              ${file.compartoNome
                ? file.classificationSource === 'manual'
                  ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200'
              }
            `}
            title={file.compartoNome || 'Clicca per selezionare tipo documento'}
          >
            {file.compartoNome || '-- Nessuno --'}
          </div>
        )}
      </div>

      {/* File Size */}
      <div className="flex-shrink-0 text-right text-xs text-gray-500 mr-4 min-w-[60px]">
        {formatFileSize(file.sizeBytes)}
      </div>

      {/* Date */}
      <div className="flex-shrink-0 text-right text-xs text-gray-500 mr-4 min-w-[80px]">
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
  onFileClassificationChange,
  className = '',
  objectExtractionStatus,
  isExtractionEnabled = false, // ✅ Default: disabilitato
  sortBy = 'name',
  sortOrder = 'asc',
  onSortChange
}: FileGridProps) {
  // Hook per colonna "Oggetto" ridimensionabile
  const { width: oggettoColumnWidth, handleResizeStart: handleOggettoResizeStart } = useOggettoColumnWidth();

  // Calcola la larghezza necessaria per la colonna "Tipo documento"
  // basandosi sul testo più lungo tra tutti i comparti disponibili e quelli usati nei file
  const compartoColumnWidth = useMemo(() => {
    // Trova il testo più lungo tra tutti i comparti disponibili
    const allComparti = CompartiService.getAll();
    const longestComparto = allComparti.reduce((longest, current) =>
      current.nome.length > longest.nome.length ? current : longest
    );

    // Trova il testo più lungo tra i comparti effettivamente usati nei file
    const usedComparti = files
      .map(f => f.compartoNome)
      .filter((nome): nome is string => !!nome);

    const longestUsed = usedComparti.length > 0
      ? usedComparti.reduce((longest, current) =>
          current.length > longest.length ? current : longest
        )
      : longestComparto.nome;

    // Calcola la larghezza necessaria (approssimativa: ~7px per carattere + padding)
    const textLength = Math.max(longestComparto.nome.length, longestUsed.length);
    const calculatedWidth = textLength * 7 + 32; // 7px per carattere + 32px padding (16px per lato)

    // Limita tra min e max ragionevoli
    return Math.max(150, Math.min(600, calculatedWidth));
  }, [files]);

  const itemData = {
    files,
    selectedIds,
    onToggleSelection,
    onOpenPreview,
    onRowMenu,
    onFileClassificationChange,
    compartoColumnWidth,
    oggettoColumnWidth,
    handleOggettoResizeStart,
    isExtractionEnabled, // ✅ Passa flag estrazione
    objectExtractionStatus // ✅ Passa status estrazione
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
        <div className="w-6 mr-3 flex-shrink-0"></div>
        <div className="w-8 mr-3 flex-shrink-0"></div>
        <div className="flex-1 min-w-[200px] min-w-0 flex items-center gap-2">
          <span>Name</span>
          {onSortChange && (
            <>
              <button
                onClick={() => {
                  const newOrder = sortBy === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                  onSortChange('name', newOrder);
                }}
                className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                  sortBy === 'name' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'
                }`}
                title="Ordina per nome"
              >
                <ArrowUpDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  const newOrder = sortBy === 'date' && sortOrder === 'desc' ? 'asc' : 'desc';
                  onSortChange('date', newOrder);
                }}
                className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                  sortBy === 'date' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'
                }`}
                title="Ordina per data"
              >
                <Calendar className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
        <div
          className="flex-shrink-0 mr-4 min-w-0 relative"
          style={{ width: `${oggettoColumnWidth}px`, minWidth: `${oggettoColumnWidth}px` }}
        >
          <div className="flex items-center gap-2">
            {objectExtractionStatus && isExtractionEnabled && !objectExtractionStatus.isComplete ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Analisi documenti ({objectExtractionStatus.percentage}%)</span>
              </>
            ) : (
              <span>Oggetto</span>
            )}
          </div>
          {/* Resize handle nell'header */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-10 transition-all"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOggettoResizeStart(e);
            }}
            style={{ marginRight: '-4px' }}
            title="Trascina per ridimensionare"
          />
        </div>
        <div
          className="flex-shrink-0 mr-4 min-w-0"
          style={{ width: `${compartoColumnWidth}px`, minWidth: `${compartoColumnWidth}px` }}
        >
          Tipo documento
        </div>
        <div className="flex-shrink-0 text-right mr-4 min-w-[60px] max-w-[100px]">Size</div>
        <div className="flex-shrink-0 text-right mr-4 min-w-[80px] max-w-[120px]">Date</div>
        <div className="w-8 flex-shrink-0"></div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {files.length > 0 ? (
          files.map((file, index) => (
            <FileRow
              key={file.id}
              index={index}
              style={{}}
              data={itemData}
            />
          ))
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

// ✅ Export default come fallback per compatibilità
export default FileGrid;
