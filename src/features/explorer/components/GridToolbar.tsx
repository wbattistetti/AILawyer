import React from 'react';
import { 
  Search, 
  Filter, 
  CheckSquare, 
  Square, 
  Upload, 
  Pause, 
  Play, 
  Square as Stop,
  RotateCcw,
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
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUploadToArchive: () => void;
  scanning: boolean;
  progress: ScanProgress;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRescan: () => void;
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
  onSelectAll,
  onDeselectAll,
  onUploadToArchive,
  scanning,
  progress,
  onPause,
  onResume,
  onStop,
  onRescan,
  className = ''
}: GridToolbarProps) {
  const toggleKindFilter = (kind: FileKind) => {
    const newKinds = new Set(filters.kinds);
    if (newKinds.has(kind)) {
      newKinds.delete(kind);
    } else {
      newKinds.add(kind);
    }
    onFiltersChange({ kinds: newKinds });
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
            onClick={() => toggleKindFilter(kind)}
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
      </div>

      {/* Actions Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Selection Controls */}
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
          {/* Scan Controls */}
          {scanning ? (
            <>
              <button
                onClick={onPause}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
              
              <button
                onClick={onStop}
                className="flex items-center gap-2 px-3 py-1 text-sm text-red-600 hover:text-red-900"
              >
                <Stop className="w-4 h-4" />
                Stop
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onResume}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
              
              <button
                onClick={onRescan}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4" />
                Rescan
              </button>
            </>
          )}

          {/* Upload Button */}
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

