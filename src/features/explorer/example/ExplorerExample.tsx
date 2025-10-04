import React from 'react';
import { Explorer, useExplorer } from '../index';

/**
 * Esempio di integrazione del pannello Explorer nel progetto AILawyer
 */
export function ExplorerExample() {
  const { ExplorerProps } = useExplorer();

  return (
    <div className="h-screen flex flex-col">
      {/* Header dell'app */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <h1 className="text-xl font-semibold text-gray-900">
          AILawyer - File Explorer
        </h1>
      </div>

      {/* Pannello Explorer */}
      <div className="flex-1">
        <Explorer {...ExplorerProps} />
      </div>
    </div>
  );
}

/**
 * Esempio di integrazione in una pagina esistente
 */
export function PraticaCanvasWithExplorer() {
  const { ExplorerProps } = useExplorer();

  return (
    <div className="h-screen flex">
      {/* Sidebar con Explorer */}
      <div className="w-1/3 border-r border-gray-200">
        <Explorer {...ExplorerProps} />
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 p-6">
        <h2 className="text-2xl font-bold mb-4">Pratica Canvas</h2>
        <p className="text-gray-600">
          Il pannello Explorer è ora integrato nella sidebar. 
          Puoi selezionare file e caricarli nell'archivio della pratica.
        </p>
      </div>
    </div>
  );
}

/**
 * Esempio di utilizzo con adapter personalizzato
 */
export function ExplorerWithCustomAdapter() {
  // In un ambiente reale, potresti voler configurare l'adapter
  // con opzioni specifiche o integrazioni custom
  const { ExplorerProps } = useExplorer();

  return (
    <div className="h-screen">
      <Explorer 
        {...ExplorerProps}
        className="border border-gray-300 rounded-lg"
      />
    </div>
  );
}

