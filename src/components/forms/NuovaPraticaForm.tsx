import React, { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pratica } from '@/types'

const praticaSchema = z.object({
  numeroRuolo: z.string().min(1, 'Numero RGN/NR è obbligatorio'),
  cliente: z.string()
    .min(1, 'Cliente/i è obbligatorio')
    .refine((value) => {
      // Dividi per virgola e pulisci
      const names = value.split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0)

      // Controlla che ogni nome abbia almeno nome e cognome
      const validNames = names.filter(name => {
        const parts = name.trim().split(/\s+/).filter(Boolean)
        return parts.length >= 2 // Richiede almeno nome e cognome
      })

      return validNames.length > 0
    }, {
      message: 'Ogni cliente deve avere nome e cognome separati da spazio (es. "Mario Rossi")'
    }),
  foro: z.string().optional(),
  pmGiudice: z.string().optional(),
})

type PraticaFormData = z.infer<typeof praticaSchema>

interface NuovaPraticaFormProps {
  onSubmit: (data: {
    numeroRuolo: string
    cliente: string
    foro?: string
    pmGiudice?: string
  }) => void
  isLoading?: boolean
}

export function NuovaPraticaForm({ onSubmit, isLoading }: NuovaPraticaFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<PraticaFormData>({
    resolver: zodResolver(praticaSchema),
  })

  const clienteValue = watch('cliente')

  const handleClienteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setValue('cliente', value)

    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Nuova Pratica Penale</CardTitle>
        <CardDescription className="text-center">
          Inserisci i dati della nuova pratica per iniziare la gestione documentale
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* PRIMA RIGA: 3 campi affiancati */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numeroRuolo">Numero RGN/NR *</Label>
              <Input
                id="numeroRuolo"
                {...register('numeroRuolo')}
                placeholder="es. 12345/2024"
                className={errors.numeroRuolo ? 'border-red-500' : ''}
              />
              {errors.numeroRuolo && (
                <p className="text-sm text-red-500">{errors.numeroRuolo.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="foro">Foro/Ufficio</Label>
              <Input
                id="foro"
                {...register('foro')}
                placeholder="es. Tribunale di Milano"
                className={errors.foro ? 'border-red-500' : ''}
              />
              {errors.foro && (
                <p className="text-sm text-red-500">{errors.foro.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pmGiudice">PM/Giudice</Label>
              <Input
                id="pmGiudice"
                {...register('pmGiudice')}
                placeholder="es. Dott. Giuseppe Verdi"
              />
            </div>
          </div>

          {/* SECONDA RIGA: Cliente/i a larghezza completa (obbligatorio) */}
          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente/i *</Label>
            <textarea
              ref={textareaRef}
              id="cliente"
              value={clienteValue || ''}
              placeholder="es. Mario Rossi, Anna Bianchi, Luca Verdi"
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none overflow-hidden ${errors.cliente ? 'border-red-500' : ''
                }`}
              style={{ minHeight: '40px', maxHeight: '200px' }}
              onChange={handleClienteChange}
            />
            {errors.cliente && (
              <p className="text-sm text-red-500">{errors.cliente.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Inserisci uno o più clienti separati da virgola. Ogni cliente deve avere nome e cognome (es. "Mario Rossi, Anna Bianchi")
            </p>
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <Button type="submit" disabled={isLoading} className="px-8">
              {isLoading ? 'Creazione...' : 'Crea Pratica'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}