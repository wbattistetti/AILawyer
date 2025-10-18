# Sistema di Gestione Bozze

## 📋 Panoramica

Il sistema implementa una gestione intelligente delle pratiche con distinzione tra **bozze** (draft) e **pratiche salvate definitivamente** (committed).

## 🎯 Obiettivi risolti

- ✅ **Salvataggio automatico**: I documenti sono salvati nel DB immediatamente (non si perde nulla)
- ✅ **Recupero bozze**: Puoi chiudere e riaprire le bozze senza perdere dati
- ✅ **No duplicati**: Il sistema rileva bozze esistenti con lo stesso nome
- ✅ **Pulizia automatica**: Le bozze vecchie (>7 giorni) vengono eliminate automaticamente
- ✅ **Delete reale**: Eliminare un documento lo rimuove dal DB e dal filesystem

---

## 🔧 Come funziona

### Stati della Pratica

Ogni pratica ha un campo `status`:
- **`draft`** (default): Bozza, può essere eliminata automaticamente dopo 7 giorni
- **`committed`**: Salvata definitivamente, non viene mai auto-eliminata

### Flusso utente

1. **Crea nuova pratica** → `status: 'draft'` automaticamente
2. **Carica documenti** → Salvati nel DB immediatamente (collegati alla bozza)
3. **Chiudi pagina** → Bozza resta nel DB (recuperabile)
4. **Riapri pratica** → Tutti i documenti sono ancora lì
5. **Clicca "Salva definitivamente"** → `status: 'committed'` (pratica permanente)

### Rilevamento bozze duplicate

Quando crei una nuova pratica:
1. Backend controlla se esiste già una bozza con lo stesso nome
2. Se esiste, frontend mostra dialog:
   - **Recupera bozza**: Apre la bozza esistente con i documenti
   - **Elimina e ricrea**: Elimina la vecchia e crea una nuova
   - **Rinomina**: Permette di cambiare nome alla nuova
   - **Annulla**: Torna indietro

---

## 🛠️ API Endpoints

### Backend (Pratiche)

#### `GET /pratiche/check-draft?nome=<nome>`
Verifica se esiste una bozza con quel nome.

**Response:**
```json
{
  "exists": true,
  "draft": {
    "id": "abc123",
    "nome": "Mario Rossi",
    "cliente": "Studio XYZ",
    "createdAt": "2024-10-15T10:30:00Z",
    "documentCount": 5
  }
}
```

#### `POST /pratiche/:id/commit`
Salva definitivamente una pratica (cambia status da `draft` a `committed`).

**Response:**
```json
{
  "ok": true,
  "pratica": { /* pratica aggiornata */ }
}
```

### Backend (Documenti)

#### `DELETE /documenti/:id`
Elimina un documento dal DB e dal filesystem.

**Response:**
```json
{
  "ok": true
}
```

---

## 🧹 Pulizia automatica bozze

### Script manuale

```bash
# Dry run (mostra cosa verrebbe eliminato senza eliminare)
npm run cleanup:drafts:dry

# Esecuzione reale (elimina bozze > 7 giorni)
npm run cleanup:drafts

# Custom threshold (10 giorni)
npx tsx src/scripts/cleanup-drafts.ts --days=10
```

### Output esempio

```
🧹 [CLEANUP] Avvio pulizia bozze vecchie...

📅 Soglia: 7 giorni
🔍 Modalità: ESECUZIONE REALE
────────────────────────────────────────────────────────────

🔎 Cerco bozze create prima del 10/10/2024...

📋 Trovate 2 bozze da eliminare

📁 Pratica: "Test Vecchio"
   ID: abc123
   Cliente: Studio Test
   Creata: 05/10/2024 14:30:00
   Documenti: 3
   🗑️  File eliminato: doc1.pdf
   🗑️  File eliminato: doc2.pdf
   🗑️  File eliminato: doc3.pdf
   ✅ Pratica eliminata

============================================================
📊 RIEPILOGO CLEANUP
============================================================
Pratiche eliminate:     2
Documenti eliminati:    5
File eliminati:         5
Errori:                 0
============================================================

✅ Cleanup completato!
```

### Schedulazione (opzionale)

Per eseguire automaticamente ogni giorno, puoi usare:
- **Windows**: Task Scheduler
- **Linux/Mac**: Cron job

Esempio cron (ogni giorno alle 3:00 AM):
```cron
0 3 * * * cd /path/to/backend && npm run cleanup:drafts
```

---

## 🐛 Bug Fix: Label "Da trascrivere"

### Problema originale
- PDF con `hasNativeText: false` (scansioni) non mostravano la label "Da trascrivere"
- PDF con `ocrStatus: 'completed'` non mostravano "Trascritto ✓"

### Soluzione implementata

1. **Aggiunto campo `hasNativeText` al tipo TypeScript**
   - File: `src/types/index.ts`
   - Aggiunto: `hasNativeText?: boolean`

2. **Fix logica label in ThumbCard**
   - File: `src/components/viewers/ThumbCard.tsx`
   - Label "Trascritto ✓" ora mostrata anche se `ocrStatus === 'completed'`

3. **Passaggio corretto del campo dal backend**
   - File: `src/components/pages/PraticaCanvasPage.tsx`
   - Rimosso cast `as any` e passato `hasNativeText` correttamente

### Risultato
- ✅ **Catania.pdf** (`hasNativeText: true`) → Nessuna label ✓
- ✅ **Arresto Di Nardo.pdf** (`hasNativeText: false`, `ocrStatus: 'completed'`) → "Trascritto ✓" ✓

---

## 📊 Schema Database

### Modifiche applicate

```prisma
model Pratica {
  // ... campi esistenti
  status      String   @default("draft") // ← NUOVO: "draft" | "committed"
  // ...
}

model Documento {
  // ... campi esistenti  
  hasNativeText Boolean @default(false) // ← GIÀ ESISTENTE: true se PDF nativo
  // ...
}
```

---

## 🎨 UI da implementare (futuro)

### Pagina iniziale con lista bozze

```
┌─────────────────────────────────────────────┐
│  📁 Pratiche (3)              [+ Nuova]     │
│  ─────────────────────────────────────      │
│  ✅ Caso Verdi          15/10/2024          │
│  ✅ Infortunio ACME     12/10/2024          │
│                                              │
│  📝 Bozze da completare (2) 🟡             │
│  ─────────────────────────────────────      │
│  📝 Mario Rossi (5 doc) 14/10/2024 [Azioni▾]│
│     → Recupera                               │
│     → Elimina                                │
│     → Salva definitivamente                  │
└──────────────────────────────────────────────┘
```

### Badge bozza nella pratica

Quando `pratica.status === 'draft'`:
- Mostrare badge 🟡 **BOZZA** in alto
- Pulsante **"✅ Salva definitivamente"** che chiama `api.commitPratica(id)`

---

## 📝 Note tecniche

### Delete documento
- **Ottimistico**: Rimuove dall'UI immediatamente
- **Rollback**: Se API fallisce, ricarica dati dal server
- **Storage**: Elimina file da filesystem + record DB

### Check-draft
- Eseguito mentre l'utente scrive il nome della pratica (debounced)
- Mostra warning se esiste bozza con stesso nome

### Commit pratica
- Può essere chiamato più volte (idempotente)
- Se già `committed`, ritorna success senza errori

---

## ✅ Checklist implementazione completa

- [x] Campo `status` nel modello Pratica
- [x] Campo `hasNativeText` nel tipo Documento frontend
- [x] Endpoint `GET /pratiche/check-draft`
- [x] Endpoint `POST /pratiche/:id/commit`
- [x] Endpoint `DELETE /documenti/:id` (già esistente)
- [x] Fix label ThumbCard per `ocrStatus: 'completed'`
- [x] handleRemoveThumb chiama API delete
- [x] Script cleanup-drafts.ts
- [ ] UI: Lista bozze in pagina iniziale
- [ ] UI: Badge "BOZZA" + pulsante "Salva definitivamente"
- [ ] UI: Dialog recupero bozza esistente
- [ ] Schedulazione automatica cleanup (opzionale)

---

## 🚀 Test rapido

1. **Test bozza:**
   ```bash
   # Backend
   npm run dev
   
   # Crea pratica, carica documenti, chiudi senza salvare
   # Riapri → documenti ancora presenti ✓
   ```

2. **Test delete:**
   ```bash
   # Elimina documento → verifica su filesystem che file è sparito
   ```

3. **Test cleanup:**
   ```bash
   npm run cleanup:drafts:dry
   # Verifica che vede le bozze vecchie
   ```

4. **Test label:**
   ```bash
   # Verifica che PDF nativi non mostrino "Da trascrivere"
   # Verifica che scansioni con OCR mostrino "Trascritto ✓"
   ```

---

Made with ❤️ by Agent

