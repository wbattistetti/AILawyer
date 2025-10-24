import { Button } from '../../../../components/ui/button';
import { ArrowLeft, Upload, RefreshCw } from 'lucide-react';
import { Pratica } from '../../../../types';

interface HeaderToolbarProps {
  pratica: Pratica;
  onHomeClick: () => void;
  onOpenPratica: () => void;
  onSavePratica: () => void;
  onUploadDocuments: () => void;
}

export function HeaderToolbar({
  pratica,
  onHomeClick,
  onOpenPratica,
  onSavePratica,
  onUploadDocuments
}: HeaderToolbarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-white/95 backdrop-blur border-b">
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
                <span>Cliente: {pratica.cliente}</span>
                <span>Foro: {pratica.foro}</span>
                {pratica.numeroRuolo && <span>N. {pratica.numeroRuolo}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onOpenPratica}>
              Apri pratica…
            </Button>
            <Button variant="outline" size="sm" onClick={onSavePratica}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Salva pratica
            </Button>
            <Button size="sm" onClick={onUploadDocuments}>
              <Upload className="w-4 h-4 mr-2" />
              Carica documenti
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}