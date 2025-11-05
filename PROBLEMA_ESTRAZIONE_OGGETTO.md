# Problema: Estrazione Oggetto da PDF con OCR

## Descrizione del Problema

Il sistema estrae l'oggetto da PDF documenti cercando la stringa "Oggetto:" (case-insensitive) nelle prime pagine. Il problema è che **per i PDF che richiedono OCR, l'oggetto non viene trovato anche quando è presente nel documento**.

## Logica Attuale

### Frontend: `usePdfObjectExtraction.ts`

**Flusso:**
1. Quando lo scan dei file è completato (`scanning: false`), l'hook filtra i PDF che:
   - Hanno `oggetto === undefined` (non ancora processati)
   - Hanno `hasNativeText !== undefined` (sappiamo se serve OCR o no)

2. Aggiunge questi PDF a una queue

3. Processa i PDF uno alla volta (o in parallelo, max 3) chiamando:
   ```typescript
   POST /api/filesystem/extract-object
   {
     filePath: string,
     hasNativeText: boolean
   }
   ```

4. Il backend ritorna `{ oggetto: string | null }`

5. Se `oggetto` è trovato, viene mostrato nella griglia; altrimenti rimane vuoto

### Backend: `backend/src/lib/extractObject.ts`

**Flusso per PDF con testo nativo (`hasNativeText: true`):**
1. Usa `pdftotext` (o fallback a `pdf.js`) per estrarre testo dalle prime 3 pagine
2. Applica regex: `/oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i`
3. Ritorna il testo catturato fino alla prossima linea vuota

**Flusso per PDF senza testo nativo (`hasNativeText: false`):**
1. Copia il PDF in `uploads/` con chiave temporanea
2. Imposta variabili d'ambiente:
   - `OCR_LIMIT_PAGES=3` (solo prime 3 pagine)
   - `OCR_QUICK_MODE=true` (modalità veloce)
   - `OCR_CROP_TOP_THIRD=true` (ritaglia solo primo terzo di ogni pagina)
3. Chiama `ocrService.extract(sanitizedKey, callback)`
4. Il servizio OCR:
   - Usa `pdftoppm` per rasterizzare le pagine in PNG
   - Se `OCR_CROP_TOP_THIRD=true`, ritaglia ogni PNG al primo terzo (usando `canvas`)
   - Passa le immagini ritagliate a Tesseract.js per OCR
   - Ritorna array di oggetti `{ text: string, confidence: number }` per pagina
5. Unisce tutto il testo estratto
6. Applica la stessa regex: `/oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i`
7. Ritorna il testo catturato

## Problemi Identificati

### 1. Processing in Parallelo
Il frontend processa più PDF contemporaneamente (vedi log: `processingCount: 3`), ma il backend potrebbe non gestire correttamente il crop delle immagini quando chiamato in parallelo.

### 2. Log Backend Mancanti
I log del backend mostrano che le richieste arrivano, ma non ci sono log dettagliati per:
- Il testo estratto dall'OCR
- La regex matching
- Se l'oggetto viene trovato o meno

### 3. Regex Potenzialmente Incompleta
La regex attuale cerca:
```
/oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i
```

Questo cerca:
- `oggetto` (case-insensitive)
- Spazi opzionali
- `:`
- Spazi opzionali
- Tutto fino alla prossima linea vuota (`\n\n` o `\n\s*\n`)

**Problemi possibili:**
- L'OCR potrebbe non riconoscere correttamente i due punti (`:`) o gli spazi
- L'OCR potrebbe inserire caratteri speciali o spazi extra
- Il testo potrebbe essere su più righe con interruzioni diverse

### 4. Crop Top Third
Il crop al primo terzo potrebbe tagliare l'oggetto se è posizionato più in basso nella pagina.

## Codice Rilevante

### Frontend Hook
```typescript
// src/features/explorer/hooks/usePdfObjectExtraction.ts

const extractObject = useCallback(async (filePath: string, hasNativeText?: boolean): Promise<string | null> => {
  const response = await fetch('http://localhost:3001/api/filesystem/extract-object', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, hasNativeText }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.oggetto || null;
}, []);
```

### Backend Extract Object
```typescript
// backend/src/lib/extractObject.ts

export async function extractObject(
  pdfPath: string,
  hasNativeText: boolean,
  maxPages: number = 3
): Promise<string | null> {
  if (hasNativeText) {
    // Usa pdftotext o pdf.js
    const text = await extractTextNative(pdfPath, maxPages);
    const regex = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i;
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : null;
  } else {
    // Usa OCR
    const { ocrService } = await import('../services/ocr.js');
    const result = await ocrService.extract(sanitizedKey, callback);
    const allText = result.pages.map(p => p.text).join('\n\n');
    const regex = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i;
    const match = allText.match(regex);
    return match && match[1] ? match[1].trim() : null;
  }
}
```

### OCR Service con Crop
```typescript
// backend/src/services/ocr-poppler.ts

async rasterizePage(pdfPath: string, pageNum: number): Promise<string> {
  // Rasterizza pagina in PNG
  const pngPath = await execa('pdftoppm', [...]);

  // Se OCR_CROP_TOP_THIRD=true, ritaglia
  if (process.env.OCR_CROP_TOP_THIRD === 'true') {
    await cropImageTopThird(pngPath); // Ritaglia al primo terzo
  }

  // OCR con Tesseract
  const result = await worker.recognize(pngPath);
  return result.data.text;
}
```

## Log di Esempio

```
[PDF Object Extraction][REQUEST] {
  filePath: 'C:\\Dav Canz\\Arresto Di Nardo.pdf',
  hasNativeText: false,
  timestamp: '2025-11-05T05:31:33.445Z'
}

[PDF Object Extraction][RESPONSE] {
  filePath: 'C:\\Dav Canz\\Arresto Di Nardo.pdf',
  status: 200,
  statusText: 'OK',
  elapsedMs: 214,
  ok: true
}

[PDF Object Extraction][SUCCESS] {
  filePath: 'C:\\Dav Canz\\Arresto Di Nardo.pdf',
  hasOggetto: false,
  oggettoLength: 0,
  oggettoPreview: null,
  elapsedMs: 225
}
```

**Nota:** Il PDF "Arresto Di Nardo" ha un oggetto chiaro ("OGGETTO:"), ma il backend ritorna `hasOggetto: false`.

## Possibili Soluzioni

### 1. Aggiungere Log Dettagliati nel Backend
Aggiungere log per:
- Il testo estratto dall'OCR (primi 500 caratteri)
- Il risultato della regex matching
- Se l'oggetto viene trovato o meno

### 2. Migliorare la Regex
Provare regex alternative più tolleranti:
```javascript
// Regex più permissiva
/oggetto\s*[:]\s*([^\n]+(?:\n(?!\s*\n)[^\n]+)*)/i

// O ancora più semplice
/oggetto[:\s]+(.+?)(?:\n\s*\n|$)/is
```

### 3. Verificare il Crop
Verificare se il crop al primo terzo taglia l'oggetto. Potrebbe essere necessario:
- Aumentare l'area crop (es. primi 2/3 o metà pagina)
- O rimuovere il crop per i primi 3 PDF che richiedono OCR

### 4. Testare OCR Quality
Verificare la qualità del testo estratto dall'OCR. Potrebbe essere necessario:
- Aumentare la risoluzione delle immagini rasterizzate
- Migliorare il preprocessing delle immagini
- Usare un modello OCR diverso o più accurato

### 5. Processing Sequenziale
Evitare processing in parallelo per PDF che richiedono OCR, per evitare problemi di concorrenza nel crop delle immagini.

## Dati di Test

**PDF di test:** `C:\Dav Canz\Arresto Di Nardo.pdf`
- Ha `hasNativeText: false` (richiede OCR)
- Ha una riga chiara: "OGGETTO: ..."
- Il backend ritorna `oggetto: null` invece del testo

## Risultati Dopo Implementazione

**Test del 05/11/2025:**
- ✅ Processing sequenziale implementato (limite a 1 per OCR)
- ✅ Regex più tolleranti implementate (3 pattern diversi)
- ✅ Crop disattivato temporaneamente
- ✅ DPI aumentato a 400
- ✅ Log dettagliati aggiunti

**Risultati:**
- ❌ Tutti i PDF con OCR (`hasNativeText: false`) ritornano ancora `hasOggetto: false`
- ✅ PDF con testo nativo funzionano correttamente (es. "Catania", "Informativa Piccolo Mattone")
- ⚠️ Processing parallelo ancora presente (vedi log: `processingCount: 2` per OCR)

**Prossimi passi:**
1. Verificare i log del backend per vedere se il testo OCR viene estratto
2. Verificare se il testo contiene "oggetto" (case-insensitive)
3. Verificare quale regex pattern viene usato e perché fallisce
4. Controllare se il DPI aumentato migliora la qualità OCR

## Domande per l'Esperto

1. La regex è corretta per testo estratto da OCR? Dovrebbe essere più tollerante?
2. Il crop al primo terzo è troppo aggressivo? L'oggetto potrebbe essere più in basso?
3. La qualità del testo OCR è sufficiente? Dovremmo vedere il testo estratto per verificare?
4. C'è un problema di concorrenza nel processing parallelo?
5. Dovremmo provare un approccio diverso (es. cercare in tutte le pagine, non solo prime 3)?

