import React from 'react';
import { Explorer, useExplorer } from './index';

/**
 * Componente di integrazione per il pannello Explorer nel progetto AILawyer
 * 
 * Questo file mostra come integrare il pannello Explorer nelle pagine esistenti
 * del progetto, come PraticaCanvasPage o NuovaPraticaPage.
 */

/**
 * Wrapper per il pannello Explorer con stili specifici del progetto
 */
export function AILawyerExplorer({ className = '' }: { className?: string }) {
  const { ExplorerProps } = useExplorer();

  return (
    <div className={`h-full bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <Explorer {...ExplorerProps} />
    </div>
  );
}

/**
 * Integrazione in una pagina di pratica esistente
 */
export function PraticaPageWithExplorer() {
  return (
    <div className="h-screen flex">
      {/* Sidebar con Explorer */}
      <div className="w-80 border-r border-gray-200 bg-gray-50">
        <div className="p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            File Explorer
          </h3>
          <AILawyerExplorer />
        </div>
      </div>

      {/* Contenuto principale della pratica */}
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Gestione Pratica
        </h1>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-gray-600">
            Il pannello Explorer è ora integrato nella sidebar. 
            Puoi selezionare file dal filesystem e caricarli nell'archivio della pratica.
          </p>
          
          <div className="mt-4 p-4 bg-blue-50 rounded-md">
            <h4 className="font-medium text-blue-900 mb-2">Funzionalità disponibili:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Navigazione tra drive e cartelle</li>
              <li>• Filtri per tipo file (PDF, Word, Immagini, etc.)</li>
              <li>• Anteprima file direttamente nel pannello</li>
              <li>• Selezione multipla per upload batch</li>
              <li>• Azioni contestuali (Localizza, Apri, Copia percorso)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal con Explorer per selezione file
 */
export function FileSelectionModal({ 
  isOpen, 
  onClose, 
  onFilesSelected 
}: {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: any[]) => void;
}) {
  const { ExplorerProps } = useExplorer();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-4/5 h-4/5 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Seleziona File
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Explorer */}
        <div className="flex-1 p-6">
          <Explorer {...ExplorerProps} />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Annulla
          </button>
          <button
            onClick={() => {
              // TODO: Implement file selection logic
              onFilesSelected([]);
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Seleziona File
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook per integrare l'Explorer con lo stato dell'applicazione
 */
export function useExplorerIntegration() {
  const { adapter } = useExplorer();

  const uploadSelectedFiles = async (selectedFiles: any[]) => {
    // TODO: Implementare la logica di upload nel backend
    console.log('Uploading files:', selectedFiles);
    
    // Esempio di chiamata API
    // const response = await fetch('/api/upload', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ files: selectedFiles })
    // });
    
    return { success: true, uploadedCount: selectedFiles.length };
  };

  const openFileInSystem = async (filePath: string) => {
    try {
      await adapter.openInSystem(filePath);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const revealFileInFolder = async (filePath: string) => {
    try {
      await adapter.revealInFolder(filePath);
    } catch (error) {
      console.error('Failed to reveal file:', error);
    }
  };

  return {
    uploadSelectedFiles,
    openFileInSystem,
    revealFileInFolder
  };
}

