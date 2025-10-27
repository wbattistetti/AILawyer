import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { MemoriaDifensivaCreateInput, MemoriaDifensivaUpdateInput } from '../types/index.js'

const memoriaDifensivaCreateSchema = z.object({
    title: z.string().min(1),
    praticaId: z.string(),
    structure: z.object({
        sections: z.array(z.object({
            id: z.string(),
            type: z.enum(['reato', 'motivazione', 'contromotivazione', 'prova', 'testimonianza', 'altro']),
            title: z.string(),
            content: z.string(),
            extracts: z.array(z.string()), // Array di ID estratti
            subsections: z.array(z.any()).optional(),
            order: z.number()
        })),
        metadata: z.object({
            title: z.string(),
            clientName: z.string(),
            caseNumber: z.string(),
            createdAt: z.string(),
            analystName: z.string()
        })
    }).optional()
})

const memoriaDifensivaUpdateSchema = z.object({
    title: z.string().min(1).optional(),
    structure: z.object({
        sections: z.array(z.object({
            id: z.string(),
            type: z.enum(['reato', 'motivazione', 'contromotivazione', 'prova', 'testimonianza', 'altro']),
            title: z.string(),
            content: z.string(),
            extracts: z.array(z.string()), // Array di ID estratti
            subsections: z.array(z.any()).optional(),
            order: z.number()
        })),
        metadata: z.object({
            title: z.string(),
            clientName: z.string(),
            caseNumber: z.string(),
            createdAt: z.string(),
            analystName: z.string()
        })
    }).optional()
})

export async function memoriaDifensivaRoutes(fastify: FastifyInstance) {
    // GET /api/memoria-difensiva - Lista tutte le memorie difensive
    fastify.get('/memoria-difensiva', async (request, reply) => {
        try {
            const memorie = await prisma.memoriaDifensiva.findMany({
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
            })

            // Parse dates and structure
            const memorieWithDates = memorie.map(memoria => ({
                ...memoria,
                createdAt: memoria.createdAt.toISOString(),
                updatedAt: memoria.updatedAt.toISOString(),
                structure: memoria.structure ? JSON.parse(memoria.structure) : null
            }))

            return { memorie: memorieWithDates }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero delle memorie difensive' })
        }
    })

    // GET /api/memoria-difensiva/:id - Ottieni memoria difensiva specifica
    fastify.get<{ Params: { id: string } }>('/memoria-difensiva/:id', async (request, reply) => {
        try {
            const { id } = request.params

            const memoria = await prisma.memoriaDifensiva.findUnique({
                where: { id },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    }
                }
            })

            if (!memoria) {
                return reply.status(404).send({ error: 'Memoria difensiva non trovata' })
            }

            // Parse dates and structure
            const memoriaWithDates = {
                ...memoria,
                createdAt: memoria.createdAt.toISOString(),
                updatedAt: memoria.updatedAt.toISOString(),
                structure: memoria.structure ? JSON.parse(memoria.structure) : null
            }

            return memoriaWithDates
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero della memoria difensiva' })
        }
    })

    // POST /api/memoria-difensiva - Crea nuova memoria difensiva
    fastify.post<{ Body: MemoriaDifensivaCreateInput }>('/memoria-difensiva', async (request, reply) => {
        try {
            const data = memoriaDifensivaCreateSchema.parse(request.body)

            const memoria = await prisma.memoriaDifensiva.create({
                data: {
                    title: data.title,
                    praticaId: data.praticaId,
                    structure: data.structure ? JSON.stringify(data.structure) : null
                },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    }
                }
            })

            // Parse dates and structure
            const memoriaWithDates = {
                ...memoria,
                createdAt: memoria.createdAt.toISOString(),
                updatedAt: memoria.updatedAt.toISOString(),
                structure: memoria.structure ? JSON.parse(memoria.structure) : null
            }

            return memoriaWithDates
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nella creazione della memoria difensiva' })
        }
    })

    // PUT /api/memoria-difensiva/:id - Aggiorna memoria difensiva
    fastify.put<{
        Params: { id: string }
        Body: MemoriaDifensivaUpdateInput
    }>('/memoria-difensiva/:id', async (request, reply) => {
        try {
            const { id } = request.params
            const data = memoriaDifensivaUpdateSchema.parse(request.body)

            const memoria = await prisma.memoriaDifensiva.update({
                where: { id },
                data: {
                    ...data,
                    structure: data.structure ? JSON.stringify(data.structure) : undefined
                },
                include: {
                    pratica: {
                        select: {
                            id: true,
                            numeroRuolo: true,
                            foro: true
                        }
                    }
                }
            })

            // Parse dates and structure
            const memoriaWithDates = {
                ...memoria,
                createdAt: memoria.createdAt.toISOString(),
                updatedAt: memoria.updatedAt.toISOString(),
                structure: memoria.structure ? JSON.parse(memoria.structure) : null
            }

            return memoriaWithDates
        } catch (error: any) {
            fastify.log.error(error)
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Dati non validi', details: error.errors })
            }
            return reply.status(500).send({ error: 'Errore nell\'aggiornamento della memoria difensiva' })
        }
    })

    // DELETE /api/memoria-difensiva/:id - Elimina memoria difensiva
    fastify.delete<{ Params: { id: string } }>('/memoria-difensiva/:id', async (request, reply) => {
        try {
            const { id } = request.params

            await prisma.memoriaDifensiva.delete({ where: { id } })

            return { success: true }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nell\'eliminazione della memoria difensiva' })
        }
    })

    // GET /api/memoria-difensiva/pratica/:praticaId - Ottieni memorie difensive per pratica
    fastify.get<{ Params: { praticaId: string } }>('/memoria-difensiva/pratica/:praticaId', async (request, reply) => {
        try {
            const { praticaId } = request.params

            const memorie = await prisma.memoriaDifensiva.findMany({
                where: { praticaId },
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
            })

            // Parse dates and structure
            const memorieWithDates = memorie.map(memoria => ({
                ...memoria,
                createdAt: memoria.createdAt.toISOString(),
                updatedAt: memoria.updatedAt.toISOString(),
                structure: memoria.structure ? JSON.parse(memoria.structure) : null
            }))

            return { memorie: memorieWithDates }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nel recupero delle memorie difensive' })
        }
    })

    // POST /api/memoria-difensiva/:id/generate - Genera documento finale da estratti
    fastify.post<{ Params: { id: string } }>('/memoria-difensiva/:id/generate', async (request, reply) => {
        try {
            const { id } = request.params

            const memoria = await prisma.memoriaDifensiva.findUnique({
                where: { id },
                include: {
                    pratica: {
                        include: {
                            estratti: {
                                include: {
                                    clienti: {
                                        select: {
                                            id: true,
                                            nome: true,
                                            cognome: true
                                        }
                                    }
                                },
                                orderBy: { extractDate: 'asc' }
                            }
                        }
                    }
                }
            })

            if (!memoria) {
                return reply.status(404).send({ error: 'Memoria difensiva non trovata' })
            }

            // Genera struttura documento basata sugli estratti
            const structure = {
                sections: [],
                metadata: {
                    title: memoria.title,
                    clientName: memoria.pratica.clienti?.[0]?.nome + ' ' + memoria.pratica.clienti?.[0]?.cognome || 'Cliente',
                    caseNumber: memoria.pratica.numeroRuolo || 'N/A',
                    createdAt: new Date().toISOString(),
                    analystName: 'Analista' // TODO: ottenere dal contesto utente
                }
            }

            // Organizza estratti per tipo
            const estrattiByType = memoria.pratica.estratti.reduce((acc, estratto) => {
                if (!acc[estratto.type]) acc[estratto.type] = []
                acc[estratto.type].push(estratto)
                return acc
            }, {} as Record<string, any[]>)

            // Crea sezioni per ogni tipo
            Object.entries(estrattiByType).forEach(([type, estratti], index) => {
                structure.sections.push({
                    id: `section-${type}-${index}`,
                    type,
                    title: getTypeTitle(type),
                    content: estratti.map(e => e.content).join('\n\n'),
                    extracts: estratti.map(e => e.id),
                    order: index
                })
            })

            // Aggiorna la memoria con la struttura generata
            const updatedMemoria = await prisma.memoriaDifensiva.update({
                where: { id },
                data: {
                    structure: JSON.stringify(structure)
                }
            })

            return {
                ...updatedMemoria,
                createdAt: updatedMemoria.createdAt.toISOString(),
                updatedAt: updatedMemoria.updatedAt.toISOString(),
                structure
            }
        } catch (error) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Errore nella generazione del documento' })
        }
    })
}

function getTypeTitle(type: string): string {
    const titles: Record<string, string> = {
        'reato': 'Reati Contestati',
        'motivazione': 'Motivazioni',
        'contromotivazione': 'Contro-motivazioni',
        'prova': 'Prove',
        'testimonianza': 'Testimonianze',
        'altro': 'Altri Elementi'
    }
    return titles[type] || 'Sezione'
}
