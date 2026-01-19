# REPORT: Problema Rettangolo Selezione Word Viewer

## 📋 PROBLEMA ORIGINALE

### Sintomi
1. **Ritardo nell'apparizione**: Il rettangolo blu non appare immediatamente quando si clicca, ma solo dopo aver iniziato a trascinare
2. **Angolo non segue il mouse**: Durante il drag, l'angolo in basso a destra del rettangolo non coincide con la posizione del mouse, rimanendo "indietro"
3. **Comportamento inconsistente**: Il rettangolo appare ma con coordinate errate

### Contesto
- **File interessati**: Word Viewer (documenti `.docx`)
- **Componenti coinvolti**:
  - `useRectSelection` (hook comune per drag rettangolo)
  - `DraftOverlay` (componente per renderizzare il rettangolo)
  - `WordViewerShell` (shell principale del viewer Word)
  - `useViewerOverlays` (hook per gestire overlay roots)

---

## 🔍 ANALISI DEL PROBLEMA

### Problema 1: Coordinate Relative vs Assolute

**Causa identificata**:
Nel `handleMouseDown`, le coordinate venivano salvate come **relative al `hostRect`** al momento del click:
```typescript
const rect = host.getBoundingClientRect()
const startX = e.clientX - rect.left  // ❌ Coordinate relative
const startY = e.clientY - rect.top   // ❌ Coordinate relative
startPosRef.current = { x: startX, y: startY }
```

**Problema**: Durante `mousemove`, se l'utente scrolla o il viewport cambia, il `hostRect` viene ricalcolato, ma `startPosRef.current` contiene ancora coordinate relative al `rect` vecchio. Questo causa uno sfasamento.

**Esempio**:
- Click a `(100, 200)` relativi al host
- Scroll di 50px verso il basso
- `hostRect.top` cambia da `0` a `-50`
- Durante `mousemove`, il calcolo usa `startPosRef.current.x` (100) che è relativo al vecchio rect
- Risultato: il rettangolo è spostato di 50px

### Problema 2: Draft Iniziale Non Immediato

**Causa identificata**:
Il draft iniziale veniva creato solo se `currentPageRef.current` era già impostato:
```typescript
if (onDraftChange && currentPageRef.current) {  // ❌ Aspetta currentPageRef
  // Crea draft
}
```

**Problema**: `getPageNumberFromElement` può richiedere tempo (deve cercare nel DOM), causando un ritardo nell'apparizione del rettangolo.

### Problema 3: Overlay Root Non Trovato

**Causa identificata**:
`DraftOverlay` cerca l'overlay root in `overlayRootsRef.current.get(draft.page)`, ma:
- `useViewerOverlays` potrebbe non aver ancora trovato le pagine Word
- Le pagine Word hanno `data-page="1"` ma potrebbero non essere ancora nel DOM quando viene chiamato `useViewerOverlays`
- Il `MutationObserver` in `useViewerOverlays` potrebbe non rilevare le pagine in tempo

---

## ✅ SOLUZIONE IMPLEMENTATA

### Modifica 1: Coordinate Assolute

**File**: `src/components/viewers/common/hooks/useRectSelection.ts`

**Cambiamento**:
```typescript
// PRIMA (linea ~102-104):
const rect = host.getBoundingClientRect()
const startX = e.clientX - rect.left
const startY = e.clientY - rect.top
startPosRef.current = { x: startX, y: startY }

// DOPO (linea ~104-107):
startPosRef.current = {
  x: e.clientX,  // ✅ Coordinate assolute
  y: e.clientY   // ✅ Coordinate assolute
}
```

**Durante `mousemove`** (linea ~160-167):
```typescript
// ✅ Ricalcola hostRect ogni volta (per gestire scroll/resize)
const hostRect = host.getBoundingClientRect()

// ✅ Converti coordinate assolute in relative al host corrente
const startX = startPosRef.current.x - hostRect.left
const startY = startPosRef.current.y - hostRect.top
const endX = e.clientX - hostRect.left
const endY = e.clientY - hostRect.top
```

**Vantaggi**:
- Le coordinate sono sempre corrette anche durante scroll/resize
- Il rettangolo segue correttamente il mouse

### Modifica 2: Draft Iniziale Immediato

**File**: `src/components/viewers/common/hooks/useRectSelection.ts`

**Cambiamento** (linea ~118-133):
```typescript
// ✅ Crea draft iniziale zero-area IMMEDIATAMENTE (non aspetta currentPageRef)
if (onDraftChange) {
  const hostRect = host.getBoundingClientRect()
  const startX = e.clientX - hostRect.left
  const startY = e.clientY - hostRect.top
  const xPct = startX / hostRect.width
  const yPct = startY / hostRect.height

  onDraftChange({
    page: currentPageRef.current || 1, // ✅ Usa 1 come fallback
    x0Pct: xPct,
    y0Pct: yPct,
    x1Pct: xPct,
    y1Pct: yPct
  })
}
```

**Vantaggi**:
- Il rettangolo appare immediatamente al click
- Non aspetta che `getPageNumberFromElement` completi

### Modifica 3: Fallback Overlay Root

**File**: `src/components/viewers/word-viewer/components/DraftOverlay.tsx`

**Cambiamento** (linea ~23-57):
```typescript
// ✅ Prova prima con overlay root
let root = overlayRootsRef.current.get(draft.page)

// ✅ Fallback: se non c'è overlay root, usa direttamente l'elemento pagina
if (!root) {
  const pageEl = pageElsRef.current.get(draft.page)
  if (pageEl) {
    // ✅ Crea root temporaneo se non esiste
    root = document.createElement('div')
    root.className = 'viewer-overlay-root'
    // ... stili ...
    pageEl.appendChild(root)
    overlayRootsRef.current.set(draft.page, root)
  }
}
```

**Vantaggi**:
- Il rettangolo viene renderizzato anche se `useViewerOverlays` non ha ancora trovato le pagine
- Crea l'overlay root al volo se necessario

---

## 🐛 PROBLEMI RIMANENTI

### Problema A: Coordinate Percentuali vs Pixel

**Descrizione**:
Il rettangolo viene renderizzato usando coordinate **percentuali** (`x0Pct`, `y0Pct`, etc.), ma queste sono calcolate rispetto al **`host`** (container principale), non rispetto all'**elemento pagina**.

**Esempio**:
- `host` ha dimensioni `1000x2000px`
- Click a `(500, 1000)` → `xPct = 0.5`, `yPct = 0.5`
- Ma l'elemento pagina (`data-page="1"`) potrebbe essere più piccolo e posizionato diversamente
- Il rettangolo viene renderizzato al 50% dell'elemento pagina, non al punto corretto

**Possibile causa**:
In `DraftOverlay`, le coordinate percentuali sono applicate direttamente all'elemento pagina:
```typescript
const left = `${draft.x0Pct * 100}%`  // ❌ Percentuale rispetto alla pagina
const top = `${draft.y0Pct * 100}%`   // ❌ Ma x0Pct è calcolato rispetto al host
```

**Soluzione necessaria**:
Convertire le coordinate percentuali dal `host` alle coordinate percentuali della **pagina**:
```typescript
// Calcola posizione relativa alla pagina
const pageEl = pageElsRef.current.get(draft.page)
const pageRect = pageEl.getBoundingClientRect()
const hostRect = hostRef.current.getBoundingClientRect()

// Converti da percentuali host a pixel, poi a percentuali pagina
const xPx = draft.x0Pct * hostRect.width
const yPx = draft.y0Pct * hostRect.height
const xPctPage = (xPx - (pageRect.left - hostRect.left)) / pageRect.width
const yPctPage = (yPx - (pageRect.top - hostRect.top)) / pageRect.height
```

### Problema B: RequestAnimationFrame Delay

**Descrizione**:
Il `mousemove` usa `requestAnimationFrame` per throttling, causando un leggero ritardo nella visualizzazione:
```typescript
rafRef.current = requestAnimationFrame(() => {
  // Calcola e aggiorna draft
})
```

**Problema**:
- `requestAnimationFrame` viene eseguito al prossimo frame (tipicamente 16ms dopo)
- Durante un drag veloce, il rettangolo può "rimanere indietro" di 1-2 frame

**Possibile soluzione**:
- Usare `mousemove` diretto per aggiornamenti più frequenti
- Oppure ridurre il throttling usando un debounce più corto

### Problema C: Word Viewer Structure

**Descrizione**:
Il Word viewer ha una struttura DOM diversa dal PDF viewer:
- **PDF**: Ogni pagina è un elemento con `data-page-number` e ha un layer dedicato
- **Word**: Tutto il documento è in un singolo elemento `div` con `data-page="1"`

**Possibile causa**:
Le coordinate percentuali potrebbero non funzionare correttamente perché:
- Il `host` in `WordViewerShell` è il container esterno
- L'elemento pagina è dentro `WordViewerCore`, che ha il suo `hostRef` interno
- C'è una discrepanza tra dove vengono calcolate le coordinate (host esterno) e dove viene renderizzato il rettangolo (elemento pagina interno)

---

## 🔧 RACCOMANDAZIONI PER ESPERTO

### 1. Verificare Calcolo Coordinate

**Test da fare**:
```typescript
// In useRectSelection, durante mousemove, aggiungere log:
console.log('[DEBUG]', {
  mouseX: e.clientX,
  mouseY: e.clientY,
  hostRect: host.getBoundingClientRect(),
  startPos: startPosRef.current,
  calculatedX0Pct: x0Pct,
  calculatedY0Pct: y0Pct
})

// In DraftOverlay, aggiungere log:
console.log('[DEBUG DraftOverlay]', {
  draft,
  pageEl: pageElsRef.current.get(draft.page)?.getBoundingClientRect(),
  hostRect: hostRef.current?.getBoundingClientRect(),
  calculatedLeft: left,
  calculatedTop: top
})
```

### 2. Verificare Struttura DOM

**Test da fare**:
- Aprire DevTools durante il drag
- Verificare dove viene renderizzato il rettangolo (`createPortal` target)
- Verificare se l'elemento pagina ha `position: relative`
- Verificare se le coordinate percentuali sono calcolate correttamente

### 3. Confrontare con PDF Viewer

**File di riferimento**:
- `src/components/viewers/pdf-viewer/hooks/useNativeSelection.ts` (linea ~655-664)
- `src/components/viewers/pdf-viewer/components/AnnotationOverlays.tsx` (linea ~105-130)

**Nota**: Il PDF viewer funziona correttamente. Confrontare come vengono calcolate e renderizzate le coordinate nel PDF viewer vs Word viewer.

### 4. Possibile Soluzione Alternativa

**Opzione A**: Renderizzare il rettangolo direttamente nel `host` invece che nell'elemento pagina:
```typescript
// In WordViewerShell, invece di DraftOverlay:
{draft && (
  <div
    style={{
      position: 'absolute',
      left: `${draft.x0Pct * 100}%`,
      top: `${draft.y0Pct * 100}%`,
      width: `${(draft.x1Pct - draft.x0Pct) * 100}%`,
      height: `${(draft.y1Pct - draft.y0Pct) * 100}%`,
      background: 'rgba(59,130,246,0.3)',
      pointerEvents: 'none',
      zIndex: 1000
    }}
  />
)}
```

**Opzione B**: Calcolare coordinate relative all'elemento pagina invece che al host:
```typescript
// In useRectSelection, durante mousemove:
const pageEl = pageElsRef.current.get(currentPageRef.current)
if (pageEl) {
  const pageRect = pageEl.getBoundingClientRect()
  const startX = startPosRef.current.x - pageRect.left
  const startY = startPosRef.current.y - pageRect.top
  const endX = e.clientX - pageRect.left
  const endY = e.clientY - pageRect.top

  const x0Pct = startX / pageRect.width
  const y0Pct = startY / pageRect.height
  // ...
}
```

---

## 📊 STATO ATTUALE

### ✅ Funziona
- Il rettangolo viene creato immediatamente al click
- Le coordinate assolute vengono salvate correttamente
- Il fallback per overlay root funziona

### ❌ Non Funziona
- L'angolo in basso a destra non segue correttamente il mouse
- Le coordinate percentuali potrebbero essere calcolate rispetto al container sbagliato
- C'è un leggero ritardo dovuto a `requestAnimationFrame`

### ⚠️ Da Verificare
- Se le coordinate percentuali sono calcolate rispetto al `host` o all'elemento pagina
- Se la struttura DOM del Word viewer è compatibile con il sistema di coordinate attuale
- Se `requestAnimationFrame` causa il ritardo percepito

---

## 📝 FILE MODIFICATI

1. `src/components/viewers/common/hooks/useRectSelection.ts`
   - Coordinate assolute invece di relative
   - Draft iniziale immediato
   - Ricalcolo hostRect durante mousemove/mouseup

2. `src/components/viewers/word-viewer/components/DraftOverlay.tsx`
   - Fallback per creare overlay root se non esiste
   - Log di debug

3. `src/components/viewers/word-viewer/WordViewerShell.tsx`
   - Integrazione DraftOverlay

---

## 🎯 PROSSIMI PASSI SUGGERITI

1. **Aggiungere log dettagliati** per tracciare il flusso delle coordinate
2. **Verificare la struttura DOM** del Word viewer durante il drag
3. **Confrontare con PDF viewer** per capire le differenze
4. **Testare soluzione alternativa** (renderizzare direttamente nel host o calcolare coordinate relative alla pagina)

---

---

## 🔬 ANALISI TECNICA DETTAGLIATA

### Struttura DOM Word Viewer

```
WordViewerShell (hostRef)
  └─ div.flex-1.overflow-auto (hostRef - container principale)
      └─ WordViewerCore
          └─ div.word-viewer-container (hostRef interno di WordViewerCore)
              └─ div.word-viewer-content
                  └─ div[data-page="1"].word-page (elemento pagina)
                      └─ [HTML content]
```

**Problema**:
- `useRectSelection` calcola coordinate rispetto al `hostRef` di `WordViewerShell` (container esterno)
- `DraftOverlay` renderizza il rettangolo nell'elemento pagina (`div[data-page="1"]`)
- Se l'elemento pagina è più piccolo o posizionato diversamente rispetto al container, le coordinate percentuali sono errate

### Flusso Dati

1. **mousedown** → `useRectSelection.handleMouseDown`
   - Salva `e.clientX, e.clientY` (assoluti)
   - Calcola percentuali rispetto a `host.getBoundingClientRect()`
   - Chiama `onDraftChange({ page, x0Pct, y0Pct, x1Pct, y1Pct })`

2. **mousemove** → `useRectSelection.handleMouseMove`
   - Ricalcola `host.getBoundingClientRect()` (per scroll/resize)
   - Converte coordinate assolute in relative al host corrente
   - Calcola nuove percentuali
   - Chiama `onDraftChange` con nuove coordinate

3. **React render** → `WordViewerShell`
   - `draft` state cambia
   - Renderizza `<DraftOverlay draft={draft} />`

4. **DraftOverlay render**
   - Trova overlay root per `draft.page`
   - Applica coordinate percentuali direttamente:
     ```typescript
     left: `${draft.x0Pct * 100}%`  // Percentuale rispetto all'elemento pagina
     top: `${draft.y0Pct * 100}%`   // Ma x0Pct è calcolato rispetto al host!
     ```

### Problema Root Cause

**Le coordinate percentuali sono calcolate rispetto al HOST ma applicate all'ELEMENTO PAGINA**.

Se:
- Host: `1000x2000px`, click a `(500, 1000)` → `x0Pct = 0.5, y0Pct = 0.5`
- Elemento pagina: `800x1500px`, posizionato a `(100, 200)` rispetto al host
- Il rettangolo viene renderizzato al 50% dell'elemento pagina = `(400, 750)` pixel
- Ma dovrebbe essere a `(500-100, 1000-200) = (400, 800)` pixel relativi alla pagina
- Errore: `(400, 750)` vs `(400, 800)` = **50px di differenza in Y**

---

## 💡 SOLUZIONE PROPOSTA

### Opzione 1: Calcolare Coordinate Rispetto alla Pagina

Modificare `useRectSelection` per calcolare coordinate relative all'elemento pagina:

```typescript
// In handleMouseMove, invece di:
const hostRect = host.getBoundingClientRect()
const startX = startPosRef.current.x - hostRect.left
// ...

// Fare:
const pageEl = pageElsRef.current.get(currentPageRef.current)
if (pageEl) {
  const pageRect = pageEl.getBoundingClientRect()
  const startX = startPosRef.current.x - pageRect.left
  const startY = startPosRef.current.y - pageRect.top
  const endX = e.clientX - pageRect.left
  const endY = e.clientY - pageRect.top

  const x0Pct = Math.max(0, Math.min(1, Math.min(startX, endX) / pageRect.width))
  const y0Pct = Math.max(0, Math.min(1, Math.min(startY, endY) / pageRect.height))
  // ...
}
```

**Pro**: Coordinate sempre corrette
**Contro**: Richiede accesso a `pageElsRef` in `useRectSelection`

### Opzione 2: Convertire in DraftOverlay

Convertire le coordinate percentuali dal host alla pagina in `DraftOverlay`:

```typescript
// In DraftOverlay:
const pageEl = pageElsRef.current.get(draft.page)
const hostEl = /* ottenere hostRef */ // ⚠️ Problema: non abbiamo accesso a hostRef

if (pageEl && hostEl) {
  const pageRect = pageEl.getBoundingClientRect()
  const hostRect = hostEl.getBoundingClientRect()

  // Converti da percentuali host a pixel
  const x0Px = draft.x0Pct * hostRect.width
  const y0Px = draft.y0Pct * hostRect.height

  // Converti a percentuali pagina
  const x0PctPage = (x0Px - (pageRect.left - hostRect.left)) / pageRect.width
  const y0PctPage = (y0Px - (pageRect.top - hostRect.top)) / pageRect.height

  // Usa x0PctPage, y0PctPage per il rendering
}
```

**Pro**: Non richiede modifiche a `useRectSelection`
**Contro**: `DraftOverlay` non ha accesso a `hostRef`

### Opzione 3: Renderizzare nel Host

Renderizzare il rettangolo direttamente nel `host` invece che nell'elemento pagina:

```typescript
// In WordViewerShell, invece di DraftOverlay:
{draft && (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 1000
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: `${draft.x0Pct * 100}%`,
        top: `${draft.y0Pct * 100}%`,
        width: `${(draft.x1Pct - draft.x0Pct) * 100}%`,
        height: `${(draft.y1Pct - draft.y0Pct) * 100}%`,
        background: 'rgba(59,130,246,0.3)',
        pointerEvents: 'none'
      }}
    />
  </div>
)}
```

**Pro**: Coordinate sempre corrette (percentuali rispetto al host)
**Contro**: Il rettangolo potrebbe essere sopra altri elementi (toolbar, etc.)

---

**Data report**: 2025-01-XX
**Versione codice**: Dopo refactoring unificazione selezione
**Status**: ⚠️ Parzialmente risolto - problemi rimanenti con coordinate
**Priorità**: 🔴 ALTA - L'angolo non segue il mouse è un bug critico UX
Ma