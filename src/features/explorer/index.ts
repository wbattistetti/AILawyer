// Main component
export { Explorer } from './Explorer';

// Types
export type {
  DriveType,
  DriveInfo,
  FileKind,
  FileEntry,
  ScanProgress,
  GridFilters,
  ExplorerState,
  TreeNode,
  RowAction
} from './types';

// Hooks
export { useDriveList } from './hooks/useDriveList';
export { useScanFiles } from './hooks/useScanFiles';
export { useExplorerState } from './hooks/useExplorerState';
export { useExplorer, useExplorerAdapter } from './hooks/useExplorer';

// Services
export type { FileSystemAdapter } from './services/FileSystemAdapter';
// export { NodeFileSystemAdapter } from './services/adapters/NodeFileSystemAdapter'; // Disabled for browser compatibility
export { MockFileSystemAdapter } from './services/adapters/MockFileSystemAdapter';
export { MimeService } from './services/MimeService';
export { LocalizeService } from './services/LocalizeService';

// Components (for advanced usage)
export { SplitLayout } from './components/SplitLayout';
export { DirectoryTree } from './components/DirectoryTree';
export { FileGrid } from './components/FileGrid';
export { GridToolbar } from './components/GridToolbar';
export { PreviewPane } from './components/PreviewPane';
export { RowActionsMenu } from './components/RowActionsMenu';
export { DriveIcon } from './components/DriveIcon';

// Viewers
export { PdfViewerAdapter } from './components/viewers/PdfViewerAdapter';
export { ImageViewer } from './components/viewers/ImageViewer';
export { MediaViewer } from './components/viewers/MediaViewer';
export { WordViewer } from './components/viewers/WordViewer';
export { UnknownViewer } from './components/viewers/UnknownViewer';
