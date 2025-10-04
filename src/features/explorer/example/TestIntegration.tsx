import React from 'react';
import { Explorer, useExplorer } from '../index';

/**
 * Componente di test per verificare l'integrazione del pannello Explorer
 * 
 * Questo componente può essere utilizzato per testare il pannello Explorer
 * in isolamento prima dell'integrazione completa.
 */
export function TestExplorerIntegration() {
  const { ExplorerProps } = useExplorer();

  return (
    <div className="h-screen flex flex-col">
      {/* Header di test */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <h1 className="text-xl font-semibold text-gray-900">
          Test Explorer Integration
        </h1>
        <div className="ml-auto text-sm text-gray-500">
          Mock Environment
        </div>
      </div>

      {/* Pannello Explorer */}
      <div className="flex-1">
        <Explorer {...ExplorerProps} />
      </div>

      {/* Footer con informazioni */}
      <div className="h-12 bg-gray-50 border-t border-gray-200 flex items-center px-6">
        <div className="text-xs text-gray-500">
          Explorer Panel - Mock FileSystem Adapter Active
        </div>
      </div>
    </div>
  );
}

/**
 * Componente di test per verificare l'integrazione con DockWorkspaceV2
 */
export function TestDockWorkspaceIntegration() {
  const { ExplorerProps } = useExplorer();

  // Mock delle props necessarie per DockWorkspaceV2
  const mockProps = {
    docs: [
      { id: 'doc1', title: 'Documento 1.pdf' },
      { id: 'doc2', title: 'Documento 2.docx' }
    ],
    renderArchive: () => (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4">Archivio Mock</h3>
        <div className="space-y-2">
          <div className="p-2 bg-gray-100 rounded">Documento 1.pdf</div>
          <div className="p-2 bg-gray-100 rounded">Documento 2.docx</div>
        </div>
      </div>
    ),
    renderExplorer: () => <Explorer {...ExplorerProps} />,
    renderDoc: (docId: string) => (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4">Documento: {docId}</h3>
        <p>Contenuto del documento mock...</p>
      </div>
    )
  };

  return (
    <div className="h-screen">
      <div className="p-4 bg-blue-50 border-b">
        <h2 className="text-lg font-semibold text-blue-900">
          Test DockWorkspaceV2 Integration
        </h2>
        <p className="text-sm text-blue-700">
          Questo test simula l'integrazione completa con DockWorkspaceV2
        </p>
      </div>
      
      {/* Simulazione del layout DockWorkspaceV2 */}
      <div className="h-[calc(100vh-80px)] flex">
        {/* Sidebar sinistra con tab */}
        <div className="w-80 border-r border-gray-200 bg-gray-50">
          <div className="h-full">
            {/* Tab Explorer */}
            <div className="h-full">
              <Explorer {...ExplorerProps} />
            </div>
          </div>
        </div>

        {/* Area centrale */}
        <div className="flex-1 p-4">
          <h3 className="text-lg font-semibold mb-4">Area Centrale</h3>
          <p className="text-gray-600">
            Qui verrebbe mostrato il contenuto principale della pratica.
          </p>
        </div>
      </div>
    </div>
  );
}

