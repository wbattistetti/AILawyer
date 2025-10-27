/*
  Warnings:

  - You are about to drop the column `clienteId` on the `pratiche` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "pratica_clienti" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    CONSTRAINT "pratica_clienti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pratica_clienti_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clienti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numeroRuolo" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "pmGiudice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_pratiche" ("createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt") SELECT "createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt" FROM "pratiche";
DROP TABLE "pratiche";
ALTER TABLE "new_pratiche" RENAME TO "pratiche";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "pratica_clienti_praticaId_clienteId_key" ON "pratica_clienti"("praticaId", "clienteId");
