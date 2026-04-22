-- Sprint 1: X-segment primitive + practice-model + production-policy + day-of-week roster
--
-- Adds per Bible §2.1 / §3 / §4 / §7:
--   BlockType: asstPreMin, doctorMin, asstPostMin, doctorContinuityRequired
--   Office:    practiceModel, productionPolicy, maxConcurrentDoctorOps,
--              doctorTransitionBufferMin, efdaScopeLevel
--   Provider:  dayOfWeekRoster (JSON array, default weekdays)
--
-- SQLite supports ADD COLUMN without requiring RedefineTables when defaults
-- are constant literals. All columns added here use constant defaults.

-- AlterTable BlockType — X-segment template columns
ALTER TABLE "BlockType" ADD COLUMN "asstPreMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlockType" ADD COLUMN "doctorMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlockType" ADD COLUMN "asstPostMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlockType" ADD COLUMN "doctorContinuityRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Office — practice-model + production-policy metadata
ALTER TABLE "Office" ADD COLUMN "practiceModel" TEXT NOT NULL DEFAULT '1D2O';
ALTER TABLE "Office" ADD COLUMN "productionPolicy" TEXT NOT NULL DEFAULT 'JAMESON_50';
ALTER TABLE "Office" ADD COLUMN "maxConcurrentDoctorOps" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Office" ADD COLUMN "doctorTransitionBufferMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Office" ADD COLUMN "efdaScopeLevel" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable Provider — day-of-week roster (Bible §7, closes P0-1)
ALTER TABLE "Provider" ADD COLUMN "dayOfWeekRoster" TEXT NOT NULL DEFAULT '["MON","TUE","WED","THU","FRI"]';
