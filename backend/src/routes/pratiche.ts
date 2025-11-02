import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { PraticaCreateInput } from '../types/index.js'

const praticaCreateSchema = z.object({
  numeroRuolo: z.string().min(1),
  cliente: z.string().min(1),
  foro: z.string().optional(),
  pmGiudice: z.string().optional(),
})

const COMPARTI_DEFAULT = [
  { key: 'parti_anagrafiche', nome: 'Parti & Anagrafiche', ordine: 0 },
  { key: 'admin_procure', nome: 'Admin & Procure', ordine: 1 },
  { key: 'denuncia_querela', nome: 'Denuncia–Querela / Notizia di reato', ordine: 2 },
  { key: 'indagini_preliminari', nome: 'Indagini preliminari', ordine: 3 },
  { key: 'verbal_arresto_sequestro', nome: 'Verbal: Arresto Perquisizioni Sequestro', ordine: 4 },
  { key: 'interrogatori_dichiarazioni', nome: 'Interrogatori e Dichiarazioni', ordine: 5 },
  { key: 'corrispondenza_pec', nome: 'Corrispondenza & PEC', ordine: 6 },
  { key: 'utenz_scadenze', nome: 'Elenco Utenze Scadenze Proroghe', ordine: 7 },
  { key: 'trascriptioni_intercett', nome: 'Trascrizioni Intercettazioni Telefoniche', ordine: 8 },
  { key: 'atti_interlocutori', nome: 'Atti Interlocutori Corrispondenza Varia', ordine: 9 },
  { key: 'nomi_citati_frequentazioni', nome: 'Nomi Citati in Atti Frequentazioni', ordine: 10 },
  { key: 'contestazioni', nome: 'Contestazioni P.M./GIP', ordine: 11 },
  { key: 'raccolta_prove', nome: 'Raccolta Prove Osservazioni', ordine: 12 },
  { key: 'mappe_concettuali', nome: 'Mappe Concettuali Grafico', ordine: 13 },
  { key: 'note_campo_libero', nome: 'Note a Campo Libero', ordine: 14 },
]

// Funzione helper per processare i nomi clienti
function parseClientNames(clienteString: string): string[] {
  console.log(`🔧 PARSING CLIENTI:`)
  console.log(`   Input: "${clienteString}"`)

  // Dividi per virgola e pulisci
  const names = clienteString
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0)

  console.log(`   Dopo split per virgola:`, names)

  // Rimuovi duplicati mantenendo l'ordine
  const uniqueNames = [...new Set(names)]
  console.log(`   Dopo rimozione duplicati:`, uniqueNames)

  return uniqueNames
}

export async function praticheRoutes(fastify: FastifyInstance) {
  // List pratiche (simple, latest first)
  fastify.get('/pratiche', async (_request, reply) => {
    try {
      const pratiche = await prisma.pratica.findMany({
        include: {
          clienti: {
            include: {
              cliente: true
            }
          },
          _count: {
            select: { documenti: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: 50
      })

      return pratiche.map(pratica => {
        const nome = pratica.numeroRuolo || `Pratica ${pratica.id.slice(0, 8)}`
        const clientiNomi = pratica.clienti.map(pc => `${pc.cliente.nome} ${pc.cliente.cognome}`).join(', ')
        const cliente = clientiNomi || 'Nessun cliente'

        return {
          ...pratica,
          nome,
          cliente,
          clienti: pratica.clienti.map(pc => pc.cliente),
          documentCount: pratica._count.documenti
        }
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero delle pratiche' })
    }
  })

  // Create pratica
  fastify.post<{ Body: PraticaCreateInput }>('/pratiche', async (request, reply) => {
    try {
      const parsed = praticaCreateSchema.parse(request.body)

      // Processa i nomi dei clienti
      console.log(`🔍 INPUT ORIGINALE: "${parsed.cliente}"`)
      const clientNames = parseClientNames(parsed.cliente)
      console.log(`📋 NOMI PARSATI (${clientNames.length}):`, clientNames)

      // Trova o crea i clienti
      const clientiIds: string[] = []
      for (let i = 0; i < clientNames.length; i++) {
        const name = clientNames[i]
        console.log(`\n👤 PROCESSANDO CLIENTE ${i + 1}/${clientNames.length}: "${name}"`)

        const parts = name.trim().split(/\s+/).filter(Boolean)
        console.log(`   📝 Parti dopo split:`, parts)

        if (parts.length < 2) {
          console.warn(`   ❌ Nome cliente non valido (mancano nome o cognome): "${name}"`)
          continue
        }

        // Prende il primo elemento come nome, il resto come cognome
        const nome = parts[0]
        const cognome = parts.slice(1).join(' ')

        console.log(`   🔍 Cercando cliente: nome="${nome}", cognome="${cognome}"`)

        // Cerca cliente esistente
        let cliente = await prisma.cliente.findFirst({
          where: {
            nome: nome,
            cognome: cognome
          }
        })

        // Se non esiste, crealo
        if (!cliente) {
          console.log(`   ➕ Creando nuovo cliente: ${nome} ${cognome}`)
          try {
            cliente = await prisma.cliente.create({
              data: {
                nome,
                cognome,
                metadati: JSON.stringify([])
              }
            })
            console.log(`   ✅ Cliente creato con ID: ${cliente.id}`)
          } catch (error) {
            console.error(`   ❌ Errore nella creazione cliente:`, error)
            continue
          }
        } else {
          console.log(`   🔄 Cliente esistente trovato: ${cliente.id}`)
        }

        clientiIds.push(cliente.id)
        console.log(`   ✅ Cliente aggiunto alla lista. Totale: ${clientiIds.length}`)
      }

      console.log(`\n📊 RISULTATO FINALE:`)
      console.log(`   - Clienti processati: ${clientiIds.length}`)
      console.log(`   - Clienti validi: ${clientiIds.length}`)
      console.log(`   - IDs finali:`, clientiIds)

      if (clientiIds.length === 0) {
        console.log(`❌ ERRORE: Nessun cliente valido trovato!`)
        return reply.status(400).send({ error: 'Nessun cliente valido trovato' })
      }

      const pratica = await prisma.pratica.create({
        data: {
          numeroRuolo: parsed.numeroRuolo,
          foro: parsed.foro ?? '',
          pmGiudice: parsed.pmGiudice ?? null,
          clienti: {
            create: clientiIds.map(clienteId => ({ clienteId }))
          }
        },
      })

      // Per ora creiamo solo i comparti di default
      const clientComparti = [];


      // Combine default and client compartments
      const allComparti = [...COMPARTI_DEFAULT, ...clientComparti];

      console.log('All comparti to create:', allComparti);

      // Create all comparti
      await prisma.$transaction(
        allComparti.map(comparto =>
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

  // Get clienti di una pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id/clienti', async (request, reply) => {
    try {
      const pratica = await prisma.pratica.findUnique({
        where: { id: request.params.id },
        include: {
          clienti: {
            include: {
              cliente: true
            }
          }
        }
      })

      if (!pratica) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      const clienti = pratica.clienti.map(pc => pc.cliente)
      return { clienti }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero dei clienti' })
    }
  })

  // Get pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id', async (request, reply) => {
    try {
      const pratica = await prisma.pratica.findUnique({
        where: { id: request.params.id },
        include: {
          clienti: {
            include: {
              cliente: true
            }
          }
        }
      })

      if (!pratica) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      // Costruisci nome da numeroRuolo
      const nome = pratica.numeroRuolo || `Pratica ${pratica.id.slice(0, 8)}`

      // Costruisci cliente stringa dai clienti associati
      const clientiNomi = pratica.clienti.map(pc => `${pc.cliente.nome} ${pc.cliente.cognome}`).join(', ')
      const cliente = clientiNomi || 'Nessun cliente'

      return {
        ...pratica,
        nome, // Aggiungi nome costruito
        cliente, // Aggiungi cliente costruito
        clienti: pratica.clienti.map(pc => pc.cliente) // Normalizza struttura clienti
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero della pratica' })
    }
  })

  // Update pratica
  fastify.patch<{ Params: { id: string }; Body: { numeroRuolo?: string; foro?: string; pmGiudice?: string } }>('/pratiche/:id', async (request, reply) => {
    const praticaId = request.params.id
    console.log('[SAVE][PRATICA][START]', {
      praticaId,
      body: request.body,
      numeroRuolo: request.body.numeroRuolo,
      foro: request.body.foro,
      pmGiudice: request.body.pmGiudice
    })

    try {
      const pratica = await prisma.pratica.findUnique({
        where: { id: praticaId }
      })

      if (!pratica) {
        console.log('[SAVE][PRATICA][ERROR] Pratica non trovata', { praticaId })
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      console.log('[SAVE][PRATICA][BEFORE]', {
        praticaId,
        oldNumeroRuolo: pratica.numeroRuolo,
        oldForo: pratica.foro,
        oldPmGiudice: pratica.pmGiudice
      })

      const dataToUpdate: any = {}
      if (request.body.numeroRuolo !== undefined) {
        dataToUpdate.numeroRuolo = request.body.numeroRuolo
      }
      if (request.body.foro !== undefined) {
        dataToUpdate.foro = request.body.foro
      }
      if (request.body.pmGiudice !== undefined) {
        dataToUpdate.pmGiudice = request.body.pmGiudice
      }

      console.log('[SAVE][PRATICA][UPDATE-DATA]', { praticaId, dataToUpdate })

      const updated = await prisma.pratica.update({
        where: { id: praticaId },
        data: dataToUpdate
      })

      console.log('[SAVE][PRATICA][SUCCESS]', {
        praticaId,
        newNumeroRuolo: updated.numeroRuolo,
        newForo: updated.foro,
        newPmGiudice: updated.pmGiudice,
        updatedAt: updated.updatedAt
      })

      return updated
    } catch (error) {
      console.error('[SAVE][PRATICA][ERROR]', {
        praticaId,
        error: (error as Error).message,
        stack: (error as Error).stack
      })
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nell\'aggiornamento della pratica' })
    }
  })

  // Get comparti for pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id/comparti', async (request, reply) => {
    try {
      let comparti = await prisma.comparto.findMany({
        where: { praticaId: request.params.id },
        orderBy: { ordine: 'asc' },
      })

      // ✅ Mappa dei vecchi nomi ai nuovi (per aggiornare quelli esistenti)
      const nomeUpdateMap: Record<string, string> = {
        'O.C.C.C. ANAGRAFICA INQUISITO': 'Parti & Anagrafiche',
        'FATTO REATI CONTESTATI P.M.': 'Admin & Procure',
        'INFORMATIVE': 'Denuncia–Querela / Notizia di reato',
        'FASCICOLO P.M. e GIP': 'Indagini preliminari',
        'VERBALI: ARRESTO PERQUISIZIONI SEQUESTRO': 'Verbal: Arresto Perquisizioni Sequestro',
        'INTERROGATORI E DICHIARAZIONI': 'Interrogatori e Dichiarazioni',
        'INTERCETTAZIONI TELEFONICHE': 'Corrispondenza & PEC',
        'ELENCO UTENZE SCADENZE PROROGHE': 'Elenco Utenze Scadenze Proroghe',
        'TRASCRIZIONI INTERCETTAZIONI TELEFONICHE': 'Trascrizioni Intercettazioni Telefoniche',
        'ATTI INTERLOCUTORI CORRISPONDENZA VARIA': 'Atti Interlocutori Corrispondenza Varia',
        'NOMI CITATI IN ATTI FREQUENTAZIONI': 'Nomi Citati in Atti Frequentazioni',
        'CONTESTAZIONI P.M./GIP': 'Contestazioni P.M./GIP',
        'RACCOLTA PROVE OSSERVAZIONI': 'Raccolta Prove Osservazioni',
        'MAPPE CONCETTUALI GRAFICO': 'Mappe Concettuali Grafico',
        'NOTE A CAMPO LIBERO': 'Note a Campo Libero',
        'Indagini preliminari (PG/PM, 415-bis)': 'Indagini preliminari',
        'Perizie & Consulenze (CTP/CTU)': 'Perizie e Consulenze',
        'Prove & Allegati (foto, audio, chat)': 'Prove e Allegati',
        'Provvedimenti del giudice (GIP/GUP/Trib.)': 'Provvedimenti (GIP GUP Trib)',
        'Da classificare': 'Parti & Anagrafiche',
      }

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
      } else {
        // ✅ Aggiorna i nomi vecchi ai nuovi
        const updates: Promise<any>[] = []
        for (const comparto of comparti) {
          const nuovoNome = nomeUpdateMap[comparto.nome]
          if (nuovoNome && nuovoNome !== comparto.nome) {
            updates.push(
              prisma.comparto.update({
                where: { id: comparto.id },
                data: { nome: nuovoNome }
              })
            )
          }
        }

        // ✅ Se esistono comparti ma ne mancano alcuni, aggiungi quelli mancanti
        const existingKeys = new Set(comparti.map(c => c.key))
        const missingComparti = COMPARTI_DEFAULT.filter(c => !existingKeys.has(c.key))

        if (missingComparti.length > 0) {
          for (const comparto of missingComparti) {
            updates.push(
              prisma.comparto.create({
                data: {
                  praticaId: request.params.id,
                  key: comparto.key,
                  nome: comparto.nome,
                  ordine: comparto.ordine,
                }
              })
            )
          }
        }

        if (updates.length > 0) {
          await prisma.$transaction(updates)
        }
      }

      // Ricarica tutti i comparti (con nomi aggiornati)
      comparti = await prisma.comparto.findMany({
        where: { praticaId: request.params.id },
        orderBy: { ordine: 'asc' },
      })

      return comparti
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero dei comparti' })
    }
  })

  // Get documenti for pratica
  fastify.get<{ Params: { id: string } }>('/pratiche/:id/documenti', async (request, reply) => {
    const praticaId = request.params.id
    console.log('[LOAD][DOCUMENTI][START]', { praticaId })

    try {
      const documentiRaw = await prisma.documento.findMany({
        where: { praticaId: praticaId },
        orderBy: { createdAt: 'desc' },
        select: {
          // Escludi thumbnailDataUrl per performance (caricamento lazy)
          id: true,
          praticaId: true,
          compartoId: true,
          filename: true,
          mime: true,
          size: true,
          s3Key: true,
          hash: true,
          ocrStatus: true,
          ocrText: true,
          ocrConfidence: true,
          ocrLayout: true,
          ocrPdfKey: true,
          hasNativeText: true,
          classConfidence: true,
          classWhy: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          // thumbnailDataUrl escluso - carica via /documenti/:id/thumbnail se serve
        }
      })

      console.log('[LOAD][DOCUMENTI][FOUND]', {
        praticaId,
        count: documentiRaw.length,
        documenti: documentiRaw.map((d: any) => ({
          id: d.id,
          filename: d.filename,
          compartoId: d.compartoId,
          s3Key: d.s3Key
        }))
      })

      const documenti = documentiRaw.map((d: any) => {
        const tags = typeof d.tags === 'string' ? (() => { try { return JSON.parse(d.tags) } catch { return [] } })() : (d.tags ?? [])
        const ocrLayout = typeof d.ocrLayout === 'string' ? (() => { try { return JSON.parse(d.ocrLayout) } catch { return undefined } })() : d.ocrLayout
        return { ...d, tags, ocrLayout }
      })

      // 🔍 LOG: Verifica se ocrText è presente quando vengono caricati i documenti
      const ocrTextStatus = documenti.map((d: any) => ({
        id: d.id.substring(0, 20) + '...',
        filename: d.filename,
        ocrStatus: d.ocrStatus,
        hasOcrText: !!d.ocrText,
        ocrTextLength: d.ocrText?.length || 0,
        ocrTextPreview: d.ocrText ? d.ocrText.substring(0, 100) : null
      }))

      console.log('[LOAD][DOCUMENTI][SUCCESS]', {
        praticaId,
        count: documenti.length,
        compartiCount: Object.keys(documenti.reduce((acc: any, d: any) => {
          acc[d.compartoId] = true
          return acc
        }, {})).length
      })

      console.log('[LOAD][DOCUMENTI][OCR-TEXT-STATUS]', {
        praticaId,
        ocrTextStatus,
        summary: {
          total: documenti.length,
          withOcrText: ocrTextStatus.filter((d: any) => d.hasOcrText).length,
          completedWithoutText: ocrTextStatus.filter((d: any) => d.ocrStatus === 'completed' && !d.hasOcrText).length
        }
      })

      return documenti
    } catch (error) {
      console.error('[LOAD][DOCUMENTI][ERROR]', {
        praticaId,
        error: (error as Error).message,
        stack: (error as Error).stack
      })
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