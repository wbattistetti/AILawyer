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

  readChunk = async (filePath: string, start: number, len: number): Promise<ArrayBuffer> => {
    try {
      const url = `${this.baseUrl}/api/filesystem/read-chunk`;
      console.log('[BackendFileSystemAdapter][readChunk]', {
        baseUrl: this.baseUrl,
        url,
        filePath: filePath.substring(0, 50)
      });

      const response = await fetch(url, {
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
      console.error(`[BackendFileSystemAdapter][readChunk] Failed to read chunk from ${filePath}:`, error, {
        baseUrl: this.baseUrl,
        url: `${this.baseUrl}/api/filesystem/read-chunk`
      });
      throw error;
    }
  }

  // ✅ Implementa watchDrives per aggiornamento dinamico
  watchDrives(cb: (drives: DriveInfo[]) => void): () => void {
    let intervalId: NodeJS.Timeout;
    let lastDrives: DriveInfo[] = [];
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        const drives = await this.listDrives();

        // Controlla se i drive sono cambiati (numero, lettere, mounted status)
        const drivesChanged =
          drives.length !== lastDrives.length ||
          drives.some((d, i) => {
            const last = lastDrives[i];
            return !last ||
              d.id !== last.id ||
              d.mounted !== last.mounted ||
              d.serialNumber !== last.serialNumber;
          }) ||
          lastDrives.some((last, i) => {
            const current = drives[i];
            return !current ||
              last.id !== current.id ||
              last.mounted !== current.mounted;
          });

        if (drivesChanged) {
          lastDrives = drives;
          cb(drives);
        }
      } catch (error) {
        console.error('[BackendFileSystemAdapter] Error polling drives:', error);
      }
    };

    // Poll ogni 2 secondi
    intervalId = setInterval(poll, 2000);
    poll(); // Controlla immediatamente

    // Restituisci funzione di cleanup
    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }
}
