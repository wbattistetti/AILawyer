import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NuovaPraticaForm } from '@/components/forms/NuovaPraticaForm'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Pratica } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NuovaPraticaPage() {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (data: Omit<Pratica, 'id' | 'createdAt'>) => {
    setIsLoading(true)
    try {
      const pratica = await api.createPratica(data)
      toast({
        title: 'Pratica creata con successo',
        description: `La pratica "${pratica.nome}" è stata creata e i comparti sono stati inizializzati.`,
      })
      navigate(`/pratica/${pratica.id}`)
    } catch (error) {
      console.error('Errore nella creazione della pratica:', error)
      toast({
        title: 'Errore',
        description: 'Si è verificato un errore durante la creazione della pratica.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna alla Home
          </Button>
        </div>
        
        <NuovaPraticaForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  )
}