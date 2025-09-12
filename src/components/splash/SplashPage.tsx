import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scale, FileSearch, Upload, Zap, FolderOpen, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pratica } from '@/types'

export function SplashPage() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<Pratica[]>([])
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<Pratica[] | null>(null)

  useEffect(() => {
    // In assenza di un endpoint dedicato, mostriamo le ultime pratiche visitate salvate in localStorage
    try {
      const raw = localStorage.getItem('recent_pratiche')
      if (raw) setRecent(JSON.parse(raw))
    } catch {}
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
          <div className="grid md:grid-cols-2 gap-3 max-w-xl mx-auto">
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 text-lg font-semibold"
              onClick={() => navigate('/nuova-pratica')}
            >
              <Upload className="w-5 h-5 mr-2" /> Nuova pratica
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="px-6 py-4 text-lg"
              onClick={() => setOpen(true)}
            >
              <FolderOpen className="w-5 h-5 mr-2" /> Apri pratica
            </Button>
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

          {/* Modal Apri pratica */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Apri pratica</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <button
                  className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={async () => {
                    try {
                      // Carichiamo elenco pratiche recenti dal backend prendendo le ultime 10 per createdAt
                      const res = await fetch('/api/pratiche')
                      if (res.ok) {
                        const data = await res.json()
                        setAll(data)
                      }
                    } catch {}
                  }}
                >Carica elenco dal server</button>
                <div className="grid sm:grid-cols-2 gap-3">
                  {(all ?? recent).map(p => (
                    <button key={p.id} onClick={() => { setOpen(false); navigate(`/pratica/${p.id}`) }} className="text-left p-3 rounded border hover:bg-muted">
                      <div className="font-medium truncate">{p.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.cliente} · {p.foro}</div>
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}