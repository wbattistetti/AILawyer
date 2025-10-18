import { prisma } from '../lib/database.js'
import { detectNativeText } from '../lib/detectNativeText.js'
import path from 'path'
import fs from 'fs'

/**
 * Script per aggiornare hasNativeText su tutti i PDF esistenti
 */
async function updateNativeText() {
  console.log('🔍 [MIGRATION] Starting native text detection for existing PDFs...\n')
  
  try {
    // 1. Trova tutti i documenti PDF
    const allDocs = await prisma.documento.findMany({
      where: {
        OR: [
          { mime: { startsWith: 'application/pdf' } },
          { filename: { endsWith: '.pdf' } }
        ]
      },
      select: {
        id: true,
        filename: true,
        s3Key: true,
        hasNativeText: true
      }
    })
    
    console.log(`📄 Found ${allDocs.length} PDF documents\n`)
    
    const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
    let updated = 0
    let skipped = 0
    let errors = 0
    
    // 2. Per ogni PDF, rileva se ha testo nativo
    for (const doc of allDocs) {
      const pdfPath = path.join(uploadsDir, doc.s3Key)
      
      console.log(`\n📄 Processing: ${doc.filename}`)
      console.log(`   ID: ${doc.id}`)
      console.log(`   Path: ${pdfPath}`)
      console.log(`   Current hasNativeText: ${doc.hasNativeText}`)
      
      if (!fs.existsSync(pdfPath)) {
        console.log(`   ❌ File not found, skipping`)
        skipped++
        continue
      }
      
      try {
        const hasNativeText = await detectNativeText(pdfPath)
        
        // Aggiorna solo se il valore è cambiato
        if (hasNativeText !== doc.hasNativeText) {
          await prisma.documento.update({
            where: { id: doc.id },
            data: { hasNativeText }
          })
          console.log(`   ✅ Updated: hasNativeText = ${hasNativeText}`)
          updated++
        } else {
          console.log(`   ⏭️  No change needed (already ${hasNativeText})`)
          skipped++
        }
      } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`)
        errors++
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 Migration Summary:')
    console.log('='.repeat(60))
    console.log(`Total PDFs:    ${allDocs.length}`)
    console.log(`Updated:       ${updated}`)
    console.log(`Skipped:       ${skipped}`)
    console.log(`Errors:        ${errors}`)
    console.log('='.repeat(60))
    
    console.log('\n✅ Migration completed!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Esegui lo script
updateNativeText()

