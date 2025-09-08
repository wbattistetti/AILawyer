import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})