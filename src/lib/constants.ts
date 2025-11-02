export const COMPARTI_PENALI = [
  { key: 'parti_anagrafiche', nome: 'Parti & Anagrafiche', ordine: 0 },
  { key: 'admin_procure', nome: 'Admin & Procure', ordine: 1 },
  { key: 'denuncia_querela', nome: 'Denuncia–Querela / Notizia di reato', ordine: 2 },
  { key: 'indagini_preliminari', nome: 'Indagini preliminari', ordine: 3 },
  { key: 'verbal_arresto_sequestro', nome: 'Verbal: Arresto Perquisizioni Sequestro', ordine: 4 },
  { key: 'interrogatori_dichiarazioni', nome: 'Interrogatori e Dichiarazioni', ordine: 5 },
  { key: 'corrispondenza_pec', nome: 'Corrispondenza & PEC', ordine: 6 },
  { key: 'utenz_scadenze', nome: 'Elenco Utenze Scadenze Proroghe', ordine: 7 },
  { key: 'trascriptioni_intercett', nome: 'Trascrizioni Intercettazioni Telefoniche', ordine: 8 },
  { key: 'atti_interlocutori', nome: 'Atti Interlocutori Corrispondenza Varia', ordine: 9 },
  { key: 'nomi_citati_frequentazioni', nome: 'Nomi Citati in Atti Frequentazioni', ordine: 10 },
  { key: 'contestazioni', nome: 'Contestazioni P.M./GIP', ordine: 11 },
  { key: 'raccolta_prove', nome: 'Raccolta Prove Osservazioni', ordine: 12 },
  { key: 'mappe_concettuali', nome: 'Mappe Concettuali Grafico', ordine: 13 },
  { key: 'note_campo_libero', nome: 'Note a Campo Libero', ordine: 14 },
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