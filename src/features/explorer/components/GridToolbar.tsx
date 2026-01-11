import React from 'react';
import {
  Search,
  Filter,
  CheckSquare,
  Square,
  Upload,
  Square as Stop,
  X,
  FileText,
  Image,
  Video,
  Music,
  File,
  FileType,
  FileImage
} from 'lucide-react';
import { GridFilters, FileKind, ScanProgress } from '../types';
import { MimeService } from '../services/MimeService';

interface GridToolbarProps {
  filters: GridFilters;
  onFiltersChange: (filters: Partial<GridFilters>) => void;
  selectedCount: number;
  totalFiles: number; // Total files found (all files in memory) - non più usato direttamente, ma mantenuto per compatibilità
  visibleFiles: number; // Files visible after filtering
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUploadToArchive: () => void;
  scanning: boolean; // Usato solo per nascondere lo status durante la scansione
  progress: ScanProgress; // Usato solo per la progress bar
  onPause?: () => void; // ✅ Opzionale, non più usato
  onResume?: () => void; // ✅ Opzionale, non più usato
  onStop?: () => void; // ✅ Opzionale, non più usato
  onRescan?: () => void; // ✅ Opzionale, non più usato
  onAnalyzeDocuments?: () => void; // ✅ Avvia analisi e classificazione
  isAnalyzing?: boolean; // ✅ Indica se l'analisi è in corso
  onStopAnalysis?: () => void; // ✅ Ferma l'analisi
  canAnalyze?: boolean; // ✅ Se false, disabilita "Analizza documenti" (tutti i file sono già analizzati)
  className?: string;
}

const FILE_KINDS: Array<{
  kind: FileKind;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}> = [
  {
    kind: 'pdf',
    label: 'PDF',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: FileType,
    iconColor: 'text-red-600'
  },
  {
    kind: 'word',
    label: 'Word',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: FileText,
    iconColor: 'text-blue-600'
  },
  {
    kind: 'image',
    label: 'Images',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: FileImage,
    iconColor: 'text-green-600'
  },
  {
    kind: 'video',
    label: 'Video',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Video,
    iconColor: 'text-purple-600'
  },
  {
    kind: 'audio',
    label: 'Audio',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: Music,
    iconColor: 'text-orange-600'
  }
];

export function GridToolbar({
  filters,
  onFiltersChange,
  selectedCount,
  totalFiles,
  visibleFiles,
  onSelectAll,
  onDeselectAll,
  onUploadToArchive,
  scanning,
  progress,
  onPause,
  onResume,
  onStop,
  onRescan,
  onAnalyzeDocuments,
  isAnalyzing = false,
  onStopAnalysis,
  canAnalyze = true, // ✅ Default: abilitato
  className = ''
}: GridToolbarProps) {
  const handleKindFilterClick = (kind: FileKind, e: React.MouseEvent) => {
    if (e.ctrlKey || e.shiftKey) {
      // Se Ctrl o Shift premuto: seleziona solo questo tipo (esclude tutti gli altri)
      onFiltersChange({ kinds: new Set([kind]) });
    } else {
      // Clic normale: toggle
      const newKinds = new Set(filters.kinds);
      if (newKinds.has(kind)) {
        newKinds.delete(kind);
      } else {
        newKinds.add(kind);
      }
      onFiltersChange({ kinds: newKinds });
    }
  };

  const selectAllTypes = () => {
    // Seleziona tutti i tipi di file
    onFiltersChange({ kinds: new Set(['pdf', 'word', 'image', 'video', 'audio']) });
  };

  const clearSearch = () => {
    onFiltersChange({ search: '' });
  };

  const formatProgress = () => {
    // Se abbiamo informazioni sulle directory, usa quelle
    if (progress.totalDirs && progress.totalDirs > 0) {
      const completedDirs = progress.completedDirs || 0;
      const percentage = Math.round((completedDirs / progress.totalDirs) * 100);
      return `${percentage}%`;
    }

    // Fallback al vecchio metodo (anche se non dovrebbe mai essere usato)
    if (progress.scanned === 0) return '0%';
    return '100%'; // Se stiamo scansionando senza info directory, mostra almeno qualcosa
  };

  const formatPhaseLabel = () => {
    if (progress.phase === 'counting') {
      return 'Counting directories...';
    }

    if (progress.currentDir) {
      // Mostra il nome della directory corrente (accorciato se troppo lungo)
      const parts = progress.currentDir.split(/[/\\]/);
      const lastPart = parts[parts.length - 1] || parts[parts.length - 2] || progress.currentDir;
      return `Scanning: ${lastPart}`;
    }

    return 'Scanning files...';
  };

  return (
    <div className={`bg-white border-b border-gray-200 p-4 ${className}`}>
      {/* Search and Filters Row */}
      <div className="flex items-center gap-4 mb-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {filters.search && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle */}
        <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Kind Filters */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-600 mr-2">Types:</span>
        {FILE_KINDS.map(({ kind, label, color, icon: Icon, iconColor }) => (
          <button
            key={kind}
            onClick={(e) => handleKindFilterClick(kind, e)}
            className={`
              flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full border transition-colors
              ${filters.kinds.has(kind)
                ? `${color} border-current`
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }
            `}
          >
            <Icon className={`w-4 h-4 ${filters.kinds.has(kind) ? iconColor : 'text-gray-500'}`} />
            {label}
          </button>
        ))}
        {/* Tutti Button - visibile solo se non tutti i tipi sono selezionati */}
        {filters.kinds.size < 5 && (
          <button
            onClick={selectAllTypes}
            className="flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            title="Seleziona tutti i tipi di file"
          >
            Tutti
          </button>
        )}
      </div>

      {/* Actions Row - Riorganizzato come richiesto */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* ✅ 1. Status - SOLO conteggio file filtrati (più chiaro) */}
          {!scanning && (
            <div className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
              <span>{visibleFiles} file{visibleFiles !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* ✅ 2. Select All / Deselect All */}
          <button
            onClick={onSelectAll}
            className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <CheckSquare className="w-4 h-4" />
            Select All
          </button>

          <button
            onClick={onDeselectAll}
            className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <Square className="w-4 h-4" />
            Deselect All
          </button>

          {/* Selected Count */}
          {selectedCount > 0 && (
            <div className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              Selected: {selectedCount}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ RIMOSSO: Resume/Rescan/Pause/Stop per scansione (la scansione parte automaticamente) */}

          {/* ✅ 3. Analizza documenti + Stop (quando isAnalyzing) */}
          {onAnalyzeDocuments && (
            <>
              <button
                onClick={onAnalyzeDocuments}
                disabled={isAnalyzing || !canAnalyze}
                className={`flex items-center gap-2 px-3 py-1 text-sm rounded transition-colors ${
                  isAnalyzing || !canAnalyze
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                title={
                  !canAnalyze
                    ? "Tutti i documenti visibili sono già stati analizzati"
                    : "Analizza documenti: estrae oggetto e classifica automaticamente"
                }
              >
                <FileText className="w-4 h-4" />
                Analizza documenti
              </button>

              {/* ✅ Stop appare SOLO quando isAnalyzing è true, A DESTRA di Analizza */}
              {isAnalyzing && onStopAnalysis && (
                <button
                  onClick={onStopAnalysis}
                  className="flex items-center gap-2 px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700 rounded"
                  title="Ferma l'analisi in corso"
                >
                  <Stop className="w-4 h-4" />
                  Stop
                </button>
              )}
            </>
          )}

          {/* ✅ 4. Upload to Archive */}
          <button
            onClick={onUploadToArchive}
            disabled={selectedCount === 0}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${selectedCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <Upload className="w-4 h-4" />
            Upload to Archive
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {scanning && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>{formatPhaseLabel()}</span>
            <span>{formatProgress()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                progress.phase === 'counting'
                  ? 'bg-yellow-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: formatProgress() }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
            {progress.totalDirs ? (
              <>
                <span>Directories: {progress.completedDirs || 0} / {progress.totalDirs}</span>
                <span>Files found: {progress.matched}</span>
                <span>Scanned: {progress.scanned}</span>
              </>
            ) : (
              <>
                <span>Scanned: {progress.scanned}</span>
                <span>Matched: {progress.matched}</span>
                <span>Queued: {progress.queued}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

