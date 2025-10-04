import React, { useMemo } from 'react';
import { FileGrid } from './FileGrid';
import { useContentWidth } from '../hooks/useContentWidth';
import { FileEntry } from '../types';

interface FileGridWithAutoWidthProps {
  files: FileEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (fileId: string) => void;
  onOpenPreview: (file: FileEntry) => void;
  onRowMenu: (file: FileEntry, action: string) => void;
  className?: string;
  onWidthChange?: (width: number) => void;
}

export function FileGridWithAutoWidth({
  files,
  selectedIds,
  onToggleSelection,
  onOpenPreview,
  onRowMenu,
  className = '',
  onWidthChange
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
    <div ref={measureRef} className={className}>
      <FileGrid
        files={files}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
        onOpenPreview={onOpenPreview}
        onRowMenu={onRowMenu}
      />
    </div>
  );
}
