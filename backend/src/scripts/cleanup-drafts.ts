import { prisma } from '../lib/database.js'
import { storageService } from '../lib/storage.js'

/**
 * Script per eliminare automaticamente le bozze vecchie (> 7 giorni)
 * Può essere eseguito manualmente o schedulato come cron job
 * 
 * Uso:
 * npx tsx src/scripts/cleanup-drafts.ts [--days=7] [--dry-run]
 */

const DAYS_THRESHOLD = parseInt(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1] || '7')
const DRY_RUN = process.argv.includes('--dry-run')

async function cleanupOldDrafts() {
  console.log('🧹 [CLEANUP] Avvio pulizia bozze vecchie...\n')
  console.log(`📅 Soglia: ${DAYS_THRESHOLD} giorni`)
  console.log(`🔍 Modalità: ${DRY_RUN ? 'DRY RUN (nessuna cancellazione)' : 'ESECUZIONE REALE'}`)
  console.log('─'.repeat(60))
  
  try {
    const thresholdDate = new Date(Date.now() - DAYS_THRESHOLD * 24 * 60 * 60 * 1000)
    console.log(`\n🔎 Cerco bozze create prima del ${thresholdDate.toLocaleString('it-IT')}...`)
    
    // Trova tutte le bozze vecchie
    const oldDrafts = await prisma.pratica.findMany({
      where: {
        status: 'draft',
        createdAt: {
          lt: thresholdDate
        }
      },
      include: {
        _count: {
          select: { documenti: true }
        }
      }
    })
    
    console.log(`\n📋 Trovate ${oldDrafts.length} bozze da eliminare\n`)
    
    if (oldDrafts.length === 0) {
      console.log('✅ Nessuna bozza da eliminare.')
      return
    }
    
    let totalDeleted = 0
    let totalDocsDeleted = 0
    let totalFilesDeleted = 0
    let errors = 0
    
    for (const pratica of oldDrafts) {
      const docCount = pratica._count.documenti
      console.log(`\n📁 Pratica: "${pratica.nome}"`)
      console.log(`   ID: ${pratica.id}`)
      console.log(`   Cliente: ${pratica.cliente}`)
      console.log(`   Creata: ${new Date(pratica.createdAt).toLocaleString('it-IT')}`)
      console.log(`   Documenti: ${docCount}`)
      
      if (DRY_RUN) {
        console.log('   🔍 [DRY RUN] Sarebbe stata eliminata')
        totalDeleted++
        totalDocsDeleted += docCount
        continue
      }
      
      try {
        // 1. Trova e elimina tutti i documenti (e relativi file)
        const documenti = await prisma.documento.findMany({
          where: { praticaId: pratica.id }
        })
        
        for (const doc of documenti) {
          try {
            // Elimina file da storage
            await storageService.deleteObject(doc.s3Key)
            console.log(`   🗑️  File eliminato: ${doc.filename}`)
            totalFilesDeleted++
          } catch (storageError) {
            console.warn(`   ⚠️  Impossibile eliminare file ${doc.s3Key}: ${(storageError as Error).message}`)
          }
        }
        
        // 2. Elimina la pratica (cascade elimina anche documenti e comparti)
        await prisma.pratica.delete({
          where: { id: pratica.id }
        })
        
        console.log(`   ✅ Pratica eliminata`)
        totalDeleted++
        totalDocsDeleted += docCount
      } catch (error) {
        console.error(`   ❌ Errore eliminazione: ${(error as Error).message}`)
        errors++
      }
    }
    
    // Riepilogo
    console.log('\n' + '='.repeat(60))
    console.log('📊 RIEPILOGO CLEANUP')
    console.log('='.repeat(60))
    console.log(`Pratiche eliminate:     ${totalDeleted}`)
    console.log(`Documenti eliminati:    ${totalDocsDeleted}`)
    console.log(`File eliminati:         ${totalFilesDeleted}`)
    console.log(`Errori:                 ${errors}`)
    console.log('='.repeat(60))
    
    if (DRY_RUN) {
      console.log('\n💡 Questo era un DRY RUN. Esegui senza --dry-run per eliminare realmente.')
    } else {
      console.log('\n✅ Cleanup completato!')
    }
    
  } catch (error) {
    console.error('\n❌ Errore durante il cleanup:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Esegui cleanup
cleanupOldDrafts()

