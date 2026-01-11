import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FileSearch, Upload, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { Pratica } from '@/types'
import { PraticheDropdown } from './PraticheDropdown'

export function SplashPage() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<Pratica[]>([])
  const [all, setAll] = useState<Pratica[]>([])
  const [draftCount, setDraftCount] = useState(0)

  useEffect(() => {
    // Carica pratiche recenti da localStorage
    try {
      const raw = localStorage.getItem('recent_pratiche')
      if (raw) setRecent(JSON.parse(raw))
    } catch { }

    // Carica tutte le pratiche
    api.getPratiche().then(pratiche => {
      setAll(pratiche)
      const drafts = pratiche.filter(p => p.status === 'draft')
      setDraftCount(drafts.length)
    }).catch(() => { })
  }, [])

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
                <FileSearch className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
                LegalFlow
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Sistema di gestione documentale intelligente per studi legali penali
            </p>
          </div>

          {/* CTA / Open */}
          <div className={`flex gap-3 max-w-xl mx-auto justify-center ${all.length > 0 ? 'md:grid md:grid-cols-2' : ''}`}>
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 text-lg font-semibold"
              onClick={() => navigate('/nuova-pratica')}
            >
              <Upload className="w-5 h-5 mr-2" /> Nuova pratica
            </Button>

            {/* ✅ Mostra "Apri pratica" solo se ci sono pratiche nel database */}
            {all.length > 0 && (
              <PraticheDropdown
                pratiche={all}
                draftCount={draftCount}
                onPraticheChange={setAll}
                onDraftCountChange={setDraftCount}
              />
            )}
          </div>

          {/* ✅ Mostra "Pratiche recenti" solo se ci sono pratiche nel database E pratiche recenti */}
          {all.length > 0 && recent.length > 0 && (
            <div className="mt-8 max-w-2xl mx-auto w-full">
              <div className="flex items-center gap-2 text-slate-200 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Pratiche recenti</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {recent.slice(0, 4).map(p => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/pratica/${p.id}`)}
                    className="text-left p-3 rounded bg-white/10 hover:bg-white/15 transition"
                  >
                    <div className="text-white font-medium truncate">{p.nome}</div>
                    <div className="text-slate-300 text-xs truncate">{p.cliente} · {p.foro}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
