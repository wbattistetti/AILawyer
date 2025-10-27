/*
  Warnings:

  - Added the required column `analystId` to the `estratti` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "memorie_difensive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "structure" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "memorie_difensive_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_estratti" (
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
    "sourceDocId" TEXT,
    "sourceDocTitle" TEXT,
    "bbox" TEXT,
    "extractDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notesAnalyst" TEXT,
    "notesDescription" TEXT,
    "notesStrategy" TEXT,
    "notesDefense" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "analystId" TEXT NOT NULL,
    CONSTRAINT "estratti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "estratti_parentReatoId_fkey" FOREIGN KEY ("parentReatoId") REFERENCES "estratti" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "estratti_parentMotivazioneId_fkey" FOREIGN KEY ("parentMotivazioneId") REFERENCES "estratti" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_estratti" ("content", "createdAt", "end", "id", "page", "parentMotivazioneId", "parentReatoId", "praticaId", "sourceDoc", "start", "title", "type", "updatedAt") SELECT "content", "createdAt", "end", "id", "page", "parentMotivazioneId", "parentReatoId", "praticaId", "sourceDoc", "start", "title", "type", "updatedAt" FROM "estratti";
DROP TABLE "estratti";
ALTER TABLE "new_estratti" RENAME TO "estratti";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
