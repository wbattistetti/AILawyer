import React, { useMemo } from 'react';
import { FileGrid } from './FileGrid';
import { useContentWidth } from '../hooks/useContentWidth';
import { FileEntry, SortField, SortOrder } from '../types';
import { ObjectExtractionStatus } from '../hooks/usePdfObjectExtraction';

interface FileGridWithAutoWidthProps {
  files: FileEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (fileId: string) => void;
  onOpenPreview: (file: FileEntry) => void;
  onRowMenu: (file: FileEntry, action: string) => void;
  onFileClassificationChange?: (fileId: string, compartoKey: string, compartoNome: string) => void;
  className?: string;
  onWidthChange?: (width: number) => void;
  objectExtractionStatus?: ObjectExtractionStatus;
  isExtractionEnabled?: boolean; // ✅ Se false, non mostrare "Sto analizzando l'oggetto..."
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSortChange?: (field: SortField, order: SortOrder) => void;
}

export function FileGridWithAutoWidth({
  files,
  selectedIds,
  onToggleSelection,
  onOpenPreview,
  onRowMenu,
  onFileClassificationChange,
  className = '',
  onWidthChange,
  objectExtractionStatus,
  isExtractionEnabled = false, // ✅ Default: disabilitato
  sortBy = 'name',
  sortOrder = 'asc',
  onSortChange
}: FileGridWithAutoWidthProps) {
  // Estrai i nomi dei file per calcolare la larghezza ottimale
  const fileNames = useMemo(() => {
    return files.map(file => file.name);
  }, [files]);

  // Calcola la larghezza ottimale basandosi sui nomi dei file
  const { optimalWidth, measureRef } = useContentWidth(fileNames, {
    minWidth: 500, // Aumentato da 400
    maxWidth: 1200, // Aumentato da 800 per permettere nomi più lunghi
    padding: 300, // Aumentato: Checkbox(24) + Icon(32) + Size(80) + Date(96) + Actions(32) + Margins(36) = 300px
    measureText: true
  });

  // Notifica il cambiamento di larghezza al componente padre
  React.useEffect(() => {
    if (onWidthChange) {
      onWidthChange(optimalWidth);
    }
  }, [optimalWidth, onWidthChange]);

  return (
    <div ref={measureRef} className={`h-full ${className}`}>
      <FileGrid
        files={files}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
        onOpenPreview={onOpenPreview}
        onRowMenu={onRowMenu}
        onFileClassificationChange={onFileClassificationChange}
        objectExtractionStatus={objectExtractionStatus}
        isExtractionEnabled={isExtractionEnabled}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
      />
    </div>
  );
}
