import { prisma } from '../lib/database.js'

async function seed() {
  console.log('🌱 Starting database seed...')

  try {
    // Clean existing data
    await prisma.job.deleteMany()
    await prisma.documento.deleteMany()
    await prisma.comparto.deleteMany()
    await prisma.estratto.deleteMany()
    await prisma.pratica.deleteMany()
    await prisma.cliente.deleteMany()
    await prisma.tipoDinamico.deleteMany()

    console.log('✅ Database cleaned')

    // Create sample cliente
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Mario',
        cognome: 'Rossi',
        codiceFiscale: 'RSSMRA80E15F205X',
        dataNascita: new Date('1980-05-15'),
        indirizzo: 'Via Roma 1, Milano',
        metadati: JSON.stringify([
          { type: 'testo', label: 'telefono', value: '3331234567' },
          { type: 'testo', label: 'email', value: 'mario.rossi@email.com' },
          { type: 'booleano', label: 'cliente_vip', value: 'true' }
        ])
      },
    })

    console.log('✅ Sample cliente created')

    // Create sample pratica
    const pratica = await prisma.pratica.create({
      data: {
        clienteId: cliente.id,
        numeroRuolo: '12345/2024',
        foro: 'Tribunale di Milano',
        pmGiudice: 'Dott. Giuseppe Verdi',
      },
    })

    console.log('✅ Sample pratica created')

    // Create sample tipo dinamici
    const tipiDinamici = await prisma.tipoDinamico.createMany({
      data: [
        {
          label: 'telefono',
          type: 'testo',
          obbligatorio: false,
          validazione: JSON.stringify({ pattern: '^[0-9+\\s-]+$' }),
          ordine: 1
        },
        {
          label: 'email',
          type: 'testo',
          obbligatorio: false,
          validazione: JSON.stringify({ pattern: '^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$' }),
          ordine: 2
        },
        {
          label: 'cliente_vip',
          type: 'booleano',
          obbligatorio: false,
          ordine: 3
        },
        {
          label: 'note',
          type: 'testo',
          obbligatorio: false,
          ordine: 4
        }
      ]
    })

    console.log('✅ Sample tipo dinamici created')

    // Create default comparti
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

    await prisma.comparto.createMany({
      data: COMPARTI_DEFAULT.map(comparto => ({
        praticaId: pratica.id,
        key: comparto.key,
        nome: comparto.nome,
        ordine: comparto.ordine,
      })),
    })

    console.log('✅ Default comparti created')
    console.log(`🎉 Seed completed!`)
    console.log(`   - Cliente ID: ${cliente.id}`)
    console.log(`   - Pratica ID: ${pratica.id}`)
    console.log(`   - Tipi dinamici: 4`)
    console.log(`   - Comparti: ${COMPARTI_DEFAULT.length}`)

  } catch (error) {
    console.error('❌ Seed failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})