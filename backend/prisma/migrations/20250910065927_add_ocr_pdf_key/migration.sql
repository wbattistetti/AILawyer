-- CreateTable
CREATE TABLE "pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "controparte" TEXT,
    "pmGiudice" TEXT,
    "numeroRuolo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "comparti" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    CONSTRAINT "comparti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documenti" (
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
    "classConfidence" REAL,
    "classWhy" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documenti_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documenti_compartoId_fkey" FOREIGN KEY ("compartoId") REFERENCES "comparti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documenti" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "comparti_praticaId_key_key" ON "comparti"("praticaId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "documenti_s3Key_key" ON "documenti"("s3Key");
