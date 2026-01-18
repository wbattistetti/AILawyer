import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { detectNativeText } from '../lib/detectNativeText';
import { extractObject } from '../lib/extractObject';

const execAsync = promisify(exec);

// ✅ Funzione helper per ottenere la lista dei drive (riutilizzabile)
async function getDrivesList(fastify?: FastifyInstance): Promise<any[]> {
  const drives = [];
  const log = fastify?.log || console;

      // Windows drives
      if (process.platform === 'win32') {
        try {
          // ✅ Usa PowerShell con Get-CimInstance (wmic è deprecato e non disponibile)
          const psScript = `$disks = Get-CimInstance -ClassName Win32_LogicalDisk; foreach ($disk in $disks) { $caption = $disk.DeviceID; $drivetype = $disk.DriveType; $size = $disk.Size; $freespace = $disk.FreeSpace; $volumename = $disk.VolumeName; Write-Output ($caption + '|' + $drivetype + '|' + $size + '|' + $freespace + '|' + $volumename) }`;

          const { stdout: diskInfo } = await execAsync(`powershell -NoProfile -Command "${psScript}"`);
          const lines = diskInfo.split('\n').filter(line => line.trim());

          // ✅ Ottieni anche il volume label (nome del volume) per USB/DVD
          // ✅ Il volume label è già incluso nell'output PowerShell sopra
          let volumeLabels: Map<string, string> = new Map();

          // Parsa l'output PowerShell: "caption|drivetype|size|freespace|volumename"
          for (const line of lines) {
            const parts = line.split('|');
            if (parts.length >= 5) {
              const caption = parts[0].trim();
              const volumename = parts[4].trim();

              // Verifica che caption sia una lettera di drive valida (es. "D:")
              if (caption && caption.match(/^[A-Z]:$/)) {
                // Salva solo se il volume name non è vuoto e non è uguale alla caption
                if (volumename && volumename !== caption && volumename !== '') {
                  volumeLabels.set(caption, volumename);
                }
              }
            }
          }

      // ✅ Ottieni interfaccia e serial number dei drive per distinguere USB da hard disk fissi
      // ✅ Mappa drive letter -> interfaccia (USB, SATA, ecc.) per distinguere USB da hard disk fissi
      let driveInterfaces: Map<string, string> = new Map();
      // ✅ Mappa drive letter -> serial number del dispositivo
      let driveSerials: Map<string, string> = new Map();

      try {
        // ✅ Usa PowerShell con Get-CimInstance (wmic è deprecato e non disponibile)
        const psScript = `$result = @(); $logicalDisks = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 -or $_.DriveType -eq 3 }; foreach ($logicalDisk in $logicalDisks) { $letter = $logicalDisk.DeviceID; $partition = Get-CimInstance -ClassName Win32_LogicalDiskToPartition | Where-Object { $_.Dependent -like ('*' + $letter + '*') } | Select-Object -First 1; if ($partition) { $diskId = ($partition.Antecedent -split '"')[1]; $disk = Get-CimInstance -ClassName Win32_DiskDrive | Where-Object { $_.DeviceID -eq $diskId } | Select-Object -First 1; if ($disk) { $interface = $disk.InterfaceType; $serial = $disk.SerialNumber; $result += ($letter + '|' + $interface + '|' + $serial) } } }; $result -join [Environment]::NewLine`;

        const { stdout: psOutput } = await execAsync(`powershell -NoProfile -Command "${psScript}"`);
        const psLines = psOutput.split('\n').filter(line => line.trim());
        log.info('[DRIVES] PowerShell output lines:', psLines.length);

        for (const line of psLines) {
          const parts = line.split('|');
          if (parts.length >= 3) {
            const driveLetter = parts[0].trim();
            const interfaceType = parts[1].trim();
            const serialNumber = parts[2].trim();

            log.info(`[DRIVES] Drive ${driveLetter}: interfaceType="${interfaceType}", serialNumber="${serialNumber}"`);

            if (interfaceType && interfaceType.toUpperCase().includes('USB')) {
              driveInterfaces.set(driveLetter, 'USB');
              log.info(`[DRIVES] ✅ Drive ${driveLetter} riconosciuto come USB (interfaccia: ${interfaceType})`);
            }

            if (serialNumber && serialNumber !== 'SerialNumber' && serialNumber.length > 0) {
              driveSerials.set(driveLetter, serialNumber);
              log.info(`[DRIVES] ✅ Drive ${driveLetter} serial number: ${serialNumber}`);
            }
          }
        }
      } catch (interfaceError) {
        log.error('[DRIVES] ❌ Could not get drive interfaces/serials:', interfaceError);
      }

      // ✅ Parsa l'output PowerShell: "caption|drivetype|size|freespace|volumename"
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 5) {
          const caption = parts[0].trim();
          const drivetype = parts[1].trim();
          const size = parts[2].trim();
          const freespace = parts[3].trim();
          const volumename = parts[4].trim();

          let driveType = getDriveType(parseInt(drivetype));
          const originalDriveType = driveType;
          const interfaceType = driveInterfaces.get(caption);

          // ✅ Se è un drive fisso (type 3) ma ha interfaccia USB, è una chiavetta/hard disk USB esterno
          if (driveType === 'fixed' && interfaceType === 'USB') {
            driveType = 'removable'; // Tratta come removable (chiavetta/hard disk USB esterno)
            log.info(`[DRIVES] Drive ${caption} riconosciuto come USB (interfaccia: ${interfaceType}), tipo cambiato da ${originalDriveType} a ${driveType}`);
          } else if (caption === 'D:') {
            // ✅ Debug specifico per D:
            log.info(`[DRIVES] Drive D: - drivetype: ${drivetype}, driveType: ${driveType}, interface: ${interfaceType}, serialNumber: ${driveSerials.get(caption)}`);
          }

          if (driveType) {
            // ✅ Usa il volume label se disponibile, altrimenti usa la caption
            const volumeLabel = volumename && volumename !== '' ? volumename : (volumeLabels.get(caption) || caption);
            const serialNumber = driveSerials.get(caption);

            drives.push({
              id: caption,
              label: volumeLabel, // ✅ Ora contiene il nome del volume (es. "Pippo" per USB, "DVD_NAME" per DVD)
              path: caption + '\\',
              type: driveType,
              capacityBytes: size && size !== '' ? parseInt(size) : undefined,
              freeBytes: freespace && freespace !== '' ? parseInt(freespace) : undefined,
              mounted: true,
              serialNumber: serialNumber // ✅ Identificatore univoco del dispositivo
            });
          }
        }
      }
    } catch (wmicError) {
      // Log rimosso - wmic fallback è normale su Windows, non è un errore

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
}

export async function filesystemRoutes(fastify: FastifyInstance) {
  // List drives
  fastify.get('/filesystem/drives', async (request, reply) => {
    try {
      const drives = await getDrivesList(fastify);
      return drives;
    } catch (error) {
      fastify.log.error('Failed to list drives:', error);
      return reply.code(500).send({ error: 'Failed to list drives' });
    }
  });

  // List directory contents
  fastify.post('/filesystem/list', async (request, reply) => {
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
  fastify.post('/filesystem/exists', async (request, reply) => {
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
  fastify.post('/filesystem/open', async (request, reply) => {
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
  fastify.post('/filesystem/reveal', async (request, reply) => {
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
  fastify.post('/filesystem/read-chunk', async (request, reply) => {
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
  fastify.get('/filesystem/file/*', async (request, reply) => {
    try {
      // Extract file path from URL (handles both with and without /api prefix)
      const urlPath = request.url.replace(/^\/api\/filesystem\/file\//, '').replace(/^\/filesystem\/file\//, '');
      const filePath = decodeURIComponent(urlPath);

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
        // ✅ PDF
        case '.pdf':
          contentType = 'application/pdf';
          break;
        // ✅ Word
        case '.docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case '.doc':
          contentType = 'application/msword';
          break;
        // ✅ Immagini
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
        case '.bmp':
          contentType = 'image/bmp';
          break;
        case '.svg':
          contentType = 'image/svg+xml';
          break;
        // ✅ Video
        case '.mp4':
          contentType = 'video/mp4';
          break;
        case '.avi':
          contentType = 'video/x-msvideo';
          break;
        case '.mov':
          contentType = 'video/quicktime';
          break;
        case '.wmv':
          contentType = 'video/x-ms-wmv';
          break;
        case '.flv':
          contentType = 'video/x-flv';
          break;
        case '.webm':
          contentType = 'video/webm';
          break;
        case '.mkv':
          contentType = 'video/x-matroska';
          break;
        case '.m4v':
          contentType = 'video/x-m4v';
          break;
        // ✅ Audio
        case '.mp3':
          contentType = 'audio/mpeg';
          break;
        case '.wav':
          contentType = 'audio/wav';
          break;
        case '.ogg':
          contentType = 'audio/ogg';
          break;
        case '.m4a':
          contentType = 'audio/mp4';
          break;
        case '.flac':
          contentType = 'audio/flac';
          break;
        case '.aac':
          contentType = 'audio/aac';
          break;
      }

      // Set headers
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', String(stats.size));
      reply.header('Accept-Ranges', 'bytes'); // ✅ Supporta range requests per video/audio
      reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // ✅ Streaming diretto (non carica tutto in memoria)
      return reply.send(fs.createReadStream(filePath));
    } catch (error) {
      fastify.log.error('Failed to serve file:', error);
      return reply.code(500).send({ error: 'Failed to serve file' });
    }
  });

  // Read file content for upload
  fastify.post('/filesystem/read-file', async (request, reply) => {
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
  fastify.post('/filesystem/copy-temp', async (request, reply) => {
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
  fastify.post('/filesystem/move-to-archive', async (request, reply) => {
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
  fastify.delete('/filesystem/temp/:filename', async (request, reply) => {
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
  fastify.post('/filesystem/cleanup-temp', async (request, reply) => {
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

  // Detect native text in PDF (for OCR detection)
  fastify.post('/filesystem/detect-native-text', async (request, reply) => {
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

      // Check if it's a PDF
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.pdf') {
        return reply.code(400).send({ error: 'File must be a PDF' });
      }

      // Detect native text (reads only first page for speed)
      const hasNativeText = await detectNativeText(filePath);

      return reply.send({ hasNativeText });
    } catch (error) {
      fastify.log.error('Failed to detect native text:', error);
      return reply.code(500).send({ error: 'Failed to detect native text' });
    }
  });

  // Extract object from PDF (reads first few pages and searches for "Oggetto:")
  fastify.post('/filesystem/extract-object', async (request, reply) => {
    const requestBody = request.body as { filePath: string; hasNativeText?: boolean };
    const { filePath, hasNativeText } = requestBody;

    try {
      if (!filePath) {
        return reply.code(400).send({ error: 'File path is required' });
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (accessError) {
        return reply.code(404).send({ error: 'File not found' });
      }

      // Check if it's a PDF
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.pdf') {
        return reply.code(400).send({ error: 'File must be a PDF' });
      }

      // Se hasNativeText non è fornito, rilevalo (silenzioso)
      let hasNative = hasNativeText;
      if (hasNative === undefined) {
        hasNative = await detectNativeText(filePath);
      }

      // Estrai oggetto dalle prime pagine (i log sono dentro extractObject)
      const oggetto = await extractObject(filePath, hasNative, 3);

      // Log solo se trovato (per debug)
      if (oggetto) {
        const filename = filePath.split(/[/\\]/).pop();
        fastify.log.info('[EXTRACT-OBJECT][FOUND]', {
          filename,
          length: oggetto.length
        });
      }

      return reply.send({ oggetto });
    } catch (error: any) {
      // Log solo errori reali
      const filename = filePath?.split(/[/\\]/).pop() || 'unknown';
      fastify.log.error('[EXTRACT-OBJECT][ERROR]', {
        filename,
        error: error?.message || String(error)
      });
      return reply.code(500).send({ error: 'Failed to extract object' });
    }
  });

  // Copia file da filePath originale a uploads/ per OCR on-demand
  fastify.post('/filesystem/copy-for-ocr', async (request, reply) => {
    try {
      const { sourcePath, targetS3Key } = request.body as { sourcePath: string; targetS3Key: string };

      if (!sourcePath || !targetS3Key) {
        return reply.code(400).send({ error: 'sourcePath and targetS3Key are required' });
      }

      // Verifica che il file sorgente esista
      try {
        await fs.access(sourcePath);
      } catch {
        return reply.code(404).send({ error: 'Source file not found', sourcePath });
      }

      // Sanitizza s3Key per path Windows (rimuove caratteri non validi come ':')
      const sanitizeFileName = (key: string) => key.replace(/[:<>"|?*\\]/g, '_');
      const sanitizedKey = sanitizeFileName(targetS3Key);
      const uploadsDir = path.resolve(process.cwd(), '..', 'uploads');
      const targetPath = path.join(uploadsDir, sanitizedKey);

      // Crea directory se non esiste
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Copia file
      await fs.copyFile(sourcePath, targetPath);

      fastify.log.info({
        msg: 'File copied for OCR',
        sourcePath,
        targetPath,
        s3Key: targetS3Key,
        sanitizedKey
      });

      return reply.send({
        success: true,
        targetPath,
        sanitizedKey
      });
    } catch (error: any) {
      fastify.log.error({
        msg: 'Failed to copy file for OCR',
        error: error?.message,
        stack: error?.stack
      });
      return reply.code(500).send({
        error: 'Failed to copy file for OCR',
        details: error?.message || String(error)
      });
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
