/**
 * Barra fissa della pratica con navigazione e azioni principali.
 */

import { forwardRef } from 'react';
import { Button } from '../../../../components/ui/button';
import { Switch } from '../../../../components/ui/switch';
import { ArrowLeft, Upload, RefreshCw, Loader2, FolderOpen, User, Network } from 'lucide-react';
import { Pratica } from '../../../../types';
import { SettingsButton } from '@/components/theme/SettingsDialog';

interface HeaderToolbarProps {
  pratica: Pratica;
  onHomeClick: () => void;
  onOpenPratica: () => void;
  onSavePratica: () => void;
  onUploadDocuments: () => void;
  saveFilesToDb: boolean;
  onSaveFilesToDbChange: (value: boolean) => void;
  isSaving?: boolean;
  onOpenExplorer?: () => void;
  onOpenCliente?: () => void;
  onOpenGraphBuilder?: () => void;
}

export const HeaderToolbar = forwardRef<HTMLDivElement, HeaderToolbarProps>(function HeaderToolbar({
  pratica,
  onHomeClick,
  onOpenPratica,
  onSavePratica,
  onUploadDocuments,
  saveFilesToDb,
  onSaveFilesToDbChange,
  isSaving = false,
  onOpenExplorer,
  onOpenCliente,
  onOpenGraphBuilder
}: HeaderToolbarProps, ref) {
  return (
    <div ref={ref} className="fixed top-0 left-0 right-0 z-[9999] bg-background/95 backdrop-blur border-b">
      <div className="w-full px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={onHomeClick}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Home
            </Button>

            <div>
              <h1 className="text-xl font-bold">{pratica.nome}</h1>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Foro: {pratica.foro}</span>
                {pratica.numeroRuolo && <span>N. {pratica.numeroRuolo}</span>}
              </div>
            </div>

            {/* ✅ Nuovi pulsanti: Cliente e Explorer */}
            {onOpenCliente && pratica.cliente && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenCliente}
                className="flex items-center"
              >
                <User className="w-4 h-4 mr-2" />
                {pratica.cliente}
              </Button>
            )}

            {onOpenExplorer && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenExplorer}
                className="flex items-center"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Explorer
              </Button>
            )}

            {onOpenGraphBuilder && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenGraphBuilder}
                className="flex items-center"
              >
                <Network className="w-4 h-4 mr-2" />
                Crea Grafo
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onOpenPratica}>
              Apri pratica…
            </Button>

            {/* Toggle "File su DB" */}
            <div className="flex items-center space-x-2 px-3 py-1.5 border rounded-md bg-card">
              <label htmlFor="save-files-toggle" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                File su DB
              </label>
              <Switch
                id="save-files-toggle"
                checked={saveFilesToDb}
                onCheckedChange={onSaveFilesToDbChange}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onSavePratica}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salva pratica
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Salva pratica
                </>
              )}
            </Button>
            <Button size="sm" onClick={onUploadDocuments}>
              <Upload className="w-4 h-4 mr-2" />
              Carica documenti
            </Button>
            <SettingsButton />
          </div>
        </div>
      </div>
    </div>
  );
});