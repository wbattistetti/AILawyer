/**
 * API per persistere le anagrafiche estratte e le relative evidenze documentali.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { createOccurrenceFingerprint, isValidItalianTaxCode } from '../services/person-identity.js'

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional()
const personSchema = z.object({
  id: z.string().trim().min(1).max(100),
  full_name: z.string().trim().min(2).max(240),
  first_name: optionalText(120),
  last_name: optionalText(120),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  place_of_birth: optionalText(240),
  tax_code: z.string().trim().toUpperCase().refine(isValidItalianTaxCode, 'Codice fiscale non valido').optional(),
  address: optionalText(500),
  residence_address: optionalText(500),
  domicile_address: optionalText(500),
  postal_code: z.string().regex(/^\d{5}$/u).optional(),
  city: optionalText(160),
  province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/u).optional(),
  phone: optionalText(80),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  profession: optionalText(240),
  titles: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  confidence: z.number().min(0).max(1),
  occCount: z.number().int().min(0).max(100_000),
})

const boxSchema = z.object({
  x0Pct: z.number().min(0).max(1),
  x1Pct: z.number().min(0).max(1),
  y0Pct: z.number().min(0).max(1),
  y1Pct: z.number().min(0).max(1),
}).refine(box => box.x1Pct >= box.x0Pct && box.y1Pct >= box.y0Pct, 'Bounding box non valido')

const occurrenceSchema = z.object({
  personKey: z.string().trim().min(1).max(100),
  docId: z.string().trim().min(1).max(200),
  docTitle: z.string().trim().min(1).max(500),
  page: z.number().int().min(1).max(100_000),
  snippet: z.string().trim().min(1).max(4_000),
  box: boxSchema,
})

const saveSchema = z.object({
  persons: z.array(personSchema).max(5_000),
  occurrences: z.array(occurrenceSchema).max(50_000).default([]),
}).superRefine((payload, context) => {
  const personKeys = new Set(payload.persons.map(person => person.id))
  payload.occurrences.forEach((occurrence, index) => {
    if (!personKeys.has(occurrence.personKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurrences', index, 'personKey'],
        message: `Persona non presente nel payload: ${occurrence.personKey}`,
      })
    }
  })
})

type PersonInput = z.infer<typeof personSchema>

function toApiPerson(person: any) {
  return {
    id: person.externalKey,
    praticaId: person.praticaId,
    full_name: person.fullName,
    first_name: person.firstName ?? undefined,
    last_name: person.lastName ?? undefined,
    date_of_birth: person.dateOfBirth ?? undefined,
    place_of_birth: person.placeOfBirth ?? undefined,
    tax_code: person.taxCode ?? undefined,
    address: person.address ?? undefined,
    residence_address: person.residenceAddress ?? undefined,
    domicile_address: person.domicileAddress ?? undefined,
    postal_code: person.postalCode ?? undefined,
    city: person.city ?? undefined,
    province: person.province ?? undefined,
    phone: person.phone ?? undefined,
    email: person.email ?? undefined,
    profession: person.profession ?? undefined,
    titles: JSON.parse(person.titles || '[]'),
    confidence: person.confidence,
    occCount: person.occurrenceCount,
    updatedAt: person.updatedAt.getTime(),
  }
}

function personData(person: PersonInput) {
  return {
    externalKey: person.id,
    fullName: person.full_name,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    dateOfBirth: person.date_of_birth ?? null,
    placeOfBirth: person.place_of_birth ?? null,
    taxCode: person.tax_code ?? null,
    address: person.address ?? null,
    residenceAddress: person.residence_address ?? null,
    domicileAddress: person.domicile_address ?? null,
    postalCode: person.postal_code ?? null,
    city: person.city ?? null,
    province: person.province ?? null,
    phone: person.phone ?? null,
    email: person.email ?? null,
    profession: person.profession ?? null,
    titles: JSON.stringify(person.titles),
    confidence: person.confidence,
    occurrenceCount: person.occCount,
  }
}

/** Registra le route REST delle schede anagrafiche. */
export async function personsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { praticaId: string } }>('/pratiche/:praticaId/persons', async request => {
    const praticaId = z.string().min(1).parse(request.params.praticaId)
    const persons = await prisma.persona.findMany({
      where: { praticaId },
      include: { occorrenze: { orderBy: [{ sourceDocTitle: 'asc' }, { page: 'asc' }] } },
      orderBy: { fullName: 'asc' },
    })
    return {
      persons: persons.map(toApiPerson),
      occurrences: persons.flatMap(person => person.occorrenze.map(occurrence => ({
        id: occurrence.id,
        praticaId,
        personKey: person.externalKey,
        docId: occurrence.sourceDocId,
        docTitle: occurrence.sourceDocTitle,
        page: occurrence.page,
        snippet: occurrence.snippet,
        box: JSON.parse(occurrence.bbox),
        createdAt: occurrence.createdAt.getTime(),
      }))),
    }
  })

  fastify.put<{ Params: { praticaId: string }; Body: unknown }>(
    '/pratiche/:praticaId/persons',
    async (request, reply) => {
      try {
        const praticaId = z.string().min(1).parse(request.params.praticaId)
        const payload = saveSchema.parse(request.body)
        const practiceExists = await prisma.pratica.count({ where: { id: praticaId } })
        if (!practiceExists) return reply.status(404).send({ error: 'Pratica non trovata' })

        const saved = await prisma.$transaction(async transaction => {
          const retainedExternalKeys = payload.persons.map(person => person.id)
          await transaction.persona.deleteMany({
            where: {
              praticaId,
              ...(retainedExternalKeys.length > 0
                ? { externalKey: { notIn: retainedExternalKeys } }
                : {}),
            },
          })

          const personIds = new Map<string, string>()
          for (const person of payload.persons) {
            const existing = await transaction.persona.findFirst({
              where: {
                praticaId,
                OR: [
                  { externalKey: person.id },
                  ...(person.tax_code ? [{ taxCode: person.tax_code }] : []),
                ],
              },
            })
            const record = existing
              ? await transaction.persona.update({
                  where: { id: existing.id },
                  data: personData({ ...person, id: existing.externalKey }),
                })
              : await transaction.persona.create({
                  data: { ...personData(person), praticaId },
                })
            personIds.set(person.id, record.id)
          }

          const documentIds = new Set((await transaction.documento.findMany({
            where: { praticaId },
            select: { id: true },
          })).map(document => document.id))

          for (const occurrence of payload.occurrences) {
            const personaId = personIds.get(occurrence.personKey)
            if (!personaId) {
              throw new Error(`Occorrenza riferita a persona sconosciuta: ${occurrence.personKey}`)
            }
            const fingerprint = createOccurrenceFingerprint(occurrence)
            await transaction.occorrenzaPersona.upsert({
              where: { personaId_fingerprint: { personaId, fingerprint } },
              create: {
                personaId,
                documentoId: documentIds.has(occurrence.docId) ? occurrence.docId : null,
                sourceDocId: occurrence.docId,
                sourceDocTitle: occurrence.docTitle,
                page: occurrence.page,
                snippet: occurrence.snippet,
                bbox: JSON.stringify(occurrence.box),
                fingerprint,
              },
              update: {
                sourceDocTitle: occurrence.docTitle,
                snippet: occurrence.snippet,
                bbox: JSON.stringify(occurrence.box),
              },
            })
          }
          return transaction.persona.findMany({ where: { praticaId }, orderBy: { fullName: 'asc' } })
        })
        return { persons: saved.map(toApiPerson) }
      } catch (error: any) {
        fastify.log.error(error)
        if (error?.name === 'ZodError') {
          return reply.status(400).send({ error: 'Dati anagrafici non validi', details: error.errors })
        }
        return reply.status(500).send({ error: 'Salvataggio anagrafiche fallito', details: error?.message })
      }
    }
  )

  fastify.delete<{ Params: { praticaId: string } }>('/pratiche/:praticaId/persons', async request => {
    const praticaId = z.string().min(1).parse(request.params.praticaId)
    const result = await prisma.persona.deleteMany({ where: { praticaId } })
    return { ok: true, count: result.count }
  })
}
