import React from 'react'
import { api } from '../../../../lib/api'
import { Documento } from '../../../../types'
import { PdfViewerShell } from '../../../viewers/pdf-viewer/PdfViewerShell'

export interface PdfViewerManagerProps {
  doc: Documento
  praticaId: string
  syncPage: number | null
  setSyncPage: (page: number) => void
  verifyEnabled: boolean
  setVerifyEnabled: (enabled: boolean) => void
  verifyLinesByPage: Record<number, any[]>
}

export function PdfViewerManager({
  doc,
  praticaId,
  syncPage,
  setSyncPage,
  verifyEnabled,
  setVerifyEnabled,
  verifyLinesByPage
}: PdfViewerManagerProps) {

  // ✅ Usa flex-1 invece di h-full per comportamento "Fill" come VB.NET
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="border-b px-2 py-1 text-sm flex items-center gap-2">
        <button
          className={`px-2 py-1 rounded ${verifyEnabled ? 'bg-blue-100 text-blue-700' : 'hover:bg-muted'}`}
          onClick={() => setVerifyEnabled(v => !v)}
          title="Attiva/Disattiva Verify"
        >
          Verify {verifyEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Panel content - Nuovo viewer sempre attivo */}
      <div className="flex-1 overflow-hidden">
        <PdfViewerShell
          fileUrl={(doc as any).localUrl || api.getLocalFileUrl(doc.s3Key)}
          page={syncPage || 1}
          lines={verifyLinesByPage[syncPage || 1] as any}
          docId={doc.id}
          praticaId={praticaId}
          onPageChange={setSyncPage}
          docName={doc.filename}
          hasNativeText={doc.hasNativeText}
        />
      </div>
    </div>
  )
}
