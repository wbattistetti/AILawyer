import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scale, FileSearch, Upload, Zap } from 'lucide-react'

export function SplashPage() {
  const navigate = useNavigate()

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

          {/* CTA Button */}
          <div className="space-y-4">
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
              onClick={() => navigate('/nuova-pratica')}
            >
              Inizia Nuova Pratica
            </Button>
            <p className="text-sm text-slate-400">
              Gestione documentale professionale per l'avvocatura penale
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}