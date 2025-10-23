import React, { useState } from 'react'
import { api } from '../../../../lib/api'
import { Documento } from '../../../../types'
import { VerifyPdfViewer } from '../../../viewers/VerifyPdfViewer'
import { PdfViewerShell } from '../../../viewers/pdf-viewer/PdfViewerShell'

export interface PdfViewerManagerProps {
  doc: Documento
  syncPage: number | null
  setSyncPage: (page: number) => void
  verifyEnabled: boolean
  setVerifyEnabled: (enabled: boolean) => void
  verifyLinesByPage: Record<number, any[]>
  testNewViewer: boolean
  setTestNewViewer: (test: boolean) => void
}

export function PdfViewerManager({
  doc,
  syncPage,
  setSyncPage,
  verifyEnabled,
  setVerifyEnabled,
  verifyLinesByPage,
  testNewViewer,
  setTestNewViewer
}: PdfViewerManagerProps) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <div className="border-b px-2 py-1 text-sm flex items-center gap-2">
        {/* Toggle button per nuovo viewer */}
        <button
          className={`px-2 py-1 rounded ${testNewViewer ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
          onClick={() => setTestNewViewer(v => !v)}
          title="Test Nuovo Viewer"
        >
          {testNewViewer ? '🆕 Nuovo Viewer' : '✅ Vecchio Viewer'}
        </button>
        
        <button
          className={`px-2 py-1 rounded ${verifyEnabled ? 'bg-blue-100 text-blue-700' : 'hover:bg-muted'}`}
          onClick={() => setVerifyEnabled(v => !v)}
          title="Attiva/Disattiva Verify"
        >
          Verify {verifyEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Test indicator */}
      {testNewViewer && (
        <div className="bg-yellow-100 text-yellow-800 p-1 text-xs text-center">
          🆕 TESTING PdfViewerShell - Ctrl+Shift+V per toggle
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {testNewViewer ? (
          // 🔥 NUOVO PDF VIEWER SHELL (IN TEST)
          <PdfViewerShell
            fileUrl={api.getLocalFileUrl(doc.s3Key)}
            page={syncPage || 1}
            lines={verifyLinesByPage[syncPage || 1] as any}
            docId={doc.id}
            onPageChange={(p)=> setSyncPage(p)}
          />
        ) : (
          // ✅ VECCHIO VERIFY PDF VIEWER (SICURO)
          <VerifyPdfViewer
            fileUrl={api.getLocalFileUrl(doc.s3Key)}
            page={syncPage || 1}
            lines={verifyLinesByPage[syncPage || 1] as any}
            docId={doc.id}
            onPageChange={(p)=> setSyncPage(p)}
          />
        )}
      </div>
    </div>
  )
}
