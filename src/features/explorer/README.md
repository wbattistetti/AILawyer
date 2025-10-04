# Explorer Panel

Un pannello Explorer enterprise-ready per React/TypeScript con layout a tre colonne: Directory Tree | File Grid | Preview Pane.

## Caratteristiche

- **Layout a tre colonne** ridimensionabile (Tree | Grid | Preview)
- **Albero directory** con drive (HDD/SSD, USB, CD/DVD) e caricamento lazy
- **Griglia virtualizzata** con lista appiattita di tutti i file ricorsivi
- **Preview pane** con viewer modulari (PDF, Word, Immagini, Audio/Video)
- **Filtri avanzati** per tipo file (PDF, Word, Foto, Video, Audio)
- **Scansione ricorsiva** con progress bar, pause/stop/resume
- **Azioni contestuali** (Localizza, Apri con app, Apri cartella, Copia percorso)
- **Selezione multipla** con contatore e upload batch
- **Riconoscimento MIME** con signature detection + fallback estensioni
- **Supporto drive rimovibili** con watching automatico

## Installazione

```bash
npm install react-window lucide-react
```

## Utilizzo Base

```tsx
import { Explorer, useExplorer } from '@/features/explorer';

function MyApp() {
  const { ExplorerProps } = useExplorer();
  
  return (
    <div className="h-screen">
      <Explorer {...ExplorerProps} />
    </div>
  );
}
```

## Utilizzo Avanzato

```tsx
import { 
  Explorer, 
  NodeFileSystemAdapter, 
  MockFileSystemAdapter 
} from '@/features/explorer';

function MyApp() {
  // Adapter per Node.js/Electron
  const nodeAdapter = new NodeFileSystemAdapter();
  
  // Adapter mock per browser/development
  const mockAdapter = new MockFileSystemAdapter();
  
  return (
    <div className="h-screen">
      <Explorer adapter={nodeAdapter} />
    </div>
  );
}
```

## Componenti Principali

### Explorer
Componente principale che assembla tutto il pannello.

**Props:**
- `adapter: FileSystemAdapter` - Adapter per l'accesso al filesystem
- `className?: string` - Classi CSS aggiuntive

### FileSystemAdapter
Interfaccia astratta per l'accesso al filesystem.

**Metodi:**
- `listDrives(): Promise<DriveInfo[]>` - Lista dei drive disponibili
- `listDir(path: string): Promise<{files: FileInfo[]}>` - Lista contenuto directory
- `exists(path: string): Promise<boolean>` - Verifica esistenza file/directory
- `openInSystem(path: string): Promise<void>` - Apre file con app di sistema
- `revealInFolder(path: string): Promise<void>` - Mostra file nel file manager
- `readChunk?(path: string, start: number, len: number): Promise<ArrayBuffer>` - Lettura chunk per MIME detection

## Adapter Disponibili

### NodeFileSystemAdapter
Per ambienti Node.js/Electron con accesso completo al filesystem.

### MockFileSystemAdapter
Per ambienti browser/development con dati mock.

## Hooks

### useExplorer()
Hook di convenienza che fornisce l'adapter corretto per l'ambiente.

### useDriveList(adapter)
Gestisce la lista dei drive e il watching automatico.

### useScanFiles(adapter)
Orchestra la scansione ricorsiva con supporto per abort/pause.

### useExplorerState()
Gestisce lo stato globale del pannello (selezioni, filtri, progress).

## Viewer Modulari

Il pannello di preview supporta diversi tipi di file:

- **PDF**: Riutilizza il `PdfViewer` esistente
- **Immagini**: Viewer con zoom, rotazione, download
- **Audio/Video**: Player HTML5 con controlli completi
- **Word**: Placeholder con opzioni per aprire con app di sistema
- **Unknown**: Fallback generico per tipi non supportati

## Personalizzazione

### Stili
Tutti i componenti utilizzano Tailwind CSS e possono essere personalizzati tramite le props `className`.

### Viewer Custom
Puoi creare viewer personalizzati implementando l'interfaccia:

```tsx
interface CustomViewerProps {
  file: FileEntry;
  className?: string;
}

export function CustomViewer({ file, className }: CustomViewerProps) {
  return (
    <div className={className}>
      {/* Your custom viewer implementation */}
    </div>
  );
}
```

### Filtri Personalizzati
Estendi `GridFilters` per aggiungere nuovi tipi di filtro:

```tsx
interface CustomFilters extends GridFilters {
  customFilter: string;
}
```

## Performance

- **Virtualizzazione**: La griglia utilizza `react-window` per gestire migliaia di file
- **Scansione streaming**: I file vengono processati in batch incrementali
- **Lazy loading**: Le directory vengono caricate solo quando necessario
- **Memoizzazione**: Gli hook utilizzano `useMemo` per ottimizzare le derivazioni

## Accessibilità

- **Keyboard navigation**: Supporto completo per navigazione da tastiera
- **ARIA roles**: Tutti i componenti hanno ruoli ARIA appropriati
- **Focus management**: Gestione corretta del focus tra i pannelli
- **Screen reader**: Compatibile con screen reader

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Dipendenze

- React 18+
- TypeScript 4.5+
- Tailwind CSS 3.0+
- Lucide React (icone)
- react-window (virtualizzazione)

## Esempi

Vedi la cartella `__tests__/` per esempi di utilizzo e test.

