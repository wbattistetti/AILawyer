import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { TipoDinamicoCreateInput, TipoDinamicoUpdateInput } from '../types/index.js'

const tipoDinamicoCreateSchema = z.object({
    label: z.string().min(1),
    type: z.enum(['testo', 'numero', 'data', 'valuta', 'booleano']),
    obbligatorio: z.boolean().default(false),
    validazione: z.object({
        pattern: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        required: z.boolean().optional(),
        message: z.string().optional()
    }).optional(),
    ordine: z.number().default(0)
})

const tipoDinamicoUpdateSchema = z.object({
    label: z.string().min(1).optional(),
    type: z.enum(['testo', 'numero', 'data', 'valuta', 'booleano']).optional(),
    obbligatorio: z.boolean().optional(),
    validazione: z.object({
        pattern: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        required: z.boolean().optional(),
        message: z.string().optional()
    }).optional(),
    ordine: z.number().optional()
})

export async function tipoDinamiciRoutes(fastify: FastifyInstance) {
    // GET /api/tipo-dinamici - Lista tutti i tipi dinamici
    fastify.get('/tipo-dinamici', async (request, reply) => {
        try {
            const tipi = await prisma.tipoDinamico.findMany({
                orderBy: { ordine: 'asc' }
            })

            // Parse validazione JSON
            const tipiWithValidazione = tipi.map(tipo => ({
                ...tipo,
                validazione: tipo.validazione ? JSON.parse(tipo.validazione) : undefined,
                createdAt: tipo.createdAt.toISOString(),
                updatedAt: tipo.updatedAt.toISOString()
            }))

            return { tipi: tipiWithValidazione }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero dei tipi dinamici' })
        }
    })

    // GET /api/tipo-dinamici/:id - Ottieni tipo specifico
    fastify.get<{ Params: { id: string } }>('/tipo-dinamici/:id', async (request, reply) => {
        try {
            const { id } = request.params

            const tipo = await prisma.tipoDinamico.findUnique({
                where: { id }
            })

            if (!tipo) {
                return reply.status(404).send({ error: 'Tipo dinamico non trovato' })
            }

            // Parse validazione JSON
            const tipoWithValidazione = {
                ...tipo,
                validazione: tipo.validazione ? JSON.parse(tipo.validazione) : undefined,
                createdAt: tipo.createdAt.toISOString(),
                updatedAt: tipo.updatedAt.toISOString()
            }

            return tipoWithValidazione
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero del tipo dinamico' })
        }
    })

    // POST /api/tipo-dinamici - Crea nuovo tipo dinamico
    fastify.post<{ Body: TipoDinamicoCreateInput }>('/tipo-dinamici', async (request, reply) => {
        try {
            const data = tipoDinamicoCreateSchema.parse(request.body)

            const tipo = await prisma.tipoDinamico.create({
                data: {
                    ...data,
                    validazione: data.validazione ? JSON.stringify(data.validazione) : undefined
                }
            })

            // Parse validazione per la risposta
            const tipoWithValidazione = {
                ...tipo,
                validazione: tipo.validazione ? JSON.parse(tipo.validazione) : undefined,
                createdAt: tipo.createdAt.toISOString(),
                updatedAt: tipo.updatedAt.toISOString()
            }

            return tipoWithValidazione
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            if (error.code === 'P2002') {
                return reply.status(400).send({ error: 'Label già esistente' })
            }
            return reply.status(500).send({ error: 'Errore nella creazione del tipo dinamico' })
        }
    })

    // PUT /api/tipo-dinamici/:id - Aggiorna tipo dinamico
    fastify.put<{
        Params: { id: string }
        Body: TipoDinamicoUpdateInput
    }>('/tipo-dinamici/:id', async (request, reply) => {
        try {
            const { id } = request.params
            const data = tipoDinamicoUpdateSchema.parse(request.body)

            const tipo = await prisma.tipoDinamico.update({
                where: { id },
                data: {
                    ...data,
                    validazione: data.validazione ? JSON.stringify(data.validazione) : undefined
                }
            })

            // Parse validazione per la risposta
            const tipoWithValidazione = {
                ...tipo,
                validazione: tipo.validazione ? JSON.parse(tipo.validazione) : undefined,
                createdAt: tipo.createdAt.toISOString(),
                updatedAt: tipo.updatedAt.toISOString()
            }

            return tipoWithValidazione
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            if (error.code === 'P2002') {
                return reply.status(400).send({ error: 'Label già esistente' })
            }
            return reply.status(500).send({ error: 'Errore nell\'aggiornamento del tipo dinamico' })
        }
    })

    // DELETE /api/tipo-dinamici/:id - Elimina tipo dinamico
    fastify.delete<{ Params: { id: string } }>('/tipo-dinamici/:id', async (request, reply) => {
        try {
            const { id } = request.params

            await prisma.tipoDinamico.delete({ where: { id } })

            return { success: true }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nell\'eliminazione del tipo dinamico' })
        }
    })

    // GET /api/tipo-dinamici/form-config - Ottieni configurazione per form dinamici
    fastify.get('/tipo-dinamici/form-config', async (request, reply) => {
        try {
            const tipi = await prisma.tipoDinamico.findMany({
                orderBy: { ordine: 'asc' }
            })

            // Trasforma in configurazione form
            const formConfig = tipi.map(tipo => ({
                label: tipo.label,
                type: tipo.type,
                obbligatorio: tipo.obbligatorio,
                validazione: tipo.validazione ? JSON.parse(tipo.validazione) : undefined,
                ordine: tipo.ordine
            }))

            return { formConfig }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero della configurazione form' })
        }
    })
}
