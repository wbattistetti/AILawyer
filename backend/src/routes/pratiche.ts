import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { PraticaCreateInput } from '../types/index.js'

const praticaCreateSchema = z.object({
  nome: z.string().min(1),
  cliente: z.string().optional(),
  foro: z.string().optional(),
  controparte: z.string().optional(),
  pmGiudice: z.string().optional(),
  numeroRuolo: z.string().optional(),
})

const COMPARTI_DEFAULT = [
  { key: 'da_classificare', nome: 'Da classificare', ordine: 0 },
  { key: 'admin_procure', nome: 'Admin & Procure', ordine: 1 },
  { key: 'parti_anagrafiche', nome: 'Parti & Anagrafiche', ordine: 2 },
  { key: 'corrispondenza_pec', nome: 'Corrispondenza & PEC', ordine: 3 },
  { key: 'denuncia_querela', nome: 'Denuncia–Querela / Notizia di reato', ordine: 4 },
  { key: 'indagini_preliminari', nome: 'Indagini preliminari (PG/PM, 415-bis)', ordine: 5 },
  { key: 'perizie_consulenze', nome: 'Perizie & Consulenze (CTP/CTU)', ordine: 6 },
  { key: 'prove_allegati', nome: 'Prove & Allegati (foto, audio, chat)', ordine: 7 },
  { key: 'udienze_verbali', nome: 'Udienze & Verbali', ordine: 8 },
  { key: 'provvedimenti_giudice', nome: 'Provvedimenti del giudice (GIP/GUP/Trib.)', ordine: 9 },
]

export async function praticheRoutes(fastify: FastifyInstance) {
  // List pratiche (simple, latest first)
  fastify.get('/pratiche', async (_request, reply) => {
    try {
      const items = await prisma.pratica.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
      return items
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero delle pratiche' })
    }
  })

  // Create pratica
  fastify.post<{ Body: PraticaCreateInput }>('/pratiche', async (request, reply) => {
    try {
      const parsed = praticaCreateSchema.parse(request.body)
      const data = {
        nome: parsed.nome,
        cliente: parsed.cliente ?? '',
        foro: parsed.foro ?? '',
        controparte: parsed.controparte ?? null,
        pmGiudice: parsed.pmGiudice ?? null,
        numeroRuolo: parsed.numeroRuolo ?? null,
      }
      const pratica = await prisma.pratica.create({
        data,
      })

      // Create default comparti (compat fallback without createMany)
      await prisma.$transaction(
        COMPARTI_DEFAULT.map(comparto =>
          prisma.comparto.create({
            data: {
              praticaId: pratica.id,
              key: comparto.key,
              nome: comparto.nome,
              ordine: comparto.ordine,
            }
          })
        )
      )

      return pratica
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nella creazione della pratica' })
    }
  })

  // Get pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id', async (request, reply) => {
    try {
      const pratica = await prisma.pratica.findUnique({
        where: { id: request.params.id },
      })

      if (!pratica) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      return pratica
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero della pratica' })
    }
  })

  // Get comparti for pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id/comparti', async (request, reply) => {
    try {
      let comparti = await prisma.comparto.findMany({
        where: { praticaId: request.params.id },
        orderBy: { ordine: 'asc' },
      })

      // If no comparti exist, create default ones
      if (comparti.length === 0) {
        await prisma.$transaction(
          COMPARTI_DEFAULT.map(comparto =>
            prisma.comparto.create({
              data: {
                praticaId: request.params.id,
                key: comparto.key,
                nome: comparto.nome,
                ordine: comparto.ordine,
              }
            })
          )
        )

        comparti = await prisma.comparto.findMany({
          where: { praticaId: request.params.id },
          orderBy: { ordine: 'asc' },
        })
      }

      return comparti
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero dei comparti' })
    }
  })

  // Get documenti for pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id/documenti', async (request, reply) => {
    try {
      const documentiRaw = await prisma.documento.findMany({
        where: { praticaId: request.params.id },
        orderBy: { createdAt: 'desc' },
      })

      const documenti = documentiRaw.map((d: any) => {
        const tags = typeof d.tags === 'string' ? (() => { try { return JSON.parse(d.tags) } catch { return [] } })() : (d.tags ?? [])
        const ocrLayout = typeof d.ocrLayout === 'string' ? (() => { try { return JSON.parse(d.ocrLayout) } catch { return undefined } })() : d.ocrLayout
        return { ...d, tags, ocrLayout }
      })

      return documenti
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero dei documenti' })
    }
  })

  // Check draft: verifica se esiste una bozza con lo stesso nome
  fastify.get<{ Querystring: { nome: string } }>('/pratiche/check-draft', async (request, reply) => {
    try {
      const { nome } = request.query
      if (!nome) {
        return reply.status(400).send({ error: 'Nome pratica richiesto' })
      }

      const draft = await prisma.pratica.findFirst({
        where: {
          nome,
          status: 'draft'
        },
        select: {
          id: true,
          nome: true,
          cliente: true,
          createdAt: true,
          _count: {
            select: { documenti: true }
          }
        }
      })

      if (!draft) {
        return { exists: false }
      }

      return {
        exists: true,
        draft: {
          id: draft.id,
          nome: draft.nome,
          cliente: draft.cliente,
          createdAt: draft.createdAt,
          documentCount: draft._count.documenti
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nella verifica bozze' })
    }
  })

  // Commit pratica: salva definitivamente (cambia status da draft a committed)
  fastify.post<{ Params: { id: string } }>('/pratiche/:id/commit', async (request, reply) => {
    try {
      const pratica = await prisma.pratica.findUnique({
        where: { id: request.params.id }
      })

      if (!pratica) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      if (pratica.status === 'committed') {
        return { ok: true, message: 'Pratica già salvata definitivamente' }
      }

      const updated = await prisma.pratica.update({
        where: { id: request.params.id },
        data: { status: 'committed' }
      })

      return { ok: true, pratica: updated }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel salvataggio definitivo' })
    }
  })

  // Delete pratica: elimina una pratica con tutti i suoi documenti
  fastify.delete<{ Params: { id: string } }>('/pratiche/:id', async (request, reply) => {
    const praticaId = request.params.id
    console.log('🗑️ [API][DELETE][START] Richiesta eliminazione pratica:', praticaId)
    
    try {
      console.log('🔍 [API][DELETE] Cerco pratica nel DB...')
      const pratica = await prisma.pratica.findUnique({
        where: { id: praticaId },
        include: {
          _count: {
            select: { documenti: true }
          }
        }
      })

      if (!pratica) {
        console.log('❌ [API][DELETE] Pratica non trovata:', praticaId)
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      console.log('✅ [API][DELETE] Pratica trovata:', {
        id: pratica.id,
        nome: pratica.nome,
        status: pratica.status,
        documenti: pratica._count.documenti
      })

      // Elimina tutti i documenti associati (i file verranno eliminati dal cascade)
      // In realtà con onDelete: Cascade in Prisma, l'eliminazione della pratica elimina automaticamente tutto
      console.log('🗄️ [API][DELETE] Elimino pratica dal DB (cascade delete documenti)...')
      await prisma.pratica.delete({
        where: { id: praticaId }
      })

      console.log('✅ [API][DELETE][SUCCESS] Pratica eliminata con successo:', pratica.nome)
      return { ok: true, message: 'Pratica eliminata con successo' }
    } catch (error) {
      console.error('❌ [API][DELETE][ERROR] Errore eliminazione pratica:', error)
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nell\'eliminazione della pratica' })
    }
  })

  // Delete all drafts: elimina tutte le bozze
  fastify.delete('/pratiche/drafts/all', async (request, reply) => {
    try {
      const result = await prisma.pratica.deleteMany({
        where: { status: 'draft' }
      })

      return { 
        ok: true, 
        count: result.count,
        message: `${result.count} bozze eliminate con successo` 
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nell\'eliminazione delle bozze' })
    }
  })
}