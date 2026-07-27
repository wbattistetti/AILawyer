/**
 * Barra fissa della pratica con navigazione e azioni principali.
 */

import { forwardRef } from 'react';
import { Button } from '../../../../components/ui/button';
import { Switch } from '../../../../components/ui/switch';
import { ArrowLeft, Upload, RefreshCw, Loader2, FolderOpen, User, Users, Boxes } from 'lucide-react';
import { Pratica } from '../../../../types';
import { SettingsButton } from '@/components/theme/SettingsDialog';
import type { ExtractionTabProgress } from '../../../../features/entities/extract-progress';
import {
  GraphToolbarControl,
  type GraphToolbarControlProps,
} from '../../../../features/case-overview/graph-builder/GraphToolbarControl';

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
  /** Catalogo grafi + azioni create/open per la toolbar multi-grafo. */
  graphToolbar?: GraphToolbarControlProps;
  /** Apre il pannello schede anagrafiche senza avviare l'estrazione. */
  onOpenPersons?: () => void;
  /** Apre il pannello anagrafiche e avvia l'estrazione dalla pratica. */
  onExtractPersons?: () => void;
  personAction?: 'extract' | 'update' | null;
  isExtractingPersons?: boolean;
  personProgress?: ExtractionTabProgress | null;
  /** Apre il pannello luoghi/persone/oggetti senza avviare l'estrazione. */
  onOpenEntities?: () => void;
  /** Apre il pannello entità e avvia l'estrazione tipizzata. */
  onExtractEntities?: () => void;
  entityAction?: 'extract' | 'update' | null;
  isExtractingEntities?: boolean;
  entityProgress?: ExtractionTabProgress | null;
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
  graphToolbar,
  onOpenPersons,
  onExtractPersons,
  personAction = null,
  isExtractingPersons = false,
  personProgress = null,
  onOpenEntities,
  onExtractEntities,
  entityAction = null,
  isExtractingEntities = false,
  entityProgress = null,
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

            {graphToolbar && (
              <GraphToolbarControl {...graphToolbar} />
            )}

            {onOpenPersons && onExtractPersons && (
              <Button
                variant="outline"
                size="sm"
                onClick={
                  isExtractingPersons
                    ? undefined
                    : personAction === null
                      ? onOpenPersons
                      : onExtractPersons
                }
                disabled={isExtractingPersons}
                className="relative flex items-center overflow-hidden"
                title={
                  isExtractingPersons
                    ? personProgress?.label ?? 'Estrazione anagrafiche in corso'
                    : personAction === 'update'
                      ? 'Aggiorna le schede dopo la modifica dei documenti'
                      : personAction === 'extract'
                        ? 'Estrai le anagrafiche dai documenti della pratica'
                        : 'Apri le schede anagrafiche della pratica'
                }
              >
                {isExtractingPersons && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-sky-200/60 transition-[width] duration-300"
                    style={{ width: `${Math.max(4, personProgress?.pct ?? 0)}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center whitespace-nowrap">
                  {isExtractingPersons
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Users className="w-4 h-4 mr-2" />}
                  {isExtractingPersons
                    ? 'Sto estraendo le anagrafiche…'
                    : personAction === 'update'
                      ? 'Aggiorna anagrafiche'
                      : personAction === 'extract'
                        ? 'Estrai anagrafiche'
                        : 'Anagrafiche'}
                </span>
              </Button>
            )}

            {onOpenEntities && onExtractEntities && (
              <Button
                variant="outline"
                size="sm"
                onClick={
                  isExtractingEntities
                    ? undefined
                    : entityAction === null
                      ? onOpenEntities
                      : onExtractEntities
                }
                disabled={isExtractingEntities}
                className="relative flex items-center overflow-hidden"
                title={
                  isExtractingEntities
                    ? entityProgress?.label ?? 'Estrazione entità in corso'
                    : entityAction === 'update'
                      ? 'Aggiorna le entità dopo la modifica dei documenti'
                      : entityAction === 'extract'
                        ? 'Estrai luoghi, persone e oggetti dai documenti'
                        : 'Apri luoghi, persone e oggetti estratti'
                }
              >
                {isExtractingEntities && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-violet-200/60 transition-[width] duration-300"
                    style={{ width: `${Math.max(4, entityProgress?.pct ?? 0)}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center whitespace-nowrap">
                  {isExtractingEntities
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Boxes className="w-4 h-4 mr-2" />}
                  {isExtractingEntities
                    ? 'Sto estraendo le entità…'
                    : entityAction === 'update'
                      ? 'Aggiorna entità'
                      : entityAction === 'extract'
                        ? 'Estrai entità'
                        : 'Entità'}
                </span>
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onOpenPratica}>
              Apri pratica…
            </Button>

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
