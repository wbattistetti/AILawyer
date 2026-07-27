/**
 * Pannello di consultazione delle schede anagrafiche.
 * L'estrazione parte dalla toolbar tramite PersonExtractionHost.
 */

import { useEffect, useState } from 'react'
import { PersonAccordion } from './PersonAccordion'
import {
  getPendingDocs,
  clearByPratica,
  upsertOccurrences,
  upsertPersons,
  type PersonRecord,
  type OccurrenceRecord,
} from './entity-index'
import { api } from '../../lib/api'
import {
  createDocumentSignature,
  getPersonDraft,
  initializePersonDraft,
  removePersonFromDraft,
  subscribePersonDraft,
} from './person-draft-store'
import {
  findPracticeDocument,
  listPracticeDocMeta,
} from './practice-document-source'

export function PersonCardsPanel({
  praticaId,
  onOpenOccurrence,
}: {
  praticaId: string
  onOpenOccurrence: (
    o: OccurrenceRecord,
    context?: { highlightQuery?: string; highlightTerms?: string[] }
  ) => void
}) {
  const [persons, setPersons] = useState<PersonRecord[]>([])
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    void refreshState().catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Caricamento anagrafiche fallito')
      setLoading(false)
    })
  }, [praticaId])

  useEffect(() => {
    return subscribePersonDraft(() => {
      const draft = getPersonDraft(praticaId)
      if (!draft) return
      setPersons(draft.persons)
      setOccurrences(draft.occurrences)
      setExtracting(draft.extracting)
    })
  }, [praticaId])

  async function refreshState() {
    setLoading(true)
    const all = listPracticeDocMeta(praticaId)
    let draft = getPersonDraft(praticaId)
    if (!draft) {
      const [remote, pendingDocuments] = await Promise.all([
        api.getPracticePersons(praticaId),
        getPendingDocs(all.map(document => ({ ...document, praticaId }))),
      ])
      await clearByPratica(praticaId)
      await upsertPersons(remote.persons)
      await upsertOccurrences(remote.occurrences)
      draft = initializePersonDraft({
        praticaId,
        persons: remote.persons,
        occurrences: remote.occurrences,
        documentSignature: createDocumentSignature(
          all.map(document => ({ id: document.docId, hash: document.hash }))
        ),
        hasExtracted: remote.persons.length > 0,
        isCurrent: all.length > 0 && pendingDocuments.length === 0,
      })
    }
    setPersons(draft.persons)
    setOccurrences(draft.occurrences)
    setExtracting(draft.extracting)
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="px-3 py-2 border-b border-red-200 bg-red-50 text-sm text-red-700 whitespace-pre-wrap" role="alert">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-neutral-500">Caricamento…</div>
        ) : extracting && persons.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">Sto estraendo le anagrafiche…</div>
        ) : (
          <PersonAccordion
            persons={persons}
            occurrences={occurrences}
            onOpenOccurrence={onOpenOccurrence}
            getOccurrencePdfUrl={(occurrence) => {
              const document = findPracticeDocument(praticaId, occurrence.docId)
              if (!document) return undefined
              const isPdf = document.mime?.includes('pdf')
                || document.filename.toLowerCase().endsWith('.pdf')
              const storageKey = document.ocrPdfKey || document.s3Key
              return isPdf && storageKey ? api.getLocalFileUrl(storageKey) : undefined
            }}
            isOccurrenceScanned={occurrence =>
              findPracticeDocument(praticaId, occurrence.docId)?.hasNativeText === false
            }
            onDeletePerson={(personId) => {
              removePersonFromDraft(praticaId, personId)
            }}
          />
        )}
        {!loading && !extracting && persons.length === 0 && (
          <div className="p-6">
            <div className="text-sm text-neutral-500">Nessuna scheda anagrafica disponibile.</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PersonCardsPanel
