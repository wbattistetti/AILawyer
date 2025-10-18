import { prisma } from '../lib/database.js'

/**
 * Script per migrare tutte le pratiche esistenti da "draft" a "committed"
 * Utile dopo l'introduzione del sistema di bozze per non avere tutte le pratiche come draft
 * 
 * Uso:
 * npx tsx src/scripts/migrate-existing-pratiche.ts
 */

async function migrateExistingPratiche() {
  console.log('🔄 Migrazione pratiche esistenti da "draft" a "committed"...\n')
  
  try {
    // Conta pratiche draft
    const count = await prisma.pratica.count({
      where: { status: 'draft' }
    })
    
    if (count === 0) {
      console.log('✅ Nessuna pratica draft da migrare.')
      return
    }
    
    console.log(`📋 Trovate ${count} pratiche con status "draft"`)
    console.log('   Verranno aggiornate a "committed" (salvate definitivamente)\n')
    
    // Aggiorna tutte a committed
    const result = await prisma.pratica.updateMany({
      where: { status: 'draft' },
      data: { status: 'committed' }
    })
    
    console.log(`✅ Migrate ${result.count} pratiche a "committed"`)
    console.log('\n' + '='.repeat(60))
    console.log('📊 RISULTATO')
    console.log('='.repeat(60))
    console.log(`Pratiche aggiornate: ${result.count}`)
    console.log('Nuovo status:        committed')
    console.log('='.repeat(60))
    console.log('\n✅ Migrazione completata!')
    console.log('\n💡 D\'ora in poi, le nuove pratiche partiranno come "draft" e')
    console.log('   potrai salvarle definitivamente quando vuoi.')
    
  } catch (error) {
    console.error('\n❌ Errore durante la migrazione:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Esegui migrazione
migrateExistingPratiche()

