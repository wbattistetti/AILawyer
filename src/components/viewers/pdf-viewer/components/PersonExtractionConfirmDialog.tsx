/**
 * ✅ Fase 5: Dialog di conferma per creazione schede anagrafiche
 */

import React from 'react';
import { useToast } from '@/hooks/use-toast';

interface PersonExtractionConfirmDialogProps {
  personCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const PersonExtractionConfirmDialog: React.FC<PersonExtractionConfirmDialogProps> = ({
  personCount,
  onConfirm,
  onCancel,
  isSaving = false,
}) => {
  const { toast } = useToast();

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[20000]"
      onClick={handleCancel}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Conferma estrazione anagrafiche</h3>

        <p className="text-sm text-neutral-700 mb-6">
          Ho trovato <strong>{personCount}</strong> {personCount === 1 ? 'anagrafica' : 'anagrafiche'}.
          Le ho evidenziate nel documento. Vuoi creare le schede anagrafiche?
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Creazione...' : 'Crea schede'}
          </button>
        </div>
      </div>
    </div>
  );
};
