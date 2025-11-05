export type DriveType = 'fixed' | 'removable' | 'optical';

export interface DriveInfo {
  id: string;
  label: string;
  path: string;
  type: DriveType;
  capacityBytes?: number;
  freeBytes?: number;
  mounted: boolean;
}

export type FileKind = 'pdf' | 'word' | 'image' | 'video' | 'audio' | 'unknown';

export interface FileEntry {
  id: string;
  name: string;
  ext?: string;
  kind: FileKind;
  sizeBytes?: number;
  mtime?: number;
  path: string;
  parentDirName?: string;
  // Classificazione documento
  compartoKey?: string; // Key del comparto (es. 'denuncia_querela')
  compartoNome?: string; // Nome del comparto (es. 'Denuncia–Querela / Notizia di reato')
  classificationSource?: 'auto' | 'manual'; // 'auto' = blu, 'manual' = verde
  // OCR detection
  hasNativeText?: boolean; // undefined = non ancora controllato, true = ha testo nativo, false = serve OCR
}

export interface ScanProgress {
  scanned: number;
  matched: number;
  queued: number;
  done: boolean;
  // Informazioni sulle directory per progresso più preciso
  totalDirs?: number;
  completedDirs?: number;
  currentDir?: string;
  phase?: 'counting' | 'scanning'; // Fase: prima conta le dir, poi scansiona
}

export interface GridFilters {
  kinds: Set<FileKind>;
  search: string;
}

export interface ExplorerState {
  selectedNode?: { type: 'drive' | 'dir'; path: string };
  files: FileEntry[];
  visibleIds: string[];
  selectedIds: Set<string>;
  filters: GridFilters;
  progress: ScanProgress;
  scanning: boolean;
  error?: string;
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'drive' | 'dir';
  expanded: boolean;
  children?: TreeNode[];
  loading?: boolean;
}

export interface RowAction {
  id: string;
  label: string;
  icon?: string;
  onClick: (file: FileEntry) => void;
}

