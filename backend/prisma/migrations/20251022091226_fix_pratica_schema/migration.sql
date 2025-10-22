/*
  Warnings:

  - You are about to drop the column `controparte` on the `pratiche` table. All the data in the column will be lost.
  - You are about to drop the column `nome` on the `pratiche` table. All the data in the column will be lost.
  - Made the column `numeroRuolo` on table `pratiche` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pratiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numeroRuolo" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "foro" TEXT NOT NULL,
    "pmGiudice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_pratiche" ("cliente", "createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt") SELECT "cliente", "createdAt", "foro", "id", "numeroRuolo", "pmGiudice", "status", "updatedAt" FROM "pratiche";
DROP TABLE "pratiche";
ALTER TABLE "new_pratiche" RENAME TO "pratiche";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
