/**
 * Modale practice-scoped per selezione modello Groq e riepilogo costi.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Trash2, X } from 'lucide-react'
import {
  api,
  type LlmModelCatalogItem,
  type PracticeAiCostsPayload,
} from '../../lib/api'
import {
  loadLegalReviewModel,
  saveLegalReviewModel,
} from '../generic-entities/review/llm-model-config'
import { AiCostsReport } from './AiCostsReport'
import { LlmModelPicker } from './LlmModelPicker'

export function AiCostsModal({
  praticaId,
  open,
  onClose,
}: {
  praticaId: string
  open: boolean
  onClose: () => void
}) {
  const [models, setModels] = useState<LlmModelCatalogItem[]>([])
  const [selectedModel, setSelectedModel] = useState(loadLegalReviewModel)
  const [costs, setCosts] = useState<PracticeAiCostsPayload | null>(null)
  const [usdToEur, setUsdToEur] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catalog, report, fx] = await Promise.all([
        api.getLlmModels(),
        api.getPracticeAiCosts(praticaId),
        api.getLlmExchangeRate(),
      ])
      setModels(catalog.models)
      setCosts(report)
      setUsdToEur(fx.usdToEur)
      const current = loadLegalReviewModel()
      const availableModel = catalog.models.some(model => model.id === current)
        ? current
        : catalog.models[0]?.id
      if (!availableModel) {
        throw new Error('Il catalogo Groq non contiene modelli chat utilizzabili')
      }
      setSelectedModel(availableModel)
      if (availableModel !== current) saveLegalReviewModel(availableModel)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [praticaId])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const clearCosts = async () => {
    if (!window.confirm('Svuotare il log IA di questa pratica?')) return
    try {
      await api.clearPracticeAiCosts(praticaId)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const selectModel = (modelId: string) => {
    setSelectedModel(saveLegalReviewModel(modelId))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-costs-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="ai-costs-title" className="font-semibold">Costi IA della pratica</h2>
            <p className="truncate text-xs text-neutral-500">
              Modello attivo: Groq / {selectedModel}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && !costs ? (
            <div className="p-6 text-center text-sm text-neutral-500">Caricamento…</div>
          ) : (
            <>
              <LlmModelPicker
                models={models}
                selectedModel={selectedModel}
                usdToEur={usdToEur}
                onSelect={selectModel}
              />
              {costs && <AiCostsReport data={costs} />}
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs"
            onClick={() => { void clearCosts() }}
            disabled={!costs?.calls.length}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Svuota log
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs"
            onClick={() => { void refresh() }}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
