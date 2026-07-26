/**
 * Resolve thumbnail header color and kind from document format.
 */

import adobeAcrobatReaderIcon from '../../../../assets/icons/adobe-acrobat-reader.svg'
import audioIcon from '../../../../assets/icons/audio.svg'
import extractIcon from '../../../../assets/icons/extract.svg'
import genericFileIcon from '../../../../assets/icons/file-generic.svg'
import imageIcon from '../../../../assets/icons/image.svg'
import microsoftWordIcon from '../../../../assets/icons/microsoft-word.svg'
import videoIcon from '../../../../assets/icons/video.svg'
import {
  isAudioDocument,
  isImageDocument,
  isPdfDocument,
  isVideoDocument,
  isWordDocument,
} from './viewerUtils'

export type DocumentHeaderKind =
  | 'pdf'
  | 'word'
  | 'image'
  | 'video'
  | 'audio'
  | 'extract'
  | 'unknown'

export type DocumentHeaderInput = {
  filename: string
  mime?: string
  isExtract?: boolean
}

export type DocumentHeaderStyle = {
  kind: DocumentHeaderKind
  headerColorClass: string
  iconSrc: string
}

const HEADER_COLOR_BY_KIND: Record<DocumentHeaderKind, string> = {
  pdf: 'bg-red-600',
  word: 'bg-blue-600',
  image: 'bg-violet-600',
  video: 'bg-indigo-600',
  audio: 'bg-emerald-600',
  extract: 'bg-emerald-400',
  unknown: 'bg-slate-500',
}

const ICON_SRC_BY_KIND: Record<DocumentHeaderKind, string> = {
  pdf: adobeAcrobatReaderIcon,
  word: microsoftWordIcon,
  image: imageIcon,
  video: videoIcon,
  audio: audioIcon,
  extract: extractIcon,
  unknown: genericFileIcon,
}

/**
 * Classify a document for thumbnail header styling.
 */
export function resolveDocumentHeaderKind(input: DocumentHeaderInput): DocumentHeaderKind {
  if (input.isExtract) return 'extract'

  const doc = { filename: input.filename || '', mime: input.mime }
  if (isPdfDocument(doc)) return 'pdf'
  if (isWordDocument(doc)) return 'word'
  if (isImageDocument(doc)) return 'image'
  if (isVideoDocument(doc)) return 'video'
  if (isAudioDocument(doc)) return 'audio'
  return 'unknown'
}

/**
 * Return Tailwind color class for a header kind.
 */
export function getDocumentHeaderColorClass(kind: DocumentHeaderKind): string {
  return HEADER_COLOR_BY_KIND[kind]
}

/**
 * Resolve full thumbnail header style (kind, color, icon) from filename/mime.
 */
export function resolveDocumentHeaderStyle(input: DocumentHeaderInput): DocumentHeaderStyle {
  const kind = resolveDocumentHeaderKind(input)
  return {
    kind,
    headerColorClass: getDocumentHeaderColorClass(kind),
    iconSrc: ICON_SRC_BY_KIND[kind],
  }
}
