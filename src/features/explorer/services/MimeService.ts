import { FileKind } from '../types';

export class MimeService {
  private static readonly EXTENSION_MAP: Record<string, FileKind> = {
    // PDF
    'pdf': 'pdf',
    
    // Word documents
    'doc': 'word',
    'docx': 'word',
    'docm': 'word',
    'dot': 'word',
    'dotx': 'word',
    'dotm': 'word',
    'rtf': 'word',
    'odt': 'word',
    
    // Images
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'bmp': 'image',
    'webp': 'image',
    'svg': 'image',
    'tiff': 'image',
    'tif': 'image',
    'ico': 'image',
    'heic': 'image',
    'heif': 'image',
    
    // Video
    'mp4': 'video',
    'avi': 'video',
    'mov': 'video',
    'wmv': 'video',
    'flv': 'video',
    'webm': 'video',
    'mkv': 'video',
    'm4v': 'video',
    '3gp': 'video',
    'ogv': 'video',
    
    // Audio
    'mp3': 'audio',
    'wav': 'audio',
    'flac': 'audio',
    'aac': 'audio',
    'ogg': 'audio',
    'wma': 'audio',
    'm4a': 'audio',
    'opus': 'audio'
  };

  private static readonly SIGNATURES: Array<{
    signature: number[];
    kind: FileKind;
    offset?: number;
  }> = [
    // PDF
    { signature: [0x25, 0x50, 0x44, 0x46], kind: 'pdf' }, // %PDF
    
    // Images
    { signature: [0xFF, 0xD8, 0xFF], kind: 'image' }, // JPEG
    { signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], kind: 'image' }, // PNG
    { signature: [0x47, 0x49, 0x46, 0x38], kind: 'image' }, // GIF
    { signature: [0x42, 0x4D], kind: 'image' }, // BMP
    { signature: [0x52, 0x49, 0x46, 0x46], kind: 'image', offset: 8 }, // WEBP (RIFF...WEBP)
    
    // Video
    { signature: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], kind: 'video' }, // MP4
    { signature: [0x1A, 0x45, 0xDF, 0xA3], kind: 'video' }, // WebM/MKV
    { signature: [0x52, 0x49, 0x46, 0x46], kind: 'video', offset: 8 }, // AVI (RIFF...AVI)
    
    // Audio
    { signature: [0x49, 0x44, 0x33], kind: 'audio' }, // MP3 with ID3
    { signature: [0xFF, 0xFB], kind: 'audio' }, // MP3
    { signature: [0x52, 0x49, 0x46, 0x46], kind: 'audio', offset: 8 }, // WAV (RIFF...WAVE)
    { signature: [0x4F, 0x67, 0x67, 0x53], kind: 'audio' }, // OGG
    
    // Word documents (ZIP-based)
    { signature: [0x50, 0x4B, 0x03, 0x04], kind: 'word' }, // DOCX, PPTX, XLSX
    { signature: [0x50, 0x4B, 0x05, 0x06], kind: 'word' }, // ZIP (empty)
    { signature: [0x50, 0x4B, 0x07, 0x08], kind: 'word' }  // ZIP (spanned)
  ];

  static async detectKind(file: {
    name: string;
    path: string;
    readChunk?: (start: number, len: number) => Promise<ArrayBuffer>;
  }): Promise<FileKind> {
    // First try signature detection if readChunk is available
    if (file.readChunk) {
      try {
        const chunk = await file.readChunk(0, 32);
        const view = new Uint8Array(chunk);
        
        for (const { signature, kind, offset = 0 } of this.SIGNATURES) {
          if (this.matchesSignature(view, signature, offset)) {
            return kind;
          }
        }
      } catch (error) {
        console.warn('Failed to read file signature:', error);
      }
    }
    
    // Fallback to extension-based detection
    const ext = this.getExtension(file.name);
    return this.EXTENSION_MAP[ext] || 'unknown';
  }

  private static matchesSignature(
    buffer: Uint8Array, 
    signature: number[], 
    offset: number = 0
  ): boolean {
    if (buffer.length < offset + signature.length) {
      return false;
    }
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[offset + i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }

  private static getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot + 1).toLowerCase();
  }

  static getKindIcon(kind: FileKind): string {
    const icons: Record<FileKind, string> = {
      pdf: 'FileText',
      word: 'FileText',
      image: 'Image',
      video: 'Video',
      audio: 'Music',
      unknown: 'File'
    };
    return icons[kind];
  }

  static getKindColor(kind: FileKind): string {
    const colors: Record<FileKind, string> = {
      pdf: 'text-red-600',
      word: 'text-blue-600',
      image: 'text-green-600',
      video: 'text-purple-600',
      audio: 'text-orange-600',
      unknown: 'text-gray-600'
    };
    return colors[kind];
  }
}

