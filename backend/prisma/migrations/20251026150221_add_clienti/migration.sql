/*
  Warnings:

  - You are about to drop the column `cliente` on the `pratiche` table. All the data in the column will be lost.
  - Added the required column `clienteId` to the `pratiche` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "clienti" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "codiceFiscale" TEXT,
    "dataNascita" DATETIME,
    "indirizzo" TEXT,
    "metadati" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tipo_dinamici" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "obbligatorio" BOOLEAN NOT NULL DEFAULT false,
    "validazione" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "estratti" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "sourceDoc" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "parentReatoId" TEXT,
    "parentMotivazioneId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "estratti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "estratti_parentReatoId_fkey" FOREIGN KEY ("parentReatoId") REFERENCES "estratti" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "estratti_parentMotivazioneId_fkey" FOREIGN KEY ("parentMotivazioneId") REFERENCES "estratti" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_EstrattoCliente" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_EstrattoCliente_A_fkey" FOREIGN KEY ("A") REFERENCES "clienti" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_EstrattoCliente_B_fkey" FOREIGN KEY ("B") REFERENCES "estratti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "numeroRuolo" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "pmGiudice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pratiche_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clienti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_pratiche" ("createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt") SELECT "createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt" FROM "pratiche";
DROP TABLE "pratiche";
ALTER TABLE "new_pratiche" RENAME TO "pratiche";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "clienti_codiceFiscale_key" ON "clienti"("codiceFiscale");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_dinamici_label_key" ON "tipo_dinamici"("label");

-- CreateIndex
CREATE UNIQUE INDEX "_EstrattoCliente_AB_unique" ON "_EstrattoCliente"("A", "B");

-- CreateIndex
CREATE INDEX "_EstrattoCliente_B_index" ON "_EstrattoCliente"("B");
