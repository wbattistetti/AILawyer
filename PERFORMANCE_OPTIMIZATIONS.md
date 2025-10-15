# Ottimizzazioni Performance - AILawyer

## Panoramica

Sono state implementate ottimizzazioni significative per massimizzare la concorrenza e automatizzare la generazione delle miniature, mantenendo le performance al massimo livello.

## 🚀 Ottimizzazioni OCR

### Concorrenza Massimizzata
- **Concorrenza automatica**: Il sistema ora calcola automaticamente la concorrenza ottimale basata sui core CPU disponibili
- **Formula ottimizzata**: `Math.max(4, Math.min(16, cpuCount * 2))` - raddoppia i core disponibili
- **Configurazione flessibile**: Possibilità di override tramite variabili d'ambiente

### Configurazioni Ottimizzate
```typescript
// Concorrenza OCR
OCR_CONCURRENCY=0          // 0 = auto-ottimizzato
OCR_MAX_CONCURRENCY=16     // Limite massimo
OCR_WORKER_CONCURRENCY=8   // Worker concorrenza

// Performance
OCR_TIMEOUT_SEC=900        // 15 minuti timeout
OCR_QUICK_MODE=false       // Modalità veloce disabilitata per qualità
```

### Pipeline Ottimizzata
- **Processamento per-pagina**: Ogni pagina viene processata in parallelo
- **Retry automatici**: Sistema robusto di retry con backoff esponenziale
- **Fallback DPI**: Automatico passaggio a DPI più alti se necessario

## 🖼️ Generazione Automatica Miniature

### Client-Side con PDF.js
- **Generazione automatica**: Le miniature vengono generate automaticamente lato client
- **Cache intelligente**: Sistema di cache per evitare rigenerazioni
- **Fallback server**: Se la generazione client fallisce, fallback al server

### Configurazioni Thumbnail
```typescript
// Thumbnail settings
THUMB_AUTO_GENERATE=true   // Generazione automatica abilitata
THUMB_QUALITY=0.8          // Qualità ottimizzata
DEFAULT_WIDTH=192          // Larghezza standard
DEFAULT_HEIGHT=256         // Altezza standard
CACHE_SIZE=100             // Cache size
BATCH_SIZE=3               // Processamento in batch
```

### Hook Personalizzati
- **`useAutoThumbnail`**: Hook per generazione singola miniatura
- **`useMultipleThumbnails`**: Hook per gestione batch miniature
- **`ThumbnailManager`**: Componente per gestione automatica collezioni

## ⚡ Ottimizzazioni Queue

### BullMQ Ottimizzato
```typescript
// Configurazioni queue
concurrency: 8                    // 8 job paralleli
stalledInterval: 30000           // 30 secondi
maxStalledCount: 1               // Retry limitato
priority: 1                      // Priorità alta
delay: 0                         // Nessun delay
```

### Worker Ottimizzati
- **Concorrenza aumentata**: Da 2 a 8 job paralleli
- **Timeout ottimizzati**: Gestione migliorata dei job stalled
- **Retry intelligenti**: Sistema di retry con backoff

## 📊 Configurazioni Performance

### Variabili d'Ambiente Ottimizzate
```bash
# OCR Performance
OCR_CONCURRENCY=0
OCR_MAX_CONCURRENCY=16
OCR_WORKER_CONCURRENCY=8

# Thumbnail Performance
THUMB_AUTO_GENERATE=true
THUMB_QUALITY=0.8

# Queue Performance
ENABLE_QUEUE=true
REDIS_URL=redis://localhost:6379
```

### Costanti Ottimizzate
```typescript
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
```

## 🛠️ Utilizzo

### Componente Ottimizzato
```tsx
import { OptimizedDocumentCollection } from './components/examples/OptimizedDocumentCollection'

<OptimizedDocumentCollection
  documents={documents}
  autoGenerateThumbnails={true}
  onDocumentSelect={handleSelect}
  onDocumentPreview={handlePreview}
  onDocumentOcr={handleOcr}
/>
```

### Hook per Miniature
```tsx
import { useAutoThumbnail } from './hooks/useAutoThumbnail'

const { thumbnail, loading, error } = useAutoThumbnail(fileUrl, {
  width: 192,
  height: 256,
  quality: 0.8
})
```

### ThumbnailManager
```tsx
import { ThumbnailManager } from './components/thumbnail/ThumbnailManager'

<ThumbnailManager documents={documents}>
  {({ getThumbnail, isLoading, getError }) => (
    // Renderizza i documenti con miniature automatiche
  )}
</ThumbnailManager>
```

## 📈 Benefici Performance

### OCR
- **Concorrenza 4x**: Da 2 a 8 job paralleli
- **Throughput aumentato**: Processamento simultaneo di più documenti
- **Latenza ridotta**: Pipeline ottimizzata per velocità

### Miniature
- **Generazione automatica**: Nessuna chiamata API manuale
- **Cache client-side**: Riduzione carico server
- **Batch processing**: Generazione ottimizzata in gruppi

### Sistema Generale
- **Scalabilità migliorata**: Gestione automatica delle risorse
- **Resilienza aumentata**: Retry e fallback automatici
- **UX ottimizzata**: Caricamento più veloce e fluido

## 🔧 Configurazione Avanzata

### Override Concorrenza
```bash
# Forza concorrenza specifica
OCR_CONCURRENCY=12
OCR_MAX_CONCURRENCY=20
OCR_WORKER_CONCURRENCY=10
```

### Disabilitare Generazione Automatica
```bash
# Disabilita generazione automatica miniature
THUMB_AUTO_GENERATE=false
```

### Configurazione Redis
```bash
# Redis ottimizzato per performance
REDIS_URL=redis://localhost:6379
# Configurazioni Redis per alta concorrenza
```

## 📝 Note Implementative

1. **Compatibilità**: Tutte le ottimizzazioni sono backward-compatible
2. **Fallback**: Sistema robusto di fallback per ogni componente
3. **Monitoring**: Log dettagliati per monitoraggio performance
4. **Configurabilità**: Tutte le ottimizzazioni sono configurabili via env vars

## 🚀 Prossimi Passi

1. **Monitoring**: Implementare metriche di performance
2. **Auto-scaling**: Sistema di auto-scaling basato su carico
3. **Caching avanzato**: Cache distribuita per miniature
4. **Load balancing**: Distribuzione intelligente del carico

---

*Le ottimizzazioni sono state progettate per massimizzare le performance mantenendo la stabilità e la compatibilità del sistema.*
