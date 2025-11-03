# PROBLEMA SCROLLBAR PDF VIEWER - ANALISI COMPLETA

## DESCRIZIONE DEL PROBLEMA

L'applicazione utilizza FlexLayout-React per creare un sistema di tab dockable. Quando un documento PDF viene aperto, viene visualizzato all'interno di un tab FlexLayout. Il problema è che si verifica una situazione di scroll errata:

1. **SCROLLBAR GIALLA (SBAGLIATA, DA ELIMINARE)**: Una scrollbar verticale appare sul lato destro del tab del documento e fa scrollare TUTTO il contenuto, inclusi elementi che dovrebbero rimanere fissi come:
   - La toolbar superiore del PDF (TopBar)
   - La toolbar avanzata del PDF (PdfToolbarAdvanced)
   - L'header del pannello di ricerca a destra
   - La sidebar sinistra (che è fuori dal tab, ma il problema si manifesta comunque)

2. **SCROLLBAR ARANCIONE (MANCANTE, DA CREARE)**: L'area del PDF viewer (PDF_HOST) dovrebbe avere una sua scrollbar verticale indipendente che permetta di scorrere solo le pagine del documento, mentre le toolbar rimangono fisse.

3. **SCROLLBAR VERDE (MANCANTE, DA CREARE)**: Il pannello di ricerca a destra dovrebbe avere una scrollbar verticale per la lista dei risultati, mentre l'header del pannello rimane fisso.

## STRUTTURA DOM (APPROSSIMATIVA)

```
flexlayout__tab (clientHeight: 681px, scrollHeight: 47239px → PROBLEMA!)
  └─ flexlayout__tab_content
      └─ [WRAPPER DIV - PdfViewerManager wrapper] (si espande a 47239px invece di 681px)
          └─ MAIN_CONTAINER (className: "flex flex-1 w-full min-h-0 overflow-hidden") (si espande a 47202px)
              ├─ LEFT_CONTAINER (className: "flex flex-col flex-1 min-w-0 overflow-hidden") (si espande a 47202px)
              │   ├─ TopBar (flex-shrink-0, dovrebbe essere fissa)
              │   ├─ PdfToolbarAdvanced (flex-shrink-0, dovrebbe essere fissa)
              │   └─ PDF_HOST (ref={hostRef}, className: "flex-1 overflow-auto relative min-h-0")
              │       (scrollHeight: 47113px, clientHeight: 47113px → scrollHeight === clientHeight → NO SCROLLBAR!)
              │       Dovrebbe avere scrollHeight > clientHeight per mostrare scrollbar arancione
              └─ SearchPanel
                  ├─ SearchPanel Header (flex-shrink-0, dovrebbe essere fisso)
                  └─ SearchPanel Results (dovrebbe avere scrollbar verde)
```

## ANALISI DEL PROBLEMA

Dai log della console risulta che:

1. **flexlayout__tab ha overflow: auto invece di hidden**: Nonostante le regole CSS con `!important`, FlexLayout sembra applicare `overflow: auto` inline o con maggiore specificità. Il tab ha `clientHeight: 681px` (corretto, corrisponde all'altezza disponibile) ma `scrollHeight: 47239px` (troppo grande, indica che il contenuto interno si è espanso).

2. **I container interni si espandono invece di essere vincolati**:
   - `MAIN_CONTAINER`: `height: 47202.5px`, `scrollHeight: 47202px`, `clientHeight: 47202px` → `scrollHeight === clientHeight` → non può scrollare, si è espanso per contenere tutto
   - `LEFT_CONTAINER`: `height: 47202.5px`, stesso problema
   - `PDF_HOST`: `height: 47113.1px`, `scrollHeight: 47113px`, `clientHeight: 47113px` → stesso problema

3. **Il problema fondamentale**: In un layout Flexbox, quando un elemento ha `flex: 1` e il suo contenuto è più grande dell'altezza disponibile, l'elemento si espande per contenere tutto il contenuto a meno che:
   - Il genitore abbia un'altezza limitata E
   - L'elemento abbia `min-height: 0` (che c'è, vedi `min-h-0`) E
   - Il genitore abbia `overflow: hidden` (manca o non viene applicato correttamente)

## TENTATIVI DI SOLUZIONE IMPLEMENTATI

### 1. CSS in DockWorkspaceV2.css

Ho aggiunto regole CSS per forzare `overflow: hidden` sul `flexlayout__tab`:

```css
/* ✅ Fix CHIRURGICO: flexlayout__tab non deve scrollare (scrollbar gialla sbagliata) */
/* ✅ IMPORTANTE: Solo per document tabs, NON per drawer tabs */
/* ✅ Usa selettore più specifico per escludere drawerContentTabset e aumenta specificità */
.dockv2-root .flexlayout__tabset:not([id="drawerContentTabset"]) > .flexlayout__tabset_content > .flexlayout__tab {
  overflow: hidden !important; /* ✅ Blocca scrollbar gialla sbagliata */
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  height: 100% !important;
  max-height: 100% !important;
  position: relative !important;
}

/* ✅ Fallback: se il selettore sopra non funziona, prova questo più generico ma sempre escludendo drawer */
.dockv2-root .flexlayout__tabset:not([id="drawerContentTabset"]) .flexlayout__tab {
  overflow: hidden !important; /* ✅ Blocca scrollbar gialla sbagliata */
  overflow-x: hidden !important;
  overflow-y: hidden !important;
}
```

**Problema**: Il CSS non viene applicato o viene sovrascritto. I log mostrano che `computedOverflow` è ancora "auto" anche dopo l'applicazione del CSS.

### 2. JavaScript Fallback in PdfViewerShell.tsx

Ho aggiunto un `useEffect` che:

a) Forza `overflow: hidden` via JavaScript se il CSS non funziona:
```javascript
if (!isDrawerTab && tabStyle.overflow === 'auto') {
  tabElement.style.overflow = 'hidden'
  tabElement.style.overflowX = 'hidden'
  tabElement.style.overflowY = 'hidden'
}
```

b) Limita l'altezza dei container interni al `clientHeight` del `flexlayout__tab`:
```javascript
const tabClientHeight = tabElement.clientHeight // 681px
if (tabClientHeight > 0 && tabClientHeight < 2000) {
  const tabContent = tabElement.querySelector('.flexlayout__tab_content')
  if (tabContent) {
    const firstChild = tabContent.firstElementChild // Wrapper PdfViewerManager
    if (firstChild && firstChild.clientHeight > tabClientHeight * 1.1) {
      firstChild.style.height = `${tabClientHeight}px`
      firstChild.style.maxHeight = `${tabClientHeight}px`
      firstChild.style.overflow = 'hidden'
    }

    const mainContainer = firstChild.querySelector('[class*="flex flex-1 w-full"]')
    if (mainContainer && mainContainer.clientHeight > tabClientHeight * 1.1) {
      mainContainer.style.height = `${tabClientHeight}px`
      mainContainer.style.maxHeight = `${tabClientHeight}px`
    }
  }
}
```

**Problema**: Anche dopo aver forzato `overflow: hidden` sul tab e limitato l'altezza dei wrapper, i log mostrano che:
- Il `flexlayout__tab` ora ha `overflow: hidden` (corretto, il fix JS funziona)
- Ma `scrollHeight` è ancora `47239px` mentre `clientHeight` è `681px` → il tab può ancora scrollare (anche se la scrollbar non è visibile)
- I container interni continuano ad avere `scrollHeight === clientHeight` → non mostrano scrollbar

### 3. Struttura JSX di PdfViewerShell.tsx

Il componente restituisce questa struttura (rilevante per il problema):

```jsx
return (
  <React.Fragment>
    <div className="flex flex-1 w-full min-h-0 overflow-hidden"> {/* MAIN_CONTAINER */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden"> {/* LEFT_CONTAINER */}
        <TopBar flex-shrink-0 ... />
        <PdfToolbarAdvanced flex-shrink-0 ... />
        <div
          ref={hostRef}
          className="flex-1 overflow-auto relative min-h-0" {/* PDF_HOST */}
          style={{ ['--scale-factor' as any]: String(shell.scaleRef?.current || 1) }}
        >
          <PdfViewerCore ... />
        </div>
      </div>
      <SearchPanel ... />
    </div>
  </React.Fragment>
)
```

**Note**:
- `MAIN_CONTAINER` ha `overflow-hidden` → corretto, non dovrebbe scrollare
- `LEFT_CONTAINER` ha `overflow-hidden` → corretto, non dovrebbe scrollare
- `PDF_HOST` ha `overflow-auto` → corretto, DOVREBBE avere scrollbar, ma non appare perché si espande

## CODICE COMPLETO IMPLEMENTATO

### File: src/components/DockWorkspaceV2.css

```css
/* ✅ Fix CHIRURGICO: flexlayout__tab non deve scrollare (scrollbar gialla sbagliata) */
/* ✅ IMPORTANTE: Solo per document tabs, NON per drawer tabs */
/* ✅ Usa selettore più specifico per escludere drawerContentTabset e aumenta specificità */
.dockv2-root .flexlayout__tabset:not([id="drawerContentTabset"]) > .flexlayout__tabset_content > .flexlayout__tab {
  overflow: hidden !important; /* ✅ Blocca scrollbar gialla sbagliata */
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  height: 100% !important;
  max-height: 100% !important;
  position: relative !important;
}

/* ✅ Fallback: se il selettore sopra non funziona, prova questo più generico ma sempre escludendo drawer */
.dockv2-root .flexlayout__tabset:not([id="drawerContentTabset"]) .flexlayout__tab {
  overflow: hidden !important; /* ✅ Blocca scrollbar gialla sbagliata */
  overflow-x: hidden !important;
  overflow-y: hidden !important;
}
```

### File: src/components/viewers/pdf-viewer/PdfViewerShell.tsx

Il componente contiene un `useEffect` completo che analizza e tenta di correggere il problema. Ecco il codice rilevante integrato:

```typescript
useEffect(() => {
  const analyzeElement = (el: HTMLElement, name: string, depth: number = 0) => {
    const style = window.getComputedStyle(el)
    const canScroll = el.scrollHeight > el.clientHeight
    const hasOverflow = style.overflow !== 'visible' && style.overflow !== 'clip'
    const hasOverflowY = style.overflowY !== 'visible' && style.overflowY !== 'clip'
    const info = {
      name, depth, tagName: el.tagName, className: el.className.substring(0, 100),
      id: el.id || '(no id)', scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      scrollTop: el.scrollTop, scrollDifference: el.scrollHeight - el.clientHeight,
      offsetHeight: el.offsetHeight, overflow: style.overflow, overflowY: style.overflowY,
      overflowX: style.overflowX, height: style.height, maxHeight: style.maxHeight,
      minHeight: style.minHeight, position: style.position, display: style.display,
      flex: style.flex, flexDirection: style.flexDirection, canScroll, hasOverflow,
      hasOverflowY, hasScrollbar: canScroll && hasOverflowY
    }
    console.log(`[SCROLLBAR_DEBUG] ${'  '.repeat(depth)}${name}:`, JSON.stringify(info, null, 2))
    return info
  }

  const analyzeScrollbars = () => {
    let root = hostRef.current?.parentElement?.parentElement?.parentElement as HTMLElement | null
    if (!root) {
      root = document.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
    }
    if (!root) {
      console.warn('[SCROLLBAR_DEBUG] Root container not found')
      return
    }
    console.log('[SCROLLBAR_DEBUG] ========== SCROLLBAR ANALYSIS START ==========')
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    let tabElement: HTMLElement | null = null
    let current: HTMLElement | null = root
    let level = 0
    while (current && level < 10) {
      if (current.classList.contains('flexlayout__tab')) {
        tabElement = current
        break
      }
      current = current.parentElement
      level++
    }
    if (tabElement) {
      const tabStyle = window.getComputedStyle(tabElement)
      const tabInfo = {
        element: 'FLEXLAYOUT__TAB',
        className: tabElement.className,
        id: tabElement.id || '(no id)',
        parentId: tabElement.parentElement?.id || '(no parent id)',
        parentTabsetId: tabElement.closest('.flexlayout__tabset')?.id || '(no tabset id)',
        computedOverflow: tabStyle.overflow,
        computedOverflowY: tabStyle.overflowY,
        scrollHeight: tabElement.scrollHeight,
        clientHeight: tabElement.clientHeight,
        canScroll: tabElement.scrollHeight > tabElement.clientHeight,
        appliedCSS: tabElement.style.cssText || '(no inline styles)'
      }
      console.log('[SCROLLBAR_DEBUG] FLEXLAYOUT__TAB (trovato nella gerarchia):', JSON.stringify(tabInfo, null, 2))
      const parentTabset = tabElement.closest('.flexlayout__tabset') as HTMLElement | null
      const isDrawerTab = parentTabset?.id === 'drawerContentTabset'
      if (!isDrawerTab) {
        if (tabStyle.overflow === 'auto') {
          console.warn('[SCROLLBAR_DEBUG] ⚠️ CSS non applicato, forzo overflow:hidden via JavaScript')
          tabElement.style.overflow = 'hidden'
          tabElement.style.overflowX = 'hidden'
          tabElement.style.overflowY = 'hidden'
        }
        const tabClientHeight = tabElement.clientHeight
        if (tabClientHeight > 0 && tabClientHeight < 2000) {
          const tabContent = tabElement.querySelector('.flexlayout__tab_content') as HTMLElement | null
          if (tabContent) {
            const firstChild = tabContent.firstElementChild as HTMLElement | null
            if (firstChild) {
              const firstChildHeight = parseInt(window.getComputedStyle(firstChild).height) || 0
              if (firstChildHeight > tabClientHeight * 1.1) {
                console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza wrapper a:', tabClientHeight, '(era:', firstChildHeight, ')')
                firstChild.style.height = `${tabClientHeight}px`
                firstChild.style.maxHeight = `${tabClientHeight}px`
                firstChild.style.overflow = 'hidden'
              }
              const mainContainer = firstChild.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
              if (mainContainer) {
                const mainHeight = parseInt(window.getComputedStyle(mainContainer).height) || 0
                if (mainHeight > tabClientHeight * 1.1) {
                  console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza MAIN_CONTAINER a:', tabClientHeight, '(era:', mainHeight, ')')
                  mainContainer.style.height = `${tabClientHeight}px`
                  mainContainer.style.maxHeight = `${tabClientHeight}px`
                }
              }
            }
          }
        }
      }
      const finalStyle = window.getComputedStyle(tabElement)
      if (tabElement.scrollHeight > tabElement.clientHeight) {
        console.error('[SCROLLBAR_DEBUG] ❌ FLEXLAYOUT__TAB può ancora scrollare!', {
          scrollHeight: tabElement.scrollHeight,
          clientHeight: tabElement.clientHeight,
          overflow: finalStyle.overflow
        })
      } else {
        console.log('[SCROLLBAR_DEBUG] ✅ FLEXLAYOUT__TAB non può scrollare (corretto)')
      }
    } else {
      console.warn('[SCROLLBAR_DEBUG] flexlayout__tab non trovato nella gerarchia')
    }
    const mainContainer = root
    const mainInfo = analyzeElement(mainContainer, 'MAIN_CONTAINER', 0)
    if (mainInfo.canScroll) {
      console.error('[SCROLLBAR_DEBUG] ❌ MAIN_CONTAINER può scrollare!')
    }
    const leftContainer = mainContainer.querySelector('[class*="flex flex-col flex-1 min-w-0 overflow-hidden"]') as HTMLElement | null
    if (leftContainer) {
      analyzeElement(leftContainer, 'LEFT_CONTAINER', 1)
    }
    const pdfHost = hostRef.current
    if (pdfHost) {
      const hostInfo = analyzeElement(pdfHost, 'PDF_HOST (hostRef, dovrebbe avere scrollbar arancione)', 2)
      if (!hostInfo.canScroll && pdfHost.scrollHeight > pdfHost.clientHeight) {
        console.error('[SCROLLBAR_DEBUG] ❌ PDF_HOST NON può scrollare ma ha contenuto maggiore! Dovrebbe avere scrollbar!')
      } else if (hostInfo.canScroll) {
        console.log('[SCROLLBAR_DEBUG] ✅ PDF_HOST può scrollare (scrollbar arancione OK)')
      }
    }
    let parent = root.parentElement
    let parentLevel = 0
    const parents = []
    while (parent && parentLevel < 6) {
      const style = window.getComputedStyle(parent)
      parents.push({
        level: parentLevel, tagName: parent.tagName,
        className: parent.className.substring(0, 100), id: parent.id || '(no id)',
        height: style.height, maxHeight: style.maxHeight, clientHeight: parent.clientHeight,
        scrollHeight: parent.scrollHeight, overflow: style.overflow, overflowY: style.overflowY,
        display: style.display, flex: style.flex,
        canScroll: parent.scrollHeight > parent.clientHeight
      })
      parent = parent.parentElement
      parentLevel++
    }
    console.log('[SCROLLBAR_DEBUG] VIEWPORT:', { viewportHeight, viewportWidth, availableHeight: viewportHeight - 100 })
    console.log('[SCROLLBAR_DEBUG] PARENT CHAIN (dal MAIN_CONTAINER verso l\'alto):')
    parents.forEach((p, idx) => {
      console.log(`[SCROLLBAR_DEBUG]   Parent[${idx}]:`, JSON.stringify(p, null, 2))
      if (p.canScroll) {
        console.error(`[SCROLLBAR_DEBUG]   ❌ Parent[${idx}] può scrollare! Tag: ${p.tagName}, Class: ${p.className.substring(0, 50)}`)
      }
    })
    console.log('[SCROLLBAR_DEBUG] ========== SCROLLBAR ANALYSIS END ==========')
  }

  const applyScrollbarFix = () => {
    const root = hostRef.current?.parentElement?.parentElement?.parentElement as HTMLElement | null
    if (!root) return
    let tabElement: HTMLElement | null = null
    let current: HTMLElement | null = root
    let level = 0
    while (current && level < 10) {
      if (current.classList.contains('flexlayout__tab')) {
        tabElement = current
        break
      }
      current = current.parentElement
      level++
    }
    if (tabElement) {
      const parentTabset = tabElement.closest('.flexlayout__tabset') as HTMLElement | null
      const isDrawerTab = parentTabset?.id === 'drawerContentTabset'
      if (!isDrawerTab) {
        const tabStyle = window.getComputedStyle(tabElement)
        if (tabStyle.overflow === 'auto') {
          tabElement.style.overflow = 'hidden'
          tabElement.style.overflowX = 'hidden'
          tabElement.style.overflowY = 'hidden'
        }
        const tabClientHeight = tabElement.clientHeight
        if (tabClientHeight > 0 && tabClientHeight < 2000) {
          const tabContent = tabElement.querySelector('.flexlayout__tab_content') as HTMLElement | null
          if (tabContent) {
            const firstChild = tabContent.firstElementChild as HTMLElement | null
            if (firstChild) {
              const firstChildHeight = firstChild.clientHeight
              if (firstChildHeight > tabClientHeight * 1.1) {
                console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza wrapper a:', tabClientHeight, '(era:', firstChildHeight, ')')
                firstChild.style.height = `${tabClientHeight}px`
                firstChild.style.maxHeight = `${tabClientHeight}px`
                firstChild.style.overflow = 'hidden'
              }
              const mainContainer = firstChild.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
              if (mainContainer) {
                const mainHeight = mainContainer.clientHeight
                if (mainHeight > tabClientHeight * 1.1) {
                  console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza MAIN_CONTAINER a:', tabClientHeight, '(era:', mainHeight, ')')
                  mainContainer.style.height = `${tabClientHeight}px`
                  mainContainer.style.maxHeight = `${tabClientHeight}px`
                }
              }
            }
          }
        }
      }
    }
  }

  const timeout = setTimeout(() => {
    analyzeScrollbars()
    applyScrollbarFix()
  }, 800)
  const fixInterval = setInterval(() => {
    applyScrollbarFix()
  }, 1000)
  window.addEventListener('resize', () => {
    analyzeScrollbars()
    applyScrollbarFix()
  })
  return () => {
    clearTimeout(timeout)
    clearInterval(fixInterval)
    window.removeEventListener('resize', analyzeScrollbars)
  }
}, [hostRef])
```

### JSX Return (struttura rilevante):

```jsx
return (
  <React.Fragment>
    <div className="flex flex-1 w-full min-h-0 overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar flex-shrink-0 ... />
        <PdfToolbarAdvanced flex-shrink-0 ... />
        <div
          ref={hostRef}
          className="flex-1 overflow-auto relative min-h-0"
          style={{ ['--scale-factor' as any]: String(shell.scaleRef?.current || 1) }}
        >
          <PdfViewerCore ... />
        </div>
      </div>
      <SearchPanel ... />
    </div>
  </React.Fragment>
)
```

## LOG DELLA CONSOLE (STATO ATTUALE)

```
[SCROLLBAR_DEBUG] FLEXLAYOUT__TAB (trovato nella gerarchia): {
  "computedOverflow": "auto",  // Dopo il fix JS diventa "hidden"
  "scrollHeight": 47239,
  "clientHeight": 681,
  "canScroll": true  // Problema: anche dopo overflow:hidden, può ancora scrollare
}

[SCROLLBAR_DEBUG] MAIN_CONTAINER: {
  "height": "47202.5px",  // Problema: si è espanso invece di essere limitato a 681px
  "scrollHeight": 47202,
  "clientHeight": 47202,
  "canScroll": false  // Corretto: non dovrebbe scrollare, ma si è espanso
}

[SCROLLBAR_DEBUG] PDF_HOST (hostRef, dovrebbe avere scrollbar arancione): {
  "height": "47113.1px",  // Problema: si è espanso invece di essere limitato
  "scrollHeight": 47113,
  "clientHeight": 47113,
  "overflow": "auto",  // Corretto: dovrebbe avere overflow-auto
  "canScroll": false  // Problema: scrollHeight === clientHeight → NO SCROLLBAR!
}
```

## DOMANDE PER L'ESPERTO

1. Perché, anche dopo aver forzato `overflow: hidden` sul `flexlayout__tab` e limitato l'altezza dei container wrapper, `scrollHeight` rimane 47239px mentre `clientHeight` è 681px? Non dovrebbe `scrollHeight` essere uguale a `clientHeight` quando `overflow: hidden` è applicato?

2. Perché i container interni (`MAIN_CONTAINER`, `LEFT_CONTAINER`, `PDF_HOST`) continuano ad espandersi a ~47202px invece di rispettare l'altezza limitata del parent (681px) anche dopo aver impostato `style.height` e `style.maxHeight` via JavaScript?

3. C'è qualcosa nella gerarchia Flexbox che impedisce la propagazione corretta dell'altezza? Il problema è nel modo in cui FlexLayout gestisce gli stili o c'è un conflitto con le classi Tailwind CSS (`flex-1`, `min-h-0`, etc.)?

4. È corretto usare `clientHeight` per calcolare l'altezza da limitare, oppure dovrei usare `offsetHeight` o `getBoundingClientRect().height`?

5. FlexLayout applica stili inline dinamicamente? Se sì, come posso intercettare e sovrascrivere questi stili in modo più efficace?

6. Dovrei forzare anche `LEFT_CONTAINER` e `PDF_HOST` a un'altezza fissa calcolata dinamicamente, oppure dovrei risolvere il problema a monte limitando meglio il `flexlayout__tab` stesso?

7. C'è un modo per far sì che i container Flexbox con `flex: 1` rispettino automaticamente l'altezza del parent senza dover forzare `height` via JavaScript?

## CONTESTO TECNICO

- **Framework**: React + TypeScript
- **Libreria Layout**: FlexLayout-React (versione non specificata, ma recente)
- **CSS Framework**: Tailwind CSS
- **PDF Viewer**: @react-pdf-viewer/core con vari plugin
- **Browser**: Testato su Chrome/Edge (Chromium)

