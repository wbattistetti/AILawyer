-- CreateTable
CREATE TABLE "chiamate_ia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "praticaId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL,
    "costEur" REAL,
    "pricingFound" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chiamate_ia_praticaId_fkey"
        FOREIGN KEY ("praticaId") REFERENCES "pratiche" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "chiamate_ia_praticaId_createdAt_idx"
ON "chiamate_ia"("praticaId", "createdAt");

-- CreateIndex
CREATE INDEX "chiamate_ia_praticaId_operationId_idx"
ON "chiamate_ia"("praticaId", "operationId");

-- Persist review metadata produced by regex/LLM multipass.
ALTER TABLE "entita_generiche"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE "entita_generiche"
ADD COLUMN "reviewFlags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "entita_generiche"
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "occorrenze_entita_generiche"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE "occorrenze_entita_generiche"
ADD COLUMN "reviewFlags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "occorrenze_entita_generiche"
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
