-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_documenti" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "compartoId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'pending',
    "ocrText" TEXT,
    "ocrConfidence" REAL,
    "ocrLayout" TEXT,
    "ocrPdfKey" TEXT,
    "hasNativeText" BOOLEAN NOT NULL DEFAULT false,
    "classConfidence" REAL,
    "classWhy" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documenti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documenti_compartoId_fkey" FOREIGN KEY ("compartoId") REFERENCES "comparti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_documenti" ("classConfidence", "classWhy", "compartoId", "createdAt", "filename", "hash", "id", "mime", "ocrConfidence", "ocrLayout", "ocrPdfKey", "ocrStatus", "ocrText", "praticaId", "s3Key", "size", "tags", "updatedAt") SELECT "classConfidence", "classWhy", "compartoId", "createdAt", "filename", "hash", "id", "mime", "ocrConfidence", "ocrLayout", "ocrPdfKey", "ocrStatus", "ocrText", "praticaId", "s3Key", "size", "tags", "updatedAt" FROM "documenti";
DROP TABLE "documenti";
ALTER TABLE "new_documenti" RENAME TO "documenti";
CREATE UNIQUE INDEX "documenti_s3Key_key" ON "documenti"("s3Key");
CREATE TABLE "new_pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "controparte" TEXT,
    "pmGiudice" TEXT,
    "numeroRuolo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_pratiche" ("cliente", "controparte", "createdAt", "foro", "id", "nome", "numeroRuolo", "pmGiudice", "updatedAt") SELECT "cliente", "controparte", "createdAt", "foro", "id", "nome", "numeroRuolo", "pmGiudice", "updatedAt" FROM "pratiche";
DROP TABLE "pratiche";
ALTER TABLE "new_pratiche" RENAME TO "pratiche";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
