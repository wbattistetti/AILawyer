-- CreateTable
CREATE TABLE "entita_generiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalKey" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "properties" TEXT NOT NULL DEFAULT '{}',
    "confidence" REAL NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "entita_generiche_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "occorrenze_entita_generiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entitaId" TEXT NOT NULL,
    "documentoId" TEXT,
    "sourceDocId" TEXT NOT NULL,
    "sourceDocTitle" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "snippet" TEXT NOT NULL,
    "bbox" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "propertyKeys" TEXT NOT NULL DEFAULT '[]',
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "occorrenze_entita_generiche_entitaId_fkey" FOREIGN KEY ("entitaId") REFERENCES "entita_generiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "occorrenze_entita_generiche_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documenti" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "relazioni_entita_generiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceOccurrenceIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "relazioni_entita_generiche_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "relazioni_entita_generiche_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "entita_generiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "relazioni_entita_generiche_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "entita_generiche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "entita_generiche_praticaId_kind_label_idx" ON "entita_generiche"("praticaId", "kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "entita_generiche_praticaId_kind_externalKey_key" ON "entita_generiche"("praticaId", "kind", "externalKey");

-- CreateIndex
CREATE INDEX "occorrenze_entita_generiche_sourceDocId_idx" ON "occorrenze_entita_generiche"("sourceDocId");

-- CreateIndex
CREATE UNIQUE INDEX "occorrenze_entita_generiche_entitaId_fingerprint_key" ON "occorrenze_entita_generiche"("entitaId", "fingerprint");

-- CreateIndex
CREATE INDEX "relazioni_entita_generiche_praticaId_kind_idx" ON "relazioni_entita_generiche"("praticaId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "relazioni_entita_generiche_praticaId_fromEntityId_toEntityId_kind_key" ON "relazioni_entita_generiche"("praticaId", "fromEntityId", "toEntityId", "kind");
