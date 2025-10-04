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
}

export interface ScanProgress {
  scanned: number;
  matched: number;
  queued: number;
  done: boolean;
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

