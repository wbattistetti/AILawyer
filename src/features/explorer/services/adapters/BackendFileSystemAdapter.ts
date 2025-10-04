import { FileSystemAdapter, DriveInfo } from '../FileSystemAdapter';

export class BackendFileSystemAdapter implements FileSystemAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async listDrives(): Promise<DriveInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/filesystem/drives`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to list drives:', error);
      return [];
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
      const response = await fetch(`${this.baseUrl}/api/filesystem/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: dirPath }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return { files: [] };
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/filesystem/exists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
      
      if (!response.ok) {
        return false;
      }
      
      const result = await response.json();
      return result.exists;
    } catch (error) {
      console.error(`Failed to check if path exists ${path}:`, error);
      return false;
    }
  }

  async openInSystem(path: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/filesystem/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
    } catch (error) {
      console.error(`Failed to open ${path} in system:`, error);
    }
  }

  async revealInFolder(path: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/filesystem/reveal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
    } catch (error) {
      console.error(`Failed to reveal ${path} in folder:`, error);
    }
  }

  async readChunk(filePath: string, start: number, len: number): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${this.baseUrl}/api/filesystem/read-chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path: filePath, 
          start, 
          length: len 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.arrayBuffer();
    } catch (error) {
      console.error(`Failed to read chunk from ${filePath}:`, error);
      throw error;
    }
  }
}
