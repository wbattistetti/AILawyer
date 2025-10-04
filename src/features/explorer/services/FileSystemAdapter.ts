import { DriveInfo, FileEntry } from '../types';

export interface FileSystemAdapter {
  listDrives(): Promise<DriveInfo[]>;
  watchDrives?(cb: (drives: DriveInfo[]) => void): () => void;
  listDir(path: string): Promise<{
    files: {
      name: string;
      path: string;
      isDir: boolean;
      size?: number;
      mtime?: number;
    }[];
  }>;
  exists(path: string): Promise<boolean>;
  openInSystem(path: string): Promise<void>;
  revealInFolder(path: string): Promise<void>;
  readChunk?(path: string, start: number, len: number): Promise<ArrayBuffer>;
}

