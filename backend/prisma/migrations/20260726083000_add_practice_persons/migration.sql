-- CreateTable
CREATE TABLE "persone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalKey" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TEXT,
    "placeOfBirth" TEXT,
    "taxCode" TEXT,
    "address" TEXT,
    "residenceAddress" TEXT,
    "domicileAddress" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "profession" TEXT,
    "titles" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "persone_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "occorrenze_persone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "documentoId" TEXT,
    "sourceDocId" TEXT NOT NULL,
    "sourceDocTitle" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "snippet" TEXT NOT NULL,
    "bbox" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "occorrenze_persone_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "persone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "occorrenze_persone_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documenti" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "persone_praticaId_fullName_idx" ON "persone"("praticaId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "persone_praticaId_externalKey_key" ON "persone"("praticaId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "persone_praticaId_taxCode_key" ON "persone"("praticaId", "taxCode");

-- CreateIndex
CREATE INDEX "occorrenze_persone_sourceDocId_idx" ON "occorrenze_persone"("sourceDocId");

-- CreateIndex
CREATE UNIQUE INDEX "occorrenze_persone_personaId_fingerprint_key" ON "occorrenze_persone"("personaId", "fingerprint");
