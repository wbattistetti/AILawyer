import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { EstrattoCreateInput, EstrattoUpdateInput } from '../types/index.js'

const estrattoCreateSchema = z.object({
    praticaId: z.string(),
    sourceDoc: z.string(),
    page: z.number().int().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    type: z.enum(['reato', 'motivazione', 'contromotivazione', 'prova', 'testimonianza', 'altro']),
    parentReatoId: z.string().optional(),
    parentMotivazioneId: z.string().optional(),
    title: z.string().optional(),
    content: z.string().min(1),

    // Tracciabilità documento sorgente
    sourceDocId: z.string().optional(),
    sourceDocTitle: z.string().optional(),

    // Posizione nel documento (bbox)
    bbox: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
    }).optional(),

    // Data dell'estratto (per cronologia)
    extractDate: z.date().optional(),

    // Note editabili dall'analista
    notesAnalyst: z.string().optional(),
    notesDescription: z.string().optional(),
    notesStrategy: z.string().optional(),
    notesDefense: z.string().optional(),

    // Metadati
    analystId: z.string(),
    clientiIds: z.array(z.string()).optional()
})

const estrattoUpdateSchema = z.object({
    sourceDoc: z.string().optional(),
    page: z.number().int().min(1).optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
    type: z.enum(['reato', 'motivazione', 'contromotivazione', 'prova', 'testimonianza', 'altro']).optional(),
    parentReatoId: z.string().optional(),
    parentMotivazioneId: z.string().optional(),
    title: z.string().optional(),
    content: z.string().min(1).optional(),

    // Tracciabilità documento sorgente
    sourceDocId: z.string().optional(),
    sourceDocTitle: z.string().optional(),

    // Posizione nel documento (bbox)
    bbox: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
    }).optional(),

    // Data dell'estratto (per cronologia)
    extractDate: z.date().optional(),

    // Note editabili dall'analista
    notesAnalyst: z.string().optional(),
    notesDescription: z.string().optional(),
    notesStrategy: z.string().optional(),
    notesDefense: z.string().optional(),

    clientiIds: z.array(z.string()).optional()
})

export async function estrattiRoutes(fastify: FastifyInstance) {
    // GET /api/estratti - Lista tutti gli estratti
    fastify.get('/estratti', async (request, reply) => {
        try {
            const estratti = await prisma.estratto.findMany({
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
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

    // GET /api/estratti/:id - Ottieni estratto specifico
    fastify.get<{ Params: { id: string } }>('/estratti/:id', async (request, reply) => {
        try {
            const { id } = request.params

            const estratto = await prisma.estratto.findUnique({
                where: { id },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
                        }
                    },
                    parentReato: true,
                    parentMotivazione: true,
                    motivazioni: true,
                    contromotivazioni: true
                }
            })

            if (!estratto) {
                return reply.status(404).send({ error: 'Estratto non trovato' })
            }

            // Parse dates
            const estrattoWithDates = {
                ...estratto,
                createdAt: estratto.createdAt.toISOString(),
                updatedAt: estratto.updatedAt.toISOString()
            }

            return estrattoWithDates
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero dell\'estratto' })
        }
    })

    // POST /api/estratti - Crea nuovo estratto
    fastify.post<{ Body: EstrattoCreateInput }>('/estratti', async (request, reply) => {
        try {
            const data = estrattoCreateSchema.parse(request.body)

            // Validazione gerarchica
            if (data.type === 'motivazione' && !data.parentReatoId) {
                return reply.status(400).send({ error: 'Motivazione deve avere un reato padre' })
            }

            if (data.type === 'contromotivazione' && !data.parentMotivazioneId) {
                return reply.status(400).send({ error: 'Contro-motivazione deve avere una motivazione padre' })
            }

            // Crea estratto con relazioni
            const estratto = await prisma.estratto.create({
                data: {
                    praticaId: data.praticaId,
                    sourceDoc: data.sourceDoc,
                    page: data.page,
                    start: data.start,
                    end: data.end,
                    type: data.type,
                    parentReatoId: data.parentReatoId,
                    parentMotivazioneId: data.parentMotivazioneId,
                    title: data.title,
                    content: data.content,

                    // Tracciabilità documento sorgente
                    sourceDocId: data.sourceDocId,
                    sourceDocTitle: data.sourceDocTitle,

                    // Posizione nel documento (bbox)
                    bbox: data.bbox ? JSON.stringify(data.bbox) : null,

                    // Data dell'estratto (per cronologia)
                    extractDate: data.extractDate || new Date(),

                    // Note editabili dall'analista
                    notesAnalyst: data.notesAnalyst,
                    notesDescription: data.notesDescription,
                    notesStrategy: data.notesStrategy,
                    notesDefense: data.notesDefense,

                    // Metadati
                    analystId: data.analystId,

                    clienti: data.clientiIds ? {
                        connect: data.clientiIds.map(id => ({ id }))
                    } : undefined
                },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
                        }
                    },
                    parentReato: true,
                    parentMotivazione: true
                }
            })

            // Parse dates
            const estrattoWithDates = {
                ...estratto,
                createdAt: estratto.createdAt.toISOString(),
                updatedAt: estratto.updatedAt.toISOString()
            }

            return estrattoWithDates
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nella creazione dell\'estratto' })
        }
    })

    // PUT /api/estratti/:id - Aggiorna estratto
    fastify.put<{
        Params: { id: string }
        Body: EstrattoUpdateInput
    }>('/estratti/:id', async (request, reply) => {
        try {
            const { id } = request.params
            const data = estrattoUpdateSchema.parse(request.body)

            const estratto = await prisma.estratto.update({
                where: { id },
                data: {
                    ...data,
                    bbox: data.bbox ? JSON.stringify(data.bbox) : undefined,
                    clienti: data.clientiIds ? {
                        set: data.clientiIds.map(id => ({ id }))
                    } : undefined
                },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
                        }
                    },
                    parentReato: true,
                    parentMotivazione: true
                }
            })

            // Parse dates
            const estrattoWithDates = {
                ...estratto,
                createdAt: estratto.createdAt.toISOString(),
                updatedAt: estratto.updatedAt.toISOString()
            }

            return estrattoWithDates
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nell\'aggiornamento dell\'estratto' })
        }
    })

    // DELETE /api/estratti/:id - Elimina estratto
    fastify.delete<{ Params: { id: string } }>('/estratti/:id', async (request, reply) => {
        try {
            const { id } = request.params

            await prisma.estratto.delete({ where: { id } })

            return { success: true }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nell\'eliminazione dell\'estratto' })
        }
    })

    // GET /api/estratti/pratica/:praticaId - Ottieni estratti per pratica
    fastify.get<{ Params: { praticaId: string } }>('/estratti/pratica/:praticaId', async (request, reply) => {
        try {
            const { praticaId } = request.params

            const estratti = await prisma.estratto.findMany({
                where: { praticaId },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
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

    // GET /api/estratti/pratica/:praticaId/hierarchy - Ottieni gerarchia estratti
    fastify.get<{ Params: { praticaId: string } }>('/estratti/pratica/:praticaId/hierarchy', async (request, reply) => {
        try {
            const { praticaId } = request.params

            const estratti = await prisma.estratto.findMany({
                where: { praticaId },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    },
                    clienti: {
                        select: {
                            id: true,
                            nome: true,
                            cognome: true
                        }
                    },
                    parentReato: true,
                    parentMotivazione: true,
                    motivazioni: true,
                    contromotivazioni: true
                }
            })

            // Parse dates
            const estrattiWithDates = estratti.map(estratto => ({
                ...estratto,
                createdAt: estratto.createdAt.toISOString(),
                updatedAt: estratto.updatedAt.toISOString()
            }))

            // Organizza in gerarchia
            const hierarchy = {
                reati: estrattiWithDates.filter(e => e.type === 'reato'),
                motivazioni: estrattiWithDates.filter(e => e.type === 'motivazione'),
                contromotivazioni: estrattiWithDates.filter(e => e.type === 'contromotivazione')
            }

            return hierarchy
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero della gerarchia' })
        }
    })
}
