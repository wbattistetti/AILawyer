import { FileSystemAdapter, DriveInfo } from '../FileSystemAdapter';

export class MockFileSystemAdapter implements FileSystemAdapter {
  private mockDrives: DriveInfo[] = [
    {
      id: 'C:',
      label: 'Local Disk (C:)',
      path: 'C:\\',
      type: 'fixed',
      capacityBytes: 1000000000000, // 1TB
      freeBytes: 500000000000,      // 500GB
      mounted: true
    },
    {
      id: 'D:',
      label: 'USB Drive (D:)',
      path: 'D:\\',
      type: 'removable',
      capacityBytes: 32000000000,   // 32GB
      freeBytes: 16000000000,       // 16GB
      mounted: true
    }
  ];

  private mockFiles = new Map<string, any[]>([
    ['C:\\', [
      { name: 'Users', path: 'C:\\Users', isDir: true },
      { name: 'Program Files', path: 'C:\\Program Files', isDir: true },
      { name: 'Windows', path: 'C:\\Windows', isDir: true },
      { name: 'document.pdf', path: 'C:\\document.pdf', isDir: false, size: 1024000, mtime: Date.now() - 86400000 }
    ]],
    ['C:\\Users', [
      { name: 'Public', path: 'C:\\Users\\Public', isDir: true },
      { name: 'Default', path: 'C:\\Users\\Default', isDir: true }
    ]],
    ['D:\\', [
      { name: 'Photos', path: 'D:\\Photos', isDir: true },
      { name: 'Documents', path: 'D:\\Documents', isDir: true },
      { name: 'video.mp4', path: 'D:\\video.mp4', isDir: false, size: 50000000, mtime: Date.now() - 3600000 }
    ]],
    ['D:\\Photos', [
      { name: 'vacation.jpg', path: 'D:\\Photos\\vacation.jpg', isDir: false, size: 2048000, mtime: Date.now() - 7200000 },
      { name: 'family.png', path: 'D:\\Photos\\family.png', isDir: false, size: 1536000, mtime: Date.now() - 10800000 }
    ]],
    ['D:\\Documents', [
      { name: 'report.docx', path: 'D:\\Documents\\report.docx', isDir: false, size: 512000, mtime: Date.now() - 1800000 },
      { name: 'presentation.pptx', path: 'D:\\Documents\\presentation.pptx', isDir: false, size: 1024000, mtime: Date.now() - 900000 }
    ]]
  ]);

  async listDrives(): Promise<DriveInfo[]> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    return [...this.mockDrives];
  }

  watchDrives?(cb: (drives: DriveInfo[]) => void): () => void {
    // Mock implementation - no real watching
    return () => {};
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
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const files = this.mockFiles.get(dirPath) || [];
    return { files };
  }

  async exists(path: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.mockFiles.has(path) || Array.from(this.mockFiles.values())
      .flat()
      .some(file => file.path === path);
  }

  async openInSystem(path: string): Promise<void> {
    console.log(`Mock: Opening ${path} in system`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async revealInFolder(path: string): Promise<void> {
    console.log(`Mock: Revealing ${path} in folder`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async readChunk(filePath: string, start: number, len: number): Promise<ArrayBuffer> {
    // Mock file signatures
    const signatures: Record<string, number[]> = {
      'pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
      'jpg': [0xFF, 0xD8, 0xFF],
      'png': [0x89, 0x50, 0x4E, 0x47],
      'mp4': [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
      'docx': [0x50, 0x4B, 0x03, 0x04] // ZIP signature
    };

    const ext = filePath.split('.').pop()?.toLowerCase();
    const signature = signatures[ext || ''] || [0x00, 0x00, 0x00, 0x00];
    
    const buffer = new ArrayBuffer(len);
    const view = new Uint8Array(buffer);
    
    for (let i = 0; i < Math.min(len, signature.length); i++) {
      view[i] = signature[i];
    }
    
    return buffer;
  }
}

