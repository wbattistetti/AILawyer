import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  // Solo warning ed errori - niente query log (troppo verbosi)
  log: ['warn', 'error'],
})

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})