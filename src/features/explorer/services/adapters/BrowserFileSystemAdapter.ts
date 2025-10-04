import { FileSystemAdapter, DriveInfo } from '../FileSystemAdapter';

export class BrowserFileSystemAdapter implements FileSystemAdapter {
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  async listDrives(): Promise<DriveInfo[]> {
    if (this.directoryHandle) {
      return [{
        id: 'selected',
        label: this.directoryHandle.name,
        path: this.directoryHandle.name,
        type: 'fixed',
        mounted: true
      }];
    }
    
    return [];
  }

  async selectDirectory(): Promise<boolean> {
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API not supported');
      }

      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'read'
      });
      
      return true;
    } catch (error) {
      console.error('Failed to select directory:', error);
      return false;
    }
  }

  async listDir(dirPath: string): Promise<{
    files: {
      name: string;
      path: string;
      isDir: boolean;
      size?: number;
      mtime?: number;
    }[];
  }> {
    if (!this.directoryHandle) {
      return { files: [] };
    }

    try {
      const files: any[] = [];
      
      if (dirPath === this.directoryHandle.name || dirPath === 'selected') {
        const entries = this.directoryHandle.values();
        for await (const entry of entries) {
          files.push({
            name: entry.name,
            path: entry.name,
            isDir: entry.kind === 'directory',
            size: entry.kind === 'file' ? undefined,
            mtime: Date.now()
          });
        }
      } else {
        const pathParts = dirPath.split('/');
        let currentHandle = this.directoryHandle;
        
        for (const part of pathParts) {
          if (part === this.directoryHandle.name) continue;
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
        
        const entries = currentHandle.values();
        for await (const entry of entries) {
          files.push({
            name: entry.name,
            path: `${dirPath}/${entry.name}`,
            isDir: entry.kind === 'directory',
            size: entry.kind === 'file' ? undefined,
            mtime: Date.now()
          });
        }
      }
      
      return { files };
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return { files: [] };
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      if (!this.directoryHandle) return false;
      
      if (path === this.directoryHandle.name || path === 'selected') {
        return true;
      }
      
      const pathParts = path.split('/');
      let currentHandle = this.directoryHandle;
      
      for (const part of pathParts) {
        if (part === this.directoryHandle.name) continue;
        currentHandle = await currentHandle.getDirectoryHandle(part);
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async openInSystem(path: string): Promise<void> {
    console.warn('openInSystem not supported in browser');
  }

  async revealInFolder(path: string): Promise<void> {
    console.warn('revealInFolder not supported in browser');
  }

  async readChunk(filePath: string, start: number, len: number): Promise<ArrayBuffer> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    try {
      const pathParts = filePath.split('/');
      let currentHandle = this.directoryHandle;
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (part === this.directoryHandle.name) continue;
        currentHandle = await currentHandle.getDirectoryHandle(part);
      }
      
      const fileName = pathParts[pathParts.length - 1];
      const fileHandle = await currentHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      
      const slice = file.slice(start, start + len);
      return await slice.arrayBuffer();
    } catch (error) {
      console.error(`Failed to read chunk from ${filePath}:`, error);
      throw error;
    }
  }
}