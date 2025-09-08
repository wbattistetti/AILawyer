import { prisma } from '../lib/database.js'

async function seed() {
  console.log('🌱 Starting database seed...')

  try {
    // Clean existing data
    await prisma.job.deleteMany()
    await prisma.documento.deleteMany()
    await prisma.comparto.deleteMany()
    await prisma.pratica.deleteMany()

    console.log('✅ Database cleaned')

    // Create sample pratica
    const pratica = await prisma.pratica.create({
      data: {
        nome: 'Procedimento penale vs. Mario Rossi',
        cliente: 'Mario Rossi',
        foro: 'Tribunale di Milano',
        controparte: 'Procura della Repubblica',
        pmGiudice: 'Dott. Giuseppe Verdi',
        numeroRuolo: '12345/2024',
      },
    })

    console.log('✅ Sample pratica created')

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
    console.log(`🎉 Seed completed! Sample pratica ID: ${pratica.id}`)

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