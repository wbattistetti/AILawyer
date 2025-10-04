import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function filesystemRoutes(fastify: FastifyInstance) {
  // List drives
  fastify.get('/api/filesystem/drives', async (request, reply) => {
    try {
      const drives = [];
      
      // Windows drives
      if (process.platform === 'win32') {
        try {
          const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption,drivetype');
          const lines = stdout.split('\n').filter(line => line.trim());
          
          for (const line of lines.slice(1)) { // Skip header
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              const [caption, drivetype, freespace, size] = parts;
              const driveType = getDriveType(parseInt(drivetype));
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
        } catch (wmicError) {
          fastify.log.warn('wmic command failed, using fallback method:', wmicError);
          
          // Fallback: try to access common drive letters
          const commonDrives = ['C:', 'D:', 'E:', 'F:'];
          for (const drive of commonDrives) {
            try {
              await fs.access(drive + '\\');
              drives.push({
                id: drive,
                label: drive,
                path: drive + '\\',
                type: 'fixed' as const,
                mounted: true
              });
            } catch {
              // Drive doesn't exist or not accessible
            }
          }
        }
      }
      
      return drives;
    } catch (error) {
      fastify.log.error('Failed to list drives:', error);
      return reply.code(500).send({ error: 'Failed to list drives' });
    }
  });

  // List directory contents
  fastify.post('/api/filesystem/list', async (request, reply) => {
    try {
      const { path: dirPath } = request.body as { path: string };
      
      if (!dirPath) {
        return reply.code(400).send({ error: 'Path is required' });
      }

      // Check if path exists and is accessible
      try {
        await fs.access(dirPath);
      } catch (accessError) {
        fastify.log.warn(`Cannot access directory ${dirPath}:`, accessError);
        return { files: [] };
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];
      
      for (const entry of entries) {
        try {
          const fullPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(fullPath);
          
          files.push({
            name: entry.name,
            path: fullPath,
            isDir: entry.isDirectory(),
            size: entry.isFile() ? stats.size : undefined,
            mtime: stats.mtime.getTime()
          });
        } catch (statError) {
          // Skip files that can't be accessed (permission denied, etc.)
          fastify.log.warn(`Cannot access file ${entry.name}:`, statError);
          continue;
        }
      }
      
      return { files };
    } catch (error) {
      fastify.log.error(`Failed to list directory:`, error);
      return { files: [] }; // Return empty array instead of 500 error
    }
  });

  // Check if path exists
  fastify.post('/api/filesystem/exists', async (request, reply) => {
    try {
      const { path: filePath } = request.body as { path: string };
      
      if (!filePath) {
        return reply.code(400).send({ error: 'Path is required' });
      }

      try {
        await fs.access(filePath);
        return { exists: true };
      } catch {
        return { exists: false };
      }
    } catch (error) {
      fastify.log.error(`Failed to check if path exists:`, error);
      return reply.code(500).send({ error: 'Failed to check path existence' });
    }
  });

  // Open file in system
  fastify.post('/api/filesystem/open', async (request, reply) => {
    try {
      const { path: filePath } = request.body as { path: string };
      
      if (!filePath) {
        return reply.code(400).send({ error: 'Path is required' });
      }

      const command = process.platform === 'win32' 
        ? `start "" "${filePath}"`
        : process.platform === 'darwin'
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
      
      await execAsync(command);
      return { success: true };
    } catch (error) {
      fastify.log.error(`Failed to open file:`, error);
      return reply.code(500).send({ error: 'Failed to open file' });
    }
  });

  // Reveal file in folder
  fastify.post('/api/filesystem/reveal', async (request, reply) => {
    try {
      const { path: filePath } = request.body as { path: string };
      
      if (!filePath) {
        return reply.code(400).send({ error: 'Path is required' });
      }

      const command = process.platform === 'win32'
        ? `explorer /select,"${filePath}"`
        : process.platform === 'darwin'
        ? `open -R "${filePath}"`
        : `xdg-open "${filePath}"`;
      
      await execAsync(command);
      return { success: true };
    } catch (error) {
      fastify.log.error(`Failed to reveal file:`, error);
      return reply.code(500).send({ error: 'Failed to reveal file' });
    }
  });

  // Read file chunk
  fastify.post('/api/filesystem/read-chunk', async (request, reply) => {
    try {
      const { path: filePath, start, length } = request.body as { 
        path: string; 
        start: number; 
        length: number; 
      };
      
      if (!filePath || start === undefined || length === undefined) {
        return reply.code(400).send({ error: 'Path, start, and length are required' });
      }

      const fd = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(length);
        await fd.read(buffer, 0, length, start);
        return buffer;
      } finally {
        await fd.close();
      }
    } catch (error) {
      fastify.log.error(`Failed to read file chunk:`, error);
      return reply.code(500).send({ error: 'Failed to read file chunk' });
    }
  });

  // Serve file for preview (PDF, images, etc.)
  fastify.get('/api/filesystem/file/*', async (request, reply) => {
    try {
      const filePath = decodeURIComponent(request.url.replace('/api/filesystem/file/', ''));
      
      console.log('🔍 Serving file:', filePath);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (accessError) {
        console.error('❌ File not found:', filePath);
        return reply.code(404).send({ error: 'File not found' });
      }

      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Set appropriate headers based on file extension
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.webp':
          contentType = 'image/webp';
          break;
        case '.mp4':
          contentType = 'video/mp4';
          break;
        case '.mp3':
          contentType = 'audio/mpeg';
          break;
        case '.wav':
          contentType = 'audio/wav';
          break;
      }

      // Set headers
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', String(stats.size));
      reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      // Read the file as buffer
      const fileBuffer = await fs.readFile(filePath);
      return reply.send(fileBuffer);
    } catch (error) {
      fastify.log.error('Failed to serve file:', error);
      return reply.code(500).send({ error: 'Failed to serve file' });
    }
  });

  // Read file content for upload
  fastify.post('/api/filesystem/read-file', async (request, reply) => {
    try {
      const { filePath } = request.body as { filePath: string };
      
      if (!filePath) {
        return reply.code(400).send({ error: 'File path is required' });
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (accessError) {
        return reply.code(404).send({ error: 'File not found' });
      }

      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Set appropriate headers
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.bmp':
          contentType = 'image/bmp';
          break;
        case '.tiff':
          contentType = 'image/tiff';
          break;
      }

      reply.header('Content-Type', contentType);
      reply.header('Content-Length', String(stats.size));
      
      // Read the file as buffer
      const fileBuffer = await fs.readFile(filePath);
      return reply.send(fileBuffer);
    } catch (error) {
      fastify.log.error('Failed to read file:', error);
      return reply.code(500).send({ error: 'Failed to read file' });
    }
  });

  // Copy file to temp directory for preview
  fastify.post('/api/filesystem/copy-temp', async (request, reply) => {
    try {
      const { sourcePath } = request.body as { sourcePath: string };
      
      if (!sourcePath) {
        return reply.code(400).send({ error: 'Source path is required' });
      }

      // Check if source file exists
      const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);
      if (!sourceExists) {
        return reply.code(404).send({ error: 'Source file not found' });
      }

      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate unique temp filename
      const ext = path.extname(sourcePath);
      const baseName = path.basename(sourcePath, ext);
      const tempFileName = `${baseName}_${Date.now()}${ext}`;
      const tempPath = path.join(tempDir, tempFileName);

      // Copy file to temp directory
      await fs.copyFile(sourcePath, tempPath);

      // Return temp file info
      const stats = await fs.stat(tempPath);
      return reply.send({
        tempPath: `/uploads/temp/${tempFileName}`,
        fileName: tempFileName,
        size: stats.size,
        mtime: stats.mtime
      });
    } catch (error) {
      fastify.log.error('Failed to copy file to temp:', error);
      return reply.code(500).send({ error: 'Failed to copy file to temp' });
    }
  });

  // Move temp file to archive
  fastify.post('/api/filesystem/move-to-archive', async (request, reply) => {
    try {
      const { tempFileName, archivePath } = request.body as { tempFileName: string; archivePath?: string };
      
      if (!tempFileName) {
        return reply.code(400).send({ error: 'Temp file name is required' });
      }

      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      const tempFilePath = path.join(tempDir, tempFileName);

      // Check if temp file exists
      const tempExists = await fs.access(tempFilePath).then(() => true).catch(() => false);
      if (!tempExists) {
        return reply.code(404).send({ error: 'Temp file not found' });
      }

      // Determine archive path
      const finalArchivePath = archivePath || path.join(process.cwd(), 'uploads', tempFileName);
      const archiveDir = path.dirname(finalArchivePath);
      
      // Create archive directory if it doesn't exist
      await fs.mkdir(archiveDir, { recursive: true });

      // Move file from temp to archive
      await fs.rename(tempFilePath, finalArchivePath);

      return reply.send({
        archivePath: finalArchivePath,
        message: 'File moved to archive successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to move file to archive:', error);
      return reply.code(500).send({ error: 'Failed to move file to archive' });
    }
  });

  // Delete temp file
  fastify.delete('/api/filesystem/temp/:filename', async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      const tempFilePath = path.join(tempDir, filename);

      // Check if temp file exists
      const tempExists = await fs.access(tempFilePath).then(() => true).catch(() => false);
      if (!tempExists) {
        return reply.code(404).send({ error: 'Temp file not found' });
      }

      // Delete temp file
      await fs.unlink(tempFilePath);

      return reply.send({ message: 'Temp file deleted successfully' });
    } catch (error) {
      fastify.log.error('Failed to delete temp file:', error);
      return reply.code(500).send({ error: 'Failed to delete temp file' });
    }
  });

  // Cleanup old temp files (older than 1 hour)
  fastify.post('/api/filesystem/cleanup-temp', async (request, reply) => {
    try {
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      
      // Check if temp directory exists
      const tempExists = await fs.access(tempDir).then(() => true).catch(() => false);
      if (!tempExists) {
        return reply.send({ message: 'No temp directory found', deletedCount: 0 });
      }

      const files = await fs.readdir(tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour ago
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < oneHourAgo) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return reply.send({ 
        message: `Cleaned up ${deletedCount} old temp files`,
        deletedCount 
      });
    } catch (error) {
      fastify.log.error('Failed to cleanup temp files:', error);
      return reply.code(500).send({ error: 'Failed to cleanup temp files' });
    }
  });
}

function getDriveType(driveType: number): 'fixed' | 'removable' | 'optical' | null {
  switch (driveType) {
    case 2: return 'removable'; // Floppy
    case 3: return 'fixed';     // Local disk
    case 4: return 'optical';   // Network drive
    case 5: return 'optical';   // CD-ROM
    default: return null;
  }
}
