import React from 'react'
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
  cliente: z.string().min(1, 'Cliente/i è obbligatorio'),
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PraticaFormData>({
    resolver: zodResolver(praticaSchema),
  })

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
            <Input
              id="cliente"
              {...register('cliente')}
              placeholder="es. Mario Rossi, Anna Bianchi, Luca Verdi"
              className={errors.cliente ? 'border-red-500' : ''}
            />
            {errors.cliente && (
              <p className="text-sm text-red-500">{errors.cliente.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Inserisci uno o più nomi separati da virgola
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