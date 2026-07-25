/**
 * Pagina diagnostica: monta SearchPanelTree senza PdfViewer, Dockview o shell.
 * Usare per Esperimento A (digitazione in isolamento). Non è una feature utente.
 */
import React from 'react'
import { SearchProvider } from '@/components/search/SearchProvider'
import { SearchPanelTree } from '@/components/search/SearchPanelTree'

export function DebugPdfSearch() {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="text-lg font-semibold mb-2">Debug PDF search (isolato)</h1>
      <p className="text-sm text-muted-foreground mb-4 max-w-xl">
        Solo SearchProvider + SearchPanelTree. Clicca nell’input e digita: se qui funziona, il problema è nel contesto viewer/layout.
      </p>
      <div className="max-w-md border rounded-md bg-card">
        <SearchProvider
          defaultScope="current"
          initialQuery=""
          autoSearch={false}
          onSearch={async () => null}
        >
          <SearchPanelTree
            rolePrefix="pdf"
            showInput={true}
            showScopeSelector={false}
            initialQuery=""
            isVisible={true}
          />
        </SearchProvider>
      </div>
    </div>
  )
}
