import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { FileSystemAdapter, DriveInfo } from '../FileSystemAdapter';

const execAsync = promisify(exec);

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async listDrives(): Promise<DriveInfo[]> {
    const drives: DriveInfo[] = [];
    
    // Windows drives
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption,drivetype');
        const lines = stdout.split('\n').filter(line => line.trim());
        
        for (const line of lines.slice(1)) { // Skip header
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const [caption, drivetype, freespace, size] = parts;
            const driveType = this.getDriveType(parseInt(drivetype));
            if (driveType) {
              drives.push({
                id: caption,
                label: caption,
                path: caption + '\\',
                type: driveType,
                capacityBytes: size ? parseInt(size) : undefined,
                freeBytes: freespace ? parseInt(freespace) : undefined,
                mounted: true
              });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to list drives:', error);
      }
    }
    
    return drives;
  }

  private getDriveType(driveType: number): DriveInfo['type'] | null {
    switch (driveType) {
      case 2: return 'removable'; // Floppy
      case 3: return 'fixed';     // Local disk
      case 4: return 'optical';   // Network drive
      case 5: return 'optical';   // CD-ROM
      default: return null;
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
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        
        files.push({
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size: entry.isFile() ? stats.size : undefined,
          mtime: stats.mtime.getTime()
        });
      }
      
      return { files };
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return { files: [] };
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async openInSystem(path: string): Promise<void> {
    const command = process.platform === 'win32' 
      ? `start "" "${path}"`
      : process.platform === 'darwin'
      ? `open "${path}"`
      : `xdg-open "${path}"`;
    
    await execAsync(command);
  }

  async revealInFolder(path: string): Promise<void> {
    const command = process.platform === 'win32'
      ? `explorer /select,"${path}"`
      : process.platform === 'darwin'
      ? `open -R "${path}"`
      : `xdg-open "${path}"`;
    
    await execAsync(command);
  }

  async readChunk(filePath: string, start: number, len: number): Promise<ArrayBuffer> {
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(len);
      await fd.read(buffer, 0, len, start);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } finally {
      await fd.close();
    }
  }
}
