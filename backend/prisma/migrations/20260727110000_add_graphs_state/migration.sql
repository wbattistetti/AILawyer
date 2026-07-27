-- Add graphsState column for multi-graph persistence (JSON array of SavedGraph)
ALTER TABLE "pratiche" ADD COLUMN "graphsState" TEXT;
