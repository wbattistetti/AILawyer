import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Trash2, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pratica } from '@/types'
import { PraticaRow } from './PraticaRow'
import { useDeleteWithUndo } from './hooks/useDeleteWithUndo'
import { api } from '@/lib/api'

interface PraticheDropdownProps {
  pratiche: Pratica[]
  draftCount: number
  onPraticheChange: (pratiche: Pratica[]) => void
  onDraftCountChange: (count: number) => void
}

export function PraticheDropdown({
  pratiche,
  draftCount,
  onPraticheChange,
  onDraftCountChange
}: PraticheDropdownProps) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)

  // Hook per gestione eliminazione con undo
  const deleteWithUndo = useDeleteWithUndo({
    onConfirm: async (id: string) => {
      await api.deletePratica(id)
      onPraticheChange(pratiche.filter(p => p.id !== id))
      const newDrafts = pratiche.filter(p => p.id !== id && p.status === 'draft')
      onDraftCountChange(newDrafts.length)
    }
  })

  // Filtro e separazione bozze/pratiche salvate
  const { bozze, praticheSalvate } = useMemo(() => {
    const filtered = pratiche.filter(p => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        p.nome.toLowerCase().includes(q) ||
        p.cliente.toLowerCase().includes(q) ||
        p.foro.toLowerCase().includes(q)
      )
    })

    const bozze = filtered
      .filter(p => p.status === 'draft')
      .sort((a, b) => (a.numeroRuolo || '').localeCompare(b.numeroRuolo || ''))

    const praticheSalvate = filtered
      .filter(p => p.status === 'committed')
      .sort((a, b) => (a.numeroRuolo || '').localeCompare(b.numeroRuolo || ''))

    return { bozze, praticheSalvate }
  }, [pratiche, searchQuery])

  const handleDeletePratica = (pratica: Pratica) => {
    deleteWithUndo.startDelete(pratica)
  }

  const handleUndo = () => {
    // ✅ NON aggiungere la pratica: è già nella lista!
    deleteWithUndo.cancelDelete()
  }

  const handleDeleteAllDrafts = async () => {
    try {
      await api.deleteAllDrafts()
      onPraticheChange(pratiche.filter(p => p.status !== 'draft'))
      onDraftCountChange(0)
      setShowDeleteAllConfirm(false)
    } catch (error) {
      console.error('Errore eliminazione bozze:', error)
      alert('Errore nell\'eliminazione delle bozze')
    }
  }

  return (
    <div className="relative">
      <Button
        size="lg"
        variant="outline"
        className="w-full px-6 py-4 text-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FolderOpen className="w-5 h-5 mr-2" />
        Apri pratica {draftCount > 0 && (
          <span className="ml-2 text-sm opacity-90">({draftCount} {draftCount === 1 ? 'bozza' : 'bozze'})</span>
        )}
        {isOpen ? <ChevronUp className="w-5 h-5 ml-2" /> : <ChevronDown className="w-5 h-5 ml-2" />}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-slate-300 rounded-lg shadow-xl z-50 overflow-hidden min-w-[400px] w-[500px]">
          {/* Search Bar */}
          <div className="p-3 border-b bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca pratica..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Delete All Drafts Button */}
          {draftCount > 0 && (
            <div className="p-2 border-b bg-amber-50">
              {!showDeleteAllConfirm ? (
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  className="w-full px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 rounded flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Cancella {draftCount === 1 ? 'la bozza' : `tutte le ${draftCount} bozze`}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-center text-slate-700">
                    Eliminare {draftCount} {draftCount === 1 ? 'bozza' : 'bozze'}?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteAllConfirm(false)}
                      className="flex-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleDeleteAllDrafts}
                      className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium"
                    >
                      Conferma
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pratiche List */}
          <div className="max-h-96 overflow-y-auto list-none">
            {bozze.length === 0 && praticheSalvate.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {searchQuery ? 'Nessuna pratica trovata' : 'Nessuna pratica disponibile'}
              </div>
            ) : (
              <>
                {/* Sezione Bozze */}
                {bozze.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
                      <span className="text-xs font-semibold text-amber-800">Bozze ({bozze.length})</span>
                    </div>
                    {bozze.map(p => (
                      <PraticaRow
                        key={p.id}
                        pratica={p}
                        isDraft={true}
                        isDeleting={deleteWithUndo.deletedPraticaId === p.id}
                        secondsLeft={deleteWithUndo.secondsLeft}
                        hovered={hoveredId === p.id}
                        onOpen={() => {
                          setIsOpen(false)
                          navigate(`/pratica/${p.id}`)
                        }}
                        onDelete={() => handleDeletePratica(p)}
                        onUndo={handleUndo}
                        onMouseEnter={() => setHoveredId(p.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      />
                    ))}
                  </>
                )}

                {/* Separatore tra bozze e pratiche salvate */}
                {bozze.length > 0 && praticheSalvate.length > 0 && (
                  <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-600">Pratiche salvate ({praticheSalvate.length})</span>
                  </div>
                )}

                {/* Sezione Pratiche Salvate */}
                {praticheSalvate.length > 0 && (
                  <>
                    {bozze.length === 0 && (
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                        <span className="text-xs font-semibold text-slate-600">Pratiche salvate ({praticheSalvate.length})</span>
                      </div>
                    )}
                    {praticheSalvate.map(p => (
                      <PraticaRow
                        key={p.id}
                        pratica={p}
                        isDraft={false}
                        isDeleting={deleteWithUndo.deletedPraticaId === p.id}
                        secondsLeft={deleteWithUndo.secondsLeft}
                        hovered={hoveredId === p.id}
                        onOpen={() => {
                          setIsOpen(false)
                          navigate(`/pratica/${p.id}`)
                        }}
                        onDelete={() => handleDeletePratica(p)}
                        onUndo={handleUndo}
                        onMouseEnter={() => setHoveredId(p.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
