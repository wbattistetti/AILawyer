/**
 * ✅ Utility comuni per determinare il tipo di viewer da usare
 */

import { Documento } from '../../../../types'

/**
 * Determina se un documento è un file Word
 */
export function isWordDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  return (
    filename.endsWith('.docx') ||
    filename.endsWith('.doc') ||
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  )
}

/**
 * Determina se un documento è un PDF
 */
export function isPdfDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  return (
    filename.endsWith('.pdf') ||
    mime === 'application/pdf'
  )
}

/**
 * Determina se un documento è un'immagine
 */
export function isImageDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif', '.ico', '.heic', '.heif']
  const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'image/tiff', 'image/x-icon', 'image/heic', 'image/heif']

  return (
    imageExtensions.some(ext => filename.endsWith(ext)) ||
    imageMimes.some(imgMime => mime.includes(imgMime)) ||
    mime.startsWith('image/')
  )
}

/**
 * Determina se un documento è un video
 */
export function isVideoDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.ogv']
  const videoMimes = ['video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv', 'video/webm', 'video/x-matroska', 'video/x-m4v']

  return (
    videoExtensions.some(ext => filename.endsWith(ext)) ||
    mime.startsWith('video/')
  )
}

/**
 * Determina se un documento è un audio
 */
export function isAudioDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus']
  const audioMimes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/x-ms-wma', 'audio/mp4', 'audio/opus']

  return (
    audioExtensions.some(ext => filename.endsWith(ext)) ||
    mime.startsWith('audio/')
  )
}