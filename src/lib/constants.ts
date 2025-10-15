export const COMPARTI_PENALI = [
  { key: 'da_classificare', nome: 'Da classificare', ordine: 0 },
  { key: 'admin_procure', nome: 'Admin & Procure', ordine: 1 },
  { key: 'parti_anagrafiche', nome: 'Parti & Anagrafiche', ordine: 2 },
  { key: 'corrispondenza_pec', nome: 'Corrispondenza & PEC', ordine: 3 },
  { key: 'denuncia_querela', nome: 'Denuncia–Querela / Notizia di reato', ordine: 4 },
  { key: 'indagini_preliminari', nome: 'Indagini preliminari (PG/PM, 415-bis)', ordine: 5 },
  { key: 'perizie_consulenze', nome: 'Perizie & Consulenze (CTP/CTU)', ordine: 6 },
  { key: 'prove_allegati', nome: 'Prove & Allegati (foto, audio, chat)', ordine: 7 },
  { key: 'udienze_verbali', nome: 'Udienze & Verbali', ordine: 8 },
  { key: 'provvedimenti_giudice', nome: 'Provvedimenti del giudice (GIP/GUP/Trib.)', ordine: 9 },
]

export const TAG_PENALI = [
  '415-bis',
  'cautelare',
  'sequestro',
  'perquisizione',
  'intercettazioni',
  'dibattimento',
  'provvedimento',
  'GIP',
  'GUP',
  'appello',
  'cassazione',
  'CTP',
  'CTU',
  'verbale',
  'PEC',
]

export const OCR_CONFIDENCE_THRESHOLD = 65
export const CLASSIFY_CONFIDENCE_THRESHOLD = 60
export const MAX_UPLOAD_SIZE = 400 * 1024 * 1024 // 50MB
export const MAX_FILES_PER_BATCH = 50

// Configurazioni per ottimizzazioni performance
export const THUMBNAIL_CONFIG = {
  AUTO_GENERATE: true,
  DEFAULT_WIDTH: 192,
  DEFAULT_HEIGHT: 256,
  DEFAULT_QUALITY: 0.8,
  CACHE_SIZE: 100,
  BATCH_SIZE: 3,
} as const

export const OCR_CONFIG = {
  MAX_CONCURRENCY: 16,
  AUTO_OPTIMIZE: true,
  RETRY_ATTEMPTS: 3,
  TIMEOUT_MS: 900000, // 15 minuti
} as const