import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { ClienteCreateInput, ClienteUpdateInput } from '../types/index.js'

const clienteCreateSchema = z.object({
    nome: z.string().min(1),
    cognome: z.string().min(1),
    codiceFiscale: z.string().optional(),
    dataNascita: z.string().datetime().optional(),
    indirizzo: z.string().optional(),
    metadati: z.array(z.object({
        type: z.enum(['testo', 'numero', 'data', 'valuta', 'booleano']),
        label: z.string(),
        value: z.string()
    })).optional()
})

const clienteUpdateSchema = z.object({
    nome: z.string().min(1).optional(),
    cognome: z.string().min(1).optional(),
    codiceFiscale: z.string().optional(),
    dataNascita: z.string().datetime().optional(),
    indirizzo: z.string().optional(),
    metadati: z.array(z.object({
        type: z.enum(['testo', 'numero', 'data', 'valuta', 'booleano']),
        label: z.string(),
        value: z.string()
    })).optional()
})

export async function clientiRoutes(fastify: FastifyInstance) {
    // GET /api/clienti - Lista tutti i clienti
    fastify.get('/clienti', async (request, reply) => {
        try {
            const clienti = await prisma.cliente.findMany({
                include: {
                    pratiche: {
                        include: {
                            pratica: {
                                select: {
                                    id: true,
                                    numeroRuolo: true,
                                    foro: true,
                                    status: true
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            pratiche: true,
                            estratti: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })

            // Parse metadati JSON
            const clientiWithMetadati = clienti.map(cliente => ({
                ...cliente,
                metadati: JSON.parse(cliente.metadati || '[]'),
                pratiche: cliente.pratiche.map(pc => pc.pratica),
                dataNascita: cliente.dataNascita?.toISOString(),
                createdAt: cliente.createdAt.toISOString(),
                updatedAt: cliente.updatedAt.toISOString()
            }))

            return { clienti: clientiWithMetadati }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero dei clienti' })
        }
    })

    // GET /api/clienti/:id - Ottieni cliente specifico
    fastify.get<{ Params: { id: string } }>('/clienti/:id', async (request, reply) => {
        try {
            const { id } = request.params

            const cliente = await prisma.cliente.findUnique({
                where: { id },
                include: {
                    pratiche: {
                        include: {
                            comparti: true,
                            documenti: {
                                select: {
                                    id: true,
                                    filename: true,
                                    ocrStatus: true,
                                    createdAt: true
                                }
                            }
                        }
                    },
                    estratti: {
                        include: {
                            pratica: {
                                select: {
                                    id: true,
                                    numeroRuolo: true,
                                    foro: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            })

            if (!cliente) {
                return reply.status(404).send({ error: 'Cliente non trovato' })
            }

            // Parse metadati JSON
            const clienteWithMetadati = {
                ...cliente,
                metadati: JSON.parse(cliente.metadati || '[]'),
                dataNascita: cliente.dataNascita?.toISOString(),
                createdAt: cliente.createdAt.toISOString(),
                updatedAt: cliente.updatedAt.toISOString(),
                pratiche: cliente.pratiche.map(pratica => ({
                    ...pratica,
                    createdAt: pratica.createdAt.toISOString(),
                    updatedAt: pratica.updatedAt.toISOString()
                })),
                estratti: cliente.estratti.map(estratto => ({
                    ...estratto,
                    createdAt: estratto.createdAt.toISOString(),
                    updatedAt: estratto.updatedAt.toISOString()
                }))
            }

            return clienteWithMetadati
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero del cliente' })
        }
    })

    // POST /api/clienti - Crea nuovo cliente
    fastify.post<{ Body: ClienteCreateInput }>('/clienti', async (request, reply) => {
        try {
            const data = clienteCreateSchema.parse(request.body)

            const cliente = await prisma.cliente.create({
                data: {
                    ...data,
                    dataNascita: data.dataNascita ? new Date(data.dataNascita) : undefined,
                    metadati: JSON.stringify(data.metadati || [])
                },
                include: {
                    pratiche: true,
                    estratti: true
                }
            })

            // Parse metadati per la risposta
            const clienteWithMetadati = {
                ...cliente,
                metadati: JSON.parse(cliente.metadati || '[]'),
                dataNascita: cliente.dataNascita?.toISOString(),
                createdAt: cliente.createdAt.toISOString(),
                updatedAt: cliente.updatedAt.toISOString()
            }

            return clienteWithMetadati
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nella creazione del cliente' })
        }
    })

    // PUT /api/clienti/:id - Aggiorna cliente
    fastify.put<{
        Params: { id: string }
        Body: ClienteUpdateInput
    }>('/clienti/:id', async (request, reply) => {
        try {
            const { id } = request.params
            const data = clienteUpdateSchema.parse(request.body)

            const cliente = await prisma.cliente.update({
                where: { id },
                data: {
                    ...data,
                    dataNascita: data.dataNascita ? new Date(data.dataNascita) : undefined,
                    metadati: data.metadati ? JSON.stringify(data.metadati) : undefined
                },
                include: {
                    pratiche: true,
                    estratti: true
                }
            })

            // Parse metadati per la risposta
            const clienteWithMetadati = {
                ...cliente,
                metadati: JSON.parse(cliente.metadati || '[]'),
                dataNascita: cliente.dataNascita?.toISOString(),
                createdAt: cliente.createdAt.toISOString(),
                updatedAt: cliente.updatedAt.toISOString()
            }

            return clienteWithMetadati
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nell\'aggiornamento del cliente' })
        }
    })

    // DELETE /api/clienti/:id - Elimina cliente
    fastify.delete<{ Params: { id: string } }>('/clienti/:id', async (request, reply) => {
        try {
            const { id } = request.params

            await prisma.cliente.delete({ where: { id } })

            return { success: true }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nell\'eliminazione del cliente' })
        }
    })

    // GET /api/clienti/:id/estratti - Ottieni estratti del cliente
    fastify.get<{ Params: { id: string } }>('/clienti/:id/estratti', async (request, reply) => {
        try {
            const { id } = request.params

            const estratti = await prisma.estratto.findMany({
                where: {
                    clienti: {
                        some: { id }
                    }
                },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    parentReato: true,
                    parentMotivazione: true,
                    motivazioni: true,
                    contromotivazioni: true
                },
                orderBy: { createdAt: 'desc' }
            })

            // Parse dates
            const estrattiWithDates = estratti.map(estratto => ({
                ...estratto,
                createdAt: estratto.createdAt.toISOString(),
                updatedAt: estratto.updatedAt.toISOString()
            }))

            return { estratti: estrattiWithDates }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero degli estratti' })
        }
    })
}
