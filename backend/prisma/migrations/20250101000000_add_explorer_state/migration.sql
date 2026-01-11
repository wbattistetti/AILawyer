-- AlterTable
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numeroRuolo" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "pmGiudice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "explorerState" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_pratiche" ("createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt") SELECT "createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt" FROM "pratiche";
DROP TABLE "pratiche";
ALTER TABLE "new_pratiche" RENAME TO "pratiche";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
