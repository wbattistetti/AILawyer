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
  nome: z.string().min(1, 'Nome pratica è obbligatorio'),
  cliente: z.string().optional(),
  foro: z.string().optional(),
  controparte: z.string().optional(),
  pmGiudice: z.string().optional(),
  numeroRuolo: z.string().optional(),
})

type PraticaFormData = z.infer<typeof praticaSchema>

interface NuovaPraticaFormProps {
  onSubmit: (data: {
    nome: string
    cliente?: string
    foro?: string
    controparte?: string
    pmGiudice?: string
    numeroRuolo?: string
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Pratica *</Label>
              <Input
                id="nome"
                {...register('nome')}
                placeholder="es. Procedimento penale vs. Rossi Mario"
                className={errors.nome ? 'border-red-500' : ''}
              />
              {errors.nome && (
                <p className="text-sm text-red-500">{errors.nome.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente</Label>
              <Input
                id="cliente"
                {...register('cliente')}
                placeholder="es. Mario Rossi"
                className={errors.cliente ? 'border-red-500' : ''}
              />
              {errors.cliente && (
                <p className="text-sm text-red-500">{errors.cliente.message}</p>
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
              <Label htmlFor="controparte">Controparte</Label>
              <Input
                id="controparte"
                {...register('controparte')}
                placeholder="es. Procura della Repubblica"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pmGiudice">PM/Giudice</Label>
              <Input
                id="pmGiudice"
                {...register('pmGiudice')}
                placeholder="es. Dott. Giuseppe Verdi"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numeroRuolo">Numero RGN/NR</Label>
              <Input
                id="numeroRuolo"
                {...register('numeroRuolo')}
                placeholder="es. 12345/2024"
              />
            </div>
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