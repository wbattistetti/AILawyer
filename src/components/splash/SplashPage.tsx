import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scale, FileSearch, Upload, Zap, FolderOpen, Clock, FileEdit, ChevronDown, ChevronUp, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Pratica } from '@/types'

export function SplashPage() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<Pratica[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [all, setAll] = useState<Pratica[]>([])
  const [draftCount, setDraftCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deletedPratica, setDeletedPratica] = useState<Pratica | null>(null)
  const [undoTimer, setUndoTimer] = useState<NodeJS.Timeout | null>(null)
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(10)

  useEffect(() => {
    // In assenza di un endpoint dedicato, mostriamo le ultime pratiche visitate salvate in localStorage
    try {
      const raw = localStorage.getItem('recent_pratiche')
      if (raw) setRecent(JSON.parse(raw))
    } catch {}
    
    // Carica tutte le pratiche e conteggio bozze
    api.getPratiche().then(pratiche => {
      setAll(pratiche)
      const drafts = pratiche.filter(p => p.status === 'draft')
      setDraftCount(drafts.length)
    }).catch(() => {})
  }, [])

  // Cleanup timer quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (undoTimer) {
        clearTimeout(undoTimer)
      }
      if (countdownInterval) {
        clearInterval(countdownInterval)
      }
    }
  }, [undoTimer, countdownInterval])

  // Filtro e ordine alfabetico
  const filteredPratiche = all
    .filter(p => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        p.nome.toLowerCase().includes(q) ||
        p.cliente.toLowerCase().includes(q) ||
        p.foro.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const handleDeletePratica = (pratica: Pratica) => {
    console.log('🗑️ [DELETE][START] Click cestino su pratica:', { id: pratica.id, nome: pratica.nome, status: pratica.status })
    
    // Cancella timer precedente se esiste
    if (undoTimer) {
      console.log('⏱️ [DELETE][TIMER] Cancello timer precedente')
      clearTimeout(undoTimer)
      setUndoTimer(null)
    }
    if (countdownInterval) {
      console.log('⏱️ [DELETE][INTERVAL] Cancello interval precedente')
      clearInterval(countdownInterval)
      setCountdownInterval(null)
    }

    // Rimuovi dall'UI immediatamente
    console.log('🎨 [DELETE][UI] Rimuovo pratica dall\'UI')
    setAll(prev => prev.filter(p => p.id !== pratica.id))
    const newDrafts = all.filter(p => p.id !== pratica.id && p.status === 'draft')
    setDraftCount(newDrafts.length)
    
    // Salva per possibile undo
    setDeletedPratica(pratica)
    setSecondsLeft(10)
    console.log('💾 [DELETE] Pratica salvata per undo. Timer 10s parte...')
    
    // Countdown ogni secondo
    let seconds = 10
    const interval = setInterval(() => {
      seconds--
      setSecondsLeft(seconds)
      console.log(`⏳ [DELETE][COUNTDOWN] ${seconds}s rimanenti`)
      if (seconds <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    setCountdownInterval(interval)
    
    // Timer per eliminazione definitiva dopo 10 secondi
    const timer = setTimeout(async () => {
      console.log('⏰ [DELETE][TIMEOUT] Timer scaduto! Elimino pratica automaticamente...')
      clearInterval(interval)
      try {
        console.log('🌐 [DELETE][API] Chiamo api.deletePratica:', pratica.id)
        const result = await api.deletePratica(pratica.id)
        console.log('✅ [DELETE][API][SUCCESS] Pratica eliminata dal server:', result)
        setDeletedPratica(null)
        setUndoTimer(null)
        setCountdownInterval(null)
      } catch (error) {
        console.error('❌ [DELETE][API][ERROR] Errore eliminazione pratica:', error)
        // Se fallisce, ripristina
        setAll(prev => [...prev, pratica].sort((a, b) => a.nome.localeCompare(b.nome)))
        if (pratica.status === 'draft') {
          setDraftCount(prev => prev + 1)
        }
        setDeletedPratica(null)
        setCountdownInterval(null)
        alert('Errore nell\'eliminazione della pratica')
      }
    }, 10000)
    
    setUndoTimer(timer)
  }

  const handleUndo = () => {
    console.log('↩️ [UNDO] Click su "Annulla eliminazione"')
    if (undoTimer) {
      console.log('⏱️ [UNDO] Cancello timer di eliminazione')
      clearTimeout(undoTimer)
      setUndoTimer(null)
    }
    if (countdownInterval) {
      console.log('⏱️ [UNDO] Cancello countdown')
      clearInterval(countdownInterval)
      setCountdownInterval(null)
    }
    
    if (deletedPratica) {
      console.log('✅ [UNDO] Ripristino pratica nell\'UI:', deletedPratica.nome)
      // Ripristina la pratica nella lista
      setAll(prev => [...prev, deletedPratica].sort((a, b) => a.nome.localeCompare(b.nome)))
      if (deletedPratica.status === 'draft') {
        setDraftCount(prev => prev + 1)
      }
      setDeletedPratica(null)
      setSecondsLeft(10)
      console.log('🎉 [UNDO] Eliminazione annullata con successo!')
    }
  }

  const handleDismissToast = async () => {
    console.log('👆 [DISMISS] Click FUORI dal toast - Conferma eliminazione immediata')
    
    // Cancella timer
    if (undoTimer) {
      console.log('⏱️ [DISMISS] Cancello timer countdown (non più necessario)')
      clearTimeout(undoTimer)
      setUndoTimer(null)
    }
    if (countdownInterval) {
      console.log('⏱️ [DISMISS] Cancello interval countdown')
      clearInterval(countdownInterval)
      setCountdownInterval(null)
    }
    
    if (deletedPratica) {
      const praticaToDelete = deletedPratica
      console.log('🚀 [DISMISS] Eliminazione IMMEDIATA di:', { id: praticaToDelete.id, nome: praticaToDelete.nome })
      setDeletedPratica(null)
      setSecondsLeft(10)
      
      // ESEGUI SUBITO la cancellazione
      try {
        console.log('🌐 [DISMISS][API] Chiamo api.deletePratica:', praticaToDelete.id)
        const result = await api.deletePratica(praticaToDelete.id)
        console.log('✅ [DISMISS][API][SUCCESS] Pratica eliminata immediatamente dal server:', result)
      } catch (error) {
        console.error('❌ [DISMISS][API][ERROR] Errore eliminazione pratica:', error)
        // Se fallisce, ripristina la pratica
        console.log('↩️ [DISMISS] Ripristino pratica a causa dell\'errore')
        setAll(prev => [...prev, praticaToDelete].sort((a, b) => a.nome.localeCompare(b.nome)))
        if (praticaToDelete.status === 'draft') {
          setDraftCount(prev => prev + 1)
        }
        alert('Errore nell\'eliminazione della pratica')
      }
    }
  }

  const handleDeleteAllDrafts = async () => {
    try {
      const result = await api.deleteAllDrafts()
      setAll(prev => prev.filter(p => p.status !== 'draft'))
      setDraftCount(0)
      setShowDeleteAllConfirm(false)
    } catch (error) {
      console.error('Errore eliminazione bozze:', error)
      alert('Errore nell\'eliminazione delle bozze')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=2)'
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/95 to-slate-900/90" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo and Title */}
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-3 mb-6">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg">
                <Scale className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
                LegalFlow
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Sistema di gestione documentale intelligente per studi legali penali
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 my-12">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader className="text-center">
                <FileSearch className="w-12 h-12 mx-auto mb-4 text-blue-400" />
                <CardTitle className="text-lg">OCR Intelligente</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-300">
                  Estrazione automatica del testo da documenti e immagini con classificazione intelligente
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader className="text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-green-400" />
                <CardTitle className="text-lg">Upload Semplificato</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-300">
                  Drag & drop di file multipli con organizzazione automatica nei comparti appropriati
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader className="text-center">
                <Zap className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
                <CardTitle className="text-lg">Workflow Ottimizzato</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-300">
                  Canvas Kanban per la gestione visuale delle pratiche penali con automazione intelligente
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* CTA / Open */}
          <div className={`grid gap-3 max-w-xl mx-auto ${all.length > 0 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 text-lg font-semibold"
              onClick={() => navigate('/nuova-pratica')}
            >
              <Upload className="w-5 h-5 mr-2" /> Nuova pratica
            </Button>
            {all.length > 0 && (
              <div className="relative">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="w-full px-6 py-4 text-lg"
                  onClick={() => setIsOpen(!isOpen)}
                >
                  <FolderOpen className="w-5 h-5 mr-2" /> 
                  Apri pratica {draftCount > 0 && `(${draftCount} ${draftCount === 1 ? 'bozza' : 'bozze'})`}
                  {isOpen ? <ChevronUp className="w-5 h-5 ml-2" /> : <ChevronDown className="w-5 h-5 ml-2" />}
                </Button>
              
              {/* Dropdown Panel */}
              {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-300 rounded-lg shadow-xl z-50 overflow-hidden">
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
                    {filteredPratiche.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        {searchQuery ? 'Nessuna pratica trovata' : 'Nessuna pratica disponibile'}
                      </div>
                    ) : (
                      filteredPratiche.map(p => (
                        <div
                          key={p.id}
                          className="group relative border-b last:border-b-0 hover:bg-slate-50 transition"
                          onMouseEnter={() => setHoveredId(p.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <button
                            onClick={() => {
                              setIsOpen(false)
                              navigate(`/pratica/${p.id}`)
                            }}
                            className="w-full text-left p-3 pr-12"
                          >
                            <div className="font-medium flex items-center gap-2">
                              {p.status === 'draft' && (
                                <FileEdit className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              )}
                              <span className="truncate">{p.nome}</span>
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {p.cliente} · {p.foro}
                            </div>
                          </button>
                          
                          {/* Delete Button (visible on hover) */}
                          {hoveredId === p.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePratica(p)
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-red-100 rounded text-red-600"
                              title="Elimina pratica"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Toast Undo - sovrapposto alla search bar */}
              {deletedPratica && (
                <>
                  {/* Backdrop per click fuori */}
                  <div 
                    className="fixed inset-0 z-[9998]" 
                    onClick={handleDismissToast}
                  />
                  <div className="absolute top-0 left-0 right-0 p-3 border-b bg-slate-800 z-[9999]">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleUndo}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition text-white"
                      >
                        Annulla eliminazione
                      </button>
                      <span className="text-xs text-slate-300 ml-3 min-w-[30px] text-right">
                        {secondsLeft}s
                      </span>
                    </div>
                  </div>
                </>
              )}
              </div>
            )}
          </div>

          {/* Recenti */}
          <div className="mt-8 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-2 text-slate-200 mb-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Pratiche recenti</span>
            </div>
            {recent.length === 0 ? (
              <div className="text-slate-400 text-sm">Nessuna pratica recente.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {recent.slice(0,4).map(p => (
                  <button key={p.id} onClick={() => navigate(`/pratica/${p.id}`)} className="text-left p-3 rounded bg-white/10 hover:bg-white/15 transition">
                    <div className="text-white font-medium truncate">{p.nome}</div>
                    <div className="text-slate-300 text-xs truncate">{p.cliente} · {p.foro}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}